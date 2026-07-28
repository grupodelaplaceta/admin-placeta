CREATE TABLE IF NOT EXISTS rsp_empresas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  eip TEXT,
  dip TEXT,
  representantes JSONB DEFAULT '[]',
  activa BOOLEAN DEFAULT true,
  creada TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_empresas_dip ON rsp_empresas(dip);
