-- Migración: Crear tabla rsp_conexiones para persistencia de RSP
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS rsp_conexiones (
  id TEXT PRIMARY KEY,
  entidad TEXT NOT NULL,
  tipo TEXT NOT NULL,
  endpoint TEXT NOT NULL DEFAULT '',
  usuario TEXT NOT NULL DEFAULT '',
  dip TEXT NOT NULL DEFAULT '',
  tarifa REAL NOT NULL DEFAULT 0,
  iva REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  detalle TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsp_conexiones_entidad ON rsp_conexiones(entidad);
CREATE INDEX IF NOT EXISTS idx_rsp_conexiones_tipo ON rsp_conexiones(tipo);
CREATE INDEX IF NOT EXISTS idx_rsp_conexiones_creado ON rsp_conexiones(created_at);
