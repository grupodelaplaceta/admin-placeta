-- Migración: Crear tablas para persistencia de votaciones
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS rsp_votaciones (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  categoria TEXT DEFAULT 'General',
  grupo TEXT DEFAULT 'Publico_General',
  quorum INTEGER DEFAULT 50,
  a_favor INTEGER DEFAULT 0,
  en_contra INTEGER DEFAULT 0,
  abstenciones INTEGER DEFAULT 0,
  total_votos INTEGER DEFAULT 0,
  total_emitidos INTEGER DEFAULT 0,
  estado TEXT DEFAULT 'Activa',
  resultado TEXT,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
  fecha_limite TIMESTAMPTZ,
  reunion_id TEXT,
  requiere_quorum BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsp_votaciones_estado ON rsp_votaciones(estado);
CREATE INDEX IF NOT EXISTS idx_rsp_votaciones_categoria ON rsp_votaciones(categoria);

CREATE TABLE IF NOT EXISTS rsp_registro_votos (
  id TEXT PRIMARY KEY,
  votacion_id TEXT NOT NULL REFERENCES rsp_votaciones(id),
  dip TEXT NOT NULL,
  nombre TEXT DEFAULT '',
  categoria TEXT DEFAULT 'General',
  voto TEXT NOT NULL,
  hash TEXT NOT NULL,
  oficial BOOLEAN DEFAULT true,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registro_votos_votacion ON rsp_registro_votos(votacion_id);
CREATE INDEX IF NOT EXISTS idx_registro_votos_dip ON rsp_registro_votos(dip);
