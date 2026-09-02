-- ═══════════════════════════════════════════════════════════════════════
-- rsp_facturacion — Facturación central (RSP + Banco)
-- ────────────────────────────────────────────────────────────────────────
-- Guarda el ciclo mensual de facturación de las empresas: recibos de
-- Tributos (IRM+IGF) y facturas de venta/servicio, con su estado de cobro
-- (emitida / parcial / pagada / vencida / pendiente_cargo / cobrada /
-- impagada / anulada / sin_cuota) y la trazabilidad del cobro.
--
-- La capa de datos del BFF (server/db.js → coleccion('rsp_facturacion'))
-- convierte camelCase ↔ snake_case automáticamente; los JSONB se escriben
-- tal cual. Ejecutar en Supabase SQL Editor (o en el esquema que use el
-- proyecto rsp-web).
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.rsp_facturacion (
  id              text primary key,             -- RCB-<mes>-<seq> / FAC-...
  documento       text not null default 'recibo',-- 'recibo' | 'factura'
  tipo            text not null default 'tributos', -- 'tributos' | 'venta' | 'servicio'
  eip             text not null,                -- empresa emisora
  nombre          text,
  mes             text not null,                -- 'YYYY-MM'
  concepto        text,
  cliente         text,                         -- cuenta/DIP cliente (facturas)
  importe         numeric not null default 0,   -- total (recibo) o bruto (factura)
  base            numeric not null default 0,   -- base imponible
  iva             numeric not null default 0,   -- cuota IVA (CNIC-IVA)
  irm             numeric not null default 0,
  igf             numeric not null default 0,
  transaccion_id  text,
  cuenta_debito   jsonb,                        -- { id, saldo } cuenta BLP
  pagos           jsonb not null default '[]'::jsonb,
  cobro           jsonb,                        -- { fecha, transaccionId, importe, via }
  aviso           jsonb,                        -- { fecha, motivo, ... }
  estado          text not null default 'emitida',
  estado_fiscal   text,                         -- al_dia | pendiente | inhibido
  vencimiento     text,                         -- 'YYYY-MM-DD' fin de mes
  iva_exento      boolean not null default false,
  fecha           text,                         -- fecha del movimiento (facturas)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índices de consulta habituales del panel (ciclo por mes / empresa / estado)
create index if not exists rsp_facturacion_mes_idx        on public.rsp_facturacion (mes);
create index if not exists rsp_facturacion_documento_idx  on public.rsp_facturacion (documento);
create index if not exists rsp_facturacion_eip_idx        on public.rsp_facturacion (eip);
create index if not exists rsp_facturacion_estado_idx     on public.rsp_facturacion (estado);
create index if not exists rsp_facturacion_vencimiento_idx on public.rsp_facturacion (vencimiento);
