-- ═══════════════════════════════════════════════════════════════════════
-- ACADEMIA PLACETA JUNIOR — Migración de tablas
-- Sistema completo: actividades, colaboradores, puntos, diplomas
-- Ejecutar en Supabase Dashboard (SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════

-- ── ACTIVIDADES EDUCATIVAS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS junior_actividades (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT,
  tipo TEXT,                          -- test, sopa_letras, relacionar_conceptos, etc.
  edad_recomendada TEXT DEFAULT '6-12',
  dificultad TEXT DEFAULT 'media',
  tiempo_estimado INTEGER DEFAULT 10,
  num_preguntas INTEGER DEFAULT 0,
  num_fases INTEGER DEFAULT 1,
  es_examen BOOLEAN DEFAULT false,    -- >10 preguntas = examen (spec §11)
  contenido JSONB DEFAULT '{}',
  autor_dip TEXT,
  autor_nombre TEXT,
  tipo_titular TEXT DEFAULT 'profesor', -- entidad_eip | profesor | interno
  eip TEXT,
  nombre_entidad TEXT,
  precio_licencia INTEGER,            -- IVA incluido (lo abona Capitalia)
  precio_intento INTEGER,
  recompensa INTEGER,                 -- Placetas por superar (spec §10)
  estado TEXT DEFAULT 'en_revision',  -- borrador | en_revision | aprobada | rechazada | modificaciones
  publica BOOLEAN DEFAULT false,
  portada_url TEXT,                   -- imagen de portada (web/carrusel)
  destacada BOOLEAN DEFAULT false,    -- aparece en el carrusel de la web
  subvencionada BOOLEAN DEFAULT false, -- de pago pero cubierta por el Fondo Público de Acceso
  estadisticas JSONB DEFAULT '{}',
  revisado_por TEXT,
  fecha_revision TEXT,
  motivo_revision TEXT,
  creado_en TEXT DEFAULT (now()::text),
  UNIQUE (id)
);

-- ── COLABORADORES (acuerdo 18+ firmado vía PlacetaID) ────────────────
CREATE TABLE IF NOT EXISTS junior_colaboradores (
  dip TEXT PRIMARY KEY,
  nombre TEXT,
  tipo_titular TEXT DEFAULT 'profesor',
  eip TEXT,
  nombre_entidad TEXT,
  documento_id TEXT,                  -- documento oficial (sistema de documentos)
  csv TEXT,
  firmado BOOLEAN DEFAULT false,
  estado TEXT DEFAULT 'pendiente_firma', -- pendiente_firma | activo
  fecha_firma TEXT,
  creado_en TEXT DEFAULT (now()::text)
);

-- ── PUNTOS VERDES / ROJOS (spec §16) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS junior_puntos (
  junior_id INTEGER PRIMARY KEY,
  puntos_verdes INTEGER DEFAULT 0,
  puntos_rojos INTEGER DEFAULT 0,
  canjeado INTEGER DEFAULT 0,         -- placetas obtenidas por canje
  actualizado_en TEXT DEFAULT (now()::text)
);

-- ── DIPLOMAS (spec §11, §13) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS junior_diplomas (
  id TEXT PRIMARY KEY,
  junior_id INTEGER,
  junior_dip TEXT,
  junior_nombre TEXT,
  actividad_id TEXT,
  actividad_titulo TEXT,
  resultado INTEGER,                  -- porcentaje
  reconocimiento TEXT,                -- Diploma | Mención especial | Excelencia
  aprobado BOOLEAN DEFAULT true,
  fecha TEXT,
  identificador TEXT,                 -- ID único verificable
  firma_digital TEXT,
  creado_en TEXT DEFAULT (now()::text)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_actividades_estado ON junior_actividades(estado);
CREATE INDEX IF NOT EXISTS idx_actividades_categoria ON junior_actividades(categoria);
CREATE INDEX IF NOT EXISTS idx_actividades_autor ON junior_actividades(autor_dip);
CREATE INDEX IF NOT EXISTS idx_diplomas_junior ON junior_diplomas(junior_id);

-- ── AMISTADES ENTRE JUNIORS (real, por DIP) ──────────────────────────
CREATE TABLE IF NOT EXISTS junior_amigos (
  junior_dip TEXT NOT NULL,
  amigo_dip TEXT NOT NULL,
  estado TEXT DEFAULT 'aceptado',     -- aceptado | pendiente
  creado_en TEXT DEFAULT (now()::text),
  PRIMARY KEY (junior_dip, amigo_dip)
);
CREATE INDEX IF NOT EXISTS idx_amigos_junior ON junior_amigos(junior_dip);

-- ── LICENCIAS PREMIUM (pago por licencia) ────────────────────────────
CREATE TABLE IF NOT EXISTS junior_licencias (
  junior_id TEXT NOT NULL,
  actividad_id TEXT NOT NULL,
  creado_en TEXT DEFAULT (now()::text),
  PRIMARY KEY (junior_id, actividad_id)
);
CREATE INDEX IF NOT EXISTS idx_licencias_junior ON junior_licencias(junior_id);

-- ── CONFIGURACIÓN ECONÓMICA (tablas de canje editables desde el panel RSP)
CREATE TABLE IF NOT EXISTS rsp_config (
  clave TEXT PRIMARY KEY,
  valor JSONB,
  actualizado_en TEXT DEFAULT (now()::text)
);

-- ── TRANSACCIONES / MOVIMIENTOS DEL MONEDERO JUNIOR ──────────────────
-- (si ya existe del esquema CRM, se relaja su CHECK para permitir 'rbu',
--  'transferencia', etc. y que todo salga en Movimientos)
CREATE TABLE IF NOT EXISTS junior_transacciones (
  id BIGSERIAL PRIMARY KEY,
  junior_id BIGINT NOT NULL REFERENCES junior_menores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  concepto TEXT NOT NULL,
  cantidad INTEGER NOT NULL,
  saldo_resultante INTEGER NOT NULL,
  ip TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_junior_transacciones_junior ON junior_transacciones(junior_id);

-- Relajar el CHECK: la app usa tipos más allá de los del esquema original
ALTER TABLE junior_transacciones DROP CONSTRAINT IF EXISTS junior_transacciones_tipo_check;
ALTER TABLE junior_transacciones ADD CONSTRAINT junior_transacciones_tipo_check
  CHECK (tipo IN ('ganar', 'gastar', 'bonus', 'ajuste', 'rbu', 'transferencia', 'canje', 'premium'));

-- ── LOGS DEL JUNIOR ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS junior_logs (
  id BIGSERIAL PRIMARY KEY,
  junior_id BIGINT REFERENCES junior_menores(id),
  accion TEXT NOT NULL,
  detalle TEXT,
  ip TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_junior_logs_junior ON junior_logs(junior_id);

-- ── CONTROL DE RECLAMO DIARIO DE RBU (anti doble reclamo) ────────────
ALTER TABLE junior_menores ADD COLUMN IF NOT EXISTS rbu_ultima TEXT;

-- ── REGISTRO MERCANTIL — EMPRESAS Y EIP (persistente) ────────────────
CREATE TABLE IF NOT EXISTS rsp_empresas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  eip TEXT,
  dip TEXT,
  representantes JSONB DEFAULT '[]',
  activa BOOLEAN DEFAULT true,
  creada TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rsp_empresas_eip ON rsp_empresas(eip);
CREATE INDEX IF NOT EXISTS idx_rsp_empresas_dip ON rsp_empresas(dip);
