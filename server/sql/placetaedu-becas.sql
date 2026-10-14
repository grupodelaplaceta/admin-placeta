-- Valoraciones del baremo propio del ecosistema de La Placeta.
-- No guarda renta fiscal ni baremos de terceros: RSP conserva la valoración
-- que la Junta haya registrado y su versión normativa interna.
CREATE TABLE IF NOT EXISTS public.rsp_edu_beca_valoraciones (
  id text primary key,
  dip text not null,
  indicadores jsonb not null default '{}'::jsonb,
  detalle jsonb not null default '{}'::jsonb,
  inb integer not null default 0,
  nivel text not null default 'Sin beca',
  porcentaje_reconocido integer not null default 0,
  baremo_version text not null default 'ecosistema-1',
  fuente text not null default 'RSP / Junta',
  notas text not null default '',
  actualizado_en timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS rsp_edu_beca_valoraciones_dip_idx
  ON public.rsp_edu_beca_valoraciones (dip, actualizado_en desc);