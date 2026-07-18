import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://htikrqaywapshlkdonvs.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0aWtycWF5d2Fwc2hsa2RvbnZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjg0MTQ2NywiZXhwIjoyMDk4NDE3NDY3fQ.wiL-rKidW9XawEISg56mOLZEFCfq4UMm1ufil5BdaG0';

function isValidKey(key) {
  if (!key) return false;
  if (typeof key !== 'string') return false;
  if (key.includes('•') || key.includes('…') || key.includes('···')) return false;
  if (!key.includes('.') || key.length < 20) return false;
  return true;
}

// Intentar con env var primero, fallback al key hardcodeado
function resolveKey() {
  const envKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (isValidKey(envKey)) return envKey;
  if (isValidKey(FALLBACK_KEY)) return FALLBACK_KEY;
  return null;
}

const supabaseKey = resolveKey();
const supabase = supabaseKey ? createClient(SUPABASE_URL, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
}) : null;

if (!supabase) {
  console.warn('[Supabase] No se pudo inicializar: clave inválida o ausente');
}

export { supabase };

export async function testConnection() {
  if (!supabase) {
    console.log('  ⚠️  Supabase: No configurado');
    return false;
  }
  try {
    const { error } = await supabase.from('solicitantes').select('id').limit(1);
    if (error) throw error;
    console.log('  ✅ Supabase: Conectado');
    return true;
  } catch (err) {
    console.log('  ⚠️  Supabase: No disponible -', err.message.substring(0, 60));
    return false;
  }
}
