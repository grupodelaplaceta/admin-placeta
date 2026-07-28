CREATE TABLE IF NOT EXISTS rsp_reclamaciones (
  id TEXT PRIMARY KEY,
  ciudadano TEXT,
  asunto TEXT NOT NULL,
  descripcion TEXT,
  prioridad TEXT DEFAULT 'normal',
  estado TEXT DEFAULT 'abierta',
  fecha TEXT,
  asignado_a TEXT,
  respuestas JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reclamaciones_estado ON rsp_reclamaciones(estado);
