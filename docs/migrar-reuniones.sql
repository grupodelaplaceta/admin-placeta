-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Reuniones + Actas → Supabase
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rsp_reuniones (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  fecha TEXT,
  hora TEXT,
  hora_fin TEXT,
  lugar TEXT,
  convocante TEXT,
  tipo_reunion TEXT DEFAULT 'Ordinaria',
  estado TEXT DEFAULT 'Planificada',
  orden_del_dia JSONB DEFAULT '[]',
  asistentes JSONB DEFAULT '[]',
  votaciones JSONB DEFAULT '[]',
  acta JSONB DEFAULT NULL,
  fecha_firma TEXT,
  hash_acta TEXT,
  firma_presidente TEXT,
  firma_secretario TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda por estado
CREATE INDEX IF NOT EXISTS idx_reuniones_estado ON rsp_reuniones(estado);
CREATE INDEX IF NOT EXISTS idx_reuniones_fecha ON rsp_reuniones(fecha);
