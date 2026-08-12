/**
 * APLICAR MIGRACIONES SUPABASE (Postgres directo)
 * ─────────────────────────────────────────────────────────────
 * Permite ejecutar las migraciones SQL (docs/*.sql) contra la BD
 * de Supabase SIN depender del SQL editor ni del RPC exec_sql.
 *
 * Requiere en .env UNA de estas dos opciones:
 *   1. SUPABASE_DB_CONNECTION=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres
 *      (Dashboard → Project Settings → Database → Connection string, con la contraseña de la BD)
 *   2. SUPABASE_DB_PASSWORD=<contraseña de la BD>  (se construye la URL con SUPABASE_URL)
 *
 * Uso:
 *   node scripts/aplicar-migraciones.mjs                     → aplica docs/migrar-rsp-core.sql
 *   node scripts/aplicar-migraciones.mjs docs/migrar-otra.sql → aplica otro archivo
 *
 * Es idempotente (todas las tablas usan IF NOT EXISTS).
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function construirUrl() {
  if (process.env.SUPABASE_DB_CONNECTION) return process.env.SUPABASE_DB_CONNECTION;
  const pw = process.env.SUPABASE_DB_PASSWORD;
  if (!pw) return null;
  const url = process.env.SUPABASE_URL || '';
  const ref = url.replace('https://', '').split('.')[0];
  if (!ref) return null;
  // Host del pooler (session) genérico
  return `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
}

async function main() {
  const conn = construirUrl();
  if (!conn) {
    console.error('❌ No hay credenciales de BD. Añade SUPABASE_DB_CONNECTION o SUPABASE_DB_PASSWORD al .env');
    console.error('   (Dashboard → Project Settings → Database → Connection string)');
    process.exit(1);
  }

  const archivo = process.argv[2] || 'docs/migrar-rsp-core.sql';
  const ruta = path.join(__dirname, '..', archivo);
  if (!fs.existsSync(ruta)) { console.error('❌ No existe: ' + ruta); process.exit(1); }

  const sql = fs.readFileSync(ruta, 'utf8');
  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('🔌 Conectado a Postgres (Supabase).');
    console.log('▶ Aplicando: ' + archivo);
    const t0 = Date.now();
    await client.query(sql);
    console.log(`✅ Migraciones aplicadas en ${Date.now() - t0} ms`);

    // Listar tablas rsp_* existentes
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'rsp_%' ORDER BY tablename`
    );
    console.log('\n📋 Tablas rsp_* en Supabase:');
    rows.forEach(r => console.log('   - ' + r.tablename));
  } catch (e) {
    console.error('❌ Error aplicando migración:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
