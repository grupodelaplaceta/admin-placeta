/**
 * OPERATION ENGINE — FASE 4
 *
 * Toda operación pasa por:
 * CREACIÓN → IDENTIFICACIÓN → CLASIFICACIÓN → VALIDACIÓN → REGLAS →
 * FISCALIDAD → DOCUMENTACIÓN → EJECUCIÓN → AUDITORÍA
 *
 * Clasifica operaciones por concepto/origen/destino/importe/periodicidad y
 * DETECTA operaciones inconsistentes:
 *   - Concepto "Nómina agosto" sin NOM-2026-08-XXXX → RETENER/RECHAZAR
 *   - Concepto "Factura" sin FAC-... → RETENER
 *   - Subvención sin expediente → AVISO
 *
 * Persistencia Supabase (rsp_operaciones) + memoria.
 */

import { supabase } from './supabase.js';
import { generarIdentificador } from './identificadores.js';

const TABLA = 'rsp_operaciones';
const memOperaciones = new Map();

export const ETAPAS_MOTOR = [
  'creada', 'identificada', 'clasificada', 'validada', 'reglas',
  'fiscalidad', 'documentacion', 'ejecutada', 'auditada',
  'retenida', 'revertida', 'rechazada',
];

// Patrones de clasificación por concepto
const PATRONES = [
  { clave: 'nomina', re: /nomina|nómina|salario|sueldo|payroll/i, clasificacion: 'nomina', servicio: 'nominas' },
  { clave: 'factura', re: /factura|invoice|recibo/i, clasificacion: 'factura', servicio: 'facturacion' },
  { clave: 'subvencion', re: /subvencion|subvención|grant/i, clasificacion: 'subvencion', servicio: 'fundacion' },
  { clave: 'ayuda', re: /ayuda|beca|rbu|beca/i, clasificacion: 'ayuda', servicio: 'fundacion' },
  { clave: 'impuesto', re: /impuesto|tributo|tax|irm|igf|iva/i, clasificacion: 'impuesto', servicio: 'tributos' },
  { clave: 'donacion', re: /donacion|donación|donation/i, clasificacion: 'donacion', servicio: 'fundacion' },
  { clave: 'junior', re: /junior|placeta junior|recompensa|candela/i, clasificacion: 'junior', servicio: 'junior' },
  { clave: 'pago', re: /pago|payment|orden/i, clasificacion: 'pago', servicio: 'banco' },
];

/** Clasifica una operación por su concepto */
export function clasificarOperacion({ concepto = '', origen = '', destino = '', importe = 0 }) {
  const texto = `${concepto} ${origen} ${destino}`;
  for (const p of PATRONES) {
    if (p.re.test(texto)) {
      return { clasificacion: p.clasificacion, servicio: p.servicio, confianza: 'alta' };
    }
  }
  if (importe > 0 && destino) return { clasificacion: 'transferencia', servicio: 'banco', confianza: 'media' };
  return { clasificacion: 'otro', servicio: 'banco', confianza: 'baja' };
}

/**
 * Detecta inconsistencias de una operación.
 * Busca el identificador esperado según su clasificación (NOM-, FAC-, EXP-, etc.)
 */
export async function detectarInconsistencias(op, ctx = {}) {
  const inconsistencias = [];
  const concepto = op.concepto || '';
  const clasif = op.clasificacion || clasificarOperacion(op).clasificacion;

  // Nómina sin NOM- (busca en texto o en ctx.nominas)
  if (clasif === 'nomina') {
    const tieneNom = /NOM-\d{4}/i.test(concepto) || (ctx.nominas || []).some(n => n.concepto === concepto || (n.importe === op.importe && n.mes && concepto.toLowerCase().includes(n.mes.toLowerCase())));
    if (!tieneNom) inconsistencias.push({ tipo: 'NOMINA_SIN_REFERENCIA', gravedad: 'alta', mensaje: 'Concepto de nómina sin NOM-2026-XX-XXXX. La transferencia manual no sustituye el proceso de nóminas.' });
  }
  // Factura sin FAC-
  if (clasif === 'factura') {
    const tieneFac = /FAC-\d{4}/i.test(concepto) || (ctx.facturas || []).some(f => f.id === concepto || f.concepto === concepto);
    if (!tieneFac) inconsistencias.push({ tipo: 'FACTURA_SIN_REFERENCIA', gravedad: 'media', mensaje: 'Pago sin factura FAC- asociada.' });
  }
  // Subvención sin expediente EXP-
  if (clasif === 'subvencion') {
    const tieneExp = /EXP-\d{4}/i.test(concepto) || (ctx.expedientes || []).some(e => e.id === op.expediente_id);
    if (!tieneExp) inconsistencias.push({ tipo: 'SUBVENCION_SIN_EXPEDIENTE', gravedad: 'media', mensaje: 'Operación de subvención sin expediente EXP- vinculado.' });
  }
  // Importe negativo (salida) sin clasificar
  if (op.importe < 0 && !op.clasificacion && clasif === 'otro') {
    inconsistencias.push({ tipo: 'SALIDA_SIN_CLASIFICAR', gravedad: 'baja', mensaje: 'Salida de fondos sin clasificar.' });
  }
  // Operación sin documento (ctx.documentos)
  if (clasif !== 'transferencia' && clasif !== 'otro' && !(ctx.documentos || []).length) {
    inconsistencias.push({ tipo: 'SIN_DOCUMENTACION', gravedad: 'baja', mensaje: 'La operación no tiene documentación asociada en el contexto.' });
  }
  return inconsistencias;
}

/** Procesa una operación por el motor completo */
export async function procesarOperacion(op, ctx = {}, autor = {}) {
  if (!op.concepto && !op.importe) throw new Error('La operación necesita concepto o importe');
  const id = await generarIdentificador('OP');
  const clasif = clasificarOperacion(op);
  const inconsistencias = await detectarInconsistencias({ ...op, clasificacion: clasif.clasificacion }, ctx);

  const registro = {
    id,
    trf_id: op.trf_id || null,
    cuenta_origen: op.cuenta_origen || null,
    cuenta_destino: op.cuenta_destino || null,
    concepto: op.concepto || '',
    importe: op.importe || 0,
    periodicidad: op.periodicidad || 'puntual',
    servicio: op.servicio || clasif.servicio,
    clasificacion: clasif.clasificacion,
    estado_motor: inconsistencias.length > 0 ? 'retenida' : 'validada',
    inconsistencias,
    expediente_id: op.expediente_id || null,
    documentos: op.documentos || [],
    regla_aplicada: op.regla_aplicada || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memOperaciones.set(id, registro);
  if (supabase) { try { await supabase.from(TABLA).insert(registro); } catch { /* memoria */ } }
  return registro;
}

/** Cambia la etapa del motor */
export async function cambiarEtapa(id, etapa, autor = {}, motivo = '') {
  const op = await getOperacion(id);
  if (!op) throw new Error('Operación no encontrada');
  if (!ETAPAS_MOTOR.includes(etapa)) throw new Error('Etapa inválida');
  op.estado_motor = etapa;
  op.updated_at = new Date().toISOString();
  memOperaciones.set(id, op);
  if (supabase) { try { await supabase.from(TABLA).update(op).eq('id', id); } catch { /* memoria */ } }
  return op;
}

async function listarDB(filtros = {}) {
  if (!supabase) return null;
  try {
    let q = supabase.from(TABLA).select('*').order('created_at', { ascending: false }).limit(300);
    if (filtros.estado_motor) q = q.eq('estado_motor', filtros.estado_motor);
    if (filtros.clasificacion) q = q.eq('clasificacion', filtros.clasificacion);
    const { data } = await q;
    return data || [];
  } catch { return null; }
}

export async function listarOperaciones(filtros = {}) {
  const db = await listarDB(filtros);
  if (db && db.length > 0) {
    db.forEach(o => memOperaciones.set(o.id, o));
    return db;
  }
  let lista = [...memOperaciones.values()].reverse();
  if (filtros.estado_motor) lista = lista.filter(o => o.estado_motor === filtros.estado_motor);
  if (filtros.clasificacion) lista = lista.filter(o => o.clasificacion === filtros.clasificacion);
  return lista;
}

export async function getOperacion(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle();
      if (data) { memOperaciones.set(id, data); return data; }
    } catch { /* memoria */ }
  }
  return memOperaciones.get(id) || null;
}

/** Estado del motor */
export async function estadoOperationEngine() {
  const todas = await listarOperaciones();
  return {
    total: todas.length,
    retenidas: todas.filter(o => o.estado_motor === 'retenida').length,
    rechazadas: todas.filter(o => o.estado_motor === 'rechazada').length,
    ejecutadas: todas.filter(o => o.estado_motor === 'ejecutada').length,
    porClasificacion: {},
    porEstado: Object.fromEntries(ETAPAS_MOTOR.map(e => [e, todas.filter(o => o.estado_motor === e).length])),
  };
}

export default {
  ETAPAS_MOTOR, clasificarOperacion, detectarInconsistencias,
  procesarOperacion, cambiarEtapa, listarOperaciones, getOperacion, estadoOperationEngine,
};
