/**
 * AUTO-MIGRACIÓN — Sistema de Bundles de Placeta Junior
 *
 * Intenta crear las tablas de bundles si no existen. En producción Vercel
 * suele estar disponible la RPC exec_sql (creada por el administrador);
 * si no está disponible, se loguea la instrucción para ejecutar el script
 * docs/migrar-academia-junior.sql en el SQL editor de Supabase.
 */
import { supabase } from './supabase.js';

const SQL_BUNDLES = `
CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio INTEGER DEFAULT 0,
  moneda TEXT DEFAULT 'Pz',
  imagen_url TEXT,
  activo BOOLEAN DEFAULT true,
  fecha_inicio TEXT,
  fecha_fin TEXT,
  created_at TEXT DEFAULT (now()::text),
  updated_at TEXT DEFAULT (now()::text)
);
CREATE TABLE IF NOT EXISTS bundle_items (
  id BIGSERIAL PRIMARY KEY,
  bundle_id TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  actividad_id TEXT NOT NULL REFERENCES junior_actividades(id) ON DELETE CASCADE,
  orden INTEGER DEFAULT 0,
  UNIQUE (bundle_id, actividad_id)
);
CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_actividad ON bundle_items(actividad_id);
CREATE TABLE IF NOT EXISTS user_bundles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES junior_menores(id) ON DELETE CASCADE,
  bundle_id TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  adquirido_at TEXT DEFAULT (now()::text),
  precio_pagado INTEGER DEFAULT 0,
  moneda TEXT DEFAULT 'Pz',
  origen TEXT DEFAULT 'bundle',
  UNIQUE (user_id, bundle_id)
);
CREATE INDEX IF NOT EXISTS idx_user_bundles_user ON user_bundles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bundles_bundle ON user_bundles(bundle_id);
CREATE TABLE IF NOT EXISTS user_activities (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES junior_menores(id) ON DELETE CASCADE,
  actividad_id TEXT NOT NULL REFERENCES junior_actividades(id) ON DELETE CASCADE,
  desbloqueado_at TEXT DEFAULT (now()::text),
  origen TEXT DEFAULT 'individual',
  UNIQUE (user_id, actividad_id)
);
CREATE INDEX IF NOT EXISTS idx_user_activities_user ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_actividad ON user_activities(actividad_id);
`;

export async function initBundleTables() {
  if (!supabase) return false;
  try {
    // ¿Ya existen? comprobación rápida
    const { error: checkErr } = await supabase.from('bundles').select('id').limit(1);
    if (!checkErr) {
      console.log('[Bundles] ✅ Tablas de bundles presentes.');
      return true;
    }
    // Intentar crear vía exec_sql (si el admin la definió)
    const { error: rpcErr } = await supabase.rpc('exec_sql', { sql: SQL_BUNDLES });
    if (!rpcErr) {
      console.log('[Bundles] ✅ Tablas de bundles creadas vía exec_sql.');
      return true;
    }
    // Comprobar de nuevo (algunos entornos pueden crearlas en segundo plano)
    const { error: check2 } = await supabase.from('bundles').select('id').limit(1);
    if (!check2) return true;
    console.warn('[Bundles] ⚠️ No se pudieron crear las tablas automáticamente.');
    console.warn('[Bundles] Ejecuta docs/migrar-academia-junior.sql en el SQL editor de Supabase.');
    return false;
  } catch (e) {
    console.warn('[Bundles] ⚠️ Auto-migración fallida:', e.message);
    return false;
  }
}
