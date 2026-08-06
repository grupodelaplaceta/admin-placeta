/**
 * Sistema de Subvenciones entre Empresas (RSP / Sociedades)
 * ────────────────────────────────────────────────────────────────────────────
 * Modelo de negocio:
 *  - Una EMPRESA SUBVENCIONADORA concede una subvención a otra EMPRESA (por EIP)
 *    fijando una cantidad. NO se mueve ni un solo Placeta en la concesión.
 *  - La empresa subvencionada gasta con su cuenta; después entra en
 *    "Justificar gastos", selecciona las transacciones de GASTO que quiere que
 *    le cubra la subvención, y SOLO ENTONCES se transfieren los Placetas de la
 *    cuenta subvencionadora a la subvencionada, restándose del restante.
 *  - Se pueden excluir tipos de gasto (impuestos, comisiones, IRM/IGF, IVA…).
 *  - El dinero se da al justificar (nunca de golpe). Se cierra por la empresa
 *    o según la fecha programada.
 *  - Se generan PDFs: concesión, justificación y cierre.
 */
import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { apiBancoGetState, apiBancoPost } from '../config/db.js';

const router = Router();

// ── Almacenamiento en memoria ─────────────────────────────────────────────
const memSubvenciones = new Map();
let idCounter = 0;
function nextId() { return 'SUB-' + String(++idCounter).padStart(4, '0'); }

// Tipos de gasto excluibles por defecto (impuestos / comisiones / renta / IVA)
export const TIPOS_GASTO_EXCLUIBLES = [
  { id: 'Tax', label: 'Impuestos (Tax)' },
  { id: 'OperationalFee', label: 'Comisiones (OperationalFee)' },
  { id: 'InvestmentTax', label: 'Impuestos de inversión (InvestmentTax)' },
  { id: 'InvestmentCommission', label: 'Comisiones de inversión (InvestmentCommission)' },
  { id: 'ForcedVatRegularization', label: 'Declaraciones renta / IVA (IRM, IGF, IVA)' },
  { id: 'Rbu', label: 'Renta Básica (RBU)' },
  { id: 'Donation', label: 'Donaciones' },
  { id: 'Gift', label: 'Regalos' },
  // Art. 6 CNI: categoría PLJUNIOR_PAYMENT (pagos de recompensas y juegos de
  // Capitalia en nombre de Placeta Junior). El sistema de subvenciones puede
  // EXCLUIR esta categoría o INCLUIR SOLO esta (ver incluir_tipos).
  { id: 'PljuniorPayment', label: 'Pagos Placeta Junior (PLJUNIOR_PAYMENT)' }
];

// CAPITALIA: empresa que organiza "Placeta Junior" (Art. 5 CNI). Las empresas
// pueden subvencionarla SOLO para abonar los impuestos de IVA, IRM e IGF de los
// menores de 16. El receptor se identifica por su cuenta bancaria del sistema.
const CAPITALIA = {
  id: 'CAPITALIA',
  cuentaId: 'CAPITALIA_BANK',
  nombre: 'CAPITALIA (Placeta Junior)'
};

// Tipos de gasto que CAPITALIA puede justificar: ÚNICAMENTE impuestos de los
// menores (IVA/IRM/IGF). Art. 5 CNI.
const CAPITALIA_GASTOS_PERMITIDOS = new Set([
  'Tax', 'IrmCharge', 'ForcedVatRegularization', 'InvestmentTax', 'PljuniorPayment'
]);

async function persistirSubvencion(s) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('rsp_subvenciones').upsert({
      id: s.id, emisor_eip: s.emisor_eip, emisor_nombre: s.emisor_nombre,
      receptor_eip: s.receptor_eip, receptor_nombre: s.receptor_nombre,
      es_capitalia: s.es_capitalia || false,
      importe: s.importe, importe_restante: s.importe_restante,
      concepto: s.concepto, estado: s.estado,
      concedida_por: s.concedida_por, fecha_concesion: s.fecha_concesion,
      fecha_limite: s.fecha_limite, fecha_cierre: s.fecha_cierre,
      excluir_tipos: s.excluir_tipos || [],
      incluir_tipos: s.incluir_tipos || [],
      justificaciones: s.justificaciones || [],
      pdf_concesion: s.pdf_concesion, pdf_cierre: s.pdf_cierre,
      created_at: s.created_at, updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error && error.code === '42P01') {
      try { await supabase.rpc('exec_sql', { sql: `CREATE TABLE IF NOT EXISTS rsp_subvenciones (
        id TEXT PRIMARY KEY, emisor_eip TEXT, emisor_nombre TEXT,
        receptor_eip TEXT, receptor_nombre TEXT,
        es_capitalia BOOLEAN DEFAULT FALSE,
        importe NUMERIC DEFAULT 0, importe_restante NUMERIC DEFAULT 0,
        concepto TEXT, estado TEXT DEFAULT 'concedida',
        concedida_por TEXT, fecha_concesion TEXT, fecha_limite TEXT, fecha_cierre TEXT,
        excluir_tipos JSONB DEFAULT '[]', incluir_tipos JSONB DEFAULT '[]',
        justificaciones JSONB DEFAULT '[]',
        pdf_concesion TEXT, pdf_cierre TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );`}); } catch (_) {}
    } else if (error) { console.warn('[Subvenciones] Error persistir:', error.message); }
  } catch (err) { console.warn('[Subvenciones] Error persistir:', err.message); }
}

async function initSubvenciones() {
  try {
    if (supabase) {
      const { data } = await supabase.from('rsp_subvenciones').select('*').limit(1000);
      if (data && data.length > 0) {
        for (const row of data) {
          const parseJson = (v, fb) => { try { return v == null ? fb : (typeof v === 'string' ? JSON.parse(v) : v); } catch { return fb; } };
          memSubvenciones.set(row.id, {
            id: row.id, emisor_eip: row.emisor_eip, emisor_nombre: row.emisor_nombre,
            receptor_eip: row.receptor_eip, receptor_nombre: row.receptor_nombre,
            es_capitalia: !!row.es_capitalia,
            importe: Number(row.importe || 0), importe_restante: Number(row.importe_restante || 0),
            concepto: row.concepto || '', estado: row.estado || 'concedida',
            concedida_por: row.concedida_por, fecha_concesion: row.fecha_concesion,
            fecha_limite: row.fecha_limite, fecha_cierre: row.fecha_cierre,
            excluir_tipos: parseJson(row.excluir_tipos, []),
            incluir_tipos: parseJson(row.incluir_tipos, []),
            justificaciones: parseJson(row.justificaciones, []),
            pdf_concesion: row.pdf_concesion, pdf_cierre: row.pdf_cierre,
            created_at: row.created_at
          });
          const n = parseInt(String(row.id || '').replace(/\D/g, ''), 10);
          if (!Number.isNaN(n)) idCounter = Math.max(idCounter, n);
        }
      }
    }
  } catch (e) { console.warn('[Subvenciones] No se pudieron cargar de Supabase:', e.message); }
}
const subvencionesReady = initSubvenciones();

// Resolver cuenta de empresa del banco por EIP
function cuentaPorEip(state, eip) {
  const list = (state?.accounts || []).filter(a => String(a.eip || '').toUpperCase() === String(eip || '').toUpperCase());
  return list.length ? list[0] : null;
}

// Resolver el RECEPTOR de una subvención: una empresa (por EIP) o CAPITALIA
// (Art. 5 CNI, empresa que organiza Placeta Junior). CAPITALIA se identifica
// por su cuenta del sistema y solo puede recibir para pagar impuestos junior.
function resolverReceptor(state, receptorEip) {
  const key = String(receptorEip || '').trim().toUpperCase();
  if (key === 'CAPITALIA') {
    const cuenta = (state?.accounts || []).find(a => a.id === CAPITALIA.cuentaId);
    return {
      esCapitalia: true,
      eip: 'CAPITALIA',
      nombre: CAPITALIA.nombre,
      cuentaId: cuenta?.id || CAPITALIA.cuentaId
    };
  }
  const cuenta = cuentaPorEip(state, key);
  if (!cuenta) return null;
  return { esCapitalia: false, eip: String(cuenta.eip || key).toUpperCase(), nombre: cuenta.displayName || key, cuentaId: cuenta.id };
}

function displayEmpresa(state, eip) {
  if (String(eip || '').toUpperCase() === 'CAPITALIA') return CAPITALIA.nombre;
  const c = cuentaPorEip(state, eip);
  return c?.displayName || eip;
}

// ── Vista del panel de Subvenciones (Sociedades) ──────────────────────────
router.get('/subvenciones', async (req, res) => {
  await subvencionesReady;
  const state = await apiBancoGetState().catch(() => null);
  const subvenciones = [...memSubvenciones.values()].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  // Empresas del banco con EIP para el selector (emisoras/receptoras)
  const empresas = (state?.accounts || [])
    .filter(a => (a.type === 'Business' || a.type === 'State') && /^EIP-[A-Z0-9]{4,}$/i.test(String(a.eip || '')))
    .map(a => ({ eip: String(a.eip).toUpperCase(), nombre: a.displayName || a.eip }));
  res.render('subvenciones/panel', {
    titulo: 'Subvenciones entre Empresas',
    entidad_actual: req.baseUrl.replace('/', ''),
    subvenciones,
    empresas,
    tiposExcluibles: TIPOS_GASTO_EXCLUIBLES
  });
});

// ── API: Listar subvenciones ──────────────────────────────────────────────
router.get('/api/subvenciones', async (req, res) => {
  await subvencionesReady;
  const list = [...memSubvenciones.values()].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(list);
});

// ── Consulta para la app del Banco (por EIP) ─────────────────────────────
// Devuelve las subvenciones en las que la empresa es emisora o receptora.
// Se usa desde el API Gateway (/api/v1/tributos/subvenciones) y desde el
// backend-banco (proxy) para que la app muestre las subvenciones de la empresa.
export async function listarSubvencionesDeEmpresa(eip) {
  await subvencionesReady;
  const eipNorm = String(eip || '').trim().toUpperCase();
  if (!eipNorm) return [];
  return [...memSubvenciones.values()]
    .filter(s => String(s.emisor_eip || '').toUpperCase() === eipNorm || String(s.receptor_eip || '').toUpperCase() === eipNorm)
    .map(s => ({
      id: s.id,
      emisor_eip: s.emisor_eip, emisor_nombre: s.emisor_nombre,
      receptor_eip: s.receptor_eip, receptor_nombre: s.receptor_nombre,
      importe: Number(s.importe || 0), importe_restante: Number(s.importe_restante || 0),
      concepto: s.concepto || '', estado: s.estado || 'concedida',
      concedida_por: s.concedida_por, fecha_concesion: s.fecha_concesion,
      fecha_limite: s.fecha_limite, fecha_cierre: s.fecha_cierre,
      rol: String(s.emisor_eip || '').toUpperCase() === eipNorm ? 'subvencionadora' : 'beneficiaria',
      pdf_concesion: s.pdf_concesion, pdf_cierre: s.pdf_cierre,
      justificaciones: (s.justificaciones || []).length,
      created_at: s.created_at, updated_at: s.updated_at
    }))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

// ── API: Obtener subvención ───────────────────────────────────────────────
router.get('/api/subvenciones/:id', async (req, res) => {
  await subvencionesReady;
  const s = memSubvenciones.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'No encontrada' });
  res.json(s);
});

// ── API: Conceder subvención (NO mueve Placetas) ─────────────────────────
// Body: { emisorEip, receptorEip, importe, concepto, fechaLimite?, excluirTipos?[], incluirTipos?[] }
router.post('/api/subvenciones/conceder', async (req, res) => {
  try {
    const { emisorEip, receptorEip, importe, concepto, fechaLimite, excluirTipos, incluirTipos } = req.body;
    if (!emisorEip || !receptorEip) return res.status(400).json({ error: 'Se requieren EIP emisor y receptor' });
    if (String(emisorEip).toUpperCase() === String(receptorEip).toUpperCase()) return res.status(400).json({ error: 'El emisor y el receptor no pueden ser la misma empresa' });
    const amount = Number(importe);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Importe debe ser positivo' });

    const state = await apiBancoGetState();
    const emisor = cuentaPorEip(state, emisorEip);
    const receptor = resolverReceptor(state, receptorEip);
    if (!emisor) return res.status(404).json({ error: `Empresa subvencionadora ${emisorEip} no encontrada en el banco` });
    if (!receptor) return res.status(404).json({ error: `Empresa subvencionada ${receptorEip} no encontrada en el banco` });

    const id = nextId();
    const now = new Date().toISOString();
    const subvencion = {
      id,
      emisor_eip: String(emisor.eip || emisorEip).toUpperCase(),
      emisor_nombre: emisor.displayName || emisorEip,
      receptor_eip: receptor.eip,
      receptor_nombre: receptor.nombre,
      es_capitalia: receptor.esCapitalia || false,
      importe: amount,
      importe_restante: amount,
      concepto: String(concepto || '').trim() || 'Subvención',
      estado: 'concedida',
      concedida_por: req.session?.usuario?.dip || '',
      fecha_concesion: now,
      fecha_limite: fechaLimite || null,
      fecha_cierre: null,
      // Art. 6: si se indica incluir_tipos (p.ej. solo PLJUNIOR_PAYMENT), la
      // subvención SOLO cubre esos tipos. Si no, usa las exclusiones.
      incluir_tipos: Array.isArray(incluirTipos) ? incluirTipos.filter(Boolean) : [],
      excluir_tipos: Array.isArray(excluirTipos) ? excluirTipos.filter(Boolean) : [],
      justificaciones: [],
      pdf_concesion: null,
      pdf_cierre: null,
      created_at: now
    };
    memSubvenciones.set(id, subvencion);
    await persistirSubvencion(subvencion);

    // Generar PDF de concesión
    try {
      const { generarPDF } = await import('../config/documentos.js');
      const buffer = await generarPDF('rsp', {
        titulo: `Subvención ${subvencion.id}`, tipo: 'subvencion-concesion',
        datos: subvencion, refId: id, refTipo: 'subvencion',
        createdAt: now
      });
      subvencion.pdf_concesion = `SUB-${id}-CONCESION.pdf`;
      await persistirSubvencion(subvencion);
    } catch (e) { console.warn('[Subvenciones] PDF concesión:', e.message); }

    res.json({ success: true, subvencion });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: Justificar gastos (mueve Placetas del emisor al receptor) ──────
// Body: { transaccionIds: [txId,...] } — transacciones de GASTO del receptor
router.post('/api/subvenciones/:id/justificar', async (req, res) => {
  try {
    await subvencionesReady;
    const s = memSubvenciones.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    if (s.estado === 'cerrada') return res.status(400).json({ error: 'La subvención ya está cerrada' });
    if (s.importe_restante <= 0) return res.status(400).json({ error: 'No queda importe restante en la subvención' });

    const { transaccionIds } = req.body;
    if (!Array.isArray(transaccionIds) || transaccionIds.length === 0) return res.status(400).json({ error: 'Selecciona al menos una transacción de gasto' });

    const state = await apiBancoGetState();
    const emisor = cuentaPorEip(state, s.emisor_eip);
    // CAPITALIA se resuelve por su cuenta del sistema; el resto por EIP.
    const receptor = s.es_capitalia
      ? (state?.accounts || []).find(a => a.id === CAPITALIA.cuentaId) || null
      : cuentaPorEip(state, s.receptor_eip);
    if (!emisor) return res.status(404).json({ error: `Empresa subvencionadora ${s.emisor_eip} no encontrada` });
    if (!receptor) return res.status(404).json({ error: `Empresa subvencionada ${s.receptor_eip} no encontrada` });

    // Transacciones seleccionadas del receptor (solo gastos: de su cuenta a otra)
    const txs = (state?.transactions || []).filter(t => transaccionIds.includes(t.id));
    const gastos = txs.filter(t => t.fromAccountId === receptor.id && t.status === 'Settled' && Number(t.amountPz) > 0);

    if (gastos.length === 0) return res.status(400).json({ error: 'Ninguna transacción seleccionada es un gasto válido de la empresa subvencionada' });

    // Art. 5 CNI: las subvenciones a CAPITALIA SOLO cubren impuestos de los
    // menores de 16 (IVA, IRM, IGF). No se pueden justificar otros gastos.
    if (s.es_capitalia) {
      const permitidosCap = gastos.filter(t => CAPITALIA_GASTOS_PERMITIDOS.has(t.kind));
      if (permitidosCap.length === 0) {
        return res.status(400).json({ error: 'CAPITALIA (Art. 5) solo puede justificar impuestos de menores de 16: IVA, IRM o IGF (PLJUNIOR_PAYMENT)' });
      }
      gastos.length = 0; gastos.push(...permitidosCap);
    }

    // Art. 6 CNI: si la subvención fija incluir_tipos (p.ej. solo
    // PLJUNIOR_PAYMENT), SOLO se cubren esos tipos. Si no, aplican exclusiones.
    const incluir = (s.incluir_tipos || []).filter(Boolean);
    const excluidos = new Set(s.excluir_tipos || []);
    const permitidos = gastos.filter(t =>
      (incluir.length === 0 || incluir.includes(t.kind)) && !excluidos.has(t.kind)
    );
    if (permitidos.length === 0) return res.status(400).json({ error: 'Todas las transacciones seleccionadas corresponden a tipos de gasto no cubiertos por esta subvención' });

    const importeJustificar = Number(permitidos.reduce((sum, t) => sum + Number(t.amountPz || 0), 0).toFixed(2));
    if (importeJustificar <= 0) return res.status(400).json({ error: 'Importe a justificar no válido' });
    if (importeJustificar > s.importe_restante) {
      return res.status(400).json({ error: `El importe a justificar (${importeJustificar}) supera el restante de la subvención (${s.importe_restante})` });
    }

    // Transferencia real: emisor → receptor por el importe justificado
    const transfer = await apiBancoPost('transferir', {
      from: emisor.id, to: receptor.id,
      cantidad: importeJustificar,
      concepto: `SUBVENCION ${s.id} justificación (${s.concepto})`
    });
    if (!transfer?.success) {
      return res.status(400).json({ error: transfer?.error || 'No se pudo transferir la subvención' });
    }

    const justificacion = {
      id: `JUS-${Date.now().toString(36).toUpperCase()}`,
      fecha: new Date().toISOString(),
      importe: importeJustificar,
      transaccionIds: permitidos.map(t => t.id),
      conceptos: permitidos.map(t => t.concept || t.note || t.kind),
      transactionId: transfer.transactionId,
      justificada_por: req.session?.usuario?.dip || ''
    };
    s.justificaciones = [...(s.justificaciones || []), justificacion];
    s.importe_restante = Number((s.importe_restante - importeJustificar).toFixed(2));
    if (s.importe_restante <= 0) s.estado = 'cerrada'; // se agota → cierre automático

    await persistirSubvencion(s);

    // Generar PDF de justificación
    try {
      const { generarPDF } = await import('../config/documentos.js');
      const buffer = await generarPDF('rsp', {
        titulo: `Justificación Subvención ${s.id}`, tipo: 'subvencion-justificacion',
        datos: { ...s, justificacion },
        refId: justificacion.id, refTipo: 'subvencion-justificacion',
        createdAt: justificacion.fecha
      });
      justificacion.pdf = `SUB-${s.id}-JUS-${justificacion.id}.pdf`;
      await persistirSubvencion(s);
    } catch (e) { console.warn('[Subvenciones] PDF justificación:', e.message); }

    res.json({ success: true, subvencion: s, justificacion, transfer });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: Cerrar subvención ───────────────────────────────────────────────
router.post('/api/subvenciones/:id/cerrar', async (req, res) => {
  try {
    await subvencionesReady;
    const s = memSubvenciones.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    if (s.estado === 'cerrada') return res.status(400).json({ error: 'La subvención ya está cerrada' });

    s.estado = 'cerrada';
    s.fecha_cierre = new Date().toISOString();
    await persistirSubvencion(s);

    // Generar PDF de cierre
    try {
      const { generarPDF } = await import('../config/documentos.js');
      const buffer = await generarPDF('rsp', {
        titulo: `Cierre Subvención ${s.id}`, tipo: 'subvencion-cierre',
        datos: s, refId: s.id, refTipo: 'subvencion-cierre',
        createdAt: s.fecha_cierre
      });
      s.pdf_cierre = `SUB-${s.id}-CIERRE.pdf`;
      await persistirSubvencion(s);
    } catch (e) { console.warn('[Subvenciones] PDF cierre:', e.message); }

    res.json({ success: true, subvencion: s });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: PDF de subvención (concesión / justificación / cierre) ──────────
router.get('/api/subvenciones/:id/pdf/:tipo', async (req, res) => {
  try {
    await subvencionesReady;
    const s = memSubvenciones.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'No encontrada' });
    const tipo = req.params.tipo; // concesion | justificacion | cierre
    let documento = null;
    if (tipo === 'concesion') documento = { titulo: `Subvención ${s.id}`, tipoDoc: 'subvencion-concesion', datos: s, refId: s.id, createdAt: s.fecha_concesion };
    else if (tipo === 'cierre') documento = { titulo: `Cierre Subvención ${s.id}`, tipoDoc: 'subvencion-cierre', datos: s, refId: s.id, createdAt: s.fecha_cierre || s.updated_at };
    else if (tipo === 'justificacion' && req.query.jus) {
      const jus = (s.justificaciones || []).find(j => j.id === req.query.jus);
      if (jus) documento = { titulo: `Justificación ${jus.id}`, tipoDoc: 'subvencion-justificacion', datos: { ...s, justificacion: jus }, refId: jus.id, createdAt: jus.fecha };
    }
    if (!documento) return res.status(404).json({ error: 'Documento no disponible' });
    const { generarPDF } = await import('../config/documentos.js');
    const buffer = await generarPDF('rsp', { ...documento, tipo: documento.tipoDoc });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="SUB-${s.id}-${tipo.toUpperCase()}.pdf"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── API: Gastos disponibles del receptor para justificar ─────────────────
// GET /api/subvenciones/:id/gastos → transacciones de gasto no excluidas
router.get('/api/subvenciones/:id/gastos', async (req, res) => {
  try {
    await subvencionesReady;
    const s = memSubvenciones.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    const state = await apiBancoGetState();
    const receptor = s.es_capitalia
      ? (state?.accounts || []).find(a => a.id === CAPITALIA.cuentaId) || null
      : cuentaPorEip(state, s.receptor_eip);
    if (!receptor) return res.json({ gastos: [] });
    const incluir = (s.incluir_tipos || []).filter(Boolean);
    const excluidos = new Set(s.excluir_tipos || []);
    const gastos = (state?.transactions || [])
      .filter(t => t.fromAccountId === receptor.id && t.status === 'Settled' && Number(t.amountPz) > 0)
      .map(t => ({
        id: t.id, fecha: t.createdAt || t.updatedAt,
        importe: Number(t.amountPz || 0),
        concepto: t.concept || t.note || t.kind,
        tipo: t.kind,
        // Art. 5: CAPITALIA solo puede justificar impuestos junior.
        // Art. 6: si la subvención fija incluir_tipos, solo esos; si no, aplican exclusiones.
        excluido: s.es_capitalia
          ? !CAPITALIA_GASTOS_PERMITIDOS.has(t.kind)
          : (incluir.length > 0 ? !incluir.includes(t.kind) : excluidos.has(t.kind))
      }))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    res.json({ gastos, excluidos: [...excluidos], incluir: incluir, es_capitalia: !!s.es_capitalia });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
