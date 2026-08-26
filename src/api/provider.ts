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
  ActividadJunior, ColaboradorJunior, DiplomaJunior, CodigoJunior, Subapartado,
  FacturaEmitida, ParticipacionEmpresa, Nomina,
  Votacion, VotoRegistro, Junta, Encuesta, RequisitoBono,
  BopDocumento,
} from '../types';

export interface Provider {
  /** Autenticación con credenciales (DIP + contraseña). */
  login(dip: string, password: string): Promise<Session>;
  /** Inicia el SSO con PlacetaID móvil: devuelve la URL a la que redirigir. */
  iniciarPlacetaID(): Promise<{ redirect: string }>;
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
  concederSubvencion(datos: { emisorEip: string; receptorEip: string; importe: number; concepto: string; tiposAptos?: string[]; publicada?: boolean; baremos?: Baremo[] }): Promise<SubvencionResumen>;
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
  cambiarEstadoActividadJunior(id: string, estado: 'aprobada' | 'rechazada' | 'en_revision'): Promise<void>;

  // Códigos Junior (recarga + actividades)
  listarCodigosJunior(): Promise<CodigoJunior[]>;
  crearCodigoJunior(datos: { tipo: 'recarga' | 'actividades'; valor?: number; actividadIds?: string[]; codigo?: string }): Promise<CodigoJunior>;
  accionCodigoJunior(id: string, accion: 'revocar' | 'desvincular'): Promise<void>;

  // Subapartados de actividades (diapositivas progresivas)
  listarSubapartados(actividadId: string): Promise<Subapartado[]>;
  crearSubapartado(actividadId: string, datos: { titulo: string; tipo?: string; recompensa?: number }): Promise<Subapartado>;
  desbloquearSubapartado(actividadId: string, subId: string): Promise<void>;

  // Entidades: edición y facturas
  editarEntidad(eip: string, datos: { nombre?: string; participaciones?: ParticipacionEmpresa[] }): Promise<void>;
  listarFacturasEntidad(eip: string): Promise<FacturaEmitida[]>;

  // Nóminas
  listarNominas(): Promise<Nomina[]>;
  crearNomina(datos: { dip: string; nombre?: string; periodo?: string; bruto: number; retenciones?: number; neto?: number; cuentaBanco?: string }): Promise<Nomina>;

  // Bonificaciones (empresa → particular, bajo regímenes de bono)
  listarBonos(): Promise<RegimenBono[]>;
  getBono(id: string): Promise<BonoDetalle>;
  crearBono(datos: { nombre: string; emisorEip: string; presupuesto: number; maxPorPersona: number; fechaLimite?: string; baremos?: Baremo[]; requisitos?: RequisitoBono[] }): Promise<RegimenBono>;
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
  actualizarCiudadano(dip: string, datos: { email?: string; telefono?: string; nombre?: string }): Promise<void>;
  migrarJunior(dip: string, nombre?: string, tutorDip?: string): Promise<{ success: boolean; requiereTutor?: boolean; requiereFirma?: boolean; tramite: Record<string, unknown>; expediente: Record<string, unknown> }>;

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
  revertirOperacion(id: string): Promise<void>;

  // Votaciones (por rangos democráticos, vía PlacetaID)
  listarVotaciones(): Promise<Votacion[]>;
  getVotacion(id: string): Promise<Votacion & { votos: VotoRegistro[] }>;
  crearVotacion(datos: { titulo: string; categoria: string; descripcion: string; rango: string; opciones: string[]; reunionId?: string }): Promise<Votacion>;
  editarVotacion(id: string, datos: { titulo?: string; categoria?: string; descripcion?: string; rango?: string; opciones?: string[] }): Promise<void>;
  cerrarVotacion(id: string): Promise<void>;
  publicarVotacion(id: string): Promise<void>;
  listarVotos(id: string): Promise<VotoRegistro[]>;

  // Juntas
  listarJuntas(): Promise<Junta[]>;
  getJunta(id: string): Promise<Omit<Junta, 'votaciones'> & { votaciones: Votacion[] }>;
  crearJunta(datos: { titulo: string; fecha: string; asistentes: string[]; ordenDelDia: string[]; votaciones: string[] }): Promise<Junta>;
  emitirActa(id: string, acta: string): Promise<void>;

  // Encuestas
  listarEncuestas(): Promise<Encuesta[]>;
  crearEncuesta(datos: { titulo: string; pregunta: string; opciones: string[]; rango: string }): Promise<Encuesta>;
  publicarEncuesta(id: string): Promise<void>;

  // Auditoría
  listarAuditoria(filtros?: Filtros): Promise<EventoAuditoria[]>;

  // Notificaciones
  listarNotificaciones(): Promise<Notificacion[]>;
  marcarLeida(id: string): Promise<void>;

  // Normativa
  listarCNIC(): Promise<CNICRegla[]>;
  refrescarNormativa(): Promise<{ sincronizado: boolean; total: number; fuente: string }>;
  crearVersionCNIC(datos: { codigo: string; valor: string | number; motivo: string }): Promise<CNICRegla>;
  aprobarCNIC(codigo: string): Promise<void>;
  listarBopDocumentos(): Promise<BopDocumento[]>;
  guardarBopDocumento(datos: { codigo: string; titulo: string; tipo: string; categoria: string; contenidoMd: string; notasCambio: string; cnicRefs: { codigo: string; etiqueta: string }[] }): Promise<BopDocumento>;
  aprobarBopDocumento(id: string): Promise<void>;
}
