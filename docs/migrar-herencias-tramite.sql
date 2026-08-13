-- VINCULO HERENCIA <-> TRAMITE (motor de tramites)
-- Toda herencia sigue el flujo estandar de tramite; estas columnas
-- guardan el vinculo bidireccional. Idempotente.
ALTER TABLE rsp_herencias ADD COLUMN IF NOT EXISTS tramite_id TEXT;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS herencia_id TEXT;
CREATE INDEX IF NOT EXISTS idx_rsp_herencias_tramite ON rsp_herencias(tramite_id);
CREATE INDEX IF NOT EXISTS idx_rsp_tramites_herencia ON rsp_tramites(herencia_id);

-- COLUMNAS FALTANTES DEL MOTOR DE TRAMITES
-- Sin ellas los trámites NO persistían en Supabase (solo memoria), porque el
-- upsert fallaba en silencio. Incluye firma múltiple, SLA/silencio y subsanación.
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS firmantes jsonb;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS silencio text;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS plazos jsonb;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS requisitos_pendientes jsonb;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS firmaDocId text;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS firmaEnviada boolean DEFAULT false;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS firmaCsv text;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS firmaHash text;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS firmas_completas integer DEFAULT 0;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS prorrogado integer DEFAULT 0;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS vencido boolean DEFAULT false;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS plazo_desde text;
ALTER TABLE rsp_tramites ADD COLUMN IF NOT EXISTS servicio text;
