-- Visitas anónimas de actividades de Placeta Junior (RSP).
-- Ejecutar en el proyecto Supabase de RSP.
create table if not exists public.rsp_junior_visitas_actividad (
  id uuid primary key default gen_random_uuid(),
  actividad_id text not null,
  origen text not null default 'web' check (origen in ('web', 'app')),
  visitado_en timestamptz not null default now()
);

create index if not exists rsp_junior_visitas_actividad_idx
  on public.rsp_junior_visitas_actividad (actividad_id, visitado_en desc);

create index if not exists rsp_junior_visitas_origen_idx
  on public.rsp_junior_visitas_actividad (origen, visitado_en desc);
