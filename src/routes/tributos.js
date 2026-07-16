import { Router } from 'express';
import { apiBancoGetState, sbListDeclaraciones, sbGetDeclaracion, sbCreateDeclaracion, sbUpdateDeclaracion, sbDeleteDeclaracion, sbListDeclaracionesPorMes, sbGetContribuyente, sbUpsertContribuyente, sbGetDailyBalances, sbUpsertDailyBalance, sbClearDailyBalances, sbGetControlRecaudacion, sbUpsertControlRecaudacion } from '../config/db.js';
import { verificarPermiso } from '../middleware/auth.js';
import { calcularPatrimonioMedio, calcularIA, calcularIRM, calcularIGF, calcularCotizaciones } from '../config/normativa.js';
import { generarPDF } from '../config/documentos.js';

const router = Router();

// ── Dashboard Tributos ─────────────────────────────────────────────────────
router.get('/', verificarPermiso('tributos', 'ver_contribuyentes'), async (req, res) => {
  const state = await apiBancoGetState();
  const contribuyentes = state?.accounts?.filter(a => a.tributosCensusDate) || [];
  const ingresos = contribuyentes.reduce((s, c) => s + (c.balancePz || 0), 0);
  const declaraciones = await sbListDeclaraciones(5);
  const pendientes = declaraciones.filter(d => (d.estado_pago||'Borrador') === 'Borrador').length;

  res.render('tributos/dashboard', {
    titulo: 'Tributos de La Placeta',
    entidad_actual: 'tributos',
    totalContribuyentes: contribuyentes.length,
    ingresos,
    declaracionesPendientes: pendientes,
    esAdmin: req.session.roles?.includes('tributos_admin'),
    esInspector: req.session.roles?.includes('tributos_inspector')
  });
});

// ── Listado de Contribuyentes ──────────────────────────────────────────────
router.get('/contribuyentes', verificarPermiso('tributos', 'ver_contribuyentes'), async (req, res) => {
  const state = await apiBancoGetState();
  const contribuyentes = state?.accounts?.filter(a => a.tributosCensusDate) || [];

  const { busqueda, regimen } = req.query;
  let filtrados = [...contribuyentes];
  if (busqueda) {
    const q = busqueda.toLowerCase();
    filtrados = filtrados.filter(c =>
      c.id?.toLowerCase().includes(q) ||
      c.displayName?.toLowerCase().includes(q) ||
      c.placetaId?.toLowerCase().includes(q)
    );
  }

  res.render('tributos/contribuyentes', {
    titulo: 'Contribuyentes',
    entidad_actual: 'tributos',
    contribuyentes: filtrados, total: filtrados.length
  });
});

// ── Declaraciones (View) ──────────────────────────────────────────────────
router.get('/declaraciones', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const state = await apiBancoGetState();
  const contribuyentes = state?.accounts?.filter(a => a.tributosCensusDate) || [];
  const declaraciones = await sbListDeclaraciones(200);
  const control = await sbGetControlRecaudacion(new Date().toISOString().slice(0,7));

  // Enriquecer con estado semántico
  const enriched = declaraciones.map(d => {
    const p = d.id_permiso_junta || '';
    let sem = d.estado_pago;
    if (d.estado_pago === 'Borrador') {
      if (p.startsWith('APROBADA')) sem = 'Aprobada';
      else if (p.startsWith('PENDIENTE_APROBACION')) sem = 'Pendiente_Aprobacion';
      else if (p.startsWith('BYPASS')) sem = 'Aprobada';
      else sem = 'Borrador';
    } else if (d.estado_pago === 'Emitido') {
      sem = d.transaction_id_blp ? 'Cobrado_Exito' : 'Emitido';
    }
    return { ...d, _estado_semantico: sem,
      _puede_publicar: sem === 'Borrador' && !p,
      _puede_aprobar: sem === 'Pendiente_Aprobacion',
      _puede_emitir: sem === 'Aprobada',
      _puede_eliminar: sem === 'Borrador' && !p
    };
  });

  // Calcular un patrimonio medio estimado para cada contribuyente
  const contribuyentesConPatrimonio = contribuyentes.map(c => ({
    id: c.id, placetaId: c.placetaId, displayName: c.displayName, dip: c.dip,
    type: c.type, balancePz: c.balancePz || 0, eip: c.eip
  }));

  res.render('tributos/declaraciones', {
    titulo: 'Declaraciones Tributarias',
    entidad_actual: 'tributos',
    declaraciones: enriched,
    contribuyentes: contribuyentesConPatrimonio,
    totalContribuyentes: contribuyentes.length,
    controlRecaudacion: control,
    esAdmin: req.session.roles?.includes('tributos_admin'),
    mesActual: new Date().toISOString().slice(0,7)
  });
});

// ═════════════════════════════════════════════════════════════════════════
// API DECLARACIONES (JSON)
// ═════════════════════════════════════════════════════════════════════════

// ── Listar declaraciones (API JSON) ────────────────────────────────────────
router.get('/api/declaraciones', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const declaraciones = await sbListDeclaraciones(200);
  const enriched = declaraciones.map(d => {
    const p = d.id_permiso_junta || '';
    let sem = d.estado_pago;
    if (d.estado_pago === 'Borrador') {
      if (p.startsWith('APROBADA')) sem = 'Aprobada';
      else if (p.startsWith('PENDIENTE_APROBACION')) sem = 'Pendiente_Aprobacion';
      else if (p.startsWith('BYPASS')) sem = 'Aprobada';
      else sem = 'Borrador';
    } else if (d.estado_pago === 'Emitido') {
      sem = d.transaction_id_blp ? 'Cobrado_Exito' : 'Emitido';
    }
    return { ...d, _estado_semantico: sem };
  });
  res.json(enriched);
});

// ── Crear declaración ──────────────────────────────────────────────────────
router.post('/api/declaraciones', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  try {
    const { placetaId, mesPeriodo, patrimonioMedio, tipoSujeto } = req.body;
    if (!placetaId || !mesPeriodo) return res.status(400).json({ error: 'placetaId y mesPeriodo requeridos' });

    // Calcular IRM e IGF
    const irmTipo = calcularIRM(0.02, tipoSujeto === 'Empresa' ? 'Business' : 'Personal');
    const cuotaIRM = (patrimonioMedio || 0) * irmTipo;
    const igfResult = calcularIGF(patrimonioMedio || 0, tipoSujeto === 'Empresa' ? 'Business' : 'Personal');
    const cuotaIGF = igfResult.total;

    const decl = await sbCreateDeclaracion({
      placeta_id: placetaId, mes_periodo: mesPeriodo,
      patrimonio_medio: patrimonioMedio || 0,
      indice_acumulacion: 0.0200,
      cuota_irm: Math.round(cuotaIRM * 100) / 100,
      cuota_igf: cuotaIGF,
      cuenta_id_blp: req.body.cuentaId || placetaId,
      estado_pago: 'Borrador',
      exencion_aplicada: igfResult.exento || false,
      dias_activos_mes: 30
    });

    res.json({ success: true, declaracion: decl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Obtener declaración ────────────────────────────────────────────────────
router.get('/api/declaraciones/:id', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const d = await sbGetDeclaracion(req.params.id);
  if (!d) return res.status(404).json({ error: 'No encontrada' });
  res.json(d);
});

// ── Eliminar declaración (solo borrador) ──────────────────────────────────
router.delete('/api/declaraciones/:id', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const d = await sbGetDeclaracion(req.params.id);
  if (!d) return res.status(404).json({ error: 'No encontrada' });
  if (d.estado_pago !== 'Borrador' || d.id_permiso_junta) return res.status(400).json({ error: 'Solo se pueden eliminar borradores sin procesar' });
  await sbDeleteDeclaracion(req.params.id);
  res.json({ success: true });
});

// ── Publicar (Borrador → Pendiente Aprobación) ───────────────────────────
router.put('/api/declaraciones/:id/publish', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const d = await sbGetDeclaracion(req.params.id);
  if (!d) return res.status(404).json({ error: 'No encontrada' });
  if (d.estado_pago !== 'Borrador') return res.status(400).json({ error: 'Solo se pueden publicar borradores' });

  const bypass = req.body.bypass === true && req.session.roles?.includes('tributos_admin');
  await sbUpdateDeclaracion(req.params.id, {
    id_permiso_junta: bypass ? `BYPASS-${Date.now()}` : `PENDIENTE_APROBACION-${Date.now()}`,
    bypass_junta_directiva: bypass || false
  });
  res.json({ success: true, message: bypass ? 'Aprobada directamente (bypass)' : 'Enviada a aprobación' });
});

// ── Aprobar (Pendiente → Aprobada) ────────────────────────────────────────
router.put('/api/declaraciones/:id/approve', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const d = await sbGetDeclaracion(req.params.id);
  if (!d) return res.status(404).json({ error: 'No encontrada' });
  const p = d.id_permiso_junta || '';
  if (!p.startsWith('PENDIENTE_APROBACION')) return res.status(400).json({ error: 'La declaración no está pendiente de aprobación' });

  await sbUpdateDeclaracion(req.params.id, { id_permiso_junta: `APROBADA-${Date.now()}` });
  res.json({ success: true, message: 'Declaración aprobada' });
});

// ── Rechazar (vuelve a Borrador) ──────────────────────────────────────────
router.put('/api/declaraciones/:id/reject', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const d = await sbGetDeclaracion(req.params.id);
  if (!d) return res.status(404).json({ error: 'No encontrada' });
  await sbUpdateDeclaracion(req.params.id, { id_permiso_junta: null, bypass_junta_directiva: false });
  res.json({ success: true, message: 'Declaración devuelta a borrador' });
});

// ── Emitir (Aprobada → Emitida + cobro bancario) ─────────────────────────
router.put('/api/declaraciones/:id/emit', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  try {
    const d = await sbGetDeclaracion(req.params.id);
    if (!d) return res.status(404).json({ error: 'No encontrada' });
    const p = d.id_permiso_junta || '';
    if (!p.startsWith('APROBADA') && !p.startsWith('BYPASS')) return res.status(400).json({ error: 'La declaración debe estar aprobada' });

    const total = (d.cuota_irm || 0) + (d.cuota_igf || 0);

    // Intentar cobro vía API Banco
    let transactionId = null;
    try {
      const { apiBancoPost } = await import('../config/db.js');
      const cobro = await apiBancoPost('transfer', {
        from: d.cuenta_id_blp, to: 'TGLP',
        amount: total, concept: `DEC-${d.id.slice(-8)} ${d.mes_periodo}`
      });
      if (cobro?.transactionId) transactionId = cobro.transactionId;
    } catch { /* fallback: marcar como emitida sin cobro */ }

    await sbUpdateDeclaracion(req.params.id, {
      estado_pago: 'Emitido',
      id_permiso_junta: transactionId ? `COBRADO-${transactionId}` : `EMITIDO-${Date.now()}`,
      transaction_id_blp: transactionId
    });

    res.json({ success: true, message: transactionId ? 'Declaración emitida y cobrada' : 'Declaración emitida (pendiente de cobro)', transactionId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Acciones en lote ──────────────────────────────────────────────────────
router.put('/api/declaraciones/bulk/:accion', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const { accion } = req.params;
  const { ids, bypass } = req.body;
  if (!ids?.length) return res.status(400).json({ error: 'Lista de IDs requerida' });

  const results = [];
  for (const id of ids) {
    try {
      const d = await sbGetDeclaracion(id);
      if (!d) continue;
      if (accion === 'publish') {
        const b = bypass && req.session.roles?.includes('tributos_admin');
        await sbUpdateDeclaracion(id, { id_permiso_junta: b ? `BYPASS-${Date.now()}` : `PENDIENTE_APROBACION-${Date.now()}`, bypass_junta_directiva: b || false });
        results.push({ id, success: true, accion: b ? 'bypass' : 'published' });
      } else if (accion === 'approve') {
        await sbUpdateDeclaracion(id, { id_permiso_junta: `APROBADA-${Date.now()}` });
        results.push({ id, success: true, accion: 'approved' });
      } else if (accion === 'emit') {
        const total = (d.cuota_irm || 0) + (d.cuota_igf || 0);
        await sbUpdateDeclaracion(id, { estado_pago: 'Emitido', id_permiso_junta: `EMITIDO-${Date.now()}` });
        results.push({ id, success: true, accion: 'emitted' });
      } else if (accion === 'delete') {
        if (d.estado_pago === 'Borrador' && !d.id_permiso_junta) {
          await sbDeleteDeclaracion(id);
          results.push({ id, success: true, accion: 'deleted' });
        }
      }
    } catch { results.push({ id, success: false }); }
  }
  res.json({ success: true, results });
});

// ── PDF de declaración ─────────────────────────────────────────────────────
router.get('/api/declaraciones/:id/pdf', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  try {
    const d = await sbGetDeclaracion(req.params.id);
    if (!d) return res.status(404).json({ error: 'No encontrada' });
    const buffer = await generarPDF('tributos', {
      id: d.id, titulo: `Declaración Tributaria ${d.mes_periodo}`,
      tipo: d.estado_pago === 'Borrador' ? 'declaracion-borrador' : 'declaracion-definitiva',
      datos: {
        contribuyente: d.placeta_id, periodo: d.mes_periodo,
        baseImponible: d.patrimonio_medio, cuota: (d.cuota_irm || 0) + (d.cuota_igf || 0),
        cuotaIRM: d.cuota_irm, cuotaIGF: d.cuota_igf,
        estado: d._estado_semantico || d.estado_pago,
        patrimonioMedio: d.patrimonio_medio, indiceAcumulacion: d.indice_acumulacion
      },
      estado: d.estado_pago, createdAt: d.created_at,
      refId: d.id, refTipo: 'declaracion'
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename=DEC-${d.id.slice(-8)}.pdf` });
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════
// RECONCILIACIÓN (Saldos Diarios)
// ═════════════════════════════════════════════════════════════════════════

router.post('/api/reconcile/:placetaId', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  try {
    const { placetaId } = req.params;
    const { mesPeriodo } = req.body;
    if (!mesPeriodo) return res.status(400).json({ error: 'mesPeriodo requerido' });

    const state = await apiBancoGetState();
    const cuentas = state?.accounts?.filter(a => a.placetaId === placetaId || a.id === placetaId) || [];

    await sbClearDailyBalances(placetaId, mesPeriodo);

    // Reconstruir saldos diarios desde las cuentas
    const dias = 30;
    const balances = [];
    for (let d = 1; d <= dias; d++) {
      const saldo = cuentas.reduce((s, c) => s + (c.balancePz || 0), 0) * (0.95 + Math.random() * 0.1);
      await sbUpsertDailyBalance(placetaId, mesPeriodo, d, Math.round(saldo));
      balances.push(Math.round(saldo));
    }

    // Calcular patrimonio medio
    const patrimonioMedio = calcularPatrimonioMedio(balances);

    // Auto-crear declaración
    const tipoSujeto = cuentas.some(c => c.type === 'Business') ? 'Empresa' : 'Personal';
    const irmTipo = calcularIRM(0.02, tipoSujeto === 'Empresa' ? 'Business' : 'Personal');
    const cuotaIRM = patrimonioMedio * irmTipo;
    const igfResult = calcularIGF(patrimonioMedio, tipoSujeto === 'Empresa' ? 'Business' : 'Personal');

    const decl = await sbCreateDeclaracion({
      placeta_id: placetaId, mes_periodo: mesPeriodo,
      patrimonio_medio: Math.round(patrimonioMedio * 100) / 100,
      indice_acumulacion: 0.0200,
      cuota_irm: Math.round(cuotaIRM * 100) / 100,
      cuota_igf: igfResult.total,
      cuenta_id_blp: cuentas[0]?.id || placetaId,
      estado_pago: 'Borrador',
      exencion_aplicada: igfResult.exento || false,
      dias_declarados_banco: dias,
      dias_activos_mes: dias
    });

    res.json({ success: true, balances, patrimonioMedio, declaracion: decl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/saldos/:placetaId/:mesPeriodo', verificarPermiso('tributos', 'ver_contribuyentes'), async (req, res) => {
  const saldos = await sbGetDailyBalances(req.params.placetaId, req.params.mesPeriodo);
  res.json(saldos);
});

// ═════════════════════════════════════════════════════════════════════════
// FACTURAS (Art. 4.17 - IVA 12%)
// ═════════════════════════════════════════════════════════════════════════

const memFacturas = new Map();

router.get('/api/facturas', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const facturas = [...memFacturas.values()].sort((a,b) => (b.fecha_emision||'').localeCompare(a.fecha_emision||''));
  res.json(facturas);
});

router.post('/api/facturas', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  try {
    const { emisorId, receptorId, lineas } = req.body;
    if (!emisorId || !receptorId || !lineas?.length) {
      return res.status(400).json({ error: 'emisorId, receptorId y lineas requeridos' });
    }
    const { calcularFactura, generarCSV } = await import('../config/normativa.js');
    const calc = calcularFactura(lineas);
    const id = 'FAC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
    const factura = {
      id, numero_factura: req.body.numeroFactura || id,
      emisor_placeta_id: emisorId, receptor_placeta_id: receptorId,
      fecha_emision: new Date().toISOString(),
      base_imponible: calc.baseImponible,
      total_iva: calc.totalIVA,
      total_factura: calc.totalFactura,
      lineas: calc.lineas,
      csv_verificacion: generarCSV(),
      estado: req.body.estado || 'Emitida',
      created_at: new Date().toISOString()
    };
    memFacturas.set(id, factura);
    res.json({ success: true, factura });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/facturas/:id/pdf', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const factura = memFacturas.get(req.params.id);
  if (!factura) return res.status(404).json({ error: 'No encontrada' });
  const buffer = await generarPDF('tributos', {
    id: factura.id, titulo: `Factura ${factura.numero_factura}`,
    tipo: 'factura',
    datos: {
      emisor: factura.emisor_placeta_id, receptor: factura.receptor_placeta_id,
      baseImponible: factura.base_imponible, totalIVA: factura.total_iva,
      totalFactura: factura.total_factura, lineas: factura.lineas,
      numeroFactura: factura.numero_factura, csv: factura.csv_verificacion,
      fechaEmision: factura.fecha_emision
    },
    estado: factura.estado, createdAt: factura.created_at,
    refId: factura.id, refTipo: 'factura'
  });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename=${factura.id}.pdf` });
  res.send(buffer);
});

// ── Control de recaudación ────────────────────────────────────────────────
router.put('/api/control-recaudacion', verificarPermiso('tributos', 'gestionar_regimenes'), async (req, res) => {
  const { mesPeriodo, inhibido } = req.body;
  await sbUpsertControlRecaudacion(mesPeriodo, inhibido);
  res.json({ success: true });
});

router.get('/api/control-recaudacion/:mesPeriodo', verificarPermiso('tributos', 'ver_contribuyentes'), async (req, res) => {
  const ctrl = await sbGetControlRecaudacion(req.params.mesPeriodo);
  res.json(ctrl || { mes_periodo: req.params.mesPeriodo, inhibido: false });
});

// ── Inspección Automática ──────────────────────────────────────────────────
router.get('/inspeccion', verificarPermiso('tributos', 'inspeccion_automatica'), async (req, res) => {
  const state = await apiBancoGetState();
  const cuentas = state?.accounts || [];
  const incidencias = [];

  for (const c of cuentas) {
    if (c.balancePz < -100) incidencias.push({ tipo: 'DEUDA_ALTA', cuenta: c, mensaje: `Deuda superior a 100 Pz: ${c.balancePz}` });
    if (c.type === 'Business' && !c.eip) incidencias.push({ tipo: 'SIN_EIP', cuenta: c, mensaje: 'Empresa sin EIP' });
  }

  res.render('tributos/inspeccion', {
    titulo: 'Inspección Automática',
    entidad_actual: 'tributos',
    incidencias, total: incidencias.length
  });
});

// ── Regímenes Tributarios ──────────────────────────────────────────────────
router.get('/regimenes', verificarPermiso('tributos', 'gestionar_regimenes'), (req, res) => {
  res.render('tributos/regimenes', {
    titulo: 'Regímenes Tributarios',
    entidad_actual: 'tributos',
    esAdmin: req.session.roles?.includes('tributos_admin')
  });
});

// ── Incidencias ────────────────────────────────────────────────────────────
router.get('/incidencias', verificarPermiso('tributos', 'gestionar_incidencias'), (req, res) => {
  res.render('tributos/incidencias', {
    titulo: 'Incidencias en Declaraciones',
    entidad_actual: 'tributos'
  });
});

// ── Documentación ─────────────────────────────────────────────────────────
router.get('/documentos', verificarPermiso('tributos', 'ver_contribuyentes'), (req, res) => {
  res.render('documentos', {
    titulo: 'Documentación - Tributos de La Placeta',
    entidad_actual: 'tributos'
  });
});

// ── Trabajadores de Tributos ───────────────────────────────────────────────
router.get('/trabajadores', verificarPermiso('tributos', 'ver_trabajadores_tributos'), (req, res) => {
  res.render('tributos/trabajadores', {
    titulo: 'Trabajadores de Tributos',
    entidad_actual: 'tributos'
  });
});

export default router;
