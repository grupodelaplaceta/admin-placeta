-- ═══════════════════════════════════════════════════════════════════════
-- PlacetaEDU en RSP · modelo de datos (Supabase / Postgres)
-- Ejecutar UNA VEZ en el SQL Editor del proyecto compartido
-- (https://htikrqaywapshlkdonvs.supabase.co) — idempotente.
--
--   rsp_edu_cursos        → catálogo de cursos/convocatorias (gestionado en RSP)
--   rsp_edu_inscripciones → inscripciones/expedientes (incluye Placeta Joven)
-- ═══════════════════════════════════════════════════════════════════════

-- ── Catálogo de cursos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rsp_edu_cursos (
  id                bigint PRIMARY KEY,            -- id numérico (compatible con la web de EDU)
  titulo            text NOT NULL DEFAULT '',
  emoji             text DEFAULT '💻',
  descripcion       text DEFAULT '',
  duracion          text DEFAULT '',
  nivel             text DEFAULT 'Principiante',
  institucion       text DEFAULT 'La Placeta EDU',
  plazas            integer DEFAULT 0,
  inscritos         integer DEFAULT 0,
  oculto            boolean DEFAULT false,
  categoria         text DEFAULT 'tech',
  categoria_label   text DEFAULT 'Tecnología',
  proveedor         text DEFAULT 'La Placeta EDU',
  convocatoria      text DEFAULT '',               -- p. ej. BPEDU-2026-01
  inicio_matricula  text,                          -- enrollStart (YYYY-MM-DD)
  fin_matricula     text,                          -- enrollEnd
  inicio_curso      text,
  fin_curso         text,
  dias_disponibles  jsonb DEFAULT '[]'::jsonb,
  objetivos         jsonb DEFAULT '[]'::jsonb,     -- learningPoints
  requisitos        jsonb DEFAULT '[]'::jsonb,
  descripcion_larga text DEFAULT '',
  url_syllabus      text DEFAULT '',
  url_badge         text DEFAULT '',
  activo            boolean DEFAULT true,
  orden             integer DEFAULT 99,
  creado_en         timestamptz DEFAULT now(),
  actualizado_en    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rsp_edu_cursos_activo_idx ON public.rsp_edu_cursos (activo);
CREATE INDEX IF NOT EXISTS rsp_edu_cursos_convocatoria_idx ON public.rsp_edu_cursos (convocatoria);

-- ── Inscripciones / expedientes de alumnos ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.rsp_edu_inscripciones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text UNIQUE NOT NULL,
  nombre                text NOT NULL DEFAULT '',
  dni                   text NOT NULL DEFAULT '',
  email                 text NOT NULL DEFAULT '',
  curso_id              bigint,
  curso_titulo          text DEFAULT '',
  convocatoria          text DEFAULT '',
  franja                text DEFAULT '',
  franja_label          text DEFAULT '',
  criterios             jsonb DEFAULT '[]'::jsonb,   -- ids de criterios de baremo
  ficheros              jsonb DEFAULT '[]'::jsonb,   -- [{criteria,name}]
  puntos                integer DEFAULT 0,
  placeta_joven         boolean DEFAULT false,        -- beneficio +20 desde Placeta Joven
  procedencia           text DEFAULT 'web',           -- 'web' | 'placeta-joven'
  estado                text DEFAULT 'pendiente',     -- pendiente|en_curso|graduado|suspendido|rechazado
  historial_estado      jsonb DEFAULT '[]'::jsonb,
  penalizaciones        jsonb DEFAULT '[]'::jsonb,
  fecha                 text DEFAULT '',              -- YYYY-MM-DD (ordenable)
  validado_en           text,
  url_certificado       text,
  cuenta_asignada       text,
  proveedor_cuenta      text,
  licencia_asignada     text,
  password_temporal     text,
  inicio_beca           text,
  fin_beca              text,
  resultado             text DEFAULT 'en_curso',
  usuario_reporto_fin   boolean DEFAULT false,
  creado_en             timestamptz DEFAULT now(),
  actualizado_en        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rsp_edu_insc_curso_idx ON public.rsp_edu_inscripciones (curso_id);
CREATE INDEX IF NOT EXISTS rsp_edu_insc_estado_idx ON public.rsp_edu_inscripciones (estado);
CREATE INDEX IF NOT EXISTS rsp_edu_insc_placeta_idx ON public.rsp_edu_inscripciones (placeta_joven);

-- Nota RLS: RSP accede con la service key. Si más adelante se abre lectura
-- pública directa, crear políticas con anon en rsp_edu_cursos (solo activos).
