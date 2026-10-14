-- Marca los códigos creados para pruebas. Solo estos códigos pueden
-- eliminarse desde el panel RSP; los códigos reales se conservan y se
-- revocan para mantener trazabilidad.
alter table if exists junior_codigos
  add column if not exists demo boolean not null default false;

create index if not exists junior_codigos_demo_idx
  on junior_codigos(demo);
