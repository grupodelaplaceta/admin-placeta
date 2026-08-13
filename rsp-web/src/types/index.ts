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
}

export interface FirmaCiudadano {
  id: string;
  documento: string;
  firmante: string;
  estado: 'pendiente' | 'completada';
  fecha?: string;
}

export interface Obligacion {
  id: string;
  tipo: 'tramite' | 'declaracion' | 'pago';
  titulo: string;
  estado: string;
  plazo?: string;
}

export interface EntidadDetalle extends Omit<EntidadRegistral, 'representantes'> {
  documentos: DocumentoCiudadano[];
  obligaciones: Obligacion[];
  representantes: { dip: string; nombre: string; cargo: string }[];
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
}

export interface DocumentoRequerido {
  id: string;
  nombre: string;
  tipo: string;
  aportado: boolean;
}

export interface GastoJustificable {
  id: string;
  concepto: string;
  importe: number;
  fecha: string;
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
}

export interface SubvencionDetalle extends SubvencionResumen {
  documentosRequeridos: DocumentoRequerido[];
  gastos: GastoJustificable[];
  justificaciones: JustificacionPago[];
  /** Tipos de gasto excluibles (impuestos/comisiones) según el sistema real. */
  excluirTipos: string[];
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
}

export interface RegimenBono {
  id: string;
  nombre: string;
  emisorEip: string;
  emisorNombre: string;
  presupuesto: number;
  maxPorPersona: number;
  baremos?: Baremo[];
  fechaLimite?: string;
  presupuestoUsado: number;
  adscritos: number;
  estado: 'activo' | 'cerrado';
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
}

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
