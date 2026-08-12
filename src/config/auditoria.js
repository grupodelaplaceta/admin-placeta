/**
 * AUDITORÍA CENTRAL — Audit Log del ecosistema (FASE 19)
 *
 * Cada acción registra: usuario, fecha, hora, IP/dispositivo, servicio,
 * acción, objeto, valor anterior, valor nuevo, motivo, autorización.
 *
 * Persistencia: Supabase (rsp_auditoria) con fallback a memoria + /tmp.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './supabase.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TABLA = 'rsp_auditoria';
const TMP_FILE = path.join(__dirname, '../../tmp-auditoria.json');

const memLog = [];
let seq = 0;

function nextId() {
  return `AUD-${new Date().getFullYear()}-${String(++seq).padStart(6, '0')}`;
}

function persistirTmp(entry) {
  try {
    let actual = [];
    if (fs.existsSync(TMP_FILE)) {
      actual = JSON.parse(fs.readFileSync(TMP_FILE, 'utf8'));
    }
    actual.push(entry);
    fs.writeFileSync(TMP_FILE, JSON.stringify(actual.slice(-500)), 'utf8');
  } catch { /* silencioso */ }
}

async function persistirDB(entry) {
  if (!supabase) return false;
  try {
    await supabase.from(TABLA).insert(entry);
    return true;
  } catch { return false; }
}

/** Registra una acción de auditoría */
export async function registrarAuditoria({
  usuario = {}, servicio = 'rsp', accion, objeto_tipo, objeto_id,
  valor_anterior = null, valor_nuevo = null, motivo = '', autorizacion = '',
  ip = '', dispositivo = '',
}) {
  const entry = {
    id: nextId(),
    usuario_dip: usuario.dip || '',
    usuario_nombre: usuario.nombre || '',
    fecha: new Date().toISOString(),
    ip,
    dispositivo: dispositivo || (ip ? 'web' : ''),
    servicio,
    accion,
    objeto_tipo,
    objeto_id,
    valor_anterior,
    valor_nuevo,
    motivo,
    autorizacion,
    created_at: new Date().toISOString(),
  };
  memLog.push(entry);
  persistirTmp(entry);
  persistirDB(entry).catch(() => {});
  return entry;
}

/** Lista registros de auditoría con filtros */
export async function listarAuditoria(filtros = {}) {
  if (supabase) {
    try {
      let q = supabase.from(TABLA).select('*').order('fecha', { ascending: false }).limit(500);
      if (filtros.servicio) q = q.eq('servicio', filtros.servicio);
      if (filtros.accion) q = q.eq('accion', filtros.accion);
      if (filtros.usuario_dip) q = q.eq('usuario_dip', filtros.usuario_dip);
      if (filtros.objeto_tipo) q = q.eq('objeto_tipo', filtros.objeto_tipo);
      if (filtros.objeto_id) q = q.eq('objeto_id', filtros.objeto_id);
      const { data } = await q;
      if (data && data.length > 0) return data;
    } catch { /* fallback memoria */ }
  }
  let lista = [...memLog].reverse();
  if (filtros.servicio) lista = lista.filter(e => e.servicio === filtros.servicio);
  if (filtros.accion) lista = lista.filter(e => e.accion === filtros.accion);
  if (filtros.usuario_dip) lista = lista.filter(e => e.usuario_dip === filtros.usuario_dip);
  return lista.slice(0, 500);
}

/** Estadísticas del audit log */
export async function estadisticasAuditoria() {
  const lista = await listarAuditoria();
  const porAccion = {};
  const porServicio = {};
  for (const e of lista) {
    porAccion[e.accion] = (porAccion[e.accion] || 0) + 1;
    porServicio[e.servicio] = (porServicio[e.servicio] || 0) + 1;
  }
  return { total: lista.length, porAccion, porServicio };
}

/** Último registro de un objeto concreto (para reconstruir histórico) */
export async function historialObjeto(objeto_tipo, objeto_id) {
  const lista = await listarAuditoria({ objeto_tipo, objeto_id });
  return lista;
}

export default {
  registrarAuditoria, listarAuditoria, estadisticasAuditoria, historialObjeto,
};
