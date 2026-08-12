/**
 * NOTIFICACIONES UNIFICADAS — FASE 17
 *
 * Centro de notificaciones: 🔴 requiere acción, 🟡 pendiente, 🔵 información, 🟢 completado.
 * Recoge eventos de todos los servicios del ecosistema.
 * Persistencia Supabase (rsp_notificaciones) + memoria.
 */

import { supabase } from './supabase.js';
import { generarIdentificador } from './identificadores.js';

const TABLA = 'rsp_notificaciones';
const memNotificaciones = [];

export const NIVELES_NOTIF = {
  accion: '🔴',      // requiere acción
  pendiente: '🟡',   // pendiente
  info: '🔵',        // información
  completado: '🟢',  // completado
};

async function listarDB(filtros = {}) {
  if (!supabase) return null;
  try {
    let q = supabase.from(TABLA).select('*').order('created_at', { ascending: false }).limit(300);
    if (filtros.nivel) q = q.eq('nivel', filtros.nivel);
    if (filtros.destinatario_dip) q = q.eq('destinatario_dip', filtros.destinatario_dip);
    if (filtros.leida !== undefined && filtros.leida !== '') q = q.eq('leida', filtros.leida === 'true' || filtros.leida === true);
    if (filtros.servicio) q = q.eq('servicio', filtros.servicio);
    const { data } = await q;
    return data || [];
  } catch { return null; }
}

async function upsertDB(n) {
  if (!supabase) return false;
  try { await supabase.from(TABLA).upsert(n, { onConflict: 'id' }); return true; }
  catch { return false; }
}

/** Crea una notificación */
export async function crearNotificacion({ nivel = 'info', titulo, mensaje = '', servicio = 'rsp', destinatario_dip = null, destinatario_eip = null, objeto_tipo = null, objeto_id = null, enlace = null }) {
  if (!titulo) throw new Error('El título de la notificación es obligatorio');
  const id = await generarIdentificador('NOTIF');
  const n = {
    id,
    nivel,
    titulo,
    mensaje,
    servicio,
    destinatario_dip,
    destinatario_eip,
    objeto_tipo,
    objeto_id,
    enlace,
    leida: false,
    fecha: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  memNotificaciones.unshift(n);
  upsertDB(n).catch(() => {});
  return n;
}

/** Lista notificaciones */
export async function listarNotificaciones(filtros = {}) {
  const db = await listarDB(filtros);
  if (db && db.length > 0) return db;
  let lista = [...memNotificaciones];
  if (filtros.nivel) lista = lista.filter(n => n.nivel === filtros.nivel);
  if (filtros.destinatario_dip) lista = lista.filter(n => n.destinatario_dip === filtros.destinatario_dip);
  if (filtros.servicio) lista = lista.filter(n => n.servicio === filtros.servicio);
  if (filtros.leida !== undefined && filtros.leida !== '') {
    const leida = filtros.leida === 'true' || filtros.leida === true;
    lista = lista.filter(n => n.leida === leida);
  }
  return lista;
}

/** Marca leída / no leída */
export async function marcarLeida(id, leida = true) {
  if (supabase) {
    try { await supabase.from(TABLA).update({ leida, updated_at: new Date().toISOString() }).eq('id', id); return; }
    catch { /* memoria */ }
  }
  const n = memNotificaciones.find(x => x.id === id);
  if (n) n.leida = leida;
}

/** Marca todas leídas de un destinatario */
export async function marcarTodasLeidas(destinatario_dip) {
  if (supabase) {
    try { await supabase.from(TABLA).update({ leida: true, updated_at: new Date().toISOString() }).eq('destinatario_dip', destinatario_dip); return; }
    catch { /* memoria */ }
  }
  memNotificaciones.forEach(n => { if (n.destinatario_dip === destinatario_dip) n.leida = true; });
}

/** Estado del centro de notificaciones */
export async function estadoNotificaciones(destinatario_dip = null) {
  const todas = await listarNotificaciones(destinatario_dip ? { destinatario_dip } : {});
  const abiertas = todas.filter(n => n.nivel === 'accion').length;
  const pendientes = todas.filter(n => n.nivel === 'pendiente').length;
  return {
    total: todas.length,
    noLeidas: todas.filter(n => !n.leida).length,
    requiereAccion: abiertas,
    pendientes,
    porNivel: Object.fromEntries(Object.keys(NIVELES_NOTIF).map(k => [k, todas.filter(n => n.nivel === k).length])),
  };
}

export default {
  NIVELES_NOTIF, crearNotificacion, listarNotificaciones,
  marcarLeida, marcarTodasLeidas, estadoNotificaciones,
};
