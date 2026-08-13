/* ═══════════════════════════════════════════════════════════════════════
   RSP Web · Contrato del proveedor de datos
   Toda la app consume este contrato. Hay dos implementaciones:
     - MockProvider (datos de demo en memoria, sin backend)
     - HttpProvider  (API JSON del backend admin-placeta)
   ═══════════════════════════════════════════════════════════════════════ */

import type {
  Session, DashboardStats, Tramite, Expediente, ContextoCiudadano,
  CiudadanoResumen, Notificacion, EventoAuditoria, CNICRegla, Operacion,
  EntidadRegistral, Filtros, Actuacion, TramiteDetalle, NuevoTramite,
  Contribuyente, ContribuyenteDetalle, DeclaracionResumen, DeclaracionDetalle,
  DocumentoCiudadano, FirmaCiudadano, Obligacion, EntidadDetalle,
  SubvencionResumen, SubvencionDetalle, Solicitud2FA, CuentaSugerencia,
  RegimenBono, BonoDetalle, Baremo, CuentaBancaria, TarjetaDigital,
  ActividadJunior, ColaboradorJunior, DiplomaJunior,
} from '../types';

export interface Provider {
  /** Autenticación con credenciales (DIP + contraseña). */
  login(dip: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  me(): Promise<Session | null>;

  dashboard(): Promise<DashboardStats>;

  // Bandeja de trabajo (trámites asignados/vencidos)
  bandeja(): Promise<Tramite[]>;

  // Trámites
  listarTramites(filtros?: Filtros): Promise<Tramite[]>;
  getTramite(id: string): Promise<TramiteDetalle>;
  crearTramite(datos: NuevoTramite): Promise<Tramite>;
  avanzarTramite(id: string, accion: string, datos?: Record<string, unknown>): Promise<void>;
  /** 2FA siempre por PlacetaID móvil: envía la petición de confirmación. */
  enviar2FA(objetoId: string, accion: string): Promise<Solicitud2FA>;
  /** Confirma la petición 2FA (equivale al webhook de PlacetaID móvil). */
  confirmar2FA(solicitudId: string): Promise<boolean>;

  // Subvenciones
  listarSubvenciones(filtros?: Filtros): Promise<SubvencionResumen[]>;
  getSubvencion(id: string): Promise<SubvencionDetalle>;
  concederSubvencion(datos: { emisorEip: string; receptorEip: string; importe: number; concepto: string }): Promise<SubvencionResumen>;
  requerirDocumentosSubvencion(id: string, documentos: string[]): Promise<void>;
  justificarPagoSubvencion(id: string, gastoIds: string[]): Promise<void>;

  // Banco
  listarCuentas(filtros?: Filtros): Promise<CuentaBancaria[]>;
  listarTarjetas(): Promise<TarjetaDigital[]>;
  accionCuenta(id: string, accion: 'bloquear' | 'desbloquear' | 'cerrar', datos?: { motivo?: string }): Promise<void>;
  cambiarTipoCuenta(id: string, nuevoTipo: string): Promise<void>;
  repartirCuenta(id: string): Promise<void>;
  abrirCuenta(datos: { nombre: string; dip: string; tipo: string; saldoInicial: number }): Promise<CuentaBancaria>;
  establecerLimiteTarjeta(id: string, limites: { contactlessLimitPz?: number; weeklyLimitPz?: number }): Promise<void>;
  congelarTarjeta(id: string, frozen: boolean): Promise<void>;

  // Placeta Junior
  listarActividadesJunior(): Promise<ActividadJunior[]>;
  listarColaboradoresJunior(): Promise<ColaboradorJunior[]>;
  listarDiplomasJunior(): Promise<DiplomaJunior[]>;

  // Bonificaciones (empresa → particular, bajo regímenes de bono)
  listarBonos(): Promise<RegimenBono[]>;
  getBono(id: string): Promise<BonoDetalle>;
  crearBono(datos: { nombre: string; emisorEip: string; presupuesto: number; maxPorPersona: number; fechaLimite?: string; baremos?: Baremo[] }): Promise<RegimenBono>;
  adscribirCiudadano(id: string, dip: string): Promise<void>;

  // Expedientes
  listarExpedientes(filtros?: Filtros): Promise<Expediente[]>;
  getExpediente(id: string): Promise<Expediente & { actuaciones: Actuacion[] }>;

  // Ciudadanos
  buscarCiudadanos(q: string): Promise<CiudadanoResumen[]>;
  contextoCiudadano(dip: string): Promise<ContextoCiudadano>;
  documentosDeCiudadano(dip: string): Promise<DocumentoCiudadano[]>;
  firmasDeCiudadano(dip: string): Promise<FirmaCiudadano[]>;
  obligacionesDeCiudadano(dip: string): Promise<Obligacion[]>;
  buscarCuentas(q: string): Promise<CuentaSugerencia[]>;
  actualizarCiudadano(dip: string, datos: { email?: string; telefono?: string }): Promise<void>;

  // Entidades
  listarEntidades(): Promise<EntidadRegistral[]>;
  getEntidad(eip: string): Promise<EntidadDetalle>;

  // Tributos
  listarContribuyentes(filtros?: Filtros): Promise<Contribuyente[]>;
  getContribuyente(id: string): Promise<ContribuyenteDetalle>;
  listarDeclaraciones(filtros?: Filtros): Promise<DeclaracionResumen[]>;
  getDeclaracion(id: string): Promise<DeclaracionDetalle>;
  accionDeclaracion(id: string, accion: string): Promise<void>;

  // Operaciones
  listarOperaciones(): Promise<Operacion[]>;

  // Auditoría
  listarAuditoria(filtros?: Filtros): Promise<EventoAuditoria[]>;

  // Notificaciones
  listarNotificaciones(): Promise<Notificacion[]>;
  marcarLeida(id: string): Promise<void>;

  // Normativa
  listarCNIC(): Promise<CNICRegla[]>;
  refrescarNormativa(): Promise<{ sincronizado: boolean; total: number; fuente: string }>;
  crearVersionCNIC(datos: { codigo: string; valor: string | number; motivo: string }): Promise<CNICRegla>;
}
