create table if not exists public.rsp_junior_docentes_feedback (
  id uuid primary key default gen_random_uuid(),
  actividad text not null,
  valoracion text not null,
  comentario text not null default '',
  contacto text,
  origen text not null default 'web',
  creado_en timestamptz not null default now()
);
create index if not exists rsp_junior_docentes_feedback_fecha_idx
  on public.rsp_junior_docentes_feedback (creado_en desc);
