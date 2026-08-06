-- Migración: rsp_subvenciones (Sistema de Subvenciones entre Empresas)
-- Ejecutar en Supabase SQL Editor (https://supabase.com/dashboard > SQL Editor)
-- Relacionado: src/routes/subvenciones.js + src/views/subvenciones/panel.ejs

CREATE TABLE IF NOT EXISTS rsp_subvenciones (
  id TEXT PRIMARY KEY,
  emisor_eip TEXT,
  emisor_nombre TEXT,
  receptor_eip TEXT,
  receptor_nombre TEXT,
  importe NUMERIC DEFAULT 0,
  importe_restante NUMERIC DEFAULT 0,
  concepto TEXT,
  estado TEXT DEFAULT 'concedida',
  concedida_por TEXT,
  fecha_concesion TEXT,
  fecha_limite TEXT,
  fecha_cierre TEXT,
  excluir_tipos JSONB DEFAULT '[]',
  justificaciones JSONB DEFAULT '[]',
  pdf_concesion TEXT,
  pdf_cierre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subvenciones_emisor ON rsp_subvenciones(emisor_eip);
CREATE INDEX IF NOT EXISTS idx_subvenciones_receptor ON rsp_subvenciones(receptor_eip);
CREATE INDEX IF NOT EXISTS idx_subvenciones_estado ON rsp_subvenciones(estado);
