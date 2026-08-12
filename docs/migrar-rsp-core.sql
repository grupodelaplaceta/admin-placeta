-- ═══════════════════════════════════════════════════════════════════════
-- MIGRACIÓN RSP CORE — Núcleo transversal del RSP (admin-placeta)
-- Ejecutar en Supabase SQL Editor (https://supabase.com/dashboard > SQL Editor)
-- Cubre: Motor Normativo CNIC, Expedientes, Incidencias, Auditoría,
--        Notificaciones, Contabilidad, Fundación, Patrimonio, Límite 500k,
--        Retribución 250 Pz, Desgravaciones, Operation Engine, Comprobación.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. MOTOR NORMATIVO CNIC (FASE 9 / 23) ────────────────────────────────
-- Reglas configurables versionadas del Código Normativo Interno Complementario.
-- NUNCA se modifica una versión vigente: se crea una nueva versión.
CREATE TABLE IF NOT EXISTS rsp_cnic (
  id TEXT PRIMARY KEY,                -- CNIC-FISC-001 (código estable)
  codigo TEXT NOT NULL UNIQUE,        -- CNIC-FISC-001
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT,                          -- impuesto | limite | rbu | bonificacion | contable | declaracion | otro
  ambito TEXT DEFAULT 'general',      -- general | banco | tributos | junior | fundacion | nominas | contabilidad | declaraciones
  valor JSONB DEFAULT '{}',           -- { tipo:'porcentaje'|'importe'|'texto', valor: 80, unidad:'%' }
  version INTEGER DEFAULT 1,
  estado TEXT DEFAULT 'borrador',     -- borrador | validacion | aprobado | programado | vigente | historico
  fecha_entrada_vigor TEXT,           -- 2026-07-01
  fecha_fin_vigor TEXT,               -- 2026-08-31
  autor_dip TEXT,
  autor_nombre TEXT,
  proponente_dip TEXT,                -- Administrador 1 (propone)
  aprobador_dip TEXT,                 -- Administrador 2 (aprueba)
  aprobador_nombre TEXT,
  critica BOOLEAN DEFAULT FALSE,      -- requiere doble aprobación
  sistemas_afectados JSONB DEFAULT '[]',
  version_anterior_id TEXT,           -- id de la versión de la que deriva
  historial JSONB DEFAULT '[]',       -- [{version, estado, fecha, autor, motivo}]
  notas_cambio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cnic_codigo ON rsp_cnic(codigo);
CREATE INDEX IF NOT EXISTS idx_cnic_estado ON rsp_cnic(estado);
CREATE INDEX IF NOT EXISTS idx_cnic_vigor ON rsp_cnic(fecha_entrada_vigor);

-- ── 2. EXPEDIENTES TRANSVERSALES (FASE 14) ───────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_expedientes (
  id TEXT PRIMARY KEY,                -- EXP-2026-000001
  titulo TEXT NOT NULL,
  tipo TEXT,                          -- general | subvencion | ayuda | sancion | reclamacion | contrato | otro
  entidad TEXT DEFAULT 'rsp',
  persona_dip TEXT,
  entidad_eip TEXT,
  relacion_ids JSONB DEFAULT '[]',    -- [{tipo:'operacion'|'solicitud'|'documento'|'firma'|'pago'|'resolucion'|'notificacion', id, label}]
  estado TEXT DEFAULT 'abierto',      -- abierto | en_tramite | resuelto | cerrado | archivado
  responsable_dip TEXT,
  responsable_nombre TEXT,
  prioridad TEXT DEFAULT 'normal',    -- baja | normal | alta | critica
  documentos JSONB DEFAULT '[]',
  resolucion TEXT,
  hash TEXT,                          -- hashIntegridad
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exp_persona ON rsp_expedientes(persona_dip);
CREATE INDEX IF NOT EXISTS idx_exp_entidad ON rsp_expedientes(entidad_eip);
CREATE INDEX IF NOT EXISTS idx_exp_estado ON rsp_expedientes(estado);

-- ── 2b. TRÁMITES / WORKFLOW (motor de trámites) ──────────────────────────
CREATE TABLE IF NOT EXISTS rsp_tramites (
  id TEXT PRIMARY KEY,                -- RSP-2026-000001
  tipo TEXT NOT NULL,                 -- subvencion | alta-entidad | cambio-datos | cambio-titularidad | solicitud-pago
  titulo TEXT NOT NULL,
  solicitante_dip TEXT,
  solicitante_nombre TEXT,
  entidad_eip TEXT,
  entidad_nombre TEXT,
  estado TEXT DEFAULT 'borrador',     -- borrador|presentado|validacion|revision|subsanacion|resolucion|firma|ejecucion|justificacion|cerrado|rechazado
  paso INTEGER DEFAULT 0,
  prioridad TEXT DEFAULT 'normal',    -- baja | normal | alta
  responsable_dip TEXT,
  responsable_nombre TEXT,
  datos JSONB DEFAULT '{}',
  documentos JSONB DEFAULT '[]',      -- [{nombre, estado:'validado'|'pendiente', fecha}]
  validaciones JSONB DEFAULT '[]',    -- [{id, nombre, ok}]
  historial JSONB DEFAULT '[]',       -- [{fecha, quien, accion, nota}]
  comunicaciones JSONB DEFAULT '[]',  -- [{fecha, remitente, texto}]
  expediente_id TEXT,                 -- EXP-2026-000001 (se crea al presentar)
  siguiente_accion TEXT,
  fecha_presentacion TEXT,
  fecha_limite TEXT,
  resolucion JSONB,
  firmas JSONB DEFAULT '[]',
  operaciones JSONB DEFAULT '[]',
  hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tram_estado ON rsp_tramites(estado);
CREATE INDEX IF NOT EXISTS idx_tram_solicitante ON rsp_tramites(solicitante_dip);
CREATE INDEX IF NOT EXISTS idx_tram_tipo ON rsp_tramites(tipo);
CREATE INDEX IF NOT EXISTS idx_tram_expediente ON rsp_tramites(expediente_id);

-- ── 3. INCIDENCIAS (FASE 18) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_incidencias (
  id TEXT PRIMARY KEY,                -- INC-2026-000001
  origen TEXT,                        -- banco | tributos | junior | fundacion | rsp | administracion | junta | edu
  servicio TEXT,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  usuario_dip TEXT,
  entidad_eip TEXT,
  gravedad TEXT DEFAULT 'media',      -- baja | media | alta | critica
  estado TEXT DEFAULT 'abierta',      -- abierta | en_revision | en_resolucion | resuelta | cerrada
  responsable_dip TEXT,
  responsable_nombre TEXT,
  documentos JSONB DEFAULT '[]',
  resolucion TEXT,
  historial JSONB DEFAULT '[]',       -- [{estado, fecha, usuario, nota}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inc_estado ON rsp_incidencias(estado);
CREATE INDEX IF NOT EXISTS idx_inc_origen ON rsp_incidencias(origen);
CREATE INDEX IF NOT EXISTS idx_inc_usuario ON rsp_incidencias(usuario_dip);

-- ── 4. AUDITORÍA CENTRAL (FASE 19) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_auditoria (
  id TEXT PRIMARY KEY,                -- AUD-2026-000001
  usuario_dip TEXT,
  usuario_nombre TEXT,
  fecha TEXT,                         -- ISO
  ip TEXT,
  dispositivo TEXT,
  servicio TEXT,                      -- banco | tributos | ...
  accion TEXT,                        -- crear | editar | aprobar | firmar | pagar | anular | exportar | auditar | administrar
  objeto_tipo TEXT,                   -- CNIC | operacion | declaracion | documento | ...
  objeto_id TEXT,
  valor_anterior JSONB,
  valor_nuevo JSONB,
  motivo TEXT,
  autorizacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aud_usuario ON rsp_auditoria(usuario_dip);
CREATE INDEX IF NOT EXISTS idx_aud_servicio ON rsp_auditoria(servicio);
CREATE INDEX IF NOT EXISTS idx_aud_fecha ON rsp_auditoria(fecha);
CREATE INDEX IF NOT EXISTS idx_aud_objeto ON rsp_auditoria(objeto_tipo, objeto_id);

-- ── 5. NOTIFICACIONES UNIFICADAS (FASE 17) ───────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_notificaciones (
  id TEXT PRIMARY KEY,                -- NOT-2026-000001
  nivel TEXT DEFAULT 'info',          -- accion (rojo) | pendiente (amarillo) | info (azul) | completado (verde)
  titulo TEXT NOT NULL,
  mensaje TEXT,
  servicio TEXT,                      -- origen
  destinatario_dip TEXT,
  destinatario_eip TEXT,
  objeto_tipo TEXT,
  objeto_id TEXT,
  enlace TEXT,
  leida BOOLEAN DEFAULT FALSE,
  fecha TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_dest ON rsp_notificaciones(destinatario_dip);
CREATE INDEX IF NOT EXISTS idx_notif_leida ON rsp_notificaciones(leida);

-- ── 6. CONTABILIDAD DE ENTIDADES (FASE 7 + punto 13) ─────────────────────
CREATE TABLE IF NOT EXISTS rsp_plan_contable (
  id TEXT PRIMARY KEY,                -- PC-1000
  codigo TEXT NOT NULL,               -- 1000
  nombre TEXT NOT NULL,
  tipo TEXT,                          -- activo | pasivo | patrimonio | ingreso | gasto
  grupo TEXT,
  obligatoria_entidades BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_codigo ON rsp_plan_contable(codigo);

CREATE TABLE IF NOT EXISTS rsp_asientos (
  id TEXT PRIMARY KEY,                -- ASI-2026-000001
  numero INTEGER,                     -- asiento correlativo por entidad
  entidad_eip TEXT,
  entidad_nombre TEXT,
  fecha TEXT NOT NULL,
  concepto TEXT,
  origen TEXT,                        -- manual | factura | nomina | banco | subvencion | automatizado
  referencia_tipo TEXT,               -- factura | nomina | operacion | subvencion
  referencia_id TEXT,
  lineas JSONB DEFAULT '[]',          -- [{cuenta, nombre, debe, haber, concepto}]
  total_debe NUMERIC DEFAULT 0,
  total_haber NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'borrador',     -- borrador | contabilizado | anulado
  contabilizado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asientos_entidad ON rsp_asientos(entidad_eip);
CREATE INDEX IF NOT EXISTS idx_asientos_fecha ON rsp_asientos(fecha);

-- ── 7. FUNDACIÓN (FASE 11 / 12) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_fundacion_programas (
  id TEXT PRIMARY KEY,                -- FUND-PROG-001
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT,                          -- ayuda | beca | rbu | proyecto | emergencia | social
  presupuesto NUMERIC DEFAULT 0,
  presupuesto_utilizado NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'activo',       -- activo | cerrado | suspendido
  requisitos JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rsp_fundacion_solicitudes (
  id TEXT PRIMARY KEY,                -- SOL-FUND-2026-000001
  programa_id TEXT,
  solicitante_dip TEXT,
  solicitante_nombre TEXT,
  importe_solicitado NUMERIC DEFAULT 0,
  importe_concedido NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'recibida',     -- recibida | en_revision | concedida | denegada | pagada | cerrada
  resolucion TEXT,
  expediente_id TEXT,                 -- EXP-...
  beneficiario_dip TEXT,
  beneficiario_nombre TEXT,
  documentos JSONB DEFAULT '[]',
  pagos JSONB DEFAULT '[]',           -- [{importe, fecha, orden, cuenta}]
  rbu BOOLEAN DEFAULT FALSE,          -- es una RBU
  rbu_semana TEXT,                    -- 2026-W32
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fund_sol_programa ON rsp_fundacion_solicitudes(programa_id);
CREATE INDEX IF NOT EXISTS idx_fund_sol_solicitante ON rsp_fundacion_solicitudes(solicitante_dip);
CREATE INDEX IF NOT EXISTS idx_fund_sol_estado ON rsp_fundacion_solicitudes(estado);

-- ── 8. CAMPAÑAS DE DESVÍO DE FONDOS (FASE 11) ────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_fundacion_campanas (
  id TEXT PRIMARY KEY,                -- CAMPAÑA-FUND-2026-01
  nombre TEXT NOT NULL,
  descripcion TEXT,
  fecha_inicio TEXT,
  fecha_fin TEXT,
  estado TEXT DEFAULT 'programada',   -- programada | activa | cerrada | cancelada
  ingresos_elegibles JSONB DEFAULT '[]',  -- [{concepto, importe, fecha}]
  destino TEXT DEFAULT 'fundacion',   -- fundacion | otro
  iva_responsabilidad TEXT DEFAULT 'capitalia',
  total_desviado NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. PATRIMONIO Y ACTIVOS (FASE 21 + puntos 2/3/4) ─────────────────────
-- % de titularidad de cuentas compartidas (nunca 100% para todos)
CREATE TABLE IF NOT EXISTS rsp_titularidades (
  id TEXT PRIMARY KEY,
  cuenta_id TEXT NOT NULL,
  titular_dip TEXT,
  titular_eip TEXT,
  porcentaje NUMERIC DEFAULT 0,       -- 0-100
  tipo TEXT DEFAULT 'compartida',     -- compartida | joint | heredada
  fuente TEXT DEFAULT 'registro',
  vigente BOOLEAN DEFAULT TRUE,
  historial JSONB DEFAULT '[]',       -- [{porcentaje, fecha, motivo, autorizado_por}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_titul_cuenta ON rsp_titularidades(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_titul_dip ON rsp_titularidades(titular_dip);
CREATE UNIQUE INDEX IF NOT EXISTS idx_titul_uniq ON rsp_titularidades(cuenta_id, titular_dip, titular_eip) WHERE vigente = TRUE;

-- Participaciones empresariales (% de patrimonio atribuible)
CREATE TABLE IF NOT EXISTS rsp_participaciones (
  id TEXT PRIMARY KEY,
  titular_dip TEXT,
  titular_nombre TEXT,
  entidad_eip TEXT,
  entidad_nombre TEXT,
  porcentaje NUMERIC DEFAULT 0,       -- 0-100
  patrimonio_neto_entidad NUMERIC DEFAULT 0,
  patrimonio_atribuible NUMERIC DEFAULT 0,  -- % * patrimonio neto
  deudas_reconocidas NUMERIC DEFAULT 0,
  valoracion TEXT DEFAULT 'patrimonio_neto',  -- patrimonio_neto | otro
  vigente BOOLEAN DEFAULT TRUE,
  historial JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_part_dip ON rsp_participaciones(titular_dip);
CREATE INDEX IF NOT EXISTS idx_part_eip ON rsp_participaciones(entidad_eip);

-- Activos (para IGF y contabilidad)
CREATE TABLE IF NOT EXISTS rsp_activos (
  id TEXT PRIMARY KEY,
  propietario_dip TEXT,
  propietario_eip TEXT,
  tipo TEXT,                          -- inmueble | vehiculo | cuenta | participacion | otro
  nombre TEXT,
  descripcion TEXT,
  valor NUMERIC DEFAULT 0,
  porcentaje_titularidad NUMERIC DEFAULT 100,
  valor_fiscal NUMERIC DEFAULT 0,     -- valor * % titularidad
  deuda_asociada NUMERIC DEFAULT 0,
  fecha_adquisicion TEXT,
  vigente BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activos_dip ON rsp_activos(propietario_dip);

-- ── 10. LÍMITE DE CAPITAL 500.000 Pz (punto 1) ───────────────────────────
CREATE TABLE IF NOT EXISTS rsp_limite_bloqueos (
  id TEXT PRIMARY KEY,
  cuenta_id TEXT NOT NULL,
  titular_dip TEXT,
  tipo_cuenta TEXT,
  saldo NUMERIC DEFAULT 0,
  limite NUMERIC DEFAULT 500000,
  exceso NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'bloqueada',    -- bloqueada | justificada | regularizada | desbloqueada
  fecha_bloqueo TEXT,
  fecha_limite_justificacion TEXT,    -- +15 días naturales
  justificacion TEXT,
  excedente_retirado NUMERIC DEFAULT 0,
  regularizado_por TEXT,
  historial JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bloq_cuenta ON rsp_limite_bloqueos(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_bloq_estado ON rsp_limite_bloqueos(estado);

-- ── 11. RETRIBUCIÓN 250 Pz PROPIETARIOS (puntos 10-12) ───────────────────
CREATE TABLE IF NOT EXISTS rsp_retribuciones (
  id TEXT PRIMARY KEY,
  beneficiario_dip TEXT,
  beneficiario_nombre TEXT,
  entidad_eip TEXT,
  entidad_nombre TEXT,
  porcentaje_participacion NUMERIC DEFAULT 0,
  cuantia_mensual NUMERIC DEFAULT 0,  -- 250 * % participación, máx 250
  mes TEXT,                           -- 2026-08
  estado TEXT DEFAULT 'pendiente',    -- pendiente | reconocida | ordenada | pagada | denegada
  fondo TEXT DEFAULT 'fondo_apoyo',   -- Fondo de Apoyo a la Participación Económica y Social
  declaracion_obligatoria BOOLEAN DEFAULT TRUE,
  controles_antifraude JSONB DEFAULT '[]',
  pagos JSONB DEFAULT '[]',
  ordenada_por TEXT,
  origen TEXT DEFAULT 'manual',           -- manual | automatico
  fuente TEXT,                            -- banco | participaciones
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_retr_dip ON rsp_retribuciones(beneficiario_dip);
CREATE INDEX IF NOT EXISTS idx_retr_mes ON rsp_retribuciones(mes);
-- Columnas de cálculo automático (instalaciones existentes)
ALTER TABLE rsp_retribuciones ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'manual';
ALTER TABLE rsp_retribuciones ADD COLUMN IF NOT EXISTS fuente TEXT;

-- ── 12. DESGRAVACIONES FISCALES (puntos 8/9) ─────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_desgravaciones (
  id TEXT PRIMARY KEY,
  titular_dip TEXT,
  titular_eip TEXT,
  tipo TEXT,                          -- iva_6 | donacion | social
  base NUMERIC DEFAULT 0,             -- importe de la operación/donación
  iva_pagado NUMERIC DEFAULT 0,
  porcentaje NUMERIC DEFAULT 6,       -- 6% del IVA efectivamente abonado
  cuantia NUMERIC DEFAULT 0,          -- base * (iva_pagado/base) * %
  origen_tipo TEXT,                   -- operacion | donacion | subvencion
  origen_id TEXT,
  ejercicio TEXT,                     -- 2026
  estado TEXT DEFAULT 'registrada',   -- registrada | aplicada | anulada
  aplicada_en TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_desgr_dip ON rsp_desgravaciones(titular_dip);
CREATE INDEX IF NOT EXISTS idx_desgr_ejercicio ON rsp_desgravaciones(ejercicio);

-- ── 13. OPERATION ENGINE (FASE 4) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_operaciones (
  id TEXT PRIMARY KEY,                -- OP-2026-000001
  trf_id TEXT,                        -- TRF-2026-... (identificador global)
  cuenta_origen TEXT,
  cuenta_destino TEXT,
  concepto TEXT,
  importe NUMERIC DEFAULT 0,
  periodicidad TEXT DEFAULT 'puntual',-- puntual | mensual | semanal | trimestral
  servicio TEXT,
  clasificacion TEXT DEFAULT 'pendiente',  -- pendiente | nomina | factura | subvencion | ayuda | transferencia | otro
  estado_motor TEXT DEFAULT 'creada', -- creada | identificada | clasificada | validada | reglas | fiscalidad | documentacion | ejecutada | auditada | retenida | revertida | rechazada
  inconsistencias JSONB DEFAULT '[]',
  expediente_id TEXT,
  documentos JSONB DEFAULT '[]',
  regla_aplicada TEXT,                -- CNIC-FISC-001 v4
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_op_estado ON rsp_operaciones(estado_motor);
CREATE INDEX IF NOT EXISTS idx_op_concepto ON rsp_operaciones(concepto);

-- ── 14. COMPROBACIÓN DEL ECOSISTEMA (FASE 27) ────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_comprobacion (
  id TEXT PRIMARY KEY,
  tipo TEXT,                          -- banco_contabilidad | factura_pago | nomina_transferencia | impuesto_operacion | documento_operacion
  resultado TEXT DEFAULT 'ok',        -- ok | diferencia | inconsistencia
  detalle JSONB DEFAULT '{}',
  importe_esperado NUMERIC DEFAULT 0,
  importe_encontrado NUMERIC DEFAULT 0,
  diferencia NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'abierta',      -- abierta | revisada | resuelta
  responsable_dip TEXT,
  fecha TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comp_resultado ON rsp_comprobacion(resultado);
CREATE INDEX IF NOT EXISTS idx_comp_tipo ON rsp_comprobacion(tipo);

-- ── 15. NÓMINAS (FASE 6) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_nominas (
  id TEXT PRIMARY KEY,                -- NOM-2026-08-0001
  trabajador_dip TEXT,
  trabajador_nombre TEXT,
  entidad_eip TEXT,
  entidad_nombre TEXT,
  periodo TEXT,                       -- 2026-08
  salario_base NUMERIC DEFAULT 0,
  complementos JSONB DEFAULT '[]',
  bruto NUMERIC DEFAULT 0,
  cotizacion_empresa NUMERIC DEFAULT 0,
  cotizacion_trabajador NUMERIC DEFAULT 0,
  retencion_irm NUMERIC DEFAULT 0,
  deducciones JSONB DEFAULT '[]',
  total_retenciones NUMERIC DEFAULT 0,
  neto NUMERIC DEFAULT 0,
  cuenta_bancaria TEXT,
  estado TEXT DEFAULT 'calculada',    -- calculada | documentada | ordenada | pagada
  orden_bancaria JSONB,
  creado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nom_periodo ON rsp_nominas(periodo);
CREATE INDEX IF NOT EXISTS idx_nom_dip ON rsp_nominas(trabajador_dip);
CREATE INDEX IF NOT EXISTS idx_nom_eip ON rsp_nominas(entidad_eip);

-- ── 16. FACTURACIÓN (FASE 5) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_facturas (
  id TEXT PRIMARY KEY,                -- FAC-2026-000001
  tipo TEXT DEFAULT 'emitida',        -- emitida | recibida | rectificativa | abono
  emisor_eip TEXT,
  emisor_nombre TEXT,
  receptor_eip TEXT,
  receptor_nombre TEXT,
  concepto TEXT,
  lineas JSONB DEFAULT '[]',
  base_imponible NUMERIC DEFAULT 0,
  total_iva NUMERIC DEFAULT 0,
  total_factura NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'emitida',      -- borrador | emitida | vencida | pagada | rectificada | anulada
  fecha TEXT,
  vencimiento TEXT,
  pagos JSONB DEFAULT '[]',
  operacion_id TEXT,
  rectifica TEXT,
  emitida_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Compatibilidad: si rsp_facturas ya existía con el esquema antiguo de
-- migrar-rsp.sql (columnas `entidad` + CHECK en `estado`), se ajusta en sitio
-- SIN perder datos, para que la facturación nueva (emisor_eip/receptor_eip)
-- funcione correctamente.
ALTER TABLE rsp_facturas DROP CONSTRAINT IF EXISTS rsp_facturas_estado_check;
ALTER TABLE rsp_facturas ALTER COLUMN estado SET DEFAULT 'emitida';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'rsp_facturas' AND column_name = 'entidad') THEN
    ALTER TABLE rsp_facturas ALTER COLUMN entidad DROP NOT NULL;
  END IF;
END $$;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'emitida';
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS emisor_eip TEXT;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS emisor_nombre TEXT;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS receptor_eip TEXT;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS receptor_nombre TEXT;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS concepto TEXT;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS lineas JSONB DEFAULT '[]';
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS base_imponible NUMERIC DEFAULT 0;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS total_iva NUMERIC DEFAULT 0;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS total_factura NUMERIC DEFAULT 0;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS fecha TEXT;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS vencimiento TEXT;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS pagos JSONB DEFAULT '[]';
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS operacion_id TEXT;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS rectifica TEXT;
ALTER TABLE rsp_facturas ADD COLUMN IF NOT EXISTS emitida_por TEXT;
CREATE INDEX IF NOT EXISTS idx_fac_emisor ON rsp_facturas(emisor_eip);
CREATE INDEX IF NOT EXISTS idx_fac_receptor ON rsp_facturas(receptor_eip);
CREATE INDEX IF NOT EXISTS idx_fac_estado ON rsp_facturas(estado);

-- ── 17. NOTIFICACIONES (FASE 17) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_notificaciones (
  id TEXT PRIMARY KEY,                -- NOTIF-2026-000001
  nivel TEXT DEFAULT 'info',          -- accion | pendiente | info | completado
  titulo TEXT NOT NULL,
  mensaje TEXT,
  servicio TEXT,
  destinatario_dip TEXT,
  destinatario_eip TEXT,
  objeto_tipo TEXT,
  objeto_id TEXT,
  enlace TEXT,
  leida BOOLEAN DEFAULT FALSE,
  fecha TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_dest ON rsp_notificaciones(destinatario_dip);
CREATE INDEX IF NOT EXISTS idx_notif_leida ON rsp_notificaciones(leida);

-- ── 18. BAJAS / ALTAS (puntos 17-18) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_bajas (
  id TEXT PRIMARY KEY,                -- BAJA-...
  dip TEXT NOT NULL,
  nombre TEXT,
  motivo TEXT,
  estado TEXT DEFAULT 'baja_activa',  -- baja_activa | reactivada
  fecha_baja TEXT,
  conservar_hasta TEXT,               -- período de conservación (7 años)
  dip_inactivo BOOLEAN DEFAULT TRUE,
  placetaid_inactivo BOOLEAN DEFAULT TRUE,
  operaciones_congeladas BOOLEAN DEFAULT TRUE,
  requiere_liquidacion_tributaria BOOLEAN DEFAULT TRUE,
  historial JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bajas_dip ON rsp_bajas(dip);
CREATE INDEX IF NOT EXISTS idx_bajas_estado ON rsp_bajas(estado);

-- ── 19. TESTAMENTO DIGITAL ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_testamentos (
  id TEXT PRIMARY KEY,                -- TEST-...
  dip TEXT NOT NULL,
  nombre TEXT,
  herederos JSONB DEFAULT '[]',       -- [{dip, nombre, porcentaje, orden}]
  bienes JSONB DEFAULT '[]',          -- [{tipo, id, descripcion, valor}]
  disposiciones TEXT,
  estado TEXT DEFAULT 'vigente',
  autorizado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_test_dip ON rsp_testamentos(dip);

-- ── 19-21. PROCESOS DE HERENCIA ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_herencias (
  id TEXT PRIMARY KEY,                -- HER-2026-000001
  causante_dip TEXT NOT NULL,
  causante_nombre TEXT,
  motivo TEXT DEFAULT 'fallecimiento',
  estado TEXT DEFAULT 'abierta',      -- abierta | en_transmision | cerrada
  herederos JSONB DEFAULT '[]',       -- [{dip, nombre, porcentaje, situacion, sustituto}]
  bienes JSONB DEFAULT '[]',          -- [{tipo, id, descripcion, valor, transmitido_a}]
  participaciones JSONB DEFAULT '[]', -- [{entidad_eip, entidad_nombre, porcentaje, valor_economico, estado, socios, reparto, fiscal_liquidado}]
  deudas JSONB DEFAULT '[]',          -- [{concepto, importe, estado}]
  fondos_sin_heredero JSONB DEFAULT '[]',  -- [{importe, concepto, fecha, destino}]
  resolucion TEXT,
  tramitada_por TEXT,
  historial JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_her_causante ON rsp_herencias(causante_dip);
CREATE INDEX IF NOT EXISTS idx_her_estado ON rsp_herencias(estado);

-- ── 7. PATRIMONIO EMPRESARIAL AFECTO A ACTIVIDAD ─────────────────────────
CREATE TABLE IF NOT EXISTS rsp_patrimonio_afecto (
  id TEXT PRIMARY KEY,                -- AFECTO-...
  entidad_eip TEXT NOT NULL,
  entidad_nombre TEXT,
  importe NUMERIC DEFAULT 0,
  concepto TEXT,
  tipo TEXT DEFAULT 'ordinario',      -- salarios | servidores | material | inversiones | proyectos | ordinario
  documento_id TEXT NOT NULL,         -- DOC-... justificativo (obligatorio)
  origen TEXT DEFAULT 'manual',       -- manual | automatico
  ejercicio TEXT,                     -- 2026
  estado TEXT DEFAULT 'registrado',
  registrado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_afecto_eip ON rsp_patrimonio_afecto(entidad_eip);
-- Columnas de cálculo automático (instalaciones existentes)
ALTER TABLE rsp_patrimonio_afecto ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'manual';
ALTER TABLE rsp_patrimonio_afecto ADD COLUMN IF NOT EXISTS ejercicio TEXT;

-- ── 22. REGISTRO MAESTRO DE IDENTIDAD (FASE 4) ────────────────────────────
CREATE TABLE IF NOT EXISTS rsp_ciudadanos (
  dip TEXT PRIMARY KEY,
  placeta_id TEXT,
  nombre TEXT,
  estado TEXT DEFAULT 'activo',           -- activo | baja
  nivel TEXT DEFAULT 'N1',                -- N1 | N2 | N3 (sin biometria)
  cuenta_principal TEXT,
  canal_preferido TEXT DEFAULT 'email',   -- email | movil | app
  fuente TEXT DEFAULT 'derivado',         -- registrado | sincronizado | derivado
  verificado_en TEXT,
  tributos_censado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ciud_placeta ON rsp_ciudadanos(placeta_id);
CREATE INDEX IF NOT EXISTS idx_ciud_nivel ON rsp_ciudadanos(nivel);
