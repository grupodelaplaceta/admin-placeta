/**
 * EXPEDIENTES TRANSVERSALES — FASE 14
 *
 * EXP-2026-000001. Un expediente puede relacionar: persona, entidad,
 * solicitud, operación, documentos, firmas, pagos, resoluciones,
 * notificaciones. Persistencia Supabase (rsp_expedientes) + memoria.
 */

import { supabase } from './supabase.js';
import { generarIdentificador, hashIntegridad } from './identificadores.js';

const TABLA = 'rsp_expedientes';
const memExpedientes = new Map();

export const ESTADOS_EXP = ['abierto', 'en_tramite', 'resuelto', 'cerrado', 'archivado'];

async function listarDB(filtros = {}) {
  if (!supabase) return null;
  try {
    let q = supabase.from(TABLA).select('*').order('created_at', { ascending: false }).limit(300);
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    if (filtros.persona_dip) q = q.eq('persona_dip', filtros.persona_dip);
    if (filtros.entidad_eip) q = q.eq('entidad_eip', filtros.entidad_eip);
    const { data } = await q;
    return data || [];
  } catch { return null; }
}

async function upsertDB(exp) {
  if (!supabase) return false;
  try { await supabase.from(TABLA).upsert(exp, { onConflict: 'id' }); return true; }
  catch { return false; }
}

/** Lista expedientes (DB → memoria) */
export async function listarExpedientes(filtros = {}) {
  const db = await listarDB(filtros);
  if (db && db.length > 0) {
    db.forEach(e => memExpedientes.set(e.id, e));
    return db;
  }
  let lista = [...memExpedientes.values()].reverse();
  if (filtros.estado) lista = lista.filter(e => e.estado === filtros.estado);
  if (filtros.persona_dip) lista = lista.filter(e => e.persona_dip === filtros.persona_dip);
  return lista;
}

/** Obtener un expediente por id */
export async function getExpediente(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle();
      if (data) { memExpedientes.set(id, data); return data; }
    } catch { /* memoria */ }
  }
  return memExpedientes.get(id) || null;
}

/** Crea un expediente transversal */
export async function crearExpediente(datos, autor = {}) {
  if (!datos.titulo) throw new Error('El título del expediente es obligatorio');
  const id = await generarIdentificador('EXP');
  const exp = {
    id,
    titulo: datos.titulo,
    tipo: datos.tipo || 'general',
    entidad: datos.entidad || 'rsp',
    persona_dip: datos.persona_dip || null,
    entidad_eip: datos.entidad_eip || null,
    relacion_ids: datos.relacion_ids || [],
    estado: datos.estado || 'abierto',
    responsable_dip: datos.responsable_dip || autor.dip || null,
    responsable_nombre: datos.responsable_nombre || autor.nombre || null,
    prioridad: datos.prioridad || 'normal',
    documentos: datos.documentos || [],
    resolucion: datos.resolucion || null,
    hash: hashIntegridad({ titulo: datos.titulo, persona: datos.persona_dip, entidad: datos.entidad_eip }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memExpedientes.set(id, exp);
  await upsertDB(exp);
  return exp;
}

/** Actualiza un expediente (editable siempre que no esté archivado) */
export async function actualizarExpediente(id, cambios, autor = {}) {
  const exp = await getExpediente(id);
  if (!exp) throw new Error('Expediente no encontrado');
  if (exp.estado === 'archivado') throw new Error('Un expediente archivado no se puede modificar');
  const permitidos = ['titulo', 'tipo', 'persona_dip', 'entidad_eip', 'relacion_ids', 'estado', 'responsable_dip', 'responsable_nombre', 'prioridad', 'documentos', 'resolucion'];
  for (const k of permitidos) {
    if (cambios[k] !== undefined) exp[k] = cambios[k];
  }
  exp.updated_at = new Date().toISOString();
  memExpedientes.set(exp.id, exp);
  await upsertDB(exp);
  return exp;
}

/** Vincula un objeto al expediente (operación, documento, firma, pago, resolución, notificación) */
export async function vincularObjeto(id, tipo, objetoId, label = '') {
  const exp = await getExpediente(id);
  if (!exp) throw new Error('Expediente no encontrado');
  const relacion = { tipo, id: objetoId, label: label || objetoId };
  const yaExiste = (exp.relacion_ids || []).some(r => r.tipo === tipo && r.id === objetoId);
  if (!yaExiste) {
    exp.relacion_ids = [...(exp.relacion_ids || []), relacion];
    exp.updated_at = new Date().toISOString();
    memExpedientes.set(exp.id, exp);
    await upsertDB(exp);
  }
  return exp;
}

/** Busca expedientes por objeto vinculado */
export async function expedientesDeObjeto(tipo, objetoId) {
  const todos = await listarExpedientes();
  return todos.filter(e => (e.relacion_ids || []).some(r => r.tipo === tipo && r.id === objetoId));
}

/** Estado del módulo */
export async function estadoExpedientes() {
  const todos = await listarExpedientes();
  return {
    total: todos.length,
    porEstado: Object.fromEntries(ESTADOS_EXP.map(e => [e, todos.filter(x => x.estado === e).length])),
  };
}

export default {
  ESTADOS_EXP, listarExpedientes, getExpediente, crearExpediente,
  actualizarExpediente, vincularObjeto, expedientesDeObjeto, estadoExpedientes,
};
