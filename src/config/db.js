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
