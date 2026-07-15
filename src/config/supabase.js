import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://htikrqaywapshlkdonvs.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0aWtycWF5d2Fwc2hsa2RvbnZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjg0MTQ2NywiZXhwIjoyMDk4NDE3NDY3fQ.wiL-rKidW9XawEISg56mOLZEFCfq4UMm1ufil5BdaG0';

function isValidKey(key) {
  if (!key) return false;
  if (key.includes('•') || key.includes('…') || key.includes('···')) return false;
  return true;
}

export const supabase = isValidKey(supabaseKey) ? createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
}) : null;

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
