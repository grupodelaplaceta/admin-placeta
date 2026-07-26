-- Migración: Crear tablas para la Red de Servicios de La Placeta (RSP)
-- Ejecutar en el SQL Editor de Supabase Dashboard

-- ============================================================
-- TABLA: rsp_conexiones
-- Registro de todas las conexiones a la RSP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rsp_conexiones (
  id TEXT PRIMARY KEY,
  entidad TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('consulta', 'modificacion')),
  endpoint TEXT NOT NULL DEFAULT '',
  usuario TEXT DEFAULT 'sistema',
  dip TEXT DEFAULT '',
  tarifa NUMERIC(12, 6) NOT NULL DEFAULT 0,
  iva NUMERIC(12, 6) NOT NULL DEFAULT 0,
  total NUMERIC(12, 6) NOT NULL DEFAULT 0,
  detalle TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsp_conexiones_entidad ON public.rsp_conexiones(entidad);
CREATE INDEX IF NOT EXISTS idx_rsp_conexiones_tipo ON public.rsp_conexiones(tipo);
CREATE INDEX IF NOT EXISTS idx_rsp_conexiones_fecha ON public.rsp_conexiones(created_at DESC);

-- ============================================================
-- TABLA: rsp_facturas
-- Facturas emitidas por uso de la RSP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rsp_facturas (
  id TEXT PRIMARY KEY,
  entidad TEXT NOT NULL,
  periodo_inicio TIMESTAMPTZ,
  periodo_fin TIMESTAMPTZ,
  emitida TIMESTAMPTZ DEFAULT NOW(),
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagada')),
  pagada_en TIMESTAMPTZ,
  num_conexiones INTEGER DEFAULT 0,
  detalle JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsp_facturas_entidad ON public.rsp_facturas(entidad);
CREATE INDEX IF NOT EXISTS idx_rsp_facturas_estado ON public.rsp_facturas(estado);

-- ============================================================
-- TABLA: rsp_fondos_historial
-- Historial de transacciones financieras de la RSP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rsp_fondos_historial (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  concepto TEXT NOT NULL DEFAULT '',
  importe NUMERIC(14, 4) NOT NULL,
  saldo NUMERIC(14, 4) NOT NULL,
  referencia_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsp_fondos_fecha ON public.rsp_fondos_historial(created_at DESC);

-- ============================================================
-- TABLA: rsp_estado
-- Estado actual de la RSP (una fila, upsert)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rsp_estado (
  id TEXT PRIMARY KEY DEFAULT 'rsp-main',
  saldo NUMERIC(14, 4) NOT NULL DEFAULT 18309.83,
  sancion_pagada BOOLEAN DEFAULT FALSE,
  sancion_pendiente NUMERIC(14, 4) DEFAULT 2461.77,
  fondos_iniciales NUMERIC(14, 4) DEFAULT 18309.83,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar estado inicial
INSERT INTO public.rsp_estado (id, saldo, sancion_pagada, sancion_pendiente, fondos_iniciales)
VALUES ('rsp-main', 18309.83, FALSE, 2461.77, 18309.83)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS: Permitir acceso con service_role
-- ============================================================
ALTER TABLE public.rsp_conexiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsp_facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsp_fondos_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsp_estado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RSP - acceso total service_role" ON public.rsp_conexiones USING (true) WITH CHECK (true);
CREATE POLICY "RSP - acceso total service_role" ON public.rsp_facturas USING (true) WITH CHECK (true);
CREATE POLICY "RSP - acceso total service_role" ON public.rsp_fondos_historial USING (true) WITH CHECK (true);
CREATE POLICY "RSP - acceso total service_role" ON public.rsp_estado USING (true) WITH CHECK (true);

-- ============================================================
-- TABLA: permisos_administracion (ya existe)
-- Añadir tipos RSP si no existen
-- ============================================================
-- Los roles rsp_admin y rsp_operador se crean desde la app
-- Ejemplo de inserción manual:
-- INSERT INTO public.permisos_administracion (dip, tipo, activo) VALUES ('23749931M', 'rsp_admin', true);
