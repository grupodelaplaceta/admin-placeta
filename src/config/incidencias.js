/**
 * INCIDENCIAS GLOBALES — FASE 18
 *
 * INC-2026-000001. Origen, usuario, servicio, problema, documentos,
 * responsable, estado, resolución, historial.
 * Estados: abierta → en_revision → en_resolucion → resuelta → cerrada.
 * Persistencia Supabase (rsp_incidencias) + memoria.
 */

import { supabase } from './supabase.js';
import { generarIdentificador } from './identificadores.js';

const TABLA = 'rsp_incidencias';
const memIncidencias = new Map();

export const ESTADOS_INC = ['abierta', 'en_revision', 'en_resolucion', 'resuelta', 'cerrada'];
export const ORIGENES_INC = ['banco', 'tributos', 'junior', 'fundacion', 'rsp', 'administracion', 'junta', 'edu', 'placetaid'];

async function listarDB(filtros = {}) {
  if (!supabase) return null;
  try {
    let q = supabase.from(TABLA).select('*').order('created_at', { ascending: false }).limit(300);
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    if (filtros.origen) q = q.eq('origen', filtros.origen);
    if (filtros.gravedad) q = q.eq('gravedad', filtros.gravedad);
    if (filtros.usuario_dip) q = q.eq('usuario_dip', filtros.usuario_dip);
    const { data } = await q;
    return data || [];
  } catch { return null; }
}

async function upsertDB(inc) {
  if (!supabase) return false;
  try { await supabase.from(TABLA).upsert(inc, { onConflict: 'id' }); return true; }
  catch { return false; }
}

/** Lista incidencias */
export async function listarIncidencias(filtros = {}) {
  const db = await listarDB(filtros);
  if (db && db.length > 0) {
    db.forEach(i => memIncidencias.set(i.id, i));
    return db;
  }
  let lista = [...memIncidencias.values()].reverse();
  if (filtros.estado) lista = lista.filter(i => i.estado === filtros.estado);
  if (filtros.origen) lista = lista.filter(i => i.origen === filtros.origen);
  if (filtros.gravedad) lista = lista.filter(i => i.gravedad === filtros.gravedad);
  return lista;
}

/** Obtiene una incidencia */
export async function getIncidencia(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle();
      if (data) { memIncidencias.set(id, data); return data; }
    } catch { /* memoria */ }
  }
  return memIncidencias.get(id) || null;
}

/** Crea una incidencia */
export async function crearIncidencia(datos, autor = {}) {
  if (!datos.titulo) throw new Error('El título de la incidencia es obligatorio');
  const id = await generarIdentificador('INC');
  const inc = {
    id,
    origen: datos.origen || 'rsp',
    servicio: datos.servicio || datos.origen || 'rsp',
    titulo: datos.titulo,
    descripcion: datos.descripcion || '',
    usuario_dip: datos.usuario_dip || autor.dip || null,
    entidad_eip: datos.entidad_eip || null,
    gravedad: datos.gravedad || 'media',
    estado: 'abierta',
    responsable_dip: datos.responsable_dip || null,
    responsable_nombre: datos.responsable_nombre || null,
    documentos: datos.documentos || [],
    resolucion: null,
    historial: [{ estado: 'abierta', fecha: new Date().toISOString(), usuario: autor.nombre || 'sistema', nota: 'Incidencia creada' }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memIncidencias.set(id, inc);
  await upsertDB(inc);
  return inc;
}

/** Cambia estado (workflow) y añade historial */
export async function cambiarEstadoIncidencia(id, nuevoEstado, actor = {}, nota = '') {
  const inc = await getIncidencia(id);
  if (!inc) throw new Error('Incidencia no encontrada');
  if (!ESTADOS_INC.includes(nuevoEstado)) throw new Error('Estado inválido');
  inc.estado = nuevoEstado;
  inc.historial = [...(inc.historial || []), { estado: nuevoEstado, fecha: new Date().toISOString(), usuario: actor.nombre || 'sistema', dip: actor.dip || '', nota }];
  if (nuevoEstado === 'resuelta' && nota) inc.resolucion = nota;
  inc.updated_at = new Date().toISOString();
  memIncidencias.set(id, inc);
  await upsertDB(inc);
  return inc;
}

/** Asigna responsable */
export async function asignarResponsable(id, dip, nombre, actor = {}) {
  const inc = await getIncidencia(id);
  if (!inc) throw new Error('Incidencia no encontrada');
  inc.responsable_dip = dip;
  inc.responsable_nombre = nombre;
  inc.estado = inc.estado === 'abierta' ? 'en_revision' : inc.estado;
  inc.historial = [...(inc.historial || []), { estado: inc.estado, fecha: new Date().toISOString(), usuario: actor.nombre || 'sistema', nota: `Responsable asignado: ${nombre || dip}` }];
  inc.updated_at = new Date().toISOString();
  memIncidencias.set(id, inc);
  await upsertDB(inc);
  return inc;
}

/** Estado del módulo */
export async function estadoIncidencias() {
  const todas = await listarIncidencias();
  return {
    total: todas.length,
    abiertas: todas.filter(i => ['abierta', 'en_revision', 'en_resolucion'].includes(i.estado)).length,
    resueltas: todas.filter(i => i.estado === 'resuelta').length,
    cerradas: todas.filter(i => i.estado === 'cerrada').length,
    criticas: todas.filter(i => i.gravedad === 'critica' && !['resuelta', 'cerrada'].includes(i.estado)).length,
    porEstado: Object.fromEntries(ESTADOS_INC.map(e => [e, todas.filter(i => i.estado === e).length])),
  };
}

export default {
  ESTADOS_INC, ORIGENES_INC, listarIncidencias, getIncidencia,
  crearIncidencia, cambiarEstadoIncidencia, asignarResponsable, estadoIncidencias,
};
