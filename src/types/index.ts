/* ═══════════════════════════════════════════════════════════════════════
   RSP Web · Tipos de dominio
   Reflejan el modelo del backend (admin-placeta) y del plan maestro.
   ═══════════════════════════════════════════════════════════════════════ */

export type Entidad = 'banco' | 'tributos' | 'junta' | 'administracion' | 'rsp' | 'junior';

export interface Usuario {
  dip: string;
  nombre: string;
  email?: string;
  avatar?: string;
  nivel?: 'N1' | 'N2' | 'N3';
}

export interface Session {
  usuario: Usuario;
  roles: string[];
  entidades: Entidad[];
  permisos: Record<string, string[]>;
}

export type EstadoTramite =
  | 'inicio'
  | 'datos'
  | 'documentacion'
  | 'validacion'
  | 'revision'
  | 'subsanacion'
  | 'resolucion'
  | 'firma'
  | 'pago'
  | 'justificacion'
  | 'cierre';

export interface Requisito {
  id: string;
  descripcion: string;
  cumplido: boolean;
}

export interface DocumentoVinculado {
  id: string;
  nombre: string;
  tipo: string;
  firmado: boolean;
}

export interface TramiteDetalle extends Tramite {
  requisitos: Requisito[];
  documentos: DocumentoVinculado[];
  actuaciones: Actuacion[];
}

export const ORDEN_ESTADOS: EstadoTramite[] = [
  'inicio', 'datos', 'documentacion', 'validacion', 'revision',
  'subsanacion', 'resolucion', 'firma', 'pago', 'justificacion', 'cierre',
];

export interface TipoTramite {
  id: string;
  etiqueta: string;
  servicio: string;
  plazoDias: number;
}

export const TIPOS_TRAMITE: TipoTramite[] = [
  { id: 'subvencion', etiqueta: 'Solicitud de subvención', servicio: 'Subvenciones', plazoDias: 15 },
  { id: 'cambio_titularidad', etiqueta: 'Cambio de titularidad', servicio: 'Patrimonio', plazoDias: 7 },
  { id: 'herencia', etiqueta: 'Sucesión / herencia', servicio: 'Sucesiones', plazoDias: 20 },
  { id: 'reparto_empresa', etiqueta: 'Reparto / escisión de empresa', servicio: 'Patrimonio', plazoDias: 20 },
  { id: 'baja', etiqueta: 'Baja de persona', servicio: 'Registro', plazoDias: 10 },
  { id: 'reclamacion', etiqueta: 'Reclamación', servicio: 'Reclamaciones', plazoDias: 10 },
  { id: 'certificado', etiqueta: 'Certificado administrativo', servicio: 'Certificados', plazoDias: 5 },
  { id: 'cuenta_bancaria', etiqueta: 'Apertura de cuenta bancaria', servicio: 'Banco', plazoDias: 5 },
  { id: 'cuenta_compartida', etiqueta: 'Crear cuenta compartida', servicio: 'Banco', plazoDias: 5 },
  { id: 'cuenta_ahorro', etiqueta: 'Crear cuenta de ahorro', servicio: 'Banco', plazoDias: 5 },
  { id: 'tarjeta_digital', etiqueta: 'Crear tarjeta digital', servicio: 'Banco', plazoDias: 3 },
  { id: 'solicitud_bono', etiqueta: 'Adhesión a un bono', servicio: 'Bonificaciones', plazoDias: 5 },
];

export interface NuevoTramite {
  tipo: string;
  servicio: string;
  dip: string;
  concepto: string;
  nombre?: string;
  /** Datos específicos del tipo de trámite (formulario concreto). */
  datos?: Record<string, string>;
}

export interface Tramite {
  id: string;
  tipo: string;
  titulo: string;
  dip: string;
  nombreCiudadano: string;
  estado: EstadoTramite;
  plazo: number; // días
  plazoDesde?: string;
  vencido?: boolean;
  asignadoA?: string | null;
  expedienteId?: string;
  servicio?: string;
  firmasCompletas?: number;
  firmasRequeridas?: number;
  actualizadoEn: string;
  /** Datos específicos capturados en el formulario del tipo. */
  datosEspecificos?: Record<string, string>;
}

export interface Actuacion {
  id: string;
  tipo: string;
  descripcion: string;
  autor: string;
  fecha: string;
}

export interface Expediente {
  id: string; // EXP-2026-000001
  titulo: string;
  dip: string;
  nombreCiudadano: string;
  servicio: string;
  estado: string;
  numActuaciones: number;
  documentos: number;
  creadoEn: string;
}

export interface CiudadanoResumen {
  dip: string;
  nombre: string;
  nivel: 'N1' | 'N2' | 'N3';
  cuentas: number;
  expedientesActivos: number;
  estado: 'activo' | 'suspendido';
  junior?: boolean;
}

export interface BloqueContexto {
  clave: string;
  etiqueta: string;
  icono: string;
  items: { clave: string; etiqueta: string; valor: string | number }[];
}

export interface ContextoCiudadano {
  dip: string;
  nombre: string;
  nivel: 'N1' | 'N2' | 'N3';
  email?: string;
  telefono?: string;
  bloques: BloqueContexto[];
}

export interface Notificacion {
  id: string;
  nivel: 'accion' | 'pendiente' | 'info' | 'completado';
  titulo: string;
  mensaje: string;
  destinatarioDip?: string;
  leida: boolean;
  acuseRecibido: boolean;
  creadaEn: string;
}

export interface EventoAuditoria {
  id: string; // AUD-2026-...
  usuario: string;
  servicio: string;
  accion: string;
  objetoTipo: string;
  objetoId: string;
  motivo?: string;
  fecha: string;
}

export interface CNICVersion {
  version: number;
  valor: string | number;
  estado: string;
  fecha: string;
}

export interface CNICRegla {
  codigo: string; // CNIC-FISC-001
  etiqueta: string;
  tipoValor: string;
  valor: string | number;
  unidad?: string;
  version: number;
  estado: 'borrador' | 'validacion' | 'aprobado' | 'programado' | 'vigente' | 'historico';
  fechaVigencia?: string;
  autor: string;
  /** Fuente de la regla: Boletín Oficial (BOP) o borrador local. */
  fuente: 'BOP' | 'local';
  bopUrl?: string;
  historial?: CNICVersion[];
}

export interface BopDocumento {
  id: string;
  codigo: string;
  titulo: string;
  tipo: string;
  categoria: string;
  estado: string;
  contenidoMd: string;
  version: number;
  aprobadaEnJunta: boolean;
  autorDip?: string;
  notasCambio?: string;
  cnicRefs?: { codigo: string; etiqueta?: string }[];
}

export interface Operacion {
  id: string; // OP-2026-...
  concepto: string;
  importe: number;
  origen: string;
  destino: string;
  clasificacion: string;
  inconsistencia?: string;
  estado: 'procesada' | 'retenida' | 'rechazada';
  fecha: string;
}

export interface EntidadRegistral {
  eip: string;
  nombre: string;
  tipo: string;
  representantes: string[];
  estado: 'activa' | 'baja';
  cumplimiento?: string;
  /** Cuentas bancarias a nombre de la entidad (datos reales del banco). */
  cuentas?: number;
  /** Número de titulares/partícipes con % registrado. */
  titulares?: number;
  /** % de participación agregado de los titulares (100 = íntegro). */
  participacionTotal?: number;
}

export type TipoSujeto = 'persona' | 'empresa' | 'junior';

export interface Contribuyente {
  id: string; // DIP o EIP
  nombre: string; // nombre legal
  tipo: TipoSujeto;
  cuentas: number;
  saldoTotalPz: number;
  estadoFiscal: 'al_dia' | 'pendiente' | 'inhibido';
  ultimaDeclaracion?: string;
  patrimonioMedio?: number;
  diasActivos?: number;
  incrementoActivos?: number; // acumulación neta (ingresos − pagos)
  indiceAcumulacion?: number; // IA en %
  ingresosMes?: number;
  pagosMes?: number;
  cuotaIrm?: number;
  cuotaIgf?: number;
  ivaExento?: boolean;
  igfExentoReducida?: boolean;
  desglose?: DesgloseFiscal;
}

export interface DeclaracionResumen {
  id: string;
  mesPeriodo: string; // '2026-07'
  contribuyenteId: string;
  contribuyenteNombre: string;
  patrimonioMedio: number;
  cuotaIrm: number;
  cuotaIgf: number;
  estado: 'borrador' | 'pendiente_aprobacion' | 'aprobada' | 'emitida' | 'cobrada';
}

export interface DesgloseFiscal {
  baseIrm: number;
  tipoIrm: number; // %
  retencionesIrm: number;
  bonificacionesIrm: number;
  patrimonioBruto: number;
  patrimonioExento: number;
  baseIgf: number;
  tipoIgf: number; // %
  ivaRepercutido: number;
  ivaSoportado: number;
  cuotaIva: number;
  // Extras de trazabilidad devueltos por el BFF (cálculo detallado):
  escalaIrm?: string;
  escalaIgf?: string;
  tramosIrm?: TramoFiscal[];
  tramosIgf?: TramoFiscal[];
  cuentas?: { id: string; nombre: string; saldo: number }[];
  movimientos?: { id: string; kind: string; concepto: string; importe: number }[];
  patrimonioMedio?: number;
  diasActivos?: number;
  ia?: number; // Índice de Acumulación (%)
  ingresosMes?: number;
  pagosMes?: number;
  acumulacionNeta?: number;
  tramoIA?: number; // 0..4
  saldosDiarios?: {
    saldoInicio: number;
    saldoActual: number;
    diasActivos: number;
    patrimonioMedio: number;
    serie: { dia: string; saldo: number }[];
  };
}

export interface TramoFiscal {
  desde: number;
  hasta: number | null;
  tipoPct: number;
  base: number;
  cuota: number;
  tramoIA?: number;
  ia?: number;
}

export interface Empleo {
  empleadorEip: string;
  empleadorNombre: string;
  salarioBruto: number;
  cotizacionPct: number; // CNIC-COTIZACION-TRABAJADOR-*
  cotizacionTrabajador: number;
  salarioNeto: number;
}

export interface DeclaracionDetalle extends DeclaracionResumen {
  cuentaIdBlp: string;
  exencionAplicada: string;
  diasActivosMes: number;
  ivaExento?: boolean;
  indiceAcumulacion?: number;
  ingresosMes?: number;
  pagosMes?: number;
  expedienteId?: string;
  documentos: { id: string; nombre: string; tipo: string }[];
  pdfUrl?: string;
  desglose?: DesgloseFiscal;
  empleos?: Empleo[];
}

export interface ContribuyenteDetalle extends Contribuyente {
  estimado: { cuotaIrm: number; cuotaIgf: number; proximoPago: string };
  declaraciones: DeclaracionResumen[];
}

export interface DocumentoCiudadano {
  id: string;
  nombre: string;
  tipo: string;
  estado: 'emitido' | 'firmado' | 'pendiente';
  fecha: string;
  version?: string;
  tutor?: string;
}

export interface FirmaCiudadano {
  id: string;
  documento: string;
  firmante: string;
  estado: 'pendiente' | 'completada';
  fecha?: string;
  version?: string;
  texto?: string;
}

export interface Obligacion {
  id: string;
  tipo: 'tramite' | 'declaracion' | 'pago';
  titulo: string;
  estado: string;
  plazo?: string;
}

export interface EntidadDetalle extends Omit<EntidadRegistral, 'representantes' | 'cuentas' | 'titulares' | 'participacionTotal'> {
  documentos: DocumentoCiudadano[];
  obligaciones: Obligacion[];
  representantes: { dip: string; nombre: string; cargo: string }[];
  /** Cuentas bancarias a nombre de la entidad. */
  cuentas: CuentaBancaria[];
  /** Facturas emitidas por la entidad (ventas). */
  facturasEmitidas: FacturaEmitida[];
  /** Participación de cada titular (%), agregada de las cuentas. */
  participacion: ParticipacionEmpresa[];
  /** Trámites en los que la entidad es interesada. */
  tramites: Tramite[];
}

/** Factura emitida por una entidad (empresa). */
export interface FacturaEmitida {
  id: string;
  numero: string; // FAC-2026-000001
  concepto: string;
  importe: number;
  estado: 'pendiente' | 'cobrada' | 'anulada';
  fecha: string;
  receptor: string; // nombre del cliente/receptor
  receptorId: string; // DIP o EIP del receptor
}

/** Titular con su % de participación en una entidad. */
export interface ParticipacionEmpresa {
  dip: string;
  nombre: string;
  pct: number;
}

// ── Facturación central (RSP + Banco) ───────────────────────────────────
export type EstadoRecibo =
  | 'emitida' | 'pagada' | 'parcial' | 'vencida'
  | 'pendiente_cargo' | 'cobrada' | 'impagada' | 'anulada' | 'sin_cuota';

export interface FacturaCiclo {
  id: string;
  eip: string;
  nombre: string;
  mes: string;
  transaccionId: string;
  concepto: string;
  cliente: string;
  fecha: string;
  bruto: number;
  base: number;
  iva: number;
  tipo: 'venta' | 'servicio';
  estado: 'abonada';
  /** El IVA repercutido de esta factura se ingresa a TGLP aparte (por factura). */
  ivaPagado: boolean;
  fechaPagoIva?: string | null;
  transaccionPagoIva?: string | null;
}

export interface ReciboTributos {
  id: string;
  tipo: 'tributos';
  eip: string;
  nombre: string;
  mes: string;
  importe: number;
  irm: number;
  igf: number;
  iva: number;
  ivaExento: boolean;
  igfExentoReducida: boolean;
  estadoFiscal: string;
  patrimonioMedio: number;
  /** Fecha de vencimiento (fin de mes) en formato YYYY-MM-DD. */
  vencimiento: string;
  estado: EstadoRecibo;
  cuentaDebito: { id: string; saldo: number } | null;
  pagos?: { transaccionId: string; fecha: string; importe: number; concepto: string }[];
  totalPagado?: number;
  cobro?: { fecha: string; transaccionId: string; importe: number; via?: string };
  aviso?: { fecha: string; motivo: string; saldo?: number; cuenta?: string; detalle?: string };
}

export interface EmpresaCiclo {
  eip: string;
  nombre: string;
  saldoTotal: number;
  cuentas: string[];
  recibo: ReciboTributos;
  facturas: FacturaCiclo[];
  totalVentas: number;
  totalIvaVentas: number;
  /** IVA pendiente de ingresar a Tributos (facturas sin pagar su IVA). */
  ivaAIngresar: number;
  totalIvaPagado: number;
  persistido?: boolean;
}

export interface CicloFacturacion {
  resumen: {
    mes: string;
    fechaGeneracion: string;
    vencimiento: string;
    tipoIvaPct: number;
    empresas: number;
    recibosPendientes: number;
    recibosPagados: number;
    facturas: number;
    totalTributos: number;
    totalPagado: number;
    totalVentas: number;
    totalIvaVentas: number;
    totalIvaAIngresar: number;
    totalIvaPagado: number;
  };
  empresas: EmpresaCiclo[];
}

export interface PlanCierre {
  fecha: string;
  cobros: { reciboId: string; eip: string; nombre: string; concepto: string; from: string; to: string; cantidad: number; fecha: string }[];
  impagados: { reciboId: string; eip: string; nombre: string; importe: number; saldo: number; cuenta: string; motivo: string }[];
  totalCobrar: number;
  totalImpagado: number;
}

export interface Nomina {
  id: string;
  dip: string;
  nombre: string;
  periodo: string;
  bruto: number;
  retenciones: number;
  neto: number;
  cuentaBanco: string;
  estado: string;
  actualizadoEn: string;
}

export interface Solicitud2FA {
  id: string;
  estado: 'pendiente';
}

export interface SubvencionResumen {
  id: string;
  emisorEip: string;
  emisorNombre: string;
  receptorEip: string;
  receptorNombre: string;
  importe: number;
  importeRestante: number;
  concepto: string;
  estado: 'concedida' | 'justificada' | 'cerrada';
  fechaConcesion: string;
  /** Publicada en la web del GDLP (solo si se marcó la casilla). */
  publicada?: boolean;
}

export interface DocumentoRequerido {
  id: string;
  nombre: string;
  tipo: string;
  aportado: boolean;
}

export type CategoriaGasto = 'factura' | 'iva' | 'tributos' | 'irm_igf' | 'operacion' | 'otro';

export interface GastoJustificable {
  id: string;
  concepto: string;
  importe: number;
  fecha: string;
  /** Categoría del gasto: factura (con su IVA/base), IVA, tributos, IRM/IGF… */
  categoria: CategoriaGasto;
  base?: number;
  iva?: number;
  facturaId?: string;
  transaccionId?: string;
  kind?: string;
  excluido?: boolean;
  justificado: boolean;
}

export interface JustificacionPago {
  id: string;
  gastoId: string;
  importe: number;
  fecha: string;
  transferenciaId: string;
  /** Desglose por categoría del pago justificado. */
  categorias?: { categoria: CategoriaGasto; importe: number }[];
}

export interface ReversionPago {
  id: string;
  gastoId: string;
  justificacionId?: string;
  importe: number;
  fecha: string;
  motivo: string;
  /** Si el dinero se devolvió al Banco/emisor con una transferencia real. */
  transferenciaId?: string;
}

export interface SubvencionDetalle extends SubvencionResumen {
  documentosRequeridos: DocumentoRequerido[];
  gastos: GastoJustificable[];
  justificaciones: JustificacionPago[];
  reversiones: ReversionPago[];
  /** Tipos de gasto excluibles (impuestos/comisiones) según el sistema real. */
  excluirTipos: string[];
  /** Tipos de transacción del banco que SÍ se pueden justificar (aptos). */
  tiposAptos: string[];
  /** Categorías de gasto que cubre esta subvención (vacío = todas). */
  categoriasCubiertas: CategoriaGasto[];
  /** Baremos automáticos para empresas que quieran optar. */
  baremos?: Baremo[];
  publicada?: boolean;
  publicadaEn?: string;
  bopUrl?: string;
}

/** Resumen por beneficiario (empresa o particular) de lo subvencionado/justificado. */
export interface BeneficiarioSubvenciones {
  id: string;            // EIP o DIP
  nombre: string;
  tipo: 'empresa' | 'particular';
  concedido: number;
  justificado: number;
  pendienteJustificar: number;
  devuelto: number;
  subvenciones: number;
  /** Todas las operaciones justificadas por este beneficiario (trazabilidad). */
  operaciones: {
    subvencionId: string;
    concepto: string;
    gastoId: string;
    categoria: CategoriaGasto;
    importe: number;
    fecha: string;
    justificacionId: string;
  }[];
}

export interface CampoTramite {
  id: string;
  etiqueta: string;
  tipo: 'texto' | 'numero' | 'fecha' | 'select' | 'textarea' | 'identidad' | 'cuenta' | 'reparto' | 'bono';
  requerido?: boolean;
  opciones?: string[];
  placeholder?: string;
}

export interface CuentaSugerencia {
  id: string;
  etiqueta: string;
  tipo: string;
}

export interface Baremo {
  id: string;
  descripcion: string;
  peso: number;
  /** Explicación de cómo se calcula/comprueba automáticamente. */
  descripcionCalculo?: string;
}

export interface RegimenBono {
  id: string;
  nombre: string;
  emisorEip: string;
  emisorNombre: string;
  presupuesto: number;
  maxPorPersona: number;
  baremos?: Baremo[];
  /** Requisitos que debe cumplir el solicitante (comprobables automáticamente). */
  requisitos?: RequisitoBono[];
  fechaLimite?: string;
  presupuestoUsado: number;
  adscritos: number;
  estado: 'activo' | 'cerrado';
}

/** Requisito de un bono, comprobable automáticamente contra datos reales. */
export interface RequisitoBono {
  id: string;
  descripcion: string;
  /** Magnitud que se evalúa (patrimonio, edad, nivel, cuentas, junior, fiscal). */
  tipo: 'patrimonio' | 'edad' | 'nivel' | 'cuentas' | 'junior' | 'fiscal';
  operador: '<' | '>' | '<=' | '>=' | '==';
  valor: number;
  /** Cómo se comprueba automáticamente (fuente de datos real). */
  explicacion: string;
}

export interface AdscripcionBono {
  dip: string;
  nombre: string;
  fechaAdscripcion: string;
  justificado: number;
}

export interface BonoDetalle extends RegimenBono {
  adscripciones: AdscripcionBono[];
  justificaciones: JustificacionPago[];
}

export interface CuentaBancaria {
  id: string;
  nombre: string;
  tipo: string;
  dip: string;
  saldo: number;
  estado: 'activa' | 'bloqueada' | 'cerrada';
  /** Las fundaciones no se pueden cerrar ni repartir. */
  esFundacion?: boolean;
  /** EIP de la entidad titular (cuentas Business). */
  eip?: string;
  /** Reparto % para cuentas de empresa (obligatorio antes de cerrar con fondos). */
  participaciones?: { dip: string; nombre: string; pct: number }[];
}

export interface TarjetaDigital {
  id: string;
  alias: string;
  accountId: string;
  tier: string;
  frozen: boolean;
  cardNumber: string;
  promoPhysical?: boolean;
  pin?: string;
  contactlessLimitPz?: number;
  weeklyLimitPz?: number;
}

export interface ActividadJunior {
  id: string;
  titulo: string;
  edadMin: number;
  edadMax: number;
  complejidad: string;
  precio: number; // Pz con IVA
  recompensa: number;
  estado: 'en_revision' | 'aprobada' | 'rechazada';
  colaborador: string;
  descripcion?: string;
  categoria?: string;
  tipo?: string;
  portadaUrl?: string;
  fechaPublicacion?: string | null;
  precioLicencia?: number;
  precioIntento?: number;
  subvencionada?: boolean;
  contenido?: Record<string, unknown>;
}

export interface CategoriaJunior { id: string; nombre: string; descripcion?: string; activa: boolean; orden: number; }
export interface BundleJunior { id: string; nombre: string; descripcion?: string; actividadIds: string[]; precioLicencia: number; precioIntento: number; publica: boolean; fechaPublicacion?: string | null; }
export interface EstadisticasJunior { actividadId?: string; actividad?: string; jugadas: number; completadas: number; comprasLicencia: number; comprasIntento: number; recompensas: number; ingresos: number; regalado: number; }
export interface FinanzasJunior { concepto: string; cantidad: number; tipo: 'facturado' | 'regalado'; origen: 'CAPITALIA' | 'PLACETA_JUNIOR'; fecha: string; referencia?: string; }

export interface ColaboradorJunior {
  dip: string;
  nombre: string;
  acuerdoFirmado: boolean;
  actividades: number;
  puntos: number;
}

export interface DiplomaJunior {
  id: string;
  dip: string;
  nombre: string;
  actividad: string;
  fecha: string;
}

export interface CodigoJunior {
  id: string;
  codigo: string;
  tipo: 'recarga' | 'un_uso' | 'actividades';
  valor: number;
  actividadIds: string[];
  estado: 'disponible' | 'canjeado' | 'revocado';
  dipVinculado: string | null;
  creadoEn: string;
  canjeadoEn: string | null;
  demo?: boolean;
}

export interface Subapartado {
  id: string;
  actividadId: string;
  titulo: string;
  orden: number;
  tipo: string;
  desbloqueado: boolean;
  recompensa: number;
  desbloqueo: string;
  contenido?: Record<string, unknown>;
}

export interface DashboardStats {
  expedientes: number;
  incidencias: number;
  incidenciasAbiertas: number;
  notificacionesNoLeidas: number;
  cnicVigentes: number;
  nominas: number;
  facturas: number;
  bloqueos500k: number;
  retribucionesPendientes: number;
  operacionesRetenidas: number;
  comprobaciones: number;
  comprobacionesInconsistencia: number;
}

export interface Filtros {
  q?: string;
  estado?: string;
}

/** Acciones que requieren doble factor (coincide con el backend dosfa). */
export const ACCIONES_CRITICAS = [
  'aprobar',
  'autorizar',
  'rechazar',
  'emitir_firma',
  'emitir_pago',
  'emitir',
  'cobrar',
  'ejecutar',
  'confirmar',
  'resolver',
  'anular',
] as const;

export type AccionCritica = (typeof ACCIONES_CRITICAS)[number];

export function esAccionCritica(accion: string): boolean {
  return (ACCIONES_CRITICAS as readonly string[]).includes(accion);
}

/* ── Participación democrática (votaciones, juntas, encuestas) ─────── */

export type RangoDemocratico = 'todos' | 'ciudadania_plena' | 'junior' | 'junta';

export interface Votacion {
  id: string; // VOT-2026-0001
  titulo: string;
  categoria: 'referendum' | 'eleccion' | 'consulta' | 'junta';
  descripcion: string;
  reunionId?: string; // junta vinculada (opcional)
  rango: RangoDemocratico;
  opciones: string[];
  estado: 'borrador' | 'abierta' | 'cerrada' | 'publicada';
  resultado?: 'aprobada' | 'rechazada' | null;
  aFavor: number;
  enContra: number;
  abstenciones: number;
  totalVotos: number;
  creadaEn: string;
  cerradaEn?: string;
  publicadaEn?: string;
  bopUrl?: string;
}

export interface VotoRegistro {
  id: string;
  votacionId: string;
  dip: string;
  voto: string; // opción elegida
  timestamp: string;
  esJunta: boolean; // los votos de la junta nunca se anonimizan
  anonimo: boolean; // true si ya pasó el plazo de anonimato (30 días)
}

export interface Junta {
  id: string; // JUN-2026-0001
  titulo: string;
  fecha: string;
  asistentes: string[];
  ordenDelDia: string[];
  votaciones: string[]; // ids de votaciones vinculadas
  acta: string; // texto del acta
  actaUrl?: string;
  estado: 'convocada' | 'celebrada' | 'acta_emitida';
}

export interface Encuesta {
  id: string; // ENC-2026-0001
  titulo: string;
  pregunta: string;
  opciones: string[];
  rango: RangoDemocratico;
  estado: 'borrador' | 'abierta' | 'cerrada' | 'publicada';
  respuestas: Record<string, number>; // opción -> nº de respuestas
  totalRespuestas: number;
  creadaEn: string;
  publicadaEn?: string;
  bopUrl?: string;
}

export const ANONIMATO_DIAS = 30;
