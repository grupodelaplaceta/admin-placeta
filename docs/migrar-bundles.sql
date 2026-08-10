-- ═══════════════════════════════════════════════════════════════════════
-- MIGRACIÓN — TABLAS DE BUNDLES (Placeta Junior)
--
-- EJECUTAR EN: Supabase Dashboard → SQL Editor (New query) → pegar → Run
--
-- Es idempotente (CREATE TABLE IF NOT EXISTS), se puede re-ejecutar.
-- Crea: bundles, bundle_items, user_bundles, user_activities
-- ═══════════════════════════════════════════════════════════════════════

-- ── BUNDLES (productos que agrupan actividades) ──────────────────────
CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio INTEGER DEFAULT 0,          -- en Placetas (moneda)
  moneda TEXT DEFAULT 'Pz',
  imagen_url TEXT,
  activo BOOLEAN DEFAULT true,
  fecha_inicio TEXT,
  fecha_fin TEXT,
  created_at TEXT DEFAULT (now()::text),
  updated_at TEXT DEFAULT (now()::text)
);

-- Actividades que componen cada Bundle
CREATE TABLE IF NOT EXISTS bundle_items (
  id BIGSERIAL PRIMARY KEY,
  bundle_id TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  actividad_id TEXT NOT NULL REFERENCES junior_actividades(id) ON DELETE CASCADE,
  orden INTEGER DEFAULT 0,
  UNIQUE (bundle_id, actividad_id)
);
CREATE INDEX IF NOT EXISTS idx_bundle_items_bundle ON bundle_items(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_actividad ON bundle_items(actividad_id);

-- Bundles adquiridos por un junior (origen: bundle / early_access / admin / promocion)
CREATE TABLE IF NOT EXISTS user_bundles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES junior_menores(id) ON DELETE CASCADE,
  bundle_id TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
  adquirido_at TEXT DEFAULT (now()::text),
  precio_pagado INTEGER DEFAULT 0,
  moneda TEXT DEFAULT 'Pz',
  origen TEXT DEFAULT 'bundle',      -- bundle | early_access | admin | promocion
  UNIQUE (user_id, bundle_id)
);
CREATE INDEX IF NOT EXISTS idx_user_bundles_user ON user_bundles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bundles_bundle ON user_bundles(bundle_id);

-- Desbloqueos individuales de actividades (origen: individual | bundle | gratuito | admin | promocion)
CREATE TABLE IF NOT EXISTS user_activities (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES junior_menores(id) ON DELETE CASCADE,
  actividad_id TEXT NOT NULL REFERENCES junior_actividades(id) ON DELETE CASCADE,
  desbloqueado_at TEXT DEFAULT (now()::text),
  origen TEXT DEFAULT 'individual',  -- individual | bundle | gratuito | admin | promocion
  UNIQUE (user_id, actividad_id)
);
CREATE INDEX IF NOT EXISTS idx_user_activities_user ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_actividad ON user_activities(actividad_id);

-- ── Verificación ──────────────────────────────────────────────────────
SELECT 'bundles' AS tabla, count(*) AS filas FROM bundles
UNION ALL SELECT 'bundle_items', count(*) FROM bundle_items
UNION ALL SELECT 'user_bundles', count(*) FROM user_bundles
UNION ALL SELECT 'user_activities', count(*) FROM user_activities;
