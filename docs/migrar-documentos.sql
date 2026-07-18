-- Migración: Crear tabla documentos para el sistema de documentación global
-- Ejecutar en el SQL Editor de Supabase Dashboard

CREATE TABLE IF NOT EXISTS public.documentos (
  id TEXT PRIMARY KEY,
  entidad TEXT NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT DEFAULT 'general',
  titulo TEXT,
  descripcion TEXT DEFAULT '',
  datos JSONB DEFAULT '{}',
  ref_id TEXT,
  ref_tipo TEXT,
  created_by TEXT DEFAULT 'sistema',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  estado TEXT DEFAULT 'borrador',
  firmado BOOLEAN DEFAULT FALSE,
  hash TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_documentos_entidad ON public.documentos(entidad);
CREATE INDEX IF NOT EXISTS idx_documentos_ref ON public.documentos(ref_id, ref_tipo);

-- También habilitar RLS y permitir acceso con service_role
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

-- Permitir todo con service_role (para admin-placeta)
CREATE POLICY "Servicio de documentacion - acceso total" ON public.documentos
  USING (true)
  WITH CHECK (true);
