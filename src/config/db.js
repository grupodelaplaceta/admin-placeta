/**
 * Funciones de acceso a datos compartidos vía Supabase y APIs del ecosistema
 */
import { supabase } from './supabase.js';

// ── Supabase Queries ──────────────────────────────────────────────────────

export async function sbFindSolicitanteByDip(dip) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('solicitantes').select('*').eq('dip', dip).maybeSingle();
    return data;
  } catch { return null; }
}

export async function sbFindSolicitanteByEmail(email) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('solicitantes').select('*').eq('email', email).maybeSingle();
    return data;
  } catch { return null; }
}

export async function sbListSolicitantes(filters = {}) {
  if (!supabase) return [];
  try {
    let query = supabase.from('solicitantes').select('*');
    if (filters.estado) query = query.eq('estado', filters.estado);
    if (filters.rol) query = query.eq('rol', filters.rol);
    if (filters.limit) query = query.limit(filters.limit);
    const { data } = await query;
    return data || [];
  } catch { return []; }
}

export async function sbFindJuniorByDip(dip) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('junior_menores').select('*').eq('dip', dip).maybeSingle();
    return data;
  } catch { return null; }
}

export async function sbFindCargosByDip(dip) {
  if (!supabase) return [];
  try {
    const { data } = await supabase.from('cargos_junta').select('*').eq('dip', dip).eq('activo', true);
    return data || [];
  } catch { return []; }
}

export async function sbFindPermisosByDip(dip) {
  if (!supabase) return [];
  try {
    const { data } = await supabase.from('permisos_administracion').select('*').eq('dip', dip).eq('activo', true);
    return data || [];
  } catch { return []; }
}

// ── API Banco ─────────────────────────────────────────────────────────────

const BANCO_API = (process.env.BANCO_API_URL || 'https://api.banco.laplaceta.org').replace(/\/+$/, '');
const CRM_KEY = process.env.CRM_READ_KEY || 'crm-gdlp-shared-key-2026';

export async function apiBancoGetState() {
  try {
    const r = await fetch(`${BANCO_API}/api/crm-state`, {
      method: 'GET',
      headers: { 'X-CRM-Key': CRM_KEY },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export async function apiBancoPost(action, data = {}) {
  try {
    const r = await fetch(`${BANCO_API}/api/crm-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CRM-Key': CRM_KEY },
      body: JSON.stringify({ action, ...data }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

// ── API PlacetaID ─────────────────────────────────────────────────────────

const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';

export async function apiPlacetaidRegistros() {
  try {
    const r = await fetch(`${PLACETAID_API}/admin/registros`, {
      headers: { 'X-API-Key': process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return [];
    return r.json();
  } catch { return []; }
}

export async function apiPlacetaidStats() {
  try {
    const r = await fetch(`${PLACETAID_API}/admin/stats`, {
      headers: { 'X-API-Key': process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

export async function apiPlacetaidDesbloquear(dip) {
  try {
    const r = await fetch(`${PLACETAID_API}/admin/desbloquear/${dip}`, {
      method: 'POST',
      headers: { 'X-API-Key': process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb' },
      signal: AbortSignal.timeout(10000)
    });
    return r.ok;
  } catch { return false; }
}

// ── DECLARACIONES TRIBUTARIAS (DB) ──────────────────────────────────────
// Almacenamiento en Supabase (tabla tributos_declaraciones)
// Fallback a memoria en serverless

const memDeclaraciones = new Map();

export async function sbListDeclaraciones(limit = 50) {
  if (!supabase) return [...memDeclaraciones.values()].sort((a,b) => (b.mes_periodo||'').localeCompare(a.mes_periodo||'')).slice(0, limit);
  try {
    const { data } = await supabase.from('tributos_declaraciones').select('*').order('created_at', { ascending: false }).limit(limit);
    return data || [];
  } catch { return [...memDeclaraciones.values()]; }
}

export async function sbGetDeclaracion(id) {
  if (!supabase) return memDeclaraciones.get(id) || null;
  try {
    const { data } = await supabase.from('tributos_declaraciones').select('*').eq('id', id).maybeSingle();
    return data;
  } catch { return memDeclaraciones.get(id) || null; }
}

export async function sbCreateDeclaracion(data) {
  const id = data.id || 'DEC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  const record = { id, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (!supabase) { memDeclaraciones.set(id, record); return record; }
  try {
    const { data: inserted } = await supabase.from('tributos_declaraciones').insert(record).select().maybeSingle();
    return inserted || record;
  } catch { memDeclaraciones.set(id, record); return record; }
}

export async function sbUpdateDeclaracion(id, data) {
  const update = { ...data, updated_at: new Date().toISOString() };
  if (!supabase) {
    const existing = memDeclaraciones.get(id);
    if (!existing) return null;
    const merged = { ...existing, ...update };
    memDeclaraciones.set(id, merged);
    return merged;
  }
  try {
    const { data: updated } = await supabase.from('tributos_declaraciones').update(update).eq('id', id).select().maybeSingle();
    return updated;
  } catch { const existing = memDeclaraciones.get(id); if (!existing) return null; const merged = { ...existing, ...update }; memDeclaraciones.set(id, merged); return merged; }
}

export async function sbDeleteDeclaracion(id) {
  if (!supabase) return memDeclaraciones.delete(id);
  try {
    await supabase.from('tributos_declaraciones').delete().eq('id', id);
    return true;
  } catch { return memDeclaraciones.delete(id); }
}

export async function sbListDeclaracionesPorMes(mesPeriodo) {
  if (!supabase) return [...memDeclaraciones.values()].filter(d => d.mes_periodo === mesPeriodo);
  try {
    const { data } = await supabase.from('tributos_declaraciones').select('*').eq('mes_periodo', mesPeriodo);
    return data || [];
  } catch { return [...memDeclaraciones.values()].filter(d => d.mes_periodo === mesPeriodo); }
}

// ── CONTRIBUYENTES TRIBUTARIOS ───────────────────────────────────────────
const memContribuyentes = new Map();

export async function sbGetContribuyente(placetaId) {
  if (!supabase) return memContribuyentes.get(placetaId) || null;
  try {
    const { data } = await supabase.from('tributos_contribuyentes').select('*').eq('placeta_id', placetaId).maybeSingle();
    return data;
  } catch { return memContribuyentes.get(placetaId) || null; }
}

export async function sbUpsertContribuyente(data) {
  const id = data.id || data.placeta_id;
  const record = { ...data, updated_at: new Date().toISOString() };
  if (!supabase) { memContribuyentes.set(id, record); return record; }
  try {
    const { data: upserted } = await supabase.from('tributos_contribuyentes').upsert(record).select().maybeSingle();
    return upserted || record;
  } catch { memContribuyentes.set(id, record); return record; }
}

// ── SALDOS DIARIOS (Reconciliación) ──────────────────────────────────────
const memSaldosDiarios = new Map();

export async function sbGetDailyBalances(placetaId, mesPeriodo) {
  const key = `${placetaId}:${mesPeriodo}`;
  if (!supabase) return memSaldosDiarios.get(key) || [];
  try {
    const { data } = await supabase.from('tributos_saldos_diarios').select('*').eq('placeta_id', placetaId).eq('mes_periodo', mesPeriodo).order('dia', { ascending: true });
    return data || [];
  } catch { return memSaldosDiarios.get(key) || []; }
}

export async function sbUpsertDailyBalance(placetaId, mesPeriodo, dia, saldo) {
  const key = `${placetaId}:${mesPeriodo}`;
  if (!supabase) {
    const arr = memSaldosDiarios.get(key) || [];
    const idx = arr.findIndex(d => d.dia === dia);
    if (idx >= 0) arr[idx] = { ...arr[idx], saldo };
    else arr.push({ placeta_id: placetaId, mes_periodo: mesPeriodo, dia, saldo });
    memSaldosDiarios.set(key, arr);
    return arr;
  }
  try {
    await supabase.from('tributos_saldos_diarios').upsert({ placeta_id: placetaId, mes_periodo: mesPeriodo, dia, saldo }, { onConflict: 'placeta_id,mes_periodo,dia' });
  } catch { /* ignore */ }
}

export async function sbClearDailyBalances(placetaId, mesPeriodo) {
  const key = `${placetaId}:${mesPeriodo}`;
  if (!supabase) { memSaldosDiarios.delete(key); return; }
  try {
    await supabase.from('tributos_saldos_diarios').delete().eq('placeta_id', placetaId).eq('mes_periodo', mesPeriodo);
  } catch { memSaldosDiarios.delete(key); }
}

// ── CONTROL DE RECAUDACIÓN ───────────────────────────────────────────────
const memControlRecaudacion = new Map();

export async function sbGetControlRecaudacion(mesPeriodo) {
  if (!supabase) return memControlRecaudacion.get(mesPeriodo) || null;
  try {
    const { data } = await supabase.from('tributos_control_recaudacion').select('*').eq('mes_periodo', mesPeriodo).maybeSingle();
    return data;
  } catch { return memControlRecaudacion.get(mesPeriodo) || null; }
}

export async function sbUpsertControlRecaudacion(mesPeriodo, inhibido) {
  if (!supabase) { memControlRecaudacion.set(mesPeriodo, { mes_periodo: mesPeriodo, inhibido }); return; }
  try {
    await supabase.from('tributos_control_recaudacion').upsert({ mes_periodo: mesPeriodo, inhibido });
  } catch { memControlRecaudacion.set(mesPeriodo, { mes_periodo: mesPeriodo, inhibido }); }
}
