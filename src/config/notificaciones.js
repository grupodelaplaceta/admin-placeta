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
  catch (e) {
    // Tabla no creada aún → auto-crearla y reintentar (como otros módulos RSP)
    if (e?.code === '42P01' || /could not find the table/i.test(e?.message || '')) {
      try {
        await supabase.rpc('exec_sql', { sql: `CREATE TABLE IF NOT EXISTS rsp_notificaciones (
          id TEXT PRIMARY KEY, nivel TEXT DEFAULT 'info', titulo TEXT NOT NULL,
          mensaje TEXT, servicio TEXT, destinatario_dip TEXT, destinatario_eip TEXT,
          objeto_tipo TEXT, objeto_id TEXT, enlace TEXT, leida BOOLEAN DEFAULT FALSE,
          canal TEXT DEFAULT 'email', acuse_recibido BOOLEAN DEFAULT FALSE,
          leida_en TEXT, acuse_en TEXT, fecha TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
        );` });
        await supabase.from(TABLA).upsert(n, { onConflict: 'id' });
        return true;
      } catch { /* memoria */ }
    }
    return false;
  }
}

/** Preferencia de canal del ciudadano (FASE 7.4): rsp_ciudadanos.canal_preferido */
async function preferenciaCanal(dip) {
  if (!dip || !supabase) return 'email';
  try {
    const { data } = await supabase.from('rsp_ciudadanos').select('canal_preferido').eq('dip', dip).maybeSingle();
    return data?.canal_preferido || 'email';
  } catch { return 'email'; }
}

/** Envío por email (FASE 7.2): si no hay proveedor configurado, fallback silencioso. */
async function enviarEmail({ to, asunto, cuerpo }) {
  const apiKey = process.env.EMAIL_API_KEY;
  if (!apiKey || !to) return false; // fallback silencioso: sin proveedor, no hace nada
  try {
    const provider = process.env.EMAIL_PROVIDER || 'resend';
    if (provider === 'resend') {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || 'notificaciones@laplaceta.org', to, subject: asunto, text: cuerpo }),
        signal: AbortSignal.timeout(8000)
      });
      return r.ok;
    }
    return false;
  } catch { return false; }
}

/** Crea una notificación (FASE 7: canal + acuse) */
export async function crearNotificacion({ nivel = 'info', titulo, mensaje = '', servicio = 'rsp', destinatario_dip = null, destinatario_eip = null, objeto_tipo = null, objeto_id = null, enlace = null, canal = null }) {
  if (!titulo) throw new Error('El título de la notificación es obligatorio');
  const id = await generarIdentificador('NOTIF');
  const canalFinal = canal || (destinatario_dip ? await preferenciaCanal(destinatario_dip) : 'email');
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
    canal: canalFinal,
    acuse_recibido: false,
    leida_en: null,
    acuse_en: null,
    fecha: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  memNotificaciones.unshift(n);
  upsertDB(n).catch(() => {});
  if (canalFinal === 'email' && destinatario_dip) {
    enviarEmail({ to: destinatario_dip, asunto: `[${servicio}] ${titulo}`, cuerpo: mensaje || titulo }).catch(() => {});
  }
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

/** Marca leída / no leída (FASE 7: deja leida_en) */
export async function marcarLeida(id, leida = true) {
  const ahora = new Date().toISOString();
  const patch = leida ? { leida, leida_en: ahora, updated_at: ahora } : { leida, updated_at: ahora };
  if (supabase) {
    try { await supabase.from(TABLA).update(patch).eq('id', id); return; }
    catch { /* memoria */ }
  }
  const n = memNotificaciones.find(x => x.id === id);
  if (n) { n.leida = leida; if (leida) n.leida_en = ahora; }
}

/** Registra acuse de recibo (FASE 7.3): el ciudadano confirma que la recibió.
 *  El acuse puede abrir/validar plazos del trámite asociado. */
export async function marcarAcuse(id) {
  const ahora = new Date().toISOString();
  if (supabase) {
    try {
      await supabase.from(TABLA).update({ acuse_recibido: true, acuse_en: ahora, updated_at: ahora }).eq('id', id);
      return;
    } catch { /* memoria */ }
  }
  const n = memNotificaciones.find(x => x.id === id);
  if (n) { n.acuse_recibido = true; n.acuse_en = ahora; }
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
  marcarLeida, marcarTodasLeidas, marcarAcuse, estadoNotificaciones,
};
