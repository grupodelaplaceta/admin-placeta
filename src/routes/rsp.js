/**
 * Rutas de la Red de Servicios de La Placeta (RSP)
 * 
 * - Dashboard principal
 * - Panel de conexiones
 * - Gestión de facturación
 * - Estado de fondos
 * - API REST para el sistema
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import {
  getConexiones, getConexionesFromSupabase, getFacturas, getEstadoFondos, getTarifas, getEstadisticas,
  generarFactura, generarFacturaPorIds, eliminarConexionesPorIds,
  pagarFactura, pagarSancionIVA, registrarConexion, TIPO_CONEXION
} from '../config/rsp.js';
import {
  TABLA_CANJE_PUNTOS_VERDES, TABLA_CANJE_PUNTOS_ROJOS, IVA_PERCENT,
  RECOMPENSAS_POR_COMPLEJIDAD, getConfigRsp, setConfigRsp
} from '../config/junior-precios.js';
import { sbUpdateActividad, sbGetActividad, sbListActividades } from '../config/junior-actividades.js';

const router = Router();

// ── DASHBOARD ──────────────────────────────────────────────────────────────
router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  const stats = getEstadisticas();
  const tarifas = getTarifas();
  const conexionesRecientes = getConexiones({ limit: 10 }).reverse();
  const facturasPendientes = getFacturas({ estado: 'pendiente' });

  // Votaciones solo desde Supabase
  let votacionesData = { activas: 0, cerradas: 0, totalVotos: 0, total: 0 };
  try {
    if (supabase) {
      const { data, error } = await supabase.from('rsp_votaciones')
        .select('id,estado,a_favor,en_contra,abstenciones,total_votos,total_emitidos')
        .order('created_at', { ascending: false });
      if (!error && data) {
        votacionesData = {
          activas: data.filter(v => v.estado === 'Activa').length,
          cerradas: data.filter(v => v.estado === 'Cerrada').length,
          totalVotos: data.reduce((s, v) => s + (v.total_votos || 0), 0),
          total: data.length
        };
      }
    }
  } catch (e) { /* votaciones no disponibles */ }

  res.render('rsp/dashboard', {
    titulo: 'Red de Servicios de La Placeta (RSP)',
    entidad_actual: 'rsp',
    stats, tarifas,
    conexionesRecientes, facturasPendientes,
    votaciones: votacionesData,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin')
  });
});

// ── CONEXIONES ─────────────────────────────────────────────────────────────
router.get('/conexiones', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_conexiones'), async (req, res) => {
  const filtros = {};
  if (req.query.entidad) filtros.entidad = req.query.entidad;
  if (req.query.tipo) filtros.tipo = req.query.tipo;

  let todas = getConexiones(filtros);
  // Si no hay datos en memoria, intentar cargar desde Supabase
  if (todas.length === 0) {
    const desdeDB = await getConexionesFromSupabase(filtros);
    if (desdeDB && desdeDB.length > 0) {
      todas = desdeDB.map(c => ({
        id: c.id, entidad: c.entidad, tipo: c.tipo, endpoint: c.endpoint,
        usuario: c.usuario || '', dip: c.dip || '',
        tarifa: c.tarifa, iva: c.iva, total: c.total,
        detalle: c.detalle || '', timestamp: c.created_at || c.timestamp
      }));
    }
  }
  const conexiones = [...todas].reverse(); // Más recientes primero

  // Estadísticas para la vista
  const consultas = conexiones.filter(c => c.tipo === TIPO_CONEXION.CONSULTA);
  const modificaciones = conexiones.filter(c => c.tipo === TIPO_CONEXION.MODIFICACION);

  res.render('rsp/conexiones', {
    titulo: 'Conexiones - Red de Servicios de La Placeta',
    entidad_actual: 'rsp',
    conexiones,
    total: conexiones.length,
    totalConsultas: consultas.length,
    totalModificaciones: modificaciones.length,
    ingresosConsultas: consultas.reduce((s, c) => s + c.total, 0),
    ingresosModificaciones: modificaciones.reduce((s, c) => s + c.total, 0),
    filtroEntidad: req.query.entidad || '',
    filtroTipo: req.query.tipo || ''
  });
});

// ── FACTURACIÓN ────────────────────────────────────────────────────────────
router.get('/facturacion', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_facturas'), (req, res) => {
  const filtros = {};
  if (req.query.entidad) filtros.entidad = req.query.entidad;
  if (req.query.estado) filtros.estado = req.query.estado;

  const facturas = getFacturas(filtros);
  const stats = getEstadisticas();
  const tarifas = getTarifas();

  res.render('rsp/facturacion', {
    titulo: 'Facturación - Red de Servicios de La Placeta',
    entidad_actual: 'rsp',
    facturas: [...facturas].reverse(),
    total: facturas.length,
    pendientes: facturas.filter(f => f.estado === 'pendiente').length,
    pagadas: facturas.filter(f => f.estado === 'pagada').length,
    totalFacturado: facturas.reduce((s, f) => s + f.detalle.total, 0),
    tarifas,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
    filtroEntidad: req.query.entidad || '',
    filtroEstado: req.query.estado || ''
  });
});

// ── GASTOS POR ENTIDAD (accesible desde cualquier workspace) ──────────
router.get('/gastos/:entidad', verificarSesion, async (req, res) => {
  const { entidad } = req.params;
  const origen = req.query.origen || entidad; // Mantener workspace original
  let conexiones = getConexiones({ entidad });
  // Si memoria vacía, cargar desde Supabase
  if (conexiones.length === 0) {
    const desdeDB = await getConexionesFromSupabase({ entidad });
    if (desdeDB && desdeDB.length > 0) {
      conexiones = desdeDB.map(c => ({
        id: c.id, entidad: c.entidad, tipo: c.tipo, endpoint: c.endpoint,
        usuario: c.usuario || '', dip: c.dip || '',
        tarifa: c.tarifa, iva: c.iva, total: c.total,
        detalle: c.detalle || '', timestamp: c.created_at || c.timestamp
      }));
    }
  }
  const consultas = conexiones.filter(c => c.tipo === TIPO_CONEXION.CONSULTA);
  const modificaciones = conexiones.filter(c => c.tipo === TIPO_CONEXION.MODIFICACION);

  // IBAN de la entidad
  const ibans = {
    banco: 'GDLP-AP98-605',
    tributos: 'GDLP-TRBX-001',
    junta: 'GDLP-AP00-001',
    administracion: 'GDLP-AP00-002',
    rsp: 'GDLP-AP64-583'
  };
  const noms = {
    banco: 'Banco de La Placeta',
    tributos: 'Tributos de La Placeta',
    junta: 'Junta de La Placeta',
    administracion: 'Administración de La Placeta',
    rsp: 'Red de Servicios de La Placeta'
  };

  res.render('rsp/gastos-entidad', {
    titulo: `Gastos RSP - ${noms[entidad] || entidad}`,
    entidad_actual: origen, // ← Usa el workspace ORIGINAL, no 'rsp'
    nomEntidad: noms[entidad] || entidad,
    iban: ibans[entidad] || '—',
    conexiones: [...conexiones].reverse(),
    totalConexiones: conexiones.length,
    totalConsultas: consultas.length,
    totalModificaciones: modificaciones.length,
    costeConsultas: consultas.reduce((s, c) => s + c.total, 0),
    costeModificaciones: modificaciones.reduce((s, c) => s + c.total, 0),
    totalGastado: conexiones.reduce((s, c) => s + c.total, 0)
  });
});

// ── FONDOS ─────────────────────────────────────────────────────────────────
router.get('/fondos', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_fondos'), (req, res) => {
  const fondos = getEstadoFondos();
  const tarifas = getTarifas();
  const stats = getEstadisticas();

  res.render('rsp/fondos', {
    titulo: 'Fondos - Red de Servicios de La Placeta',
    entidad_actual: 'rsp',
    fondos,
    tarifas,
    stats,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin')
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  CENTRO DE CONTROL DEL SISTEMA — administración global desde la RSP
//  Gestión de: Academia Junior, economía (canje/IVA/precios), licencias
//  premium, puntos, y acceso a todos los módulos del ecosistema.
// ═══════════════════════════════════════════════════════════════════════════

async function conteoSupabase(tabla, filtros = {}) {
  if (!supabase) return 0;
  try {
    let q = supabase.from(tabla).select('id', { count: 'exact', head: true });
    for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v);
    const { count } = await q;
    return count || 0;
  } catch { return 0; }
}

// ── Dashboard global del sistema ──────────────────────────────────────────
router.get('/sistema', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_dashboard'), async (req, res) => {
  const stats = getEstadisticas();

  // Academia Placeta Junior (Supabase)
  const s = {
    actividades: 0, publicadas: 0, enRevision: 0, aprobadas: 0, rechazadas: 0, premium: 0, subvencionadas: 0,
    colaboradores: 0, diplomas: 0, licencias: 0, conPuntos: 0, juniors: 0, retos: 0,
    totalVerdes: 0, totalRojos: 0, totalCanjeado: 0, ingresosPremium: 0
  };
  try {
    if (supabase) {
      const [act, pub, rev, apr, rej, prem, sub, col, dip, lic, puntos, jun, retos] = await Promise.all([
        supabase.from('junior_actividades').select('id', { count: 'exact', head: true }),
        supabase.from('junior_actividades').select('id', { count: 'exact', head: true }).eq('publica', true),
        supabase.from('junior_actividades').select('id', { count: 'exact', head: true }).eq('estado', 'en_revision'),
        supabase.from('junior_actividades').select('id', { count: 'exact', head: true }).eq('estado', 'aprobada'),
        supabase.from('junior_actividades').select('id', { count: 'exact', head: true }).eq('estado', 'rechazada'),
        supabase.from('junior_actividades').select('id', { count: 'exact', head: true }).or('precio_licencia.gt.0,precio_intento.gt.0'),
        supabase.from('junior_actividades').select('id', { count: 'exact', head: true }).eq('subvencionada', true),
        supabase.from('junior_colaboradores').select('id', { count: 'exact', head: true }),
        supabase.from('junior_diplomas').select('id', { count: 'exact', head: true }),
        supabase.from('junior_licencias').select('id', { count: 'exact', head: true }),
        supabase.from('junior_puntos').select('puntos_verdes,puntos_rojos,canjeado'),
        supabase.from('junior_menores').select('id', { count: 'exact', head: true }),
        (async () => { try { return await supabase.from('junior_retos').select('id', { count: 'exact', head: true }); } catch (e) { return { count: 0 }; } })()
      ]);
      const c = r => r?.count || 0;
      s.actividades = c(act); s.publicadas = c(pub); s.enRevision = c(rev); s.aprobadas = c(apr);
      s.rechazadas = c(rej); s.premium = c(prem); s.subvencionadas = c(sub);
      s.colaboradores = c(col); s.diplomas = c(dip); s.licencias = c(lic); s.juniors = c(jun); s.retos = c(retos);
      if (puntos?.data) {
        s.conPuntos = puntos.data.length;
        s.totalVerdes = puntos.data.reduce((a, p) => a + (p.puntos_verdes || 0), 0);
        s.totalRojos = puntos.data.reduce((a, p) => a + (p.puntos_rojos || 0), 0);
        s.totalCanjeado = puntos.data.reduce((a, p) => a + (p.canjeado || 0), 0);
      }
      // Ingresos premium aprox. (licencias vendidas)
      const { data: licData } = await supabase.from('junior_licencias').select('actividad_id');
      if (licData?.length) {
        const { data: acts } = await supabase.from('junior_actividades').select('id,precio_licencia').in('id', [...new Set(licData.map(l => l.actividad_id))]);
        const precios = Object.fromEntries((acts || []).map(a => [a.id, a.precio_licencia || 0]));
        s.ingresosPremium = licData.reduce((a, l) => a + (precios[l.actividad_id] || 0), 0);
      }
    }
  } catch (e) { /* estadísticas parciales */ }

  // Votaciones
  let votacionesData = { activas: 0, cerradas: 0, totalVotos: 0, total: 0 };
  try {
    if (supabase) {
      const { data } = await supabase.from('rsp_votaciones').select('estado,total_votos');
      if (data) {
        votacionesData = {
          activas: data.filter(v => v.estado === 'Activa').length,
          cerradas: data.filter(v => v.estado === 'Cerrada').length,
          totalVotos: data.reduce((x, v) => x + (v.total_votos || 0), 0),
          total: data.length
        };
      }
    }
  } catch (e) { /* sin votaciones */ }

  res.render('rsp/sistema', {
    titulo: 'Centro de Control del Sistema — RSP',
    entidad_actual: 'rsp',
    stats, s, votaciones: votacionesData,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin')
  });
});

// ── Gestión premium: precios, subvención, destacadas, licencias ──────────
router.get('/premium', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_facturas'), async (req, res) => {
  let actividades = [];
  try {
    if (supabase) {
      // Usa sbListActividades (normaliza) para que los valores económicos que
      // viven en `contenido` como respaldo (p. ej. subvencionada) se muestren
      // igual que las columnas reales (precio_licencia, recompensa, etc.).
      actividades = await sbListActividades({ soloPublicas: false });
    }
  } catch (e) { /* sin datos */ }

  // Licencias por actividad
  const licenciasPorActividad = {};
  let totalLicencias = 0;
  let ingresos = 0;
  try {
    if (supabase) {
      const { data: lic } = await supabase.from('junior_licencias').select('actividad_id');
      if (lic) {
        for (const l of lic) licenciasPorActividad[l.actividad_id] = (licenciasPorActividad[l.actividad_id] || 0) + 1;
        totalLicencias = lic.length;
        const ids = [...new Set(lic.map(l => l.actividad_id))];
        const { data: acts } = await supabase.from('junior_actividades').select('id,precio_licencia').in('id', ids);
        const precios = Object.fromEntries((acts || []).map(a => [a.id, a.precio_licencia || 0]));
        ingresos = lic.reduce((a, l) => a + (precios[l.actividad_id] || 0), 0);
      }
    }
  } catch (e) { /* sin licencias */ }

  res.render('rsp/premium', {
    titulo: 'Gestión Premium — Academia Placeta Junior',
    entidad_actual: 'rsp',
    actividades, licenciasPorActividad, totalLicencias, ingresos,
    ok: req.query.ok === '1',
    error: req.query.error || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin')
  });
});

router.post('/premium', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_facturas'), async (req, res) => {
  const { id } = req.body;
  if (!id) return res.redirect('/rsp/premium?error=ID requerido');
  const campos = {};
  for (const k of ['precio_licencia', 'precio_intento', 'recompensa']) {
    const v = Number(req.body[k]);
    if (!Number.isNaN(v)) campos[k] = v;
  }
  campos.subvencionada = req.body.subvencionada === 'on';
  campos.destacada = req.body.destacada === 'on';
  campos.publica = req.body.publica === 'on';
  try {
    if (supabase) {
      // sbUpdateActividad es tolerante: si la columna subvencionada aún no
      // existe en la tabla, guarda precio/recompensa/destacada en sus columnas
      // y mueve subvencionada al JSON contenido (no pierde nada).
      const ok = await sbUpdateActividad(id, campos);
      if (!ok) return res.redirect(`/rsp/premium?error=${encodeURIComponent('No se pudieron guardar los cambios')}`);
    }
  } catch (e) {
    return res.redirect(`/rsp/premium?error=${encodeURIComponent(e.message)}`);
  }
  res.redirect('/rsp/premium?ok=1');
});

// ── Configuración económica: tablas de canje ─────────────────────────────
router.get('/config', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_tarifas'), async (req, res) => {
  const [canjeV, canjeR] = await Promise.all([getTablaCanje('verdes'), getTablaCanje('rojos')]);
  res.render('rsp/config', {
    titulo: 'Configuración Económica — RSP',
    entidad_actual: 'rsp',
    iva: IVA_PERCENT,
    recompensas: RECOMPENSAS_POR_COMPLEJIDAD,
    canjeV, canjeR,
    ok: req.query.ok === '1',
    error: req.query.error || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin')
  });
});

router.post('/config', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_facturas'), async (req, res) => {
  try {
    // Tabla de canje de verdes
    const vArr = [];
    for (const k of Object.keys(req.body).filter(k => k.startsWith('v_puntos_'))) {
      const i = k.replace('v_puntos_', '');
      const p = Number(req.body[k]);
      const pz = Number(req.body[`v_placetas_${i}`]);
      if (!Number.isNaN(p) && !Number.isNaN(pz) && p > 0) vArr.push({ puntos_verdes: p, placetas: pz });
    }
    // Tabla de canje de rojos
    const rArr = [];
    for (const k of Object.keys(req.body).filter(k => k.startsWith('r_puntos_'))) {
      const i = k.replace('r_puntos_', '');
      const p = Number(req.body[k]);
      const pz = Number(req.body[`r_placetas_${i}`]);
      if (!Number.isNaN(p) && !Number.isNaN(pz) && p > 0) rArr.push({ puntos_rojos: p, placetas: pz });
    }
    if (vArr.length) await setConfigRsp('tabla_canje_verdes', vArr);
    if (rArr.length) await setConfigRsp('tabla_canje_rojos', rArr);
    res.redirect('/rsp/config?ok=1');
  } catch (e) {
    res.redirect(`/rsp/config?error=${encodeURIComponent(e.message)}`);
  }
});

// ── Puntos por junior (verdes / rojos / canjeado) ────────────────────────
router.get('/puntos', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_dashboard'), async (req, res) => {
  let puntosList = [];
  let nombres = {};
  try {
    if (supabase) {
      const { data } = await supabase.from('junior_puntos').select('*').order('puntos_verdes', { ascending: false }).limit(300);
      puntosList = data || [];
      if (puntosList.length) {
        const { data: menores } = await supabase.from('junior_menores').select('id,nombre,dip');
        nombres = Object.fromEntries((menores || []).map(m => [m.id, m]));
      }
    }
  } catch (e) { /* sin datos */ }
  res.render('rsp/puntos', {
    titulo: 'Puntos Placeta Junior — RSP',
    entidad_actual: 'rsp',
    puntosList, nombres,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin')
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// API REST
// ═══════════════════════════════════════════════════════════════════════════

// ── API: Estadísticas ─────────────────────────────────────────────────────
router.get('/api/estadisticas', verificarSesion, (req, res) => {
  res.json(getEstadisticas());
});

// ── API: Tarifas ──────────────────────────────────────────────────────────
router.get('/api/tarifas', verificarSesion, (req, res) => {
  res.json(getTarifas());
});

// ── API: Conexiones ───────────────────────────────────────────────────────
router.get('/api/conexiones', verificarSesion, verificarPermiso('rsp', 'ver_conexiones'), (req, res) => {
  const filtros = {};
  if (req.query.entidad) filtros.entidad = req.query.entidad;
  if (req.query.tipo) filtros.tipo = req.query.tipo;
  if (req.query.limit) filtros.limit = parseInt(req.query.limit);

  const conexiones = getConexiones(filtros);
  res.json({ conexiones: [...conexiones].reverse(), total: conexiones.length });
});

// ── API: Facturas ─────────────────────────────────────────────────────────
router.get('/api/facturas', verificarSesion, verificarPermiso('rsp', 'ver_facturas'), (req, res) => {
  const filtros = {};
  if (req.query.entidad) filtros.entidad = req.query.entidad;
  if (req.query.estado) filtros.estado = req.query.estado;
  res.json({ facturas: getFacturas(filtros) });
});

// ── API: Generar factura ──────────────────────────────────────────────────
router.post('/api/facturas/generar', verificarSesion, verificarPermiso('rsp', 'gestionar_facturas'), (req, res) => {
  const { entidad, periodoInicio, periodoFin, conexionIds } = req.body;
  if (!entidad) return res.status(400).json({ error: 'Entidad requerida' });

  // Si se especifican IDs de conexiones, facturar solo esas
  const factura = conexionIds && conexionIds.length > 0
    ? generarFacturaPorIds({ entidad, conexionIds })
    : generarFactura({ entidad, periodoInicio, periodoFin });

  if (!factura) return res.status(400).json({ error: 'No hay conexiones para facturar en esta entidad' });

  res.json({
    success: true,
    factura,
    desglosePago: `Base: ${factura.detalle.baseTotal.toFixed(3)} Pz (→RSP) | IVA: ${factura.detalle.iva.toFixed(3)} Pz (→TGLP) | Total: ${factura.detalle.total.toFixed(3)} Pz`
  });
});

// ── API: Pagar factura (vía Banco real y eliminar conexiones) ────────────
router.post('/api/facturas/:id/pagar', verificarSesion, verificarPermiso('rsp', 'gestionar_facturas'), async (req, res) => {
  try {
    const result = await pagarFactura(req.params.id);
    if (result.success) {
      // Eliminar las conexiones facturadas si la factura tiene IDs
      const factura = getFacturas().find(f => f.id === req.params.id);
      if (factura && factura.conexionIds && factura.conexionIds.length > 0) {
        const eliminadas = eliminarConexionesPorIds(factura.conexionIds);
        result.conexionesEliminadas = eliminadas;
      }
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── API: Estado de fondos ─────────────────────────────────────────────────
router.get('/api/fondos', verificarSesion, verificarPermiso('rsp', 'ver_fondos'), (req, res) => {
  res.json(getEstadoFondos());
});

// ── API: Pagar sanción IVA (vía Banco real) ──────────────────────────────
router.post('/api/fondos/pagar-sancion', verificarSesion, verificarPermiso('rsp', 'pagar_sancion'), async (req, res) => {
  try {
    const result = await pagarSancionIVA();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── API: Registrar conexión externa ───────────────────────────────────────
router.post('/api/conexiones/registrar', (req, res) => {
  // Permitir acceso público con api_key (para plid26-main y otras apps)
  const apiKey = req.query.api_key || req.headers['x-api-key'];
  const docsKey = process.env.DOCS_API_KEY || 'docs-shared-key-2026';
  const tienePermiso = req.session?.usuario || apiKey === docsKey;
  if (!tienePermiso) {
    return res.status(401).json({ error: 'Se requiere autenticación' });
  }

  const { entidad, tipo, endpoint, dip, detalle } = req.body;
  if (!entidad || !tipo) return res.status(400).json({ error: 'entidad y tipo son requeridos' });
  if (![TIPO_CONEXION.CONSULTA, TIPO_CONEXION.MODIFICACION].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser "consulta" o "modificacion"' });
  }

  const conexion = registrarConexion({
    entidad,
    tipo,
    endpoint: endpoint || 'api-externa',
    usuario: req.session?.usuario?.nombre || 'sistema',
    dip: dip || req.session?.usuario?.dip || '',
    detalle: detalle || ''
  });

  res.json({ success: true, conexion });
});

// Endpoint público para registrar conexiones desde plid26-main y otras apps
// Se monta en server.js ANTES del middleware de sesión
export function registrarConexionPublica(req, res) {
  const apiKey = req.query.api_key || req.headers['x-api-key'];
  const docsKey = process.env.DOCS_API_KEY || 'docs-shared-key-2026';
  if (apiKey !== docsKey) {
    return res.status(401).json({ error: 'API Key inválida' });
  }
  const { entidad, tipo, endpoint, usuario, dip, detalle } = req.body;
  if (!entidad || !tipo) return res.status(400).json({ error: 'entidad y tipo son requeridos' });
  if (![TIPO_CONEXION.CONSULTA, TIPO_CONEXION.MODIFICACION].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser "consulta" o "modificacion"' });
  }
  const conexion = registrarConexion({
    entidad, tipo, endpoint: endpoint || 'api-externa',
    usuario: usuario || 'sistema', dip: dip || '', detalle: detalle || ''
  });
  res.json({ success: true, conexion });
}

export default router;
