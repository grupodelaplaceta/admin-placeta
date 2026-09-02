/* ═══════════════════════════════════════════════════════════════════════
   RSP Web · Proveedor HTTP (backend real admin-placeta)
   Mapea el contrato del Provider a las APIs JSON del backend.
   Nota: el backend actual sirve vistas EJS en GET; para el modo live es
   necesario exponer los equivalentes JSON (contrato descrito en README).
   ═══════════════════════════════════════════════════════════════════════ */

import { http } from './client';
import type { Provider } from './provider';
import type {
  Session, DashboardStats, Tramite, Expediente, ContextoCiudadano,
  CiudadanoResumen, Notificacion, EventoAuditoria, CNICRegla, Operacion,
  EntidadRegistral, Filtros, Actuacion, TramiteDetalle, NuevoTramite,
  Contribuyente, ContribuyenteDetalle, DeclaracionResumen, DeclaracionDetalle,
  CicloFacturacion, PlanCierre,
  DocumentoCiudadano, FirmaCiudadano, Obligacion, EntidadDetalle,
  SubvencionResumen, SubvencionDetalle, Solicitud2FA, CuentaSugerencia,
  RegimenBono, BonoDetalle, CuentaBancaria, TarjetaDigital,
  ActividadJunior, ColaboradorJunior, DiplomaJunior, CodigoJunior, Subapartado, CategoriaJunior, BundleJunior, EstadisticasJunior, FinanzasJunior,
  FacturaEmitida, Nomina,
  Votacion, VotoRegistro, Junta, Encuesta,
  BopDocumento,
} from '../types';

function qs(f?: Filtros): string {
  if (!f) return '';
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.estado) p.set('estado', f.estado);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const httpProvider: Provider = {
  async login(dip, password) {
    return http.post<Session>('/login', { dip, password });
  },
  async iniciarPlacetaID() {
    return http.post<{ redirect: string }>('/login/placetaid', {});
  },
  async logout() {
    await http.post<void>('/logout');
  },
  async me() {
    try {
      return await http.get<Session>('/api/sesion');
    } catch {
      return null;
    }
  },
  async dashboard() {
    return http.get<DashboardStats>('/api/dashboard');
  },
  async bandeja() {
    return http.get<Tramite[]>('/rsp/tramites/api/bandeja');
  },
  async listarTramites(f) {
    return http.get<Tramite[]>(`/rsp/tramites/api${qs(f)}`);
  },
  async getTramite(id) {
    return http.get<TramiteDetalle>(`/rsp/tramites/api/${id}`);
  },
  async crearTramite(datos: NuevoTramite) {
    return http.post<Tramite>('/rsp/tramites/api', datos);
  },
  async avanzarTramite(id, accion, datos) {
    return http.post<void>(`/rsp/tramites/api/${id}/accion`, { accion, ...datos });
  },
  async enviar2FA(objetoId, accion) {
    return http.post<Solicitud2FA>('/rsp/tramites/api/2fa/enviar', { objetoId, accion });
  },
  async confirmar2FA(solicitudId) {
    return http.get<boolean>(`/rsp/tramites/api/2fa/estado/${solicitudId}`);
  },
  async listarExpedientes(f) {
    return http.get<Expediente[]>(`/rsp/expedientes/api${qs(f)}`);
  },
  async getExpediente(id) {
    return http.get<Expediente & { actuaciones: Actuacion[] }>(`/rsp/expedientes/api/${id}`);
  },
  async buscarCiudadanos(q) {
    return http.get<CiudadanoResumen[]>(`/rsp/api/ciudadanos?q=${encodeURIComponent(q)}`);
  },
  async contextoCiudadano(dip) {
    return http.get<ContextoCiudadano>(`/rsp/api/contexto/${dip}`);
  },
  async listarEntidades() {
    return http.get<EntidadRegistral[]>('/rsp/api/entidades');
  },
  async listarOperaciones() {
    return http.get<Operacion[]>('/rsp/operaciones/api');
  },
  async revertirOperacion(id) {
    return http.post<void>(`/rsp/operaciones/api/${id}/revertir`);
  },
  // ── Votaciones / Juntas / Encuestas ──────────────────────────────
  async listarVotaciones() {
    return http.get<Votacion[]>('/rsp/votaciones/api');
  },
  async getVotacion(id) {
    return http.get<Votacion & { votos: VotoRegistro[] }>(`/rsp/votaciones/api/${id}`);
  },
  async crearVotacion(datos) {
    return http.post<Votacion>('/rsp/votaciones/api', datos);
  },
  async editarVotacion(id, datos) {
    return http.post<void>(`/rsp/votaciones/api/${id}`, datos);
  },
  async cerrarVotacion(id) {
    return http.post<void>(`/rsp/votaciones/api/${id}/cerrar`);
  },
  async publicarVotacion(id) {
    return http.post<void>(`/rsp/votaciones/api/${id}/publicar`);
  },
  async listarVotos(id) {
    return http.get<VotoRegistro[]>(`/rsp/votaciones/api/${id}/votos`);
  },
  async listarJuntas() {
    return http.get<Junta[]>('/rsp/juntas/api');
  },
  async getJunta(id) {
    return http.get<Omit<Junta, 'votaciones'> & { votaciones: Votacion[] }>(`/rsp/juntas/api/${id}`);
  },
  async crearJunta(datos) {
    return http.post<Junta>('/rsp/juntas/api', datos);
  },
  async emitirActa(id, acta) {
    return http.post<void>(`/rsp/juntas/api/${id}/acta`, { acta });
  },
  async listarEncuestas() {
    return http.get<Encuesta[]>('/rsp/encuestas/api');
  },
  async crearEncuesta(datos) {
    return http.post<Encuesta>('/rsp/encuestas/api', datos);
  },
  async publicarEncuesta(id) {
    return http.post<void>(`/rsp/encuestas/api/${id}/publicar`);
  },
  async listarAuditoria(f) {
    return http.get<EventoAuditoria[]>(`/rsp/auditoria/api${qs(f)}`);
  },
  async listarNotificaciones() {
    return http.get<Notificacion[]>('/api/notificaciones/mis');
  },
  async marcarLeida(id) {
    return http.post<void>(`/api/notificaciones/${id}/leida`, { leida: true });
  },
  async listarCNIC() {
    return http.get<CNICRegla[]>('/rsp/normativo/api');
  },
  async refrescarNormativa() {
    return http.post<{ sincronizado: boolean; total: number; fuente: string }>('/rsp/normativo/api/refresh');
  },
  async crearVersionCNIC(datos) {
    return http.post<CNICRegla>('/rsp/normativo/api/version', datos);
  },
  async aprobarCNIC(codigo) {
    return http.post<void>(`/rsp/normativo/api/${encodeURIComponent(codigo)}/aprobar`);
  },
  async listarBopDocumentos() {
    return http.get<BopDocumento[]>('/rsp/normativo/documentos');
  },
  async guardarBopDocumento(datos) {
    return http.post<BopDocumento>('/rsp/normativo/documentos', datos);
  },
  async aprobarBopDocumento(id) {
    return http.post<void>(`/rsp/normativo/documentos/${encodeURIComponent(id)}/aprobar`);
  },
  // ── Tributos ────────────────────────────────────────────────────────
  async listarContribuyentes(f) {
    return http.get<Contribuyente[]>(`/rsp/tributos/api/contribuyentes${qs(f)}`);
  },
  async getContribuyente(id) {
    return http.get<ContribuyenteDetalle>(`/rsp/tributos/api/contribuyentes/${id}`);
  },
  async listarDeclaraciones(f) {
    return http.get<DeclaracionResumen[]>(`/rsp/tributos/api/declaraciones${qs(f)}`);
  },
  async getDeclaracion(id) {
    return http.get<DeclaracionDetalle>(`/rsp/tributos/api/declaraciones/${id}`);
  },
  async accionDeclaracion(id, accion) {
    return http.post<void>(`/rsp/tributos/api/declaraciones/${id}/${accion}`);
  },
  // ── Facturación central (RSP + Banco) ───────────────────────────────
  async cicloFacturacion(mes) {
    const q = mes ? `?mes=${encodeURIComponent(mes)}` : '';
    return http.get<CicloFacturacion>(`/rsp/facturacion/api/ciclo${q}`);
  },
  async emitirCicloFacturacion(mes) {
    return http.post<{ ok: boolean; mes: string; persistidos: number }>('/rsp/facturacion/api/emitir', { mes });
  },
  async cierreFacturacion(mes, ejecutar = false) {
    return http.post<{ ok: boolean; mes: string; ejecutar: boolean; accesoBanco: boolean; plan: PlanCierre; resultados: never[] }>('/rsp/facturacion/api/cierre', { mes, ejecutar });
  },
  async cambiarEstadoRecibo(id, mes, estado) {
    return http.post<{ ok: boolean }>(`/rsp/facturacion/api/${encodeURIComponent(id)}/estado`, { estado, mes });
  },
  // ── Detalle de ciudadano / entidad ────────────────────────────────────
  async documentosDeCiudadano(dip) {
    return http.get<DocumentoCiudadano[]>(`/rsp/api/ciudadanos/${dip}/documentos`);
  },
  async firmasDeCiudadano(dip) {
    return http.get<FirmaCiudadano[]>(`/rsp/api/ciudadanos/${dip}/firmas`);
  },
  async obligacionesDeCiudadano(dip) {
    return http.get<Obligacion[]>(`/rsp/api/ciudadanos/${dip}/obligaciones`);
  },
  async buscarCuentas(q) {
    return http.get<CuentaSugerencia[]>(`/rsp/api/cuentas/buscar?q=${encodeURIComponent(q)}`);
  },
  async actualizarCiudadano(dip, datos) {
    return http.post<void>(`/rsp/api/ciudadanos/${dip}`, datos);
  },
  async migrarJunior(dip, nombre, tutorDip) {
    return http.post<{ success: boolean; requiereTutor?: boolean; requiereFirma?: boolean; tramite: Record<string, unknown>; expediente: Record<string, unknown>; firmas?: Array<{ id: string; titulo: string; tipo: string; contenido?: string; enviado?: boolean }> }>('/rsp/normativo/api/migrar-junior', { dip, nombre, tutorDip });
  },
  async getEntidad(eip) {
    return http.get<EntidadDetalle>(`/rsp/api/entidades/${eip}`);
  },
  // ── Subvenciones ────────────────────────────────────────────────────
  async listarSubvenciones(f) {
    return http.get<SubvencionResumen[]>(`/rsp/subvenciones/api${qs(f)}`);
  },
  async getSubvencion(id) {
    return http.get<SubvencionDetalle>(`/rsp/subvenciones/api/${id}`);
  },
  async concederSubvencion(datos) {
    return http.post<SubvencionResumen>('/rsp/subvenciones/api/conceder', datos);
  },
  async requerirDocumentosSubvencion(id, documentos) {
    return http.post<void>(`/rsp/subvenciones/api/${id}/requerir-documentos`, { documentos });
  },
  async justificarPagoSubvencion(id, gastoIds) {
    return http.post<void>(`/rsp/subvenciones/api/${id}/justificar`, { gastoIds });
  },
  // ── Banco ─────────────────────────────────────────────────────────
  async listarCuentas(f) {
    return http.get<CuentaBancaria[]>(`/rsp/banco/api/cuentas${qs(f)}`);
  },
  async listarTarjetas() {
    return http.get<TarjetaDigital[]>('/rsp/banco/api/tarjetas');
  },
  async accionCuenta(id, accion, datos) {
    return http.post<void>(`/rsp/banco/api/cuentas/${id}/${accion}`, datos ?? {});
  },
  async cambiarTipoCuenta(id, nuevoTipo) {
    return http.post<void>(`/rsp/banco/api/cuentas/${id}/tipo`, { tipo: nuevoTipo });
  },
  async repartirCuenta(id) {
    return http.post<void>(`/rsp/banco/api/cuentas/${id}/repartir`);
  },
  async abrirCuenta(datos) {
    return http.post<CuentaBancaria>('/rsp/banco/api/cuentas', datos);
  },
  async establecerLimiteTarjeta(id, limites) {
    return http.post<void>(`/rsp/banco/api/tarjetas/${id}/limites`, limites);
  },
  async congelarTarjeta(id, frozen) {
    return http.post<void>(`/rsp/banco/api/tarjetas/${id}/${frozen ? 'congelar' : 'reactivar'}`);
  },
  // ── Placeta Junior ─────────────────────────────────────────────────
  async listarActividadesJunior() {
    return http.get<ActividadJunior[]>('/rsp/junior/api/actividades');
  },
  async listarColaboradoresJunior() {
    return http.get<ColaboradorJunior[]>('/rsp/junior/api/colaboradores');
  },
  async listarDiplomasJunior() {
    return http.get<DiplomaJunior[]>('/rsp/junior/api/diplomas');
  },
  async cambiarEstadoActividadJunior(id: string, estado: 'aprobada' | 'rechazada' | 'en_revision') {
    return http.post<void>(`/rsp/junior/api/actividades/${id}/estado`, { estado });
  },
  async crearActividadJunior(datos) { return http.post<ActividadJunior>('/rsp/junior/api/actividades', datos); },
  async editarActividadJunior(id, datos) { await http.post<void>(`/rsp/junior/api/actividades/${id}`, datos); },
  async listarCategoriasJunior() { return http.get<CategoriaJunior[]>('/rsp/junior/api/categorias'); },
  async crearCategoriaJunior(datos) { return http.post<CategoriaJunior>('/rsp/junior/api/categorias', datos); },
  async listarBundlesJunior() { return http.get<BundleJunior[]>('/rsp/junior/api/bundles'); },
  async crearBundleJunior(datos) { return http.post<BundleJunior>('/rsp/junior/api/bundles', datos); },
  async editarBundleJunior(id, datos) { await http.post<void>(`/rsp/junior/api/bundles/${id}`, datos); },
  async listarEstadisticasJunior() { return http.get<EstadisticasJunior[]>('/rsp/junior/api/estadisticas'); },
  async listarFinanzasJunior() { return http.get<FinanzasJunior[]>('/rsp/junior/api/finanzas'); },
  async listarCodigosJunior() {
    return http.get<CodigoJunior[]>('/rsp/junior/api/codigos');
  },
  async crearCodigoJunior(datos) {
    return http.post<CodigoJunior>('/rsp/junior/api/codigos', datos);
  },
  async accionCodigoJunior(id, accion) {
    return http.post<void>(`/rsp/junior/api/codigos/${id}/accion`, { accion });
  },
  async listarSubapartados(actividadId) {
    return http.get<Subapartado[]>(`/rsp/junior/api/actividades/${actividadId}/subapartados`);
  },
  async crearSubapartado(actividadId, datos) {
    return http.post<Subapartado>(`/rsp/junior/api/actividades/${actividadId}/subapartados`, datos);
  },
  async desbloquearSubapartado(actividadId, subId) {
    return http.post<void>(`/rsp/junior/api/actividades/${actividadId}/subapartados/${subId}/desbloquear`);
  },
  async editarEntidad(eip, datos) {
    return http.post<void>(`/rsp/api/entidades/${eip}`, datos);
  },
  async listarFacturasEntidad(eip) {
    return http.get<FacturaEmitida[]>(`/rsp/api/entidades/${eip}/facturas`);
  },
  async listarNominas() {
    return http.get<Nomina[]>('/rsp/nominas/api');
  },
  async crearNomina(datos) {
    return http.post<Nomina>('/rsp/nominas/api', datos);
  },
  // ── Bonificaciones ─────────────────────────────────────────────────
  async listarBonos() {
    return http.get<RegimenBono[]>('/rsp/bonos/api');
  },
  async getBono(id) {
    return http.get<BonoDetalle>(`/rsp/bonos/api/${id}`);
  },
  async crearBono(datos) {
    return http.post<RegimenBono>('/rsp/bonos/api', datos);
  },
  async adscribirCiudadano(id, dip) {
    return http.post<void>(`/rsp/bonos/api/${id}/adscribir`, { dip });
  },
};
