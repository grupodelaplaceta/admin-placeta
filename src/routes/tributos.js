import { Router } from 'express';
import { apiBancoGetState, sbListDeclaraciones, sbGetDeclaracion, sbCreateDeclaracion, sbUpdateDeclaracion, sbDeleteDeclaracion, sbListDeclaracionesPorMes, sbGetContribuyente, sbUpsertContribuyente, sbGetDailyBalances, sbUpsertDailyBalance, sbClearDailyBalances, sbGetControlRecaudacion, sbUpsertControlRecaudacion } from '../config/db.js';
import { verificarPermiso } from '../middleware/auth.js';
import { calcularPatrimonioMedio, calcularIA, calcularIRM, calcularIGF, calcularCotizaciones } from '../config/normativa.js';
import { generarPDF } from '../config/documentos.js';

const router = Router();

// ── Verificación de EIP (Registro Tributario real) ────────────────────────
// Busca en el estado del Banco (bank_accounts) y, si no, en el registro de
// contribuyentes del backend-banco (/api/v1/tributos/validar-eip).
// Así el RSP puede comprobar que un EIP es REAL antes de darlo por válido.
router.get('/api/validar-eip', verificarPermiso('tributos', 'ver_contribuyentes'), async (req, res) => {
  const eip = String(req.query.eip || '').trim().toUpperCase();
  if (!eip) return res.status(400).json({ error: 'EIP requerido' });
  try {
    // 1) Estado del Banco (cuentas con EIP)
    const state = await apiBancoGetState().catch(() => null);
    const cuenta = state?.accounts?.find(a => String(a.eip || '').trim().toUpperCase() === eip);
    if (cuenta) {
      return res.json({
        verificado: true, fuente: 'banco', eip,
        entidad: { id: cuenta.id, nombre: cuenta.displayName || cuenta.id, tipo: cuenta.type || 'Desconocido',
                   placetaId: cuenta.placetaId, iban: cuenta.iban, censo: cuenta.tributosCensusDate || null }
      });
    }
    // 2) Registro de contribuyentes del backend-banco
    try {
      const r = await fetch(`https://api.banco.laplaceta.org/api/v1/tributos/validar-eip?eip=${encodeURIComponent(eip)}`, { signal: AbortSignal.timeout(8000) });
      const data = await r.json();
      if (r.ok && data && (data.contributor || data.eip || data.nombre)) {
        return res.json({ verificado: true, fuente: 'contribuyentes', eip, entidad: data });
      }
    } catch (e) { /* sin acceso al registro de contribuyentes */ }

    res.status(404).json({ verificado: false, eip, error: 'EIP no encontrado en el Registro Tributario' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Dashboard Tributos ─────────────────────────────────────────────────────
router.get('/', verificarPermiso('tributos', 'ver_contribuyentes'), async (req, res) => {
  const state = await apiBancoGetState();
  const mapa = agruparContribuyentes(state);
  const ingresos = [...mapa.values()].reduce((s, c) => s + c.cuentas.reduce((x, a) => x + (a.balancePz || 0), 0), 0);
  const declaraciones = await sbListDeclaraciones(5);
  const pendientes = declaraciones.filter(d => (d.estado_pago||'Borrador') === 'Borrador').length;

  res.render('tributos/dashboard', {
    titulo: 'Tributos de La Placeta',
    entidad_actual: 'tributos',
    totalContribuyentes: mapa.size,
    ingresos,
    declaracionesPendientes: pendientes,
    esAdmin: req.session.roles?.includes('tributos_admin'),
    esInspector: req.session.roles?.includes('tributos_inspector')
  });
});

// ── Listado de Contribuyentes (Registro Tributario REAL del backend-banco) ─
// ── Agrupación de contribuyentes por DIP o EIP ───────────────────────────
// Regla: los contribuyentes son personas físicas (se identifican por DIP y
// agrupan TODAS sus cuentas excepto las de empresa) o empresas (se identifican
// por EIP y agrupan SOLO sus cuentas de empresa). Cada cuenta del banco se
// asigna a un contribuyente según su tipo: Business/State → EIP, el resto → DIP.
function agruparContribuyentes(state) {
  const cuentas = state?.accounts || [];
  const users = state?.users || [];
  const SISTEMA = new Set(['sys-bank', 'sys-state', 'TGLP', 'AGLDP', 'VAULT_EMISION', 'CAPITALIA_BANK', 'DIP-ADMIN', 'DIP-DIGITAL']);

  // Mapa placetaId → user (para resolver DIP/nombre)
  const userPorPlaceta = new Map();
  for (const u of users) userPorPlaceta.set(u.placetaId, u);

  const contribuyentes = new Map(); // clave → { dip|eip, tipo, cuentas, displayName, ... }

  // ── Validación de formatos correctos ──────────────────────────────────
  // DIP de persona: DNI español (8 dígitos + letra) o NIE (X/Y/Z + 7-8 dígitos + letra)
  const esDIPValido = (d) => /^[XYZ0-9][0-9]{7,8}[A-Z]$/.test(String(d || '').toUpperCase().trim());
  // EIP de empresa: EIP-XXXXXX
  const esEIPValido = (e) => /^EIP-[A-Z0-9]{4,}$/.test(String(e || '').toUpperCase().trim());

  const resolverNombre = (c) => {
    const u = userPorPlaceta.get(c.placetaId);
    if (u?.displayName) return u.displayName;
    if (c.displayName && c.displayName !== c.id) return c.displayName;
    return u?.dip || c.placetaId || c.id || '—';
  };

  for (const c of cuentas) {
    if (!c.placetaId && !c.eip) continue;
    if (SISTEMA.has(c.id) || SISTEMA.has(c.placetaId)) continue;
    if (c.kind === 'OperationalFee') continue;

    const esEmpresa = c.type === 'Business' || c.type === 'State';
    const u = userPorPlaceta.get(c.placetaId);

    if (esEmpresa) {
      // Empresa → SOLO si tiene EIP con formato correcto
      const eip = String(c.eip || '').trim().toUpperCase();
      if (!esEIPValido(eip)) continue;
      if (!contribuyentes.has(eip)) {
        contribuyentes.set(eip, {
          clave: eip, eip, tipo: 'Empresa', cuentas: [],
          displayName: c.displayName && c.displayName !== c.id ? c.displayName : eip,
          dip: u?.dip || ''
        });
      }
      contribuyentes.get(eip).cuentas.push(c);
    } else if (c.type === 'Child') {
      // Junior (cuenta Child): el menor tributa pero sus impuestos los paga
      // Capitalia hasta que cumple 16 años (art. régimen junior).
      // El DIP del junior se deriva del id de la cuenta (u-<dipminúscula>).
      const m = String(c.id || '').match(/^u-([0-9]{8}[A-Z])$/i);
      const dipJunior = m ? m[1].toUpperCase() : (u?.dip || '').toString().toUpperCase().trim();
      if (!esDIPValido(dipJunior)) continue;
      if (!contribuyentes.has(dipJunior)) {
        contribuyentes.set(dipJunior, {
          clave: dipJunior, dip: dipJunior, eip: null, tipo: 'Fisico', cuentas: [],
          displayName: resolverNombre(c),
          esJunior: true, pagaCapitalia: true
        });
      }
      contribuyentes.get(dipJunior).cuentas.push(c);
    } else {
      // Persona → SOLO si el DIP tiene formato correcto (DNI/NIE)
      const dip = (u?.dip || c.placetaId || '').toString().toUpperCase().trim();
      if (!esDIPValido(dip)) continue;
      if (!contribuyentes.has(dip)) {
        contribuyentes.set(dip, {
          clave: dip, dip, eip: null, tipo: 'Fisico', cuentas: [],
          displayName: resolverNombre(c)
        });
      }
      contribuyentes.get(dip).cuentas.push(c);
    }
  }

  return contribuyentes;
}

router.get('/contribuyentes', verificarPermiso('tributos', 'ver_contribuyentes'), async (req, res) => {
  const state = await apiBancoGetState().catch(() => null);
  const mapa = agruparContribuyentes(state);

  let contribuyentes = [];
  for (const c of mapa.values()) {
    const saldo = c.cuentas.reduce((s, a) => s + (a.balancePz || 0), 0);
    contribuyentes.push({
      id: c.clave,
      placetaId: c.eip || c.dip || c.clave,
      dip: c.dip || '',
      eip: c.eip || null,
      type: c.tipo,
      displayName: c.displayName || (c.eip || c.dip || c.clave),
      iban: c.cuentas[0]?.iban || '—',
      tributosCensusDate: c.cuentas.find(a => a.tributosCensusDate)?.tributosCensusDate || null,
      numCuentas: c.cuentas.length,
      saldoTotal: saldo,
      esJunior: c.esJunior || false,
      pagaCapitalia: c.pagaCapitalia || false
    });
  }
  contribuyentes.sort((a, b) => (b.saldoTotal || 0) - (a.saldoTotal || 0));

  const { busqueda } = req.query;
  let filtrados = [...contribuyentes];
  if (busqueda) {
    const q = busqueda.toLowerCase();
    filtrados = filtrados.filter(c =>
      c.id?.toLowerCase().includes(q) ||
      c.displayName?.toLowerCase().includes(q) ||
      (c.eip || '').toLowerCase().includes(q) ||
      (c.dip || '').toLowerCase().includes(q)
    );
  }

  // Declaraciones mensuales por contribuyente (desde julio 2026)
  const todasDecl = await sbListDeclaraciones(2000);
  const declPorContrib = new Map();
  for (const d of todasDecl) {
    if (!declPorContrib.has(d.placeta_id)) declPorContrib.set(d.placeta_id, []);
    declPorContrib.get(d.placeta_id).push(d);
  }
  // Ordenar por mes descendente
  for (const arr of declPorContrib.values()) arr.sort((a, b) => (b.mes_periodo || '').localeCompare(a.mes_periodo || ''));

  res.render('tributos/contribuyentes', {
    titulo: 'Contribuyentes',
    entidad_actual: 'tributos',
    contribuyentes: filtrados, total: filtrados.length,
    declaraciones: declPorContrib,
    totalDeclaraciones: todasDecl.length,
    mesActual: new Date().toISOString().slice(0, 7)
  });
});

// ── Alta de contribuyente (registro REAL en Tributos desde el RSP) ────────
// Da de alta un contribuyente (personal o empresa con EIP) en el Registro
// Tributario del backend-banco, igual que hace la app del Banco.
router.post('/api/alta', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const { dip, placeta_id, placetaId, nombre, tipo_sujeto, eip, iban } = req.body;
  if (!dip || !nombre) return res.status(400).json({ error: 'Se requieren dip y nombre' });
  try {
    const payload = {
      dip,
      placeta_id: placeta_id || placetaId || `PL-${dip?.replace(/[^A-Z0-9]/gi, '').toUpperCase()}`,
      nombre,
      tipo_sujeto: tipo_sujeto === 'Empresa' ? 'Empresa' : 'Fisico',
      eip: tipo_sujeto === 'Empresa' ? String(eip || '').trim().toUpperCase() : undefined,
      iban: iban || ''
    };
    const r = await fetch('https://api.banco.laplaceta.org/api/v1/tributos/alta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error || 'No se pudo dar de alta' });
    res.json({ success: true, ...data, eip: payload.eip });
  } catch (e) {
    res.status(502).json({ error: 'No se pudo contactar con el Registro Tributario: ' + e.message });
  }
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

    // Junior (menor de 16): sus impuestos los paga Capitalia hasta que cumple
    // los 16 años y deja de ser junior. El cobro se hace de CAPITALIA_BANK → TGLP.
    const esJunior = d.cuenta_id_blp === 'CAPITALIA_BANK' || /^CAPITALIA/i.test(d.cuenta_id_blp || '');
    const fromAccount = esJunior ? 'CAPITALIA_BANK' : d.cuenta_id_blp;
    const concepto = esJunior
      ? `DEC-JUNIOR ${d.id.slice(-8)} ${d.mes_periodo} (impuestos asumidos por Capitalia)`
      : `DEC-${d.id.slice(-8)} ${d.mes_periodo}`;

    // Intentar cobro vía API Banco
    let transactionId = null;
    try {
      const { apiBancoPost } = await import('../config/db.js');
      const cobro = await apiBancoPost('transfer', {
        from: fromAccount, to: 'TGLP',
        amount: total, concept: concepto
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
    const transacciones = state?.transactions || [];
    const resultado = await reconciliarCuentaMes(cuentas, transacciones, placetaId, mesPeriodo);
    if (resultado.error) return res.status(400).json({ error: resultado.error });
    res.json(resultado);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reconciliación reutilizable (una cuenta + un mes) ────────────────────
// Reconstruye los saldos diarios REALES desde las transacciones del banco,
// calcula patrimonio medio, IA, IRM e IGF según normativa y crea/actualiza
// la declaración mensual del contribuyente.
async function reconciliarCuentaMes(cuentas, transacciones, placetaId, mesPeriodo, opts = {}) {
  if (!cuentas || cuentas.length === 0) return { error: 'Cuenta no encontrada en el banco' };
  const esJunior = opts.esJunior === true || cuentas.some(c => c.type === 'Child');
  const pagaCapitalia = opts.pagaCapitalia === true || esJunior;
  const ids = new Set(cuentas.map(c => c.id));
  const trans = (transacciones || []).filter(t => ids.has(t.fromAccountId) || ids.has(t.toAccountId));

  await sbClearDailyBalances(placetaId, mesPeriodo);

  // ── Reconstrucción REAL del saldo diario desde las transacciones ──
  // Saldo actual = saldo base + Σ movimientos del mes  ⇒  saldo base = actual - Σ mov.
  const [anio, mes] = String(mesPeriodo).split('-').map(Number);
  const enMes = (t) => {
    const d = new Date(t.createdAt || t.updatedAt);
    return d.getFullYear() === anio && d.getMonth() + 1 === mes;
  };
  // Movimientos del mes objetivo
  const movMes = trans.filter(enMes);
  // Movimientos desde el INICIO del mes objetivo hasta HOY (incluye este mes y
  // todos los posteriores). Para un mes PASADO, el saldo base debe restar los
  // movimientos de los meses siguientes: de lo contrario el patrimonio del mes
  // pasado se infla con dinero que aún no existía en esa fecha.
  const movDesdeInicio = trans.filter(t => {
    const d = new Date(t.createdAt || t.updatedAt);
    return d.getFullYear() > anio || (d.getFullYear() === anio && d.getMonth() + 1 >= mes);
  });
  const deltaDesdeInicio = movDesdeInicio.reduce((s, t) => {
    if (ids.has(t.toAccountId)) s += Number(t.amountPz || 0);
    if (ids.has(t.fromAccountId)) s -= Number(t.amountPz || 0);
    return s;
  }, 0);
  const saldoActual = cuentas.reduce((s, c) => s + (c.balancePz || 0), 0);
  const saldoBase = saldoActual - deltaDesdeInicio;

  const diasEnMes = new Date(anio, mes, 0).getDate();
  const balances = [];
  for (let d = 1; d <= diasEnMes; d++) {
    // Saldo acumulado del contribuyente al final del día d.
    const hastaDia = trans.filter(t => {
      const dt = new Date(t.createdAt || t.updatedAt);
      return dt.getFullYear() === anio && dt.getMonth() + 1 === mes && dt.getDate() <= d;
    });
    const delta = hastaDia.reduce((s, t) => {
      if (ids.has(t.toAccountId)) s += Number(t.amountPz || 0);
      if (ids.has(t.fromAccountId)) s -= Number(t.amountPz || 0);
      return s;
    }, 0);
    const saldoDia = Math.max(0, saldoBase + delta);
    await sbUpsertDailyBalance(placetaId, mesPeriodo, d, Math.round(saldoDia));
    balances.push(Math.round(saldoDia));
  }

  // Patrimonio medio del mes (Art. 4.8)
  const patrimonioMedio = calcularPatrimonioMedio(balances);

  // IA = (media ingresos - media pagos) / patrimonio medio (Art. 4.9)
  const ingresosMes = movMes.filter(t => ids.has(t.toAccountId)).reduce((s, t) => s + Number(t.amountPz || 0), 0);
  const pagosMes = movMes.filter(t => ids.has(t.fromAccountId)).reduce((s, t) => s + Number(t.amountPz || 0), 0);
  const mediaIngresos = diasEnMes ? ingresosMes / diasEnMes : 0;
  const mediaPagos = diasEnMes ? pagosMes / diasEnMes : 0;
  const ia = calcularIA(mediaIngresos, mediaPagos, patrimonioMedio);

  // Tipo de contribuyente: empresa si alguna cuenta es Business / State.
  const tipoSujeto = cuentas.some(c => c.type === 'Business' || c.type === 'State') ? 'Empresa' : 'Personal';
  const tipoCuenta = tipoSujeto === 'Empresa' ? 'Business' : 'Personal';
  const esEmpresaPequeña = tipoCuenta === 'Business' && patrimonioMedio < 20000;

  const irmTipo = calcularIRM(ia, tipoCuenta);
  const cuotaIRM = patrimonioMedio * irmTipo;
  const igfResult = calcularIGF(patrimonioMedio, tipoCuenta, esEmpresaPequeña);
  const cuotaIGF = igfResult.exento ? 0 : igfResult.total;

  // Excepción de IVA a empresas: si la empresa tiene EIP registrado no se le
  // carga IVA en sus operaciones internas; el IVA lo liquida el emisor.
  const eipVinculado = cuentas.some(c => c.eip);

  const decl = await sbCreateDeclaracion({
    placeta_id: placetaId, mes_periodo: mesPeriodo,
    patrimonio_medio: Math.round(patrimonioMedio * 100) / 100,
    indice_acumulacion: Math.round(ia * 10000) / 10000,
    cuota_irm: Math.round(cuotaIRM * 100) / 100,
    cuota_igf: cuotaIGF,
    cuenta_id_blp: pagaCapitalia ? 'CAPITALIA_BANK' : (cuentas[0]?.id || placetaId),
    estado_pago: 'Borrador',
    exencion_aplicada: igfResult.exento || false,
    dias_declarados_banco: diasEnMes,
    dias_activos_mes: diasEnMes,
    eip: eipVinculado ? cuentas.find(c => c.eip)?.eip : null,
    iva_exento_empresa: esEmpresaPequeña || eipVinculado || false
  });

  return {
    success: true,
    balances,
    patrimonioMedio,
    indice_acumulacion: ia,
    tipoSujeto,
    cuotaIRM: Math.round(cuotaIRM * 100) / 100,
    cuotaIGF,
    irmTipo,
    igfResult,
    exencionIGF: igfResult.exento,
    iva_exento_empresa: esEmpresaPequeña || eipVinculado || false,
    esJunior,
    pagaCapitalia,
    declaracion: decl
  };
}

// ── Reconciliación MASIVA: declara TODAS las cuentas por cada mes ────────
// Desde julio de 2026 (o el mes de creación de la cuenta si es posterior)
// hasta el mes actual, genera/actualiza la declaración de cada contribuyente.
router.post('/api/reconciliar-todas', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  try {
    const state = await apiBancoGetState();
    const transacciones = state?.transactions || [];

    // Agrupar por DIP (personas) o EIP (empresas) — todas sus cuentas
    const porContribuyente = agruparContribuyentes(state);

    // Determinar desde qué mes declara cada contribuyente
    const MES_INICIO = '2026-07'; // julio 2026
    const ahora = new Date();
    const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    const meses = [];
    let [ai, mi] = MES_INICIO.split('-').map(Number);
    const [af, mf] = mesActual.split('-').map(Number);
    while (ai < af || (ai === af && mi <= mf)) {
      meses.push(`${ai}-${String(mi).padStart(2, '0')}`);
      mi++; if (mi > 12) { mi = 1; ai++; }
    }

    const resultados = [];
    let creadas = 0, yaExistentes = 0, errores = 0;

    for (const [clave, contrib] of porContribuyente) {
      // placeta_id de la declaración: EIP para empresas, DIP para personas
      const placetaId = contrib.eip || contrib.dip || clave;
      const cuentasContrib = contrib.cuentas;

      // Mes de creación del contribuyente: usar la transacción más antigua si existe
      let mesInicio = MES_INICIO;
      const idsC = new Set(cuentasContrib.map(c => c.id));
      const txDelContrib = (transacciones || []).filter(t => idsC.has(t.fromAccountId) || idsC.has(t.toAccountId));
      if (txDelContrib.length > 0) {
        const fechas = txDelContrib.map(t => new Date(t.createdAt || t.updatedAt)).filter(d => !isNaN(d));
        if (fechas.length > 0) {
          const min = new Date(Math.min(...fechas.map(d => d.getTime())));
          const mesTx = `${min.getFullYear()}-${String(min.getMonth() + 1).padStart(2, '0')}`;
          if (mesTx > MES_INICIO) mesInicio = mesTx;
        }
      }

      for (const mes of meses) {
        if (mes < mesInicio) continue; // el contribuyente aún no existía ese mes
        try {
          const existentes = await sbListDeclaracionesPorMes(mes);
          const ya = existentes.some(d => d.placeta_id === placetaId);
          if (ya) { yaExistentes++; continue; }
          const r = await reconciliarCuentaMes(cuentasContrib, transacciones, placetaId, mes, {
            esJunior: contrib.esJunior,
            pagaCapitalia: contrib.pagaCapitalia
          });
          if (r.success) {
            creadas++;
            resultados.push({ contribuyente: placetaId, mes, patrimonio: r.patrimonioMedio, irm: r.cuotaIRM, igf: r.cuotaIGF, id: r.declaracion.id, esJunior: r.esJunior, pagaCapitalia: r.pagaCapitalia });
          } else errores++;
        } catch (e) {
          errores++;
          resultados.push({ contribuyente: placetaId, mes, error: e.message });
        }
      }
    }

    res.json({
      success: true,
      desde: MES_INICIO, hasta: mesActual,
      contribuyentes: porContribuyente.size,
      meses: meses.length,
      creadas, yaExistentes, errores,
      resultados: resultados.slice(0, 100)
    });
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
