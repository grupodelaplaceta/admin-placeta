/**
 * FUNDACIÓN BANCO DE LA PLACETA — FASE 11 / 12
 *
 * Programas, ayudas, becas, RBU, solicitudes, expedientes, beneficiarios,
 * pagos. Además, campañas de desvío de fondos (ej. CAMPAÑA-FUND-2026-01).
 *
 * Flujo RBU: Solicitud → Comprobación automática → Resolución → Concesión →
 * Orden de pago → Banco. La RSP registra todo el expediente.
 *
 * Persistencia Supabase (rsp_fundacion_programas, rsp_fundacion_solicitudes,
 * rsp_fundacion_campanas) + memoria.
 */

import { supabase } from './supabase.js';
import { generarIdentificador } from './identificadores.js';
import { crearExpediente, vincularObjeto } from './expedientes.js';

const T_PROGRAMAS = 'rsp_fundacion_programas';
const T_SOLICITUDES = 'rsp_fundacion_solicitudes';
const T_CAMPANAS = 'rsp_fundacion_campanas';

const memProgramas = [];
const memSolicitudes = new Map();
const memCampanas = new Map();

export const ESTADOS_SOLICITUD = ['recibida', 'en_revision', 'concedida', 'denegada', 'pagada', 'cerrada'];
export const TIPOS_PROGRAMA = ['ayuda', 'beca', 'rbu', 'proyecto', 'emergencia', 'social'];

// ── PROGRAMAS ────────────────────────────────────────────────────────────
async function listarProgramasDB() {
  if (!supabase) return null;
  try { const { data } = await supabase.from(T_PROGRAMAS).select('*').order('nombre'); return data || []; }
  catch { return null; }
}

export async function listarProgramas() {
  const db = await listarProgramasDB();
  if (db && db.length > 0) return db;
  return memProgramas;
}

export async function crearPrograma(datos, autor = {}) {
  if (!datos.nombre) throw new Error('El nombre del programa es obligatorio');
  const prog = {
    id: `FUND-PROG-${String(memProgramas.length + 1).padStart(3, '0')}`,
    nombre: datos.nombre,
    descripcion: datos.descripcion || '',
    tipo: datos.tipo || 'ayuda',
    presupuesto: Number(datos.presupuesto) || 0,
    presupuesto_utilizado: 0,
    estado: datos.estado || 'activo',
    requisitos: datos.requisitos || [],
    created_at: new Date().toISOString(),
  };
  memProgramas.push(prog);
  if (supabase) { try { await supabase.from(T_PROGRAMAS).insert(prog); } catch { /* memoria */ } }
  return prog;
}

// ── SOLICITUDES ──────────────────────────────────────────────────────────
async function listarSolicitudesDB(filtros = {}) {
  if (!supabase) return null;
  try {
    let q = supabase.from(T_SOLICITUDES).select('*').order('created_at', { ascending: false }).limit(300);
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    if (filtros.programa_id) q = q.eq('programa_id', filtros.programa_id);
    if (filtros.solicitante_dip) q = q.eq('solicitante_dip', filtros.solicitante_dip);
    const { data } = await q;
    return data || [];
  } catch { return null; }
}

export async function listarSolicitudes(filtros = {}) {
  const db = await listarSolicitudesDB(filtros);
  if (db && db.length > 0) {
    db.forEach(s => memSolicitudes.set(s.id, s));
    return db;
  }
  let lista = [...memSolicitudes.values()].reverse();
  if (filtros.estado) lista = lista.filter(s => s.estado === filtros.estado);
  if (filtros.programa_id) lista = lista.filter(s => s.programa_id === filtros.programa_id);
  return lista;
}

export async function getSolicitud(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(T_SOLICITUDES).select('*').eq('id', id).maybeSingle();
      if (data) { memSolicitudes.set(id, data); return data; }
    } catch { /* memoria */ }
  }
  return memSolicitudes.get(id) || null;
}

/** Crea una solicitud (ayuda/beca/RBU) */
export async function crearSolicitud(datos, autor = {}) {
  if (!datos.solicitante_dip) throw new Error('El solicitante (DIP) es obligatorio');
  const id = await generarIdentificador('SOL', new Date().getFullYear(), 'FUND');
  const sol = {
    id,
    programa_id: datos.programa_id || null,
    solicitante_dip: datos.solicitante_dip,
    solicitante_nombre: datos.solicitante_nombre || '',
    importe_solicitado: Number(datos.importe_solicitado) || 0,
    importe_concedido: 0,
    estado: 'recibida',
    resolucion: null,
    expediente_id: null,
    beneficiario_dip: datos.beneficiario_dip || datos.solicitante_dip,
    beneficiario_nombre: datos.beneficiario_nombre || datos.solicitante_nombre,
    documentos: datos.documentos || [],
    pagos: [],
    rbu: !!datos.rbu,
    rbu_semana: datos.rbu_semana || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memSolicitudes.set(id, sol);
  if (supabase) { try { await supabase.from(T_SOLICITUDES).insert(sol); } catch { /* memoria */ } }

  // Crear expediente vinculado automáticamente
  try {
    const exp = await crearExpediente({
      titulo: `Solicitud ${sol.rbu ? 'RBU' : 'de ayuda'} — ${sol.solicitante_nombre || sol.solicitante_dip}`,
      tipo: 'ayuda',
      persona_dip: sol.solicitante_dip,
      entidad: 'fundacion',
    }, autor);
    sol.expediente_id = exp.id;
    await vincularObjeto(exp.id, 'solicitud', sol.id, `Solicitud ${sol.id}`);
    await actualizarSolicitudDB(sol);
  } catch { /* expediente opcional */ }

  return sol;
}

async function actualizarSolicitudDB(sol) {
  if (supabase) { try { await supabase.from(T_SOLICITUDES).upsert(sol, { onConflict: 'id' }); } catch { /* memoria */ } }
}

/** Transición de estado de una solicitud */
export async function cambiarEstadoSolicitud(id, nuevoEstado, actor = {}, nota = '') {
  const sol = await getSolicitud(id);
  if (!sol) throw new Error('Solicitud no encontrada');
  if (!ESTADOS_SOLICITUD.includes(nuevoEstado)) throw new Error('Estado inválido');
  sol.estado = nuevoEstado;
  if (nota) sol.resolucion = nota;
  if (nuevoEstado === 'denegada' && nota) sol.resolucion = `DENEGADA: ${nota}`;
  sol.updated_at = new Date().toISOString();
  await actualizarSolicitudDB(sol);
  return sol;
}

/** Concede con importe (fase comprobación automática → concesión) */
export async function concederSolicitud(id, importe, actor = {}) {
  const sol = await getSolicitud(id);
  if (!sol) throw new Error('Solicitud no encontrada');
  if (sol.estado !== 'en_revision' && sol.estado !== 'recibida') throw new Error('Solo se pueden conceder solicitudes recibidas o en revisión');
  sol.importe_concedido = Number(importe) || 0;
  sol.estado = 'concedida';
  sol.resolucion = `Concedido: ${sol.importe_concedido} Pz`;
  sol.updated_at = new Date().toISOString();
  await actualizarSolicitudDB(sol);
  return sol;
}

/** Ordena el pago (Tributos/Banco) — registra la orden en la solicitud */
export async function ordenarPagoSolicitud(id, importe, actor = {}) {
  const sol = await getSolicitud(id);
  if (!sol) throw new Error('Solicitud no encontrada');
  if (sol.estado !== 'concedida') throw new Error('Solo se puede pagar una solicitud concedida');
  const pago = { importe: Number(importe) || sol.importe_concedido, fecha: new Date().toISOString(), orden: `ORD-FUND-${Date.now().toString(36).toUpperCase()}`, cuenta: 'FUND-BLP', ordenado_por: actor.nombre || actor.dip || '' };
  sol.pagos = [...(sol.pagos || []), pago];
  sol.estado = 'pagada';
  sol.updated_at = new Date().toISOString();
  await actualizarSolicitudDB(sol);
  return sol;
}

// ── CAMPAÑAS DE DESVÍO DE FONDOS (FASE 11) ───────────────────────────────
async function listarCampanasDB() {
  if (!supabase) return null;
  try { const { data } = await supabase.from(T_CAMPANAS).select('*').order('created_at', { ascending: false }); return data || []; }
  catch { return null; }
}

export async function listarCampanas() {
  const db = await listarCampanasDB();
  if (db && db.length > 0) return db;
  return [...memCampanas.values()].reverse();
}

/** Crea una campaña de desvío de fondos (ej. CAMPAÑA-FUND-2026-01) */
export async function crearCampana(datos, autor = {}) {
  if (!datos.nombre) throw new Error('El nombre de la campaña es obligatorio');
  const anio = new Date().getFullYear();
  const num = (await listarCampanas()).filter(c => c.id.includes(String(anio))).length + 1;
  const id = `CAMPAÑA-FUND-${anio}-${String(num).padStart(2, '0')}`;
  const camp = {
    id,
    nombre: datos.nombre,
    descripcion: datos.descripcion || '',
    fecha_inicio: datos.fecha_inicio || null,
    fecha_fin: datos.fecha_fin || null,
    estado: datos.estado || 'programada',
    ingresos_elegibles: [],
    destino: datos.destino || 'fundacion',
    iva_responsabilidad: datos.iva_responsabilidad || 'capitalia',
    total_desviado: 0,
    created_at: new Date().toISOString(),
  };
  memCampanas.set(id, camp);
  if (supabase) { try { await supabase.from(T_CAMPANAS).insert(camp); } catch { /* memoria */ } }
  return camp;
}

/** Registra un ingreso elegible de la campaña (separación contable) */
export async function registrarIngresoCampana(id, { concepto, importe, fecha }) {
  const camp = await getCampana(id);
  if (!camp) throw new Error('Campaña no encontrada');
  if (camp.estado !== 'activa') throw new Error('La campaña debe estar activa para registrar ingresos');
  const ingreso = { concepto, importe: Number(importe) || 0, fecha: fecha || new Date().toISOString(), iva_responsabilidad: camp.iva_responsabilidad };
  camp.ingresos_elegibles = [...(camp.ingresos_elegibles || []), ingreso];
  camp.total_desviado = (camp.total_desviado || 0) + ingreso.importe;
  if (supabase) { try { await supabase.from(T_CAMPANAS).update(camp).eq('id', id); } catch { /* memoria */ } }
  return camp;
}

export async function getCampana(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(T_CAMPANAS).select('*').eq('id', id).maybeSingle();
      if (data) { memCampanas.set(id, data); return data; }
    } catch { /* memoria */ }
  }
  return memCampanas.get(id) || null;
}

/** Cambiar estado de campaña */
export async function cambiarEstadoCampana(id, estado, actor = {}) {
  const camp = await getCampana(id);
  if (!camp) throw new Error('Campaña no encontrada');
  camp.estado = estado;
  if (supabase) { try { await supabase.from(T_CAMPANAS).update(camp).eq('id', id); } catch { /* memoria */ } }
  return camp;
}

/** Estado del módulo Fundación */
export async function estadoFundacion() {
  const [programas, solicitudes, campanas] = await Promise.all([listarProgramas(), listarSolicitudes(), listarCampanas()]);
  return {
    programas: programas.length,
    solicitudes: solicitudes.length,
    concedidas: solicitudes.filter(s => ['concedida', 'pagada', 'cerrada'].includes(s.estado)).length,
    pagadas: solicitudes.filter(s => s.estado === 'pagada').length,
    totalConcedido: solicitudes.reduce((s, x) => s + (x.importe_concedido || 0), 0),
    campanas: campanas.length,
    campanasActivas: campanas.filter(c => c.estado === 'activa').length,
    desviadoCampanas: campanas.reduce((s, c) => s + (c.total_desviado || 0), 0),
    presupuestoProgramas: programas.reduce((s, p) => s + (p.presupuesto || 0), 0),
  };
}

export default {
  ESTADOS_SOLICITUD, TIPOS_PROGRAMA,
  listarProgramas, crearPrograma,
  listarSolicitudes, getSolicitud, crearSolicitud, cambiarEstadoSolicitud, concederSolicitud, ordenarPagoSolicitud,
  listarCampanas, getCampana, crearCampana, registrarIngresoCampana, cambiarEstadoCampana,
  estadoFundacion,
};
