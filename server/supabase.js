/* ── Cliente Supabase del BFF ────────────────────────────────────────────
   Persistencia REAL del panel: trámites, expedientes, auditoría,
   notificaciones, CNIC, operaciones, votaciones, juntas, encuestas,
   subvenciones y bonos viven en Supabase (Postgres).

   Configuración (server/.env o variables de Vercel):
     SUPABASE_URL          → https://<ref>.supabase.co
     SUPABASE_SERVICE_KEY  → service_role key (solo servidor, nunca pública)
   Sin SUPABASE_SERVICE_KEY el BFF degrada a memoria (sin persistencia).
   ──────────────────────────────────────────────────────────────────────── */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://htikrqaywapshlkdonvs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function claveValida(key) {
  if (!key || typeof key !== 'string') return false;
  if (key.length < 20 || !key.includes('.')) return false;
  if (/[•…]/.test(key)) return false;
  return true;
}

export const supabase = claveValida(SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

if (!supabase) {
  console.warn('[Supabase] No configurado (SUPABASE_SERVICE_KEY ausente). El BFF funciona en memoria sin persistencia.');
}

/** Comprueba la conexión real contra Supabase. */
export async function probarSupabase() {
  if (!supabase) return { ok: false, error: 'Sin configuración (SUPABASE_SERVICE_KEY)' };
  try {
    const { error } = await supabase.from('rsp_cnic').select('codigo').limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
