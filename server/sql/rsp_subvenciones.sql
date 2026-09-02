-- ═══════════════════════════════════════════════════════════════════════
-- rsp_subvenciones — Subvenciones (RSP) con persistencia del detalle
-- ────────────────────────────────────────────────────────────────────────
-- Tabla resumen de subvenciones concedidas (empresa EIP emisora →
-- beneficiario EIP o DIP) más columna `detalle` (JSONB) que guarda el
-- detalle operativo: documentosRequeridos, gastos (con categoría
-- factura/iva/tributos/irm_igf/operacion/otro), justificaciones y
-- reversiones (devolución a la EIP emisora).
--
-- Ejecutar en Supabase SQL Editor (esquema del proyecto rsp-web).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.rsp_subvenciones (
  id              text primary key,             -- SUB-<ts>
  emisor_eip      text not null,                -- EIP que concede la subvención
  emisor_nombre   text,
  receptor_eip    text not null,                -- EIP (empresa) o DIP (particular)
  receptor_nombre text,
  importe         numeric not null default 0,
  importe_restante numeric not null default 0,
  concepto        text,
  estado          text not null default 'concedida', -- concedida | justificada | cerrada
  fecha_concesion text,
  publicada       boolean not null default false,
  publicada_en    text,
  bop_url         text,
  -- Detalle operativo completo (JSONB, camelCase): documentosRequeridos,
  -- gastos[], justificaciones[], reversiones[], categoriasCubiertas[],
  -- tiposAptos[], excluirTipos[], baremos[].
  detalle         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Compatibilidad con una tabla preexistente sin detalle
ALTER TABLE public.rsp_subvenciones ADD COLUMN IF NOT EXISTS detalle jsonb not null default '{}'::jsonb;
ALTER TABLE public.rsp_subvenciones ADD COLUMN IF NOT EXISTS publicada boolean not null default false;
ALTER TABLE public.rsp_subvenciones ADD COLUMN IF NOT EXISTS publicada_en text;
ALTER TABLE public.rsp_subvenciones ADD COLUMN IF NOT EXISTS bop_url text;

create index if not exists rsp_subvenciones_emisor_idx   on public.rsp_subvenciones (emisor_eip);
create index if not exists rsp_subvenciones_receptor_idx on public.rsp_subvenciones (receptor_eip);
create index if not exists rsp_subvenciones_estado_idx   on public.rsp_subvenciones (estado);
