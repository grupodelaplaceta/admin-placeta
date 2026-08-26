/* ═══════════════════════════════════════════════════════════════════════
   rsp-web-api — Rutas de dominio (lectura + escritura) del BFF.
   Implementación de REFERENCIA con almacén en memoria: cubre el contrato
   del httpProvider del SPA para que admin-placeta pueda desaparecer como
   capa web. Sustituir `store` por Supabase/Postgres en producción.
   Los datos del banco se leen en vivo (getBankState) y las mutaciones
   bancarias se aplican como overlay en memoria (el crm-state es de solo
   lectura). Las reglas de cierre/reparto replican el motor del SPA.
   ═══════════════════════════════════════════════════════════════════════ */
import { Router } from 'express';
import { calcularContribuyentes } from './tributos.js';
import { coleccion } from './db.js';
import { crearYEnviarFirma, estadoFirma, enviarVotacionPlacetaID, cerrarVotacionPlacetaID } from './firmas.js';
import { CATALOGO_BASE } from './tramites-catalogo.js';
import { CATALOGO_EDU_BASE } from './edu-cursos.js';

const AHORA = () => new Date().toISOString();
const BOP_URL = (process.env.BOP_URL || 'https://bop.laplaceta.org').replace(/\/+$/, '');
const round2 = (n) => Math.round(n * 100) / 100;
const limpiar = (s = '') => String(s).replace(/\s*\(.*\)\s*$/, '').trim();

export function createApiRouter({ getBankState }) {
  const router = Router();

  // El catálogo oficial vive en BOP. RSP solo lo cachea para resiliencia:
  // nunca mezcla rsp_cnic ni genera una copia normativa propia.
  let bopHttpCache = { at: 0, data: null };
  async function cargarCnicOficial() {
    if (bopHttpCache.data && Date.now() - bopHttpCache.at < 60_000) return bopHttpCache.data;
    try {
      const response = await fetch(`${BOP_URL}/api/cnic`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`BOP respondió ${response.status}`);
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : payload.cnic;
      if (!Array.isArray(rows)) throw new Error('Respuesta CNIC inválida');
      const data = rows.map((row) => normalizarBopCnic({
        ...row,
        codigo: row.codigo || row.cnic,
        tipoValor: row.tipoValor || row.tipo_valor || row.tipo,
        valor: row.valor ?? row.valor_vigente,
        autorDip: row.autorDip || row.autor_dip,
        updatedAt: row.updatedAt || row.desde,
        vigente: row.vigente ?? row.estado === 'vigente',
      }));
      bopHttpCache = { at: Date.now(), data };
      return data;
    } catch {
      return null;
    }
  }

  /* ── Almacén persistente (Supabase) con respaldo en memoria ────────── */
  // Cada colección lee/escribe en Supabase (Postgres). Si Supabase no está
  // configurado (SUPABASE_SERVICE_KEY), opera en memoria sin persistencia.
  const store = {
    ciudadanos: [],   // derivados del banco en `ciudadanosDelBanco()`
    entidades: [],    // derivadas del banco en `entidadesDelBanco()`
    expedientes: coleccion('rsp_expedientes'),
    tramites: coleccion('rsp_tramites'),
    tramitesCatalogo: coleccion('rsp_tramites_catalogo'),
    eduCursos: coleccion('rsp_edu_cursos'),
    subvenciones: coleccion('rsp_subvenciones'),
    bonos: coleccion('rsp_bonos'),
    operaciones: coleccion('rsp_operaciones'),
    auditoria: coleccion('rsp_auditoria'),
    notificaciones: coleccion('rsp_notificaciones'),
    cnic: coleccion('rsp_cnic'),
    bopCnic: coleccion('bop_cnic'),
    bopDocumentos: coleccion('bop_documentos'),
    bopVersiones: coleccion('bop_versiones'),
    juniorActividadesDb: coleccion('junior_actividades', { orderCol: 'creado_en' }),
    juniorColaboradoresDb: coleccion('junior_colaboradores', { orderCol: 'creado_en' }),
    juniorDiplomasDb: coleccion('junior_diplomas', { orderCol: 'creado_en' }),
    juniorCodigosDb: coleccion('junior_codigos', { orderCol: 'creado_en' }),
    juniorSubapartadosDb: coleccion('junior_subapartados', { orderCol: 'orden' }),
    votaciones: coleccion('rsp_votaciones'),
    votos: coleccion('rsp_registro_votos'),
    juntas: coleccion('rsp_reuniones'),
    encuestas: coleccion('rsp_encuestas'),
    nominas: coleccion('rsp_nominas'),
    // En memoria (sesión): detalle de subvenciones/bonos y estado 2FA.
    subvencionesDetalle: {},
    bonosDetalle: {},
    juniorActividades: [],
    juniorColaboradores: [],
    juniorDiplomas: [],
    solicitudes2fa: new Map(),
  };

  // CNIC reales del BOP (fallback si la tabla rsp_cnic aún no está migrada).
  const CNIC_BASE = [
    { codigo: 'CNIC-IGF-PF-TIPO-3', etiqueta: 'Tipo IGF personas físicas tramo 3', tipoValor: 'porcentaje', valor: 30, unidad: '%', version: 1, estado: 'vigente', autor: 'Tributos', fuente: 'BOP' },
    { codigo: 'CNIC-IGF-EMPRESA-TIPO-4', etiqueta: 'Tipo IGF empresas tramo 4', tipoValor: 'porcentaje', valor: 85, unidad: '%', version: 1, estado: 'vigente', autor: 'Tributos', fuente: 'BOP' },
  ];

  // Adapta una fila de bop_cnic (Supabase) al contrato CNICRegla del SPA.
  function normalizarBopCnic(row) {
    const historial = Array.isArray(row.historial) ? row.historial : [];
    const valor = Number(row.valor);
    return {
      codigo: row.codigo,
      etiqueta: row.etiqueta || row.codigo,
      tipoValor: row.tipoValor || 'porcentaje',
      valor: Number.isNaN(valor) ? (row.valor ?? '') : valor,
      unidad: row.unidad || '%',
      version: historial.length + 1,
      estado: row.estado || (row.vigente ? 'vigente' : 'borrador'),
      autor: row.autorDip || 'BOP',
      fuente: 'BOP',
      bopUrl: `https://bop.laplaceta.org/cnic.html?codigo=${encodeURIComponent(row.codigo)}`,
      historial: historial.map((h, i) => ({ version: i + 1, valor: h.valor, desde: h.desde, notas: h.notas })),
    };
  }

  // Cachea los CNIC vigentes del BOP (bop_cnic) para el motor fiscal.
  let cnicCache = { t: 0, data: null };
  async function cargarCnicVigentes() {
    const oficial = await cargarCnicOficial();
    if (oficial) return oficial.filter((r) => r.estado === 'vigente');
    if (cnicCache.data && Date.now() - cnicCache.t < 60000) return cnicCache.data;
    try {
      const bop = (await store.bopCnic.listar()) || [];
      cnicCache = { t: Date.now(), data: bop.filter((r) => r.vigente).map(normalizarBopCnic) };
    } catch {
      cnicCache = { t: Date.now(), data: null };
    }
    return cnicCache.data;
  }

  let nuevaCuentaSeq = 0;
  const nuevasCuentas = [];
  const overlayCuentas = new Map();
  const overlayTarjetas = new Map();

  function mapearCuenta(a) {
    const nombre = limpiar(a.displayName || a.name || a.id);
    const holders = (a.accountHolders || [])
      .filter((h) => Number(h.ownershipPercent || h.pct || 0) > 0)
      .map((h) => ({
        dip: String(h.placetaId || h.dip || '').toUpperCase(),
        nombre: limpiar(h.displayName || h.name || h.placetaId || h.dip || ''),
        pct: Number(h.ownershipPercent || h.pct || 0),
      }));
    return {
      id: a.id,
      nombre,
      tipo: a.type || 'Current',
      dip: (a.placetaId || '').toUpperCase(),
      saldo: Number(a.balancePz || 0),
      estado: a.closedAt ? 'cerrada' : 'activa',
      esFundacion: /fundacion|fundación/i.test(nombre) || /^FUND-/.test(a.id || ''),
      eip: String(a.eip || '').toUpperCase(),
      participaciones: holders,
    };
  }
  function mapearTarjeta(d) {
    const num = String(d.cardNumber || d.id || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
    return {
      id: d.id, alias: d.alias || 'Tarjeta', accountId: d.accountId || '',
      tier: d.tier || 'Standard', frozen: !!d.frozen, cardNumber: num,
      promoPhysical: !!d.promoPhysical, pin: d.pin || '0000',
      contactlessLimitPz: 500, weeklyLimitPz: 1000,
    };
  }

  async function listarCuentas() {
    const state = await getBankState();
    const base = (state.accounts || []).map(mapearCuenta);
    return [...base, ...nuevasCuentas].map((c) => ({ ...c, ...(overlayCuentas.get(c.id) || {}) }));
  }
  async function listarTarjetas() {
    const state = await getBankState();
    const base = (state.digitalCards || state.cards || []).map(mapearTarjeta);
    return base.map((t) => ({ ...t, ...(overlayTarjetas.get(t.id) || {}) }));
  }
  function mutarCuenta(id, patch) {
    overlayCuentas.set(id, { ...(overlayCuentas.get(id) || {}), ...patch });
  }

  /* ── Entidades derivadas de las cuentas Business reales del banco ── */
  const EIP_POR_NOMBRE = {
    'Unhiro S.PV.': 'EIP-XJETNL',
    'Unhiro Inversiones S.P.': 'EIP-XJETNL',
    'Red del Grupo de La Placeta S.P.': 'EIP-X4NGQU',
    // 'Placeta Telecom S.P.': EIP pendiente de confirmar (llega por `eip` real).
    'Capitália Empresa': 'CAPITALIA_BANK',
  };
  const NOMBRE_EIP = {
    'EIP-XJETNL': 'Unhiro Inversiones S.P.',
    'EIP-X4NGQU': 'Red del Grupo de La Placeta S.P.',
    'CAPITALIA_BANK': 'Capitália Empresa',
  };
  const SISTEMA_CUENTA = /^(TGLP|AGLDP|VAULT_EMISION|DIP-|sys-|biz-market-|FUND-BLP)$/;
  function eipDeCuenta(c) {
    if (c.eip) return c.eip;
    if (SISTEMA_CUENTA.test(c.id)) return '';
    return EIP_POR_NOMBRE[c.nombre] || '';
  }
  async function entidadesDelBanco() {
    const cuentas = await listarCuentas();
    const map = new Map();
    for (const c of cuentas) {
      if (c.tipo !== 'Business' || c.estado === 'cerrada') continue;
      const eip = eipDeCuenta(c);
      if (!eip) continue;
      let e = map.get(eip);
      if (!e) {
        e = {
          eip,
          nombre: NOMBRE_EIP[eip] || c.nombre,
          tipo: eip === 'CAPITALIA_BANK' ? 'Sociedad pública' : 'Sociedad',
          representantes: [],
          estado: 'activa',
          cumplimiento: 'Al día',
          cuentas: 0,
          titulares: 0,
          participacionTotal: 0,
        };
        map.set(eip, e);
      }
      e.cuentas += 1;
      for (const p of c.participaciones || []) {
        if (p.dip && !e.representantes.includes(p.dip)) e.representantes.push(p.dip);
      }
    }
    const out = [];
    for (const e of map.values()) {
      const unicos = new Set(e.representantes);
      out.push({ ...e, titulares: unicos.size, representantes: Array.from(unicos) });
    }
    return out;
  }
  // Ciudadanos REALES derivados de las cuentas del banco (placetaId = DIP).
  async function ciudadanosDelBanco() {
    const cuentas = await listarCuentas();
    const DIP = /^[XYZ0-9][0-9]{7,8}[A-Z]$/;
    const map = new Map();
    for (const c of cuentas) {
      if (!DIP.test(c.dip)) continue;
      const e = map.get(c.dip) || { dip: c.dip, nombre: c.nombre, nivel: 'N1', cuentas: 0, expedientesActivos: 0, estado: 'activo' };
      e.cuentas += 1;
      map.set(c.dip, e);
    }
    return Array.from(map.values());
  }
  // Facturas emitidas: ventas reales (sender = empresa) desde los movimientos.
  function facturasDe(eip, state, cuentas) {
    const propias = new Set(cuentas.filter((c) => eipDeCuenta(c) === eip).map((c) => c.id));
    const KINDS_VENTA = new Set(['Consumption', 'Placezum', 'OperationalFee', 'Service']);
    const facturas = [];
    for (const t of state.transactions || []) {
      if (t.status && String(t.status).toLowerCase() !== 'settled') continue;
      if (!propias.has(t.fromAccountId || t.fromIban)) continue;
      if (!KINDS_VENTA.has(t.kind || t.concept)) continue;
      facturas.push({
        id: t.id,
        numero: t.id,
        concepto: t.concept || t.kind || 'Venta',
        importe: Number(t.amountPz || t.netAmount || 0),
        estado: 'cobrada',
        fecha: (t.createdAt || t.timestamp || '').slice(0, 10),
        receptor: '',
        receptorId: t.toAccountId || t.toIban || '',
      });
    }
    return facturas;
  }

  // Requisitos de bono: comprobación automática contra datos reales.
  function cumple(actual, operador, valor) {
    switch (operador) {
      case '<': return actual < valor;
      case '>': return actual > valor;
      case '<=': return actual <= valor;
      case '>=': return actual >= valor;
      case '==': return actual === valor;
      default: return false;
    }
  }
  async function verificarRequisitos(dip, requisitos) {
    const cuentas = await listarCuentas();
    const ciudadanos = await ciudadanosDelBanco();
    const propias = cuentas.filter((c) => c.dip === dip && c.estado === 'activa');
    const junior = propias.some((c) => c.tipo === 'Child') ? 1 : 0;
    const nivel = ciudadanos.find((c) => c.dip === dip)?.nivel === 'N3' ? 3 : 1;
    const datos = {
      patrimonio: propias.reduce((s, c) => s + c.saldo, 0),
      cuentas: propias.length,
      junior,
      edad: junior ? 15 : 18,
      nivel,
      fiscal: 1, // al día por defecto en el censo del BFF de referencia
    };
    const fallos = [];
    for (const r of requisitos || []) {
      const actual = datos[r.tipo];
      if (typeof actual !== 'number' || !cumple(actual, r.operador, r.valor)) fallos.push(r);
    }
    return fallos;
  }

  function cerrarCuenta(c, motivo) {
    if (c.estado === 'cerrada') throw new Error('La cuenta ya está cerrada');
    if (c.esFundacion) throw new Error('Las fundaciones no se pueden cerrar ni repartir');
    if (c.tipo === 'Business') {
      if (c.saldo > 0) throw new Error('Reparte antes los fondos de la empresa conforme al % de participaciones');
    } else if (c.saldo > 0) {
      if (motivo !== 'baja' && motivo !== 'herencia') {
        throw new Error('No se pueden cerrar cuentas personales con capital salvo baja de usuario o herencia');
      }
    }
    return { estado: 'cerrada' };
  }

  function repartir(c, cuentas) {
    if (c.tipo !== 'Business') throw new Error('Solo las cuentas de empresa se reparten conforme al %');
    if (c.esFundacion) throw new Error('Las fundaciones no se reparten ni se cierran');
    if (c.saldo <= 0) throw new Error('La cuenta no tiene fondos que repartir');
    const partes = c.participaciones || [];
    if (partes.length === 0) throw new Error('Sin participaciones registradas para repartir');
    let restante = c.saldo;
    partes.forEach((p, i) => {
      const importe = i === partes.length - 1 ? round2(restante) : round2((c.saldo * p.pct) / 100);
      const destino = cuentas.find((x) => x.dip === p.dip && x.estado === 'activa' && (x.tipo === 'Current' || x.tipo === 'Savings'));
      if (destino) mutarCuenta(destino.id, { saldo: round2(destino.saldo + importe) });
      restante = round2(restante - importe);
    });
    mutarCuenta(c.id, { saldo: 0 });
  }

  /* ── Trámites ────────────────────────────────────────────────────── */
  router.get('/rsp/tramites/api', async (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    const estado = req.query.estado;
    let lista = await store.tramites.listar();
    if (q) lista = lista.filter((t) => t.titulo.toLowerCase().includes(q) || t.dip.toLowerCase().includes(q));
    if (estado) lista = lista.filter((t) => t.estado === estado);
    res.json(lista);
  });
  router.get('/rsp/tramites/api/bandeja', async (_req, res) => {
    const lista = await store.tramites.listar();
    res.json(lista.filter((t) => t.asignadoA || t.vencido));
  });
  router.get('/rsp/tramites/api/:id', async (req, res) => {
    const t = await store.tramites.obtener(req.params.id);
    if (!t) return res.status(404).json({ error: 'Trámite no encontrado' });
    res.json({ ...t, requisitos: [], documentos: [], actuaciones: [] });
  });
  router.post('/rsp/tramites/api', async (req, res) => {
    const d = req.body || {};
    const t = {
      id: `TR-${Date.now()}`,
      tipo: d.tipo || 'certificado',
      titulo: d.concepto || d.tipo,
      dip: d.dip,
      nombreCiudadano: d.nombre || d.dip,
      estado: 'inicio',
      plazo: 10,
      servicio: d.servicio || 'RSP',
      actualizadoEn: AHORA(),
      datosEspecificos: d.datos || {},
    };
    await store.tramites.insertar(t);
    res.status(201).json(t);
  });
  router.post('/rsp/tramites/api/:id/accion', async (req, res) => {
    const t = await store.tramites.obtener(req.params.id);
    if (!t) return res.status(404).json({ error: 'Trámite no encontrado' });
    const accion = req.body?.accion;
    const estado = accion === 'resolver' ? 'resolucion' : accion || t.estado;
    await store.tramites.actualizar(req.params.id, { estado, actualizadoEn: AHORA() });

    // Al emitir firma, se crea y envía el documento a PlacetaID Móvil.
    let firma = null;
    if (accion === 'emitir_firma') {
      try {
        firma = await crearYEnviarFirma({
          titulo: t.titulo || `Firma de ${req.params.id}`,
          tipo: 'resolucion',
          dip: t.dip,
          tramiteId: t.id,
          accion,
        });
      } catch { /* la firma es best-effort: no bloquea el avance del trámite */ }
    }
    res.json({ ...t, estado, actualizadoEn: AHORA(), firma });
  });

  /* ── Catálogo de trámites públicos (administrable desde RSP) ─────────── */
  async function asegurarCatalogo() {
    const existentes = await store.tramitesCatalogo.listar();
    if ((existentes || []).length > 0) return;
    for (const t of CATALOGO_BASE) await store.tramitesCatalogo.insertar({ ...t });
  }
  router.get('/rsp/tramites-catalogo/api', async (_req, res) => {
    await asegurarCatalogo();
    const lista = await store.tramitesCatalogo.listar();
    res.json([...lista].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)));
  });
  router.post('/rsp/tramites-catalogo/api', async (req, res) => {
    const d = req.body || {};
    if (!d.id || !d.nombre) return res.status(400).json({ error: 'id y nombre requeridos' });
    const item = {
      id: String(d.id).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      nombre: String(d.nombre),
      descripcion: String(d.descripcion || ''),
      icono: String(d.icono || '📋'),
      seccion: String(d.seccion || 'identidad'),
      ambito: String(d.ambito || 'ecosistema'),
      tipoEnlace: d.tipoEnlace === 'ruta' ? 'ruta' : 'accion',
      ruta: String(d.ruta || ''),
      accion: String(d.accion || d.id),
      requisitos: Array.isArray(d.requisitos) ? d.requisitos.map(String) : [],
      documentacion: Array.isArray(d.documentacion) ? d.documentacion.map(String) : [],
      plazo: Number(d.plazo || 15),
      activo: d.activo !== false,
      orden: Number(d.orden ?? 99),
      actualizadoEn: AHORA(),
    };
    const prev = await store.tramitesCatalogo.obtener(d.id);
    if (prev) await store.tramitesCatalogo.actualizar(d.id, item);
    else await store.tramitesCatalogo.insertar(item);
    res.json({ ok: true, id: item.id });
  });
  router.post('/rsp/tramites-catalogo/api/:id/estado', async (req, res) => {
    const t = await store.tramitesCatalogo.obtener(req.params.id);
    if (!t) return res.status(404).json({ error: 'Trámite del catálogo no encontrado' });
    const activo = req.body?.activo !== undefined ? !!req.body.activo : !t.activo;
    await store.tramitesCatalogo.actualizar(req.params.id, { activo, actualizadoEn: AHORA() });
    res.json({ ok: true, id: req.params.id, activo });
  });

  /* ── Cursos de Placeta EDU (RSP como sistema central) ─────────────────── */
  async function asegurarCursosEdu() {
    const existentes = await store.eduCursos.listar();
    if ((existentes || []).length > 0) return;
    for (const c of CATALOGO_EDU_BASE) await store.eduCursos.insertar({ ...c, creadoEn: AHORA() });
  }
  router.get('/rsp/edu/api/cursos', async (_req, res) => {
    await asegurarCursosEdu();
    const lista = await store.eduCursos.listar();
    res.json([...lista].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)));
  });
  router.post('/rsp/edu/api/cursos', async (req, res) => {
    const d = req.body || {};
    if (!d.id || !d.titulo) return res.status(400).json({ error: 'id y titulo requeridos' });
    const curso = {
      id: String(d.id).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      titulo: String(d.titulo),
      descripcion: String(d.descripcion || ''),
      categoria: String(d.categoria || 'general'),
      categoriaLabel: String(d.categoriaLabel || d.categoria || 'General'),
      plazas: Number(d.plazas || 0),
      inscritos: Number(d.inscritos || 0),
      estado: String(d.estado || 'abierta'),
      precio: String(d.precio || 'Gratis'),
      duracion: String(d.duracion || ''),
      fechaInicio: d.fechaInicio || '',
      fechaFin: d.fechaFin || '',
      emoji: String(d.emoji || '📚'),
      requisitos: Array.isArray(d.requisitos) ? d.requisitos.map(String) : [],
      orden: Number(d.orden ?? 99),
      activo: d.activo !== false,
      actualizadoEn: AHORA(),
    };
    const prev = await store.eduCursos.obtener(curso.id);
    if (prev) await store.eduCursos.actualizar(curso.id, curso);
    else await store.eduCursos.insertar(curso);
    res.json({ ok: true, id: curso.id });
  });
  router.post('/rsp/edu/api/cursos/:id/estado', async (req, res) => {
    const c = await store.eduCursos.obtener(req.params.id);
    if (!c) return res.status(404).json({ error: 'Curso no encontrado' });
    const activo = req.body?.activo !== undefined ? !!req.body.activo : c.activo !== false;
    await store.eduCursos.actualizar(req.params.id, { activo, actualizadoEn: AHORA() });
    res.json({ ok: true, id: req.params.id, activo });
  });

  /* ── Firma vía PlacetaID Móvil ────────────────────────────────────── */
  router.post('/api/firmas/crear', async (req, res) => {
    const d = req.body || {};
    try {
      const firma = await crearYEnviarFirma({
        titulo: d.titulo || `Firma de ${d.accion || 'trámite'}`,
        tipo: d.tipo || 'resolucion',
        dip: d.dip,
        tramiteId: d.tramiteId || d.objetoId,
        accion: d.accion,
      });
      res.status(201).json({ id: firma.id, estado: firma.enviado ? 'enviada' : 'pendiente', enviado: firma.enviado });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.get('/api/firmas/estado/:id', async (req, res) => {
    res.json(await estadoFirma(req.params.id));
  });
  router.post('/rsp/tramites/api/2fa/enviar', (req, res) => {
    const id = `2FA-${Date.now()}`;
    store.solicitudes2fa.set(id, 'pendiente');
    res.json({ id, estado: 'pendiente' });
  });
  router.get('/rsp/tramites/api/2fa/estado/:id', (req, res) => {
    const s = store.solicitudes2fa.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Solicitud 2FA no encontrada' });
    store.solicitudes2fa.set(req.params.id, 'confirmada');
    res.json(true);
  });

  /* ── Expedientes ─────────────────────────────────────────────────── */
  router.get('/rsp/expedientes/api', async (_req, res) => {
    res.json(await store.expedientes.listar());
  });
  router.get('/rsp/expedientes/api/:id', async (req, res) => {
    const e = await store.expedientes.obtener(req.params.id);
    if (!e) return res.status(404).json({ error: 'Expediente no encontrado' });
    res.json({ ...e, actuaciones: [] });
  });

  /* ── Ciudadanos / entidades ──────────────────────────────────────── */
  router.get('/rsp/api/ciudadanos', async (req, res) => {
    try {
      const todos = await ciudadanosDelBanco();
      const q = String(req.query.q || '').toLowerCase();
      const lista = q ? todos.filter((c) => c.nombre.toLowerCase().includes(q) || c.dip.toLowerCase().includes(q)) : todos;
      res.json(lista);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.get('/rsp/api/contexto/:dip', async (req, res) => {
    try {
      const c = (await ciudadanosDelBanco()).find((x) => x.dip === req.params.dip);
      if (!c) return res.status(404).json({ error: 'Ciudadano no encontrado' });
      res.json({ ...c, email: `${c.dip.toLowerCase()}@laplaceta.org`, bloques: [{ clave: 'identidad', etiqueta: 'Identidad', icono: 'user', items: [{ clave: 'nivel', etiqueta: 'Nivel', valor: c.nivel }] }] });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.post('/rsp/api/ciudadanos/:dip', async (req, res) => {
    try {
      const dip = String(req.params.dip || '').toUpperCase();
      const datos = req.body || {};
      const cuentas = await listarCuentas();
      const propias = cuentas.filter((c) => c.dip === dip);
      if (propias.length === 0) return res.status(404).json({ error: 'Ciudadano no encontrado' });
      let nombre = propias[0].nombre;
      if (datos.nombre) {
        nombre = String(datos.nombre).trim();
        if (!nombre) return res.status(400).json({ error: 'Nombre inválido' });
        for (const c of propias) mutarCuenta(c.id, { nombre });
      }
      res.json({ ok: true, dip, nombre });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.get('/rsp/api/ciudadanos/:dip/documentos', (_req, res) => res.json([]));
  router.get('/rsp/api/ciudadanos/:dip/firmas', (_req, res) => res.json([]));
  router.get('/rsp/api/ciudadanos/:dip/obligaciones', (_req, res) => res.json([]));
  router.get('/rsp/api/cuentas/buscar', async (req, res) => {
    try {
      const q = String(req.query.q || '').toLowerCase();
      const cuentas = await listarCuentas();
      res.json(cuentas.filter((c) => c.id.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)).map((c) => ({ id: c.id, etiqueta: `${c.nombre} · ${c.tipo}`, tipo: c.tipo })));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.get('/rsp/api/entidades', async (_req, res) => {
    try { res.json(await entidadesDelBanco()); } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/api/entidades/:eip', async (req, res) => {
    try {
      const eip = req.params.eip;
      const cuentas = await listarCuentas();
      const ciudadanos = await ciudadanosDelBanco();
      const propias = cuentas.filter((c) => eipDeCuenta(c) === eip);
      const entidad = (await entidadesDelBanco()).find((x) => x.eip === eip);
      if (!entidad && propias.length === 0) return res.status(404).json({ error: 'Entidad no encontrada' });

      // Participación agregada por titular.
      const suma = new Map();
      for (const c of propias) {
        for (const p of c.participaciones || []) {
          if (p.dip) suma.set(p.dip, (suma.get(p.dip) || 0) + p.pct);
        }
      }
      const participacion = Array.from(suma.entries()).map(([dip, pct]) => ({
        dip,
        nombre: ciudadanos.find((x) => x.dip === dip)?.nombre || dip,
        pct: Math.round(pct * 10) / 10,
      }));

      const state = await getBankState();
      const facturas = facturasDe(eip, state, cuentas);
      const tramites = (await store.tramites.listar()).filter((t) => t.dip === eip);

      res.json({
        eip,
        nombre: entidad?.nombre || NOMBRE_EIP[eip] || (propias[0]?.nombre ?? eip),
        tipo: entidad?.tipo || 'Sociedad',
        estado: entidad?.estado || 'activa',
        cumplimiento: entidad?.cumplimiento,
        representantes: (entidad?.representantes || []).map((dip) => ({
          dip,
          nombre: ciudadanos.find((x) => x.dip === dip)?.nombre || dip,
          cargo: 'Representante legal',
        })),
        documentos: [],
        obligaciones: [],
        cuentas: propias,
        facturasEmitidas: facturas,
        participacion,
        tramites,
      });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // POST /rsp/api/entidades/:eip — editar nombre y participaciones.
  // Las participaciones se sincronizan con las cuentas del banco (overlay),
  // de modo que RSP y Banco muestran exactamente los mismos titulares.
  router.post('/rsp/api/entidades/:eip', async (req, res) => {
    try {
      const eip = req.params.eip;
      const d = req.body || {};
      const cuentas = await listarCuentas();
      const propias = cuentas.filter((c) => eipDeCuenta(c) === eip);
      if (propias.length === 0) return res.status(404).json({ error: 'Entidad no encontrada' });
      if (d.nombre) {
        const nombre = String(d.nombre).trim();
        if (!nombre) return res.status(400).json({ error: 'Nombre inválido' });
        for (const c of propias) mutarCuenta(c.id, { nombre });
      }
      if (Array.isArray(d.participaciones)) {
        const parts = d.participaciones
          .map((p) => ({ dip: String(p.dip || '').toUpperCase(), nombre: p.nombre || p.dip || '', pct: Number(p.pct) || 0 }))
          .filter((p) => p.dip && p.pct > 0);
        const total = parts.reduce((s, p) => s + p.pct, 0);
        if (parts.length > 0 && Math.abs(total - 100) > 0.01) {
          return res.status(400).json({ error: `La suma de participaciones debe ser 100% (actual ${Math.round(total * 10) / 10}%)` });
        }
        for (const c of propias) mutarCuenta(c.id, { participaciones: parts });
      }
      res.json({ ok: true, eip });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // GET /rsp/api/entidades/:eip/facturas — facturas emitidas por la entidad
  router.get('/rsp/api/entidades/:eip/facturas', async (req, res) => {
    try {
      const eip = req.params.eip;
      const cuentas = await listarCuentas();
      const state = await getBankState();
      res.json(facturasDe(eip, state, cuentas));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  /* ── Nóminas del banco ──────────────────────────────────────────── */
  router.get('/rsp/nominas/api', async (_req, res) => res.json(await store.nominas.listar()));
  router.post('/rsp/nominas/api', async (req, res) => {
    const d = req.body || {};
    if (!d.dip || !Number(d.bruto)) return res.status(400).json({ error: 'DIP y bruto requeridos' });
    const bruto = Number(d.bruto);
    const retenciones = Number(d.retenciones) || 0;
    const n = {
      id: `NOM-${Date.now()}`,
      dip: String(d.dip).toUpperCase(),
      nombre: d.nombre || d.dip,
      periodo: d.periodo || new Date().toISOString().slice(0, 7),
      bruto,
      retenciones,
      neto: Number(d.neto) || (bruto - retenciones),
      cuentaBanco: d.cuentaBanco || '',
      estado: 'pendiente',
      actualizadoEn: AHORA(),
    };
    await store.nominas.insertar(n);
    res.status(201).json(n);
  });

  /* ── Fundaciones (detección automática) ──────────────────────────── */
  router.get('/rsp/api/fundaciones', async (_req, res) => {
    try {
      const cuentas = await listarCuentas();
      res.json(cuentas.filter((c) => c.esFundacion).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        dip: c.dip || '',
        eip: c.eip || '',
        saldo: c.saldo,
        estado: c.estado,
        regimen: 'Exenta de IGF y de reparto; patrimonio afecto a fines sociales (CNIC-FUND-001)',
      })));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  /* ── Subvenciones ────────────────────────────────────────────────── */
  router.get('/rsp/subvenciones/api', async (_req, res) => res.json(await store.subvenciones.listar()));
  router.get('/rsp/subvenciones/api/:id', (req, res) => {
    const s = store.subvencionesDetalle[req.params.id];
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    res.json(s);
  });
  router.post('/rsp/subvenciones/api/conceder', async (req, res) => {
    const d = req.body || {};
    const s = {
      id: `SUB-${Date.now()}`,
      emisorEip: d.emisorEip, emisorNombre: d.emisorEip,
      receptorEip: d.receptorEip, receptorNombre: d.receptorEip,
      importe: d.importe, importeRestante: d.importe,
      concepto: d.concepto, estado: 'concedida', fechaConcesion: AHORA().slice(0, 10),
      publicada: d.publicada ?? false,
    };
    await store.subvenciones.insertar(s);
    store.subvencionesDetalle[s.id] = {
      ...s, documentosRequeridos: [], gastos: [], justificaciones: [],
      excluirTipos: ['Tax', 'IrmCharge', 'IvaAdjustment'],
      tiposAptos: d.tiposAptos || [],
      baremos: d.baremos || [],
      publicadaEn: d.publicada ? AHORA() : undefined,
      bopUrl: d.publicada ? `https://gdlp.laplaceta.org/subvenciones.html?codigo=${s.id}` : undefined,
    };
    res.status(201).json(s);
  });
  router.post('/rsp/subvenciones/api/:id/requerir-documentos', (req, res) => {
    const s = store.subvencionesDetalle[req.params.id];
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    s.documentosRequeridos = (req.body?.documentos || []).map((nombre, i) => ({ id: `DOC-${i}`, nombre, tipo: 'anexo', aportado: false }));
    res.json({ ok: true });
  });
  router.post('/rsp/subvenciones/api/:id/justificar', (req, res) => {
    const s = store.subvencionesDetalle[req.params.id];
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    s.estado = 'justificada';
    res.json({ ok: true });
  });

  /* ── Bonificaciones (bonos) ──────────────────────────────────────── */
  router.get('/rsp/bonos/api', async (_req, res) => res.json(await store.bonos.listar()));
  router.get('/rsp/bonos/api/:id', (req, res) => {
    const b = store.bonosDetalle[req.params.id];
    if (!b) return res.status(404).json({ error: 'Bono no encontrado' });
    res.json(b);
  });
  router.post('/rsp/bonos/api', async (req, res) => {
    const d = req.body || {};
    const b = {
      id: `BONO-${Date.now()}`, nombre: d.nombre, emisorEip: d.emisorEip, emisorNombre: d.emisorEip,
      presupuesto: d.presupuesto, maxPorPersona: d.maxPorPersona, baremos: d.baremos || [],
      requisitos: d.requisitos || [],
      fechaLimite: d.fechaLimite, presupuestoUsado: 0, adscritos: 0, estado: 'activo',
    };
    await store.bonos.insertar(b);
    store.bonosDetalle[b.id] = { ...b, adscripciones: [], justificaciones: [] };
    res.status(201).json(b);
  });
  router.post('/rsp/bonos/api/:id/adscribir', async (req, res) => {
    const b = await store.bonos.obtener(req.params.id);
    if (!b) return res.status(404).json({ error: 'Bono no encontrado' });
    const dip = (req.body?.dip || '').toUpperCase();

    // Comprobación automática de requisitos contra datos reales del banco.
    try {
      const fallos = await verificarRequisitos(dip, b.requisitos);
      if (fallos.length) {
        const detalle = fallos.map((f) => f.descripcion).join(' · ');
        return res.status(400).json({ error: `No cumple los requisitos: ${detalle}` });
      }
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }

    const detalle = store.bonosDetalle[b.id] || { ...b, adscripciones: [], justificaciones: [] };
    if (!detalle.adscripciones.some((a) => a.dip === dip)) {
      detalle.adscripciones.push({ dip, nombre: dip, fechaAdscripcion: AHORA().slice(0, 10), justificado: 0 });
      store.bonosDetalle[b.id] = detalle;
      await store.bonos.actualizar(b.id, { adscritos: (b.adscritos || 0) + 1, presupuestoUsado: Math.min(b.presupuesto, (b.presupuestoUsado || 0) + b.maxPorPersona) });
    }
    res.json({ ok: true });
  });

  /* ── Banco (lectura viva + overlay de mutaciones) ────────────────── */
  router.get('/rsp/banco/api/cuentas', async (_req, res) => {
    try { res.json(await listarCuentas()); } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/banco/api/tarjetas', async (_req, res) => {
    try { res.json(await listarTarjetas()); } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.post('/rsp/banco/api/cuentas', (req, res) => {
    const d = req.body || {};
    const c = { id: `acc-nueva-${++nuevaCuentaSeq}`, nombre: d.nombre, tipo: d.tipo, dip: (d.dip || '').toUpperCase(), saldo: Number(d.saldoInicial || 0), estado: 'activa' };
    nuevasCuentas.push(c);
    res.status(201).json(c);
  });
  router.post('/rsp/banco/api/cuentas/:id/tipo', async (req, res) => {
    try {
      const c = (await listarCuentas()).find((x) => x.id === req.params.id);
      if (!c) return res.status(404).json({ error: 'Cuenta no encontrada' });
      mutarCuenta(c.id, { tipo: req.body?.tipo || c.tipo });
      res.json({ ok: true });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.post('/rsp/banco/api/cuentas/:id/repartir', async (req, res) => {
    try {
      const cuentas = await listarCuentas();
      const c = cuentas.find((x) => x.id === req.params.id);
      if (!c) return res.status(404).json({ error: 'Cuenta no encontrada' });
      repartir(c, cuentas);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/rsp/banco/api/cuentas/:id/:accion', async (req, res) => {
    try {
      const c = (await listarCuentas()).find((x) => x.id === req.params.id);
      if (!c) return res.status(404).json({ error: 'Cuenta no encontrada' });
      const accion = req.params.accion;
      if (accion === 'bloquear') mutarCuenta(c.id, { estado: 'bloqueada' });
      else if (accion === 'desbloquear') mutarCuenta(c.id, { estado: 'activa' });
      else if (accion === 'cerrar') mutarCuenta(c.id, cerrarCuenta(c, req.body?.motivo));
      else return res.status(400).json({ error: `Acción desconocida: ${accion}` });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/rsp/banco/api/tarjetas/:id/limites', async (req, res) => {
    try {
      const t = (await listarTarjetas()).find((x) => x.id === req.params.id);
      if (!t) return res.status(404).json({ error: 'Tarjeta no encontrada' });
      const patch = {};
      if (typeof req.body?.contactlessLimitPz === 'number') patch.contactlessLimitPz = req.body.contactlessLimitPz;
      if (typeof req.body?.weeklyLimitPz === 'number') patch.weeklyLimitPz = req.body.weeklyLimitPz;
      overlayTarjetas.set(t.id, { ...(overlayTarjetas.get(t.id) || {}), ...patch });
      res.json({ ok: true });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.post('/rsp/banco/api/tarjetas/:id/:accion', async (req, res) => {
    try {
      const t = (await listarTarjetas()).find((x) => x.id === req.params.id);
      if (!t) return res.status(404).json({ error: 'Tarjeta no encontrada' });
      overlayTarjetas.set(t.id, { ...(overlayTarjetas.get(t.id) || {}), frozen: req.params.accion === 'congelar' });
      res.json({ ok: true });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  /* ── Placeta Junior ──────────────────────────────────────────────── */
  // Datos REALES de la Academia (admin-placeta.vercel.app). Sin acceso se
  // degrada al seed representativo del catálogo (nunca inventado).
  const JUNIOR_URL = process.env.JUNIOR_API_URL || 'https://admin-placeta.vercel.app/api/junior';
  async function juniorLive(path) {
    try {
      const r = await fetch(`${JUNIOR_URL}/${path}`);
      if (!r.ok) return null;
      const d = await r.json();
      const arr = Array.isArray(d) ? d : (d?.data ?? null);
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  }
  router.get('/rsp/junior/api/actividades', async (_req, res) => {
    const live = await juniorLive('actividades?solo_publicas=1');
    if (live && live.length) {
      return res.json(live.map((a) => ({
        id: a.id, titulo: a.titulo || a.nombre || 'Actividad',
        edadMin: a.edadMin ?? a.edad_min ?? 6, edadMax: a.edadMax ?? a.edad_max ?? 17,
        complejidad: a.complejidad || 'Media',
        precio: a.precio_total ?? a.precio ?? 5.6,
        recompensa: a.recompensa ?? 10,
        estado: a.estado || 'aprobada',
        colaborador: a.colaborador || '—',
      })));
    }
    // Fuente real: Supabase (junior_actividades), sin depender del proxy HTTP.
    const rows = await store.juniorActividadesDb.listar();
    if (rows && rows.length) {
      return res.json(rows.map((a) => {
        const rango = String(a.edadRecomendada || '6-17').split('-').map((x) => parseInt(x, 10));
        return {
          id: a.id,
          titulo: a.titulo || 'Actividad',
          edadMin: Number.isFinite(rango[0]) ? rango[0] : 6,
          edadMax: Number.isFinite(rango[1]) ? rango[1] : 17,
          complejidad: a.dificultad || 'Media',
          precio: Number(a.precioLicencia || 0) + Number(a.precioIntento || 0),
          recompensa: Number(a.recompensa || 0),
          estado: a.publica ? 'aprobada' : (a.estado === 'rechazada' ? 'rechazada' : 'en_revision'),
          colaborador: a.autorNombre || '—',
        };
      }));
    }
    res.json(store.juniorActividades);
  });
  router.get('/rsp/junior/api/colaboradores', async (_req, res) => {
    const live = await juniorLive('colaboradores');
    if (live && live.length) {
      return res.json(live.map((c) => ({
        dip: c.dip ?? c.placetaId ?? '',
        nombre: c.nombre ?? c.nombre_real ?? 'Colaborador',
        acuerdoFirmado: c.acuerdoFirmado ?? c.acuerdo_firmado ?? true,
        actividades: Number(c.actividades ?? c.num_actividades ?? 0),
        puntos: Number(c.puntos ?? 0),
      })));
    }
    const rows = await store.juniorColaboradoresDb.listar();
    if (rows && rows.length) {
      return res.json(rows.map((c) => ({
        dip: c.dip || c.placetaId || '',
        nombre: c.nombre || c.nombreReal || 'Colaborador',
        acuerdoFirmado: c.acuerdoFirmado !== false,
        actividades: Number(c.actividades || c.numActividades || 0),
        puntos: Number(c.puntos || 0),
      })));
    }
    res.json(store.juniorColaboradores);
  });
  router.get('/rsp/junior/api/diplomas', async (_req, res) => {
    const live = await juniorLive('diplomas');
    if (live && live.length) {
      return res.json(live.map((d) => ({
        id: d.id ?? `DIP-${d.dip}-${d.fecha}`,
        dip: d.dip ?? d.placetaId ?? '',
        nombre: d.nombre ?? d.nombre_real ?? '',
        actividad: d.actividad ?? d.actividad_titulo ?? '—',
        fecha: d.fecha ?? d.fecha_obtencion ?? '',
      })));
    }
    const rows = await store.juniorDiplomasDb.listar();
    if (rows && rows.length) {
      return res.json(rows.map((d) => ({
        id: d.id ?? `DIP-${d.juniorDip}-${d.fecha}`,
        dip: d.juniorDip || '',
        nombre: d.juniorNombre || '',
        actividad: d.actividadTitulo || '—',
        fecha: d.fecha || '',
      })));
    }
    res.json(store.juniorDiplomas);
  });

  // POST /rsp/junior/api/actividades/:id/estado — moderación de actividades
  router.post('/rsp/junior/api/actividades/:id/estado', async (req, res) => {
    const estado = req.body?.estado;
    if (!['aprobada', 'rechazada', 'en_revision'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    const publica = estado === 'aprobada';
    try {
      await store.juniorActividadesDb.actualizar(req.params.id, { estado, publica });
      res.json({ success: true, id: req.params.id, estado, publica });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ── Códigos Junior (recarga + actividades) ─────────────────────── */
  function genCodigo() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return `GDLP-${s}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  }

  router.get('/rsp/junior/api/codigos', async (_req, res) => {
    res.json(await store.juniorCodigosDb.listar());
  });

  router.post('/rsp/junior/api/codigos', async (req, res) => {
    const d = req.body || {};
    const tipo = d.tipo === 'recarga' ? 'recarga' : 'actividades';
    if (tipo === 'recarga' && !Number(d.valor)) return res.status(400).json({ error: 'Valor de recarga requerido' });
    if (tipo === 'actividades' && (!Array.isArray(d.actividadIds) || d.actividadIds.length === 0)) return res.status(400).json({ error: 'Selecciona al menos una actividad' });
    const codigo = {
      id: `COD-${Date.now()}`,
      codigo: String(d.codigo || genCodigo()).trim().toUpperCase(),
      tipo,
      valor: tipo === 'recarga' ? Number(d.valor) : 0,
      actividadIds: tipo === 'actividades' ? d.actividadIds.map(String) : [],
      estado: 'disponible',
      dipVinculado: null,
      creadoEn: AHORA(),
      canjeadoEn: null,
    };
    await store.juniorCodigosDb.insertar(codigo);
    res.status(201).json(codigo);
  });

  router.post('/rsp/junior/api/codigos/:id/accion', async (req, res) => {
    const c = await store.juniorCodigosDb.obtener(req.params.id);
    if (!c) return res.status(404).json({ error: 'Código no encontrado' });
    const accion = req.body?.accion;
    if (accion === 'revocar') await store.juniorCodigosDb.actualizar(req.params.id, { estado: 'revocado' });
    else if (accion === 'desvincular') await store.juniorCodigosDb.actualizar(req.params.id, { estado: 'disponible', dipVinculado: null, canjeadoEn: null });
    else return res.status(400).json({ error: 'Acción inválida' });
    res.json({ success: true, id: req.params.id, accion });
  });

  /* ── Subapartados de actividades (diapositivas progresivas) ──────── */
  router.get('/rsp/junior/api/actividades/:id/subapartados', async (req, res) => {
    const lista = await store.juniorSubapartadosDb.listar({ filtros: { actividadId: req.params.id } });
    res.json(lista.sort((a, b) => Number(a.orden) - Number(b.orden)));
  });

  router.post('/rsp/junior/api/actividades/:id/subapartados', async (req, res) => {
    const d = req.body || {};
    if (!d.titulo) return res.status(400).json({ error: 'Título requerido' });
    const lista = await store.juniorSubapartadosDb.listar({ filtros: { actividadId: req.params.id } });
    const sub = {
      id: `SUB-${Date.now()}`,
      actividadId: req.params.id,
      titulo: String(d.titulo).trim(),
      orden: (lista.reduce((m, s) => Math.max(m, Number(s.orden) || 0), 0) || 0) + 1,
      tipo: String(d.tipo || 'diapositiva'),
      desbloqueado: false,
      recompensa: Number(d.recompensa) || 0,
      desbloqueo: String(d.desbloqueo || 'completar_anterior'),
    };
    await store.juniorSubapartadosDb.insertar(sub);
    res.status(201).json(sub);
  });

  router.post('/rsp/junior/api/actividades/:id/subapartados/:subId/desbloquear', async (req, res) => {
    const sub = await store.juniorSubapartadosDb.obtener(req.params.subId);
    if (!sub) return res.status(404).json({ error: 'Subapartado no encontrado' });
    await store.juniorSubapartadosDb.actualizar(req.params.subId, { desbloqueado: true });
    res.json({ success: true, id: req.params.subId });
  });

  /* ── Operaciones / auditoría / notificaciones ────────────────────── */
  router.get('/rsp/operaciones/api', async (_req, res) => res.json(await store.operaciones.listar()));
  router.post('/rsp/operaciones/api/:id/revertir', async (req, res) => {
    const o = await store.operaciones.obtener(req.params.id);
    if (!o) return res.status(404).json({ error: 'Operación no encontrada' });
    if (o.estado !== 'retenida') return res.status(400).json({ error: 'Solo se pueden revertir operaciones retenidas' });
    await store.operaciones.actualizar(req.params.id, { estado: 'rechazada' });
    res.json({ ok: true });
  });
  router.get('/rsp/auditoria/api', async (_req, res) => res.json(await store.auditoria.listar()));
  router.get('/api/notificaciones/mis', async (_req, res) => res.json(await store.notificaciones.listar()));
  router.post('/api/notificaciones/:id/leida', async (req, res) => {
    const n = await store.notificaciones.obtener(req.params.id);
    if (!n) return res.status(404).json({ error: 'Notificación no encontrada' });
    await store.notificaciones.actualizar(req.params.id, { leida: true });
    res.json({ ok: true });
  });

  /* ── Dashboard (estadísticas REALES derivadas del banco y la sesión) ── */
  router.get('/api/dashboard', async (_req, res) => {
    // El banco puede no estar configurado (sin CRM_READ_KEY): el dashboard
    // sigue respondiendo con el resto de contadores reales de la sesión.
    let bloqueos500k = 0;
    try {
      const cuentas = await listarCuentas();
      bloqueos500k = cuentas.filter((c) => c.saldo > 500000 && c.tipo !== 'Business').length;
    } catch {
      /* banco no disponible: se deja en 0 */
    }
    const [expedientes, notificaciones, cnic, bopCnic, operaciones, nominas] = await Promise.all([
      store.expedientes.listar(), store.notificaciones.listar(), store.cnic.listar(), store.bopCnic.listar(), store.operaciones.listar(), store.nominas.listar(),
    ]);
    const cnicVigentes = Math.max(cnic.filter((c) => c.estado === 'vigente').length, (bopCnic || []).filter((c) => c.vigente).length, CNIC_BASE.length);
    const comprobaciones = await comprobacionesCumplimiento();
    let fundaciones = 0;
    try {
      const cuentas = await listarCuentas();
      fundaciones = cuentas.filter((c) => c.esFundacion).length;
    } catch { /* banco offline */ }
    res.json({
      expedientes: expedientes.length,
      incidencias: 0,
      incidenciasAbiertas: 0,
      notificacionesNoLeidas: notificaciones.filter((n) => !n.leida).length,
      cnicVigentes,
      nominas: nominas.length,
      facturas: 0,
      fundaciones,
      bloqueos500k,
      retribucionesPendientes: 0,
      operacionesRetenidas: operaciones.filter((o) => o.estado === 'retenida').length,
      comprobaciones: comprobaciones.length,
      comprobacionesInconsistencia: comprobaciones.filter((c) => c.estado === 'inconsistencia').length,
    });
  });

  /* ── Normativa (CNIC) ────────────────────────────────────────────── */
  router.get('/rsp/normativo/api', async (_req, res) => {
    // El editor necesita ver también borradores. La API pública de BOP
    // solo expone vigentes, por lo que aquí se consulta la tabla compartida
    // directamente y se conserva el estado real de cada versión.
    const bop = await store.bopCnic.listar();
    if (bop?.length) return res.json(bop.map(normalizarBopCnic));
    const oficial = await cargarCnicOficial();
    if (!oficial) return res.status(503).json({ error: 'bop_no_disponible', message: 'No se puede cargar el catálogo oficial de CNIC' });
    res.json(oficial);
  });
  router.post('/rsp/normativo/api/refresh', async (_req, res) => {
    bopHttpCache = { at: 0, data: null };
    const oficial = await cargarCnicOficial();
    if (oficial) return res.json({ sincronizado: true, total: oficial.length, fuente: 'BOP · API oficial' });
    const bop = await store.bopCnic.listar();
    if (!(bop || []).length) return res.status(503).json({ error: 'bop_no_disponible' });
    res.json({ sincronizado: true, total: bop.length, fuente: 'BOP · Supabase compartido' });
  });
  router.post('/rsp/normativo/api/version', async (req, res) => {
    const d = req.body || {};
    const codigo = String(d.codigo || '').trim().toUpperCase();
    const valor = d.valor;
    const motivo = String(d.motivo || '').trim();
    if (!/^CNIC-[A-Z0-9-]+$/.test(codigo) || valor === undefined || !motivo) return res.status(400).json({ error: 'codigo, valor y motivo son obligatorios' });
    const actual = await store.bopCnic.obtener(codigo);
    const historial = Array.isArray(actual?.historial) ? actual.historial : [];
    const regla = {
      ...(actual || {}), codigo, etiqueta: actual?.etiqueta || codigo,
      tipoValor: actual?.tipoValor || 'porcentaje', valor: String(valor), unidad: actual?.unidad || '%',
      vigente: false, estado: 'borrador', autorDip: req.user?.dip || 'RSP',
      historial: [...historial, ...(actual ? [{ valor: actual.valor, desde: actual.updatedAt || null, autorDip: actual.autorDip || 'BOP', notas: 'Valor anterior' }] : []), { valor: String(valor), desde: AHORA(), autorDip: req.user?.dip || 'RSP', notas: motivo }],
    };
    if (actual) await store.bopCnic.actualizar(codigo, regla);
    else await store.bopCnic.insertar(regla);
    bopHttpCache = { at: 0, data: null };
    res.status(201).json(normalizarBopCnic(regla));
  });
  router.post('/rsp/normativo/api/:codigo/aprobar', async (req, res) => {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();
    const actual = await store.bopCnic.obtener(codigo);
    if (!actual) return res.status(404).json({ error: 'CNIC no encontrado' });
    await store.bopCnic.actualizar(codigo, { vigente: true, estado: 'vigente', autorDip: req.user?.dip || actual.autorDip || 'RSP', updatedAt: AHORA() });
    bopHttpCache = { at: 0, data: null };
    cnicCache = { t: 0, data: null };
    res.json({ success: true });
  });

  const normalizarBopDocumento = (d) => ({
    id: d.id || d.codigo, codigo: d.codigo, titulo: d.titulo, tipo: d.tipo || 'cni',
    categoria: d.categoria || 'capitulo', estado: d.estado || 'proyecto',
    contenidoMd: d.contenidoMd || '', version: Number(d.version || 1),
    aprobadaEnJunta: Boolean(d.aprobadaEnJunta), autorDip: d.autorDip,
    notasCambio: d.notasCambio, cnicRefs: d.cnicRefs || [],
  });
  router.get('/rsp/normativo/documentos', async (_req, res) => {
    res.json((await store.bopDocumentos.listar()).map(normalizarBopDocumento));
  });
  router.post('/rsp/normativo/documentos', async (req, res) => {
    const d = req.body || {};
    const codigo = String(d.codigo || '').trim().toUpperCase();
    const titulo = String(d.titulo || '').trim();
    const contenidoMd = String(d.contenidoMd || '');
    if (!codigo || !titulo || !contenidoMd.trim()) return res.status(400).json({ error: 'codigo, titulo y contenidoMd son obligatorios' });
    const anterior = (await store.bopDocumentos.listar()).find((x) => x.codigo === codigo);
    const cnicRefs = Array.isArray(d.cnicRefs) ? d.cnicRefs.filter((r) => r && r.codigo).map((r) => ({ codigo: String(r.codigo).trim().toUpperCase(), etiqueta: String(r.etiqueta || r.codigo).trim() })) : [];
    const documento = { ...(anterior || {}), id: anterior?.id || `BOP-${Date.now()}`, codigo, titulo, tipo: d.tipo || 'cni', categoria: d.categoria || 'capitulo', estado: 'proyecto', contenidoMd, version: Number(anterior?.version || 0) + 1, aprobadaEnJunta: false, autorDip: req.user?.dip || 'RSP', notasCambio: String(d.notasCambio || ''), cnicRefs };
    if (anterior) { await store.bopVersiones.insertar({ documentoId: documento.id, version: anterior.version, estado: anterior.estado, contenidoMd: anterior.contenidoMd, autorDip: anterior.autorDip, notasCambio: anterior.notasCambio }); await store.bopDocumentos.actualizar(anterior.id, documento); }
    else await store.bopDocumentos.insertar(documento);
    res.status(201).json(normalizarBopDocumento(documento));
  });
  router.post('/rsp/normativo/documentos/:id/aprobar', async (req, res) => {
    const id = String(req.params.id);
    const documento = await store.bopDocumentos.obtener(id);
    if (!documento) return res.status(404).json({ error: 'Documento BOP no encontrado' });
    await store.bopDocumentos.actualizar(id, { estado: 'vigente', aprobadaEnJunta: true, updatedAt: AHORA() });
    res.json({ success: true });
  });

  /* ── Cumplimiento normativo (comprobaciones automáticas) ──────────── */
  // Comprobaciones automáticas derivadas del banco vivo. Cada incidencia
  // referencia su CNIC / fuente BOP para trazabilidad normativa.
  async function comprobacionesCumplimiento() {
    let cuentas = [];
    try { cuentas = await listarCuentas(); } catch { cuentas = []; }
    const checks = [];

    // 1) Límite de capital personal (500.000 Pz) → bloqueo preventivo.
    cuentas
      .filter((c) => c.tipo !== 'Business' && Number(c.saldo) > 500000)
      .forEach((c) => checks.push({
        id: `CMP-${c.id}-limite`,
        codigo: 'cumplimiento.limite_capital',
        titulo: `Cuenta ${c.id} supera el límite de capital personal`,
        dip: c.dip || '',
        servicio: 'Banco',
        severidad: 'critica',
        estado: 'inconsistencia',
        cnic: 'CNIC-LIMITE-CAPITAL-001',
        fuente: 'BOP',
        detalle: `Saldo ${c.saldo} Pz supera el límite ordinario de 500.000 Pz (bloqueo preventivo y justificación en 15 días).`,
        fecha: AHORA(),
      }));

    // 2) Menores sin tutor legal vinculado.
    cuentas
      .filter((c) => c.tipo === 'Child' && !c.tutorDip && !c.cotitular)
      .forEach((c) => checks.push({
        id: `CMP-${c.id}-tutor`,
        codigo: 'cumplimiento.menor_sin_tutor',
        titulo: `Menor ${c.dip || c.id} sin tutor legal vinculado`,
        dip: c.dip || '',
        servicio: 'Placeta Junior',
        severidad: 'critica',
        estado: 'inconsistencia',
        cnic: 'CNIC-MENOR-TUTOR-001',
        fuente: 'BOP',
        detalle: 'La cuenta Junior requiere tutor legal y documentación firmada antes de activarse.',
        fecha: AHORA(),
      }));

    // 3) Documentación / consentimiento obligatorio pendiente.
    cuentas
      .filter((c) => c.cumplimiento && c.cumplimiento !== 'al_dia' && c.cumplimiento !== 'Al día')
      .forEach((c) => checks.push({
        id: `CMP-${c.id}-docs`,
        codigo: 'cumplimiento.documentacion_pendiente',
        titulo: `Documentación pendiente en la cuenta ${c.id}`,
        dip: c.dip || '',
        servicio: 'Cumplimiento',
        severidad: 'alta',
        estado: 'pendiente',
        cnic: 'CNIC-DOCUMENTACION-001',
        fuente: 'BOP',
        detalle: `Estado de cumplimiento: ${c.cumplimiento}. La cuenta no puede activarse por completo.`,
        fecha: AHORA(),
      }));

    return checks;
  }

  // GET /rsp/normativo/api/comprobaciones — listado de comprobaciones
  router.get('/rsp/normativo/api/comprobaciones', async (_req, res) => {
    res.json(await comprobacionesCumplimiento());
  });

  // POST /rsp/normativo/api/migrar-junior — fuerza la migración de un
  // usuario a Placeta Junior y genera el trámite/sentencia de Justicia que
  // documenta el cambio (cerrable sin firma cuando lo permite la norma).
  // Requiere el DIP del tutor legal cuando se trata de un menor.
  router.post('/rsp/normativo/api/migrar-junior', async (req, res) => {
    const d = req.body || {};
    const dip = String(d.dip || '').trim().toUpperCase();
    if (!dip) return res.status(400).json({ error: 'DIP requerido' });
    const nombre = d.nombre || dip;
    const tutorDip = String(d.tutorDip || '').trim().toUpperCase();

    const requisitos = [
      { descripcion: 'Autorización del tutor legal (PlacetaID)', cumplido: !!tutorDip },
      { descripcion: 'Documentación de identidad del menor', cumplido: true },
      { descripcion: 'Consentimiento informado del tutor', cumplido: !!tutorDip },
    ];
    const completo = tutorDip !== '';

    // 1) Trámite/sentencia de Justicia que documenta el cambio.
    const tramite = {
      id: `TR-${Date.now()}`,
      tipo: 'sentencia_justicia',
      titulo: `Migración a Placeta Junior — ${dip}`,
      dip,
      nombreCiudadano: nombre,
      estado: completo ? 'pendiente_firma' : 'pendiente_tutor',
      cerrarSinFirma: false,
      firmaRequerida: true,
      servicio: 'Justicia',
      normativa: 'CNIC-MENOR-TUTOR-001',
      fuenteNormativa: 'BOP',
      actualizadoEn: AHORA(),
      requisitos,
      datosEspecificos: {
        motivo: d.motivo || 'Cumplimiento normativo: usuario menor de edad o con requerimiento de Placeta Junior.',
        aplicadaPor: d.aplicadaPor || 'RSP',
        tutorDip: tutorDip || null,
      },
    };
    await store.tramites.insertar(tramite);

    // 2) Expediente asociado.
    const documentoFirma = {
      id: `DOC-${Date.now()}`,
      tipo: 'consentimiento_migracion_junior',
      dip,
      tutorDip: tutorDip || null,
      estado: 'pendiente_firma',
      tramiteId: tramite.id,
      creadoEn: AHORA(),
    };
    const expediente = {
      id: `EXP-${Date.now()}`,
      dip,
      tipo: 'migracion_junior',
      tramiteId: tramite.id,
      estado: 'abierto',
      actualizadoEn: AHORA(),
      documentos: [tramite.id, documentoFirma.id],
      firma: documentoFirma,
    };
    await store.expedientes.insertar(expediente);
    await store.auditoria.insertar({
      id: `AUD-${Date.now()}`, usuario: req.user?.dip || 'RSP', servicio: 'Placeta Junior',
      accion: 'migrar_usuario', objetoTipo: 'expediente', objetoId: expediente.id,
      motivo: tramite.datosEspecificos.motivo, fecha: AHORA(),
    });

    // 3) Marcar la cuenta como Child y vincular tutor (overlay en memoria;
    //    en producción se aplica vía postBanco / crm-state).
    try {
      const cuentas = await listarCuentas();
      const cuenta = cuentas.find((c) => String(c.dip || '').toUpperCase() === dip);
      if (cuenta) mutarCuenta(cuenta.id, { tipo: 'Child', tutorDip: tutorDip || null, migradoAJunior: true, migradoEn: AHORA() });
    } catch { /* banco offline */ }

    res.status(201).json({ success: true, tramite, expediente, requiereTutor: !completo, requiereFirma: true });
  });

  /* ── Tributos: censo + declaraciones con cálculo DETALLADO y trazable ── */
  const declaracionesEstado = new Map(); // id de declaración -> estado (sesión)
  const mesActual = () => new Date().toISOString().slice(0, 7);
  const proximoPago = () => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-05`;
  };
  function declaracionDe(c, mes) {
    const id = `DEC-${mes}-${c.id}`;
    return {
      id,
      mesPeriodo: mes,
      contribuyenteId: c.id,
      contribuyenteNombre: c.nombre,
      patrimonioMedio: c.patrimonioMedio ?? c.patrimonio,
      cuotaIrm: c.cuotaIrm,
      cuotaIgf: c.cuotaIgf,
      estado: declaracionesEstado.get(id) || 'borrador',
    };
  }

  router.get('/rsp/tributos/api/contribuyentes', async (req, res) => {
    try {
      const state = await getBankState();
      const cnic = await cargarCnicVigentes();
      const lista = calcularContribuyentes(state, undefined, cnic);
      const q = String(req.query.q || '').toLowerCase();
      res.json(lista.filter((c) => !q || c.nombre.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)));
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/tributos/api/contribuyentes/:id', async (req, res) => {
    try {
      const state = await getBankState();
      const mes = req.query.mes || mesActual();
      const cnic = await cargarCnicVigentes();
      const c = calcularContribuyentes(state, undefined, cnic).find((x) => x.id === req.params.id);
      if (!c) return res.status(404).json({ error: 'Contribuyente no encontrado' });
      res.json({
        ...c,
        estimado: { cuotaIrm: c.cuotaIrm, cuotaIgf: c.cuotaIgf, proximoPago: proximoPago() },
        declaraciones: [declaracionDe(c, mes)],
      });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/tributos/api/declaraciones', async (req, res) => {
    try {
      const state = await getBankState();
      const mes = req.query.mes || mesActual();
      const cnic = await cargarCnicVigentes();
      res.json(calcularContribuyentes(state, undefined, cnic).map((c) => declaracionDe(c, mes)));
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/tributos/api/declaraciones/:id', async (req, res) => {
    try {
      const state = await getBankState();
      const mes = req.query.mes || mesActual();
      const id = req.params.id;
      const cnic = await cargarCnicVigentes();
      const c = calcularContribuyentes(state, undefined, cnic).find((x) => `DEC-${mes}-${x.id}` === id || x.id === id);
      if (!c) return res.status(404).json({ error: 'Declaración no encontrada' });
      const base = declaracionDe(c, mes);
      res.json({
        ...base,
        cuentaIdBlp: c.desglose?.cuentas?.[0]?.id ?? c.id,
        exencionAplicada: c.igfExentoReducida
          ? 'IGF exento — empresa de reducida dimensión (CNI Art. 4.15)'
          : c.ivaExento ? 'IVA exento (empresa — CNI Art. 4.4)' : 'Ninguna',
        diasActivosMes: c.diasActivos ?? 30,
        ivaExento: c.ivaExento,
        indiceAcumulacion: c.indiceAcumulacion ?? 0,
        ingresosMes: c.ingresosMes ?? 0,
        pagosMes: c.pagosMes ?? 0,
        documentos: [],
        desglose: {
          baseIrm: c.patrimonioMedio ?? c.patrimonio,
          tipoIrm: c.desglose.irm.tramos[0]?.tipoPct ?? 0,
          retencionesIrm: 0,
          bonificacionesIrm: 0,
          patrimonioBruto: c.patrimonio,
          patrimonioExento: 5000,
          baseIgf: Math.max(0, (c.patrimonioMedio ?? c.patrimonio) - 5000),
          tipoIgf: c.desglose.igf.tramos[0]?.tipoPct ?? 0,
          ivaRepercutido: 0,
          ivaSoportado: 0,
          cuotaIva: 0,
          ia: c.indiceAcumulacion ?? 0,
          ingresosMes: c.ingresosMes ?? 0,
          pagosMes: c.pagosMes ?? 0,
          acumulacionNeta: c.incrementoActivos ?? 0,
          tramoIA: c.desglose.irm.tramoIA ?? 0,
          tramosIrm: c.desglose.irm.tramos,
          tramosIgf: c.desglose.igf.tramos,
          escalaIrm: c.desglose.irm.escala,
          escalaIgf: c.desglose.igf.escala,
          cuentas: c.desglose.cuentas,
          movimientos: c.desglose.movimientos,
          patrimonioMedio: c.patrimonioMedio ?? c.patrimonio,
          diasActivos: c.diasActivos,
          saldosDiarios: c.desglose.saldosDiarios,
        },
      });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.post('/rsp/tributos/api/declaraciones/:id/:accion', (req, res) => {
    const { id, accion } = req.params;
    const estados = { publicar: 'pendiente_aprobacion', aprobar: 'aprobada', rechazar: 'borrador', emitir: 'emitida', cobrar: 'cobrada' };
    const siguiente = estados[accion];
    if (!siguiente) return res.status(400).json({ error: `Acción desconocida: ${accion}` });
    declaracionesEstado.set(id, siguiente);
    res.json({ ok: true, estado: siguiente });
  });

  /* ── Votaciones / Juntas / Encuestas ────────────────────────────── */
  router.get('/rsp/votaciones/api', async (_req, res) => res.json(await store.votaciones.listar()));
  router.get('/rsp/votaciones/api/:id', async (req, res) => {
    const v = await store.votaciones.obtener(req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    const votos = (await store.votos.listar({ filtros: { votacionId: v.id } }));
    res.json({ ...v, votos });
  });
  router.post('/rsp/votaciones/api', async (req, res) => {
    const d = req.body || {};
    const n = (await store.votaciones.listar()).length;
    const v = { id: `VOT-2026-${String(n + 1).padStart(4, '0')}`, titulo: d.titulo, categoria: d.categoria, descripcion: d.descripcion || '', reunionId: d.reunionId, rango: d.rango || 'ciudadania_plena', opciones: d.opciones || ['A favor', 'En contra', 'Abstención'], estado: 'abierta', resultado: null, aFavor: 0, enContra: 0, abstenciones: 0, totalVotos: 0, creadaEn: AHORA() };
    await store.votaciones.insertar(v);
    res.status(201).json(v);
  });
  // POST /rsp/votaciones/api/:id — editar (solo abiertas o en borrador)
  router.post('/rsp/votaciones/api/:id', async (req, res) => {
    const v = await store.votaciones.obtener(req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    if (v.estado === 'cerrada' || v.estado === 'publicada') return res.status(400).json({ error: 'Solo se pueden editar votaciones abiertas o en borrador' });
    const d = req.body || {};
    const patch = {};
    if (d.titulo) patch.titulo = String(d.titulo).trim();
    if (d.descripcion !== undefined) patch.descripcion = String(d.descripcion);
    if (d.categoria) patch.categoria = d.categoria;
    if (d.rango) patch.rango = d.rango;
    if (Array.isArray(d.opciones)) {
      const ops = d.opciones.map((o) => String(o).trim()).filter(Boolean);
      if (ops.length < 2) return res.status(400).json({ error: 'Se necesitan al menos 2 opciones' });
      patch.opciones = ops;
    }
    await store.votaciones.actualizar(req.params.id, patch);
    res.json({ ok: true, id: req.params.id });
  });
  router.post('/rsp/votaciones/api/:id/cerrar', async (req, res) => {
    const v = await store.votaciones.obtener(req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    const resultado = v.aFavor > v.enContra ? 'aprobada' : 'rechazada';
    await store.votaciones.actualizar(req.params.id, { estado: 'cerrada', cerradaEn: AHORA(), resultado });
    // Cierra también en PlacetaID Móvil (notifica el resultado a los destinatarios).
    const placetaid = await cerrarVotacionPlacetaID(v.id);
    res.json({ ok: true, placetaid: placetaid.enviado });
  });
  router.post('/rsp/votaciones/api/:id/publicar', async (req, res) => {
    const v = await store.votaciones.obtener(req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    await store.votaciones.actualizar(req.params.id, { estado: 'publicada', publicadaEn: AHORA(), bopUrl: `https://bop.laplaceta.org/votaciones.html?codigo=${v.id}` });
    // La abre también en PlacetaID Móvil (aparece en la app y notifica al grupo).
    const placetaid = await enviarVotacionPlacetaID(v);
    res.json({ ok: true, placetaid: placetaid.enviado });
  });
  router.get('/rsp/votaciones/api/:id/votos', async (req, res) => {
    const ahora = Date.now();
    const votos = await store.votos.listar({ filtros: { votacionId: req.params.id } });
    res.json(votos.map((r) => {
      const anon = !r.esJunta && (ahora - new Date(r.timestamp).getTime()) > 30 * 24 * 3600 * 1000;
      return { ...r, anonimo: anon, dip: anon ? '••••••' : r.dip };
    }));
  });
  router.get('/rsp/juntas/api', async (_req, res) => res.json(await store.juntas.listar()));
  router.get('/rsp/juntas/api/:id', async (req, res) => {
    const j = await store.juntas.obtener(req.params.id);
    if (!j) return res.status(404).json({ error: 'Junta no encontrada' });
    const votaciones = await store.votaciones.listar();
    res.json({ ...j, votaciones: (j.votaciones || []).map((vid) => votaciones.find((v) => v.id === vid)).filter(Boolean) });
  });
  router.post('/rsp/juntas/api', async (req, res) => {
    const d = req.body || {};
    const n = (await store.juntas.listar()).length;
    const j = { id: `JUN-2026-${String(n + 1).padStart(4, '0')}`, titulo: d.titulo, fecha: d.fecha || new Date().toISOString().slice(0, 10), asistentes: d.asistentes || [], ordenDelDia: d.ordenDelDia || [], votaciones: d.votaciones || [], acta: '', estado: 'convocada' };
    await store.juntas.insertar(j);
    res.status(201).json(j);
  });
  router.post('/rsp/juntas/api/:id/acta', async (req, res) => {
    const j = await store.juntas.obtener(req.params.id);
    if (!j) return res.status(404).json({ error: 'Junta no encontrada' });
    await store.juntas.actualizar(req.params.id, { acta: req.body?.acta || '', estado: 'acta_emitida', actaUrl: `https://bop.laplaceta.org/juntas.html?codigo=${j.id}` });
    res.json({ ok: true });
  });
  router.get('/rsp/encuestas/api', async (_req, res) => res.json(await store.encuestas.listar()));
  router.post('/rsp/encuestas/api', async (req, res) => {
    const d = req.body || {};
    const n = (await store.encuestas.listar()).length;
    const e = { id: `ENC-2026-${String(n + 1).padStart(4, '0')}`, titulo: d.titulo, pregunta: d.pregunta, opciones: d.opciones || [], rango: d.rango || 'todos', estado: 'abierta', respuestas: Object.fromEntries((d.opciones || []).map((o) => [o, 0])), totalRespuestas: 0, creadaEn: AHORA() };
    await store.encuestas.insertar(e);
    res.status(201).json(e);
  });
  router.post('/rsp/encuestas/api/:id/publicar', async (req, res) => {
    const e = await store.encuestas.obtener(req.params.id);
    if (!e) return res.status(404).json({ error: 'Encuesta no encontrada' });
    await store.encuestas.actualizar(req.params.id, { estado: 'publicada', publicadaEn: AHORA(), bopUrl: `https://bop.laplaceta.org/encuestas.html?codigo=${e.id}` });
    // Se envía a PlacetaID Móvil con el mismo sistema que las votaciones
    // (la app la muestra como consulta a los destinatarios del rango).
    const placetaid = await enviarVotacionPlacetaID({ id: e.id, titulo: e.titulo, pregunta: e.pregunta, descripcion: e.pregunta, categoria: 'encuesta' });
    res.json({ ok: true, placetaid: placetaid.enviado });
  });

  return router;
}
