/**
 * Contexto Único del ciudadano (FASE 0.4 / 2.6)
 * -------------------------------------------------
 * Agrega de forma FEDERADA (vía APIs, sin mega-BD) la información de un DIP:
 *   Identidad  -> PlacetaID + Supabase (solicitantes) + rsp_bajas
 *   Bancario   -> backend-banco (apiBancoGetState) acotado al titular
 *   Fiscalidad -> rsp_retribuciones, rsp_desgravaciones, rsp_nominas, tributos
 *   Patrimonio -> rsp_activos, rsp_titularidades, rsp_participaciones
 *   Expedientes-> rsp_expedientes, rsp_tramites, rsp_incidencias
 *   Notificaciones -> rsp_notificaciones
 * Cada fuente falla de forma aislada (nunca rompe el resto).
 */
import { supabase } from './supabase.js';
import { apiBancoGetState, apiPlacetaidRegistros, sbFindSolicitanteByDip, sbGetContribuyente } from './db.js';
import { resolverCiudadano } from './registro-maestro.js';

async function sbQuery(table, column, value, limit = 50) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(column, value)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function getContextoCiudadano(dip) {
  const DIP = String(dip || '').trim().toUpperCase();
  const fuentes = { ok: [], error: [] };
  const resultado = { dip: DIP, generadoEn: new Date().toISOString() };

  // ── Identidad (registro maestro + PlacetaID + Supabase) ────────────────
  const identidad = {};
  try {
    const maestro = await resolverCiudadano(DIP);
    if (maestro) {
      identidad.maestro = {
        dip: maestro.dip,
        placetaId: maestro.placeta_id,
        nombre: maestro.nombre || null,
        estado: maestro.estado || 'activo',
        nivel: maestro.nivel || 'N1',
        cuentaPrincipal: maestro.cuenta_principal || null,
        canalPreferido: maestro.canal_preferido || null,
        tributosCensado: !!maestro.tributos_censado,
        fuente: maestro.fuente || null
      };
    }
    const solicitante = await sbFindSolicitanteByDip(DIP);
    if (solicitante) {
      identidad.solicitante = {
        dip: solicitante.dip,
        nombre: solicitante.nombre || solicitante.nombre_completo || null,
        email: solicitante.email || null,
        estado: solicitante.estado || null,
        rol: solicitante.rol || null
      };
    }
    const registros = await apiPlacetaidRegistros();
    const reg = (registros || []).find((r) => String(r.dip || '').toUpperCase() === DIP);
    if (reg) {
      identidad.placetaid = {
        registroId: reg.registroId || reg._id || null,
        dip: reg.dip,
        nombreCompleto: reg.nombreCompleto || `${reg.nombre || ''} ${reg.apellidos || ''}`.trim() || null,
        rol: reg.rol || null,
        activo: reg.activo !== false,
        bloqueado: !!reg.bloqueado
      };
    }
    const bajas = await sbQuery('rsp_bajas', 'dip', DIP, 1);
    if (bajas.length) identidad.baja = { estado: bajas[0].estado, fechaBaja: bajas[0].fecha_baja || null };
    fuentes.ok.push('identidad');
  } catch (e) { fuentes.error.push('identidad'); }

  // ── Bancario (solo del titular, vía API real) ───────────────────────────
  const bancario = { usuario: null, cuentas: [], movimientos: [], saldoTotalPz: 0 };
  try {
    const state = await apiBancoGetState();
    if (state) {
      const user = (state.users || []).find((u) => String(u.dip || '').toUpperCase() === DIP);
      if (user) {
        const placetaId = user.placetaId || user.dip;
        const holderIds = (state.accountHolders || [])
          .filter((h) => String(h.placetaId || '').toUpperCase() === String(placetaId).toUpperCase())
          .map((h) => h.accountId);
        const cuentas = (state.accounts || []).filter((a) =>
          a &&
          (String(a.placetaId || '').toUpperCase() === String(placetaId).toUpperCase() ||
            (user.primaryAccountId && a.id === user.primaryAccountId) ||
            holderIds.includes(a.id))
        );
        bancario.usuario = {
          dip: user.dip, placetaId, displayName: user.displayName || null,
          censado: !!user.tributosCensusDate, eip: user.eip || null
        };
        bancario.cuentas = cuentas.map((a) => ({
          id: a.id, displayName: a.displayName || 'Cuenta', type: a.type || 'Current',
          balancePz: a.balancePz ?? 0, iban: a.iban || null, eip: a.eip || null,
          complianceStatus: a.complianceStatus || 'Clear'
        }));
        bancario.saldoTotalPz = bancario.cuentas.reduce((s, c) => s + (c.balancePz || 0), 0);
        const ids = new Set(cuentas.map((c) => c.id));
        bancario.movimientos = (state.transactions || [])
          .filter((t) => t && (ids.has(t.fromAccountId) || ids.has(t.toAccountId)))
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
          .slice(0, 20)
          .map((t) => ({
            id: t.id, kind: t.kind || 'Transfer', amountPz: t.amountPz ?? t.netAmount ?? 0,
            concept: t.concept || t.note || '', status: t.status || 'Settled',
            esEntrada: ids.has(t.toAccountId), createdAt: t.createdAt || null
          }));
        fuentes.ok.push('bancario');
      } else {
        fuentes.error.push('bancario (sin titular en el banco)');
      }
    } else {
      fuentes.error.push('bancario');
    }
  } catch (e) { fuentes.error.push('bancario'); }

  // ── Fiscalidad ──────────────────────────────────────────────────────────
  const fiscalidad = {};
  try {
    fiscalidad.retribuciones = (await sbQuery('rsp_retribuciones', 'beneficiario_dip', DIP)).map((r) => ({
      id: r.id, mes: r.mes, entidad: r.entidad_nombre || null,
      cuantiaMensual: r.cuantia_mensual ?? 0, estado: r.estado, porcentaje: r.porcentaje_participacion ?? 0
    }));
    fiscalidad.desgravaciones = (await sbQuery('rsp_desgravaciones', 'titular_dip', DIP)).map((d) => ({
      id: d.id, tipo: d.tipo, ejercicio: d.ejercicio, cuantia: d.cuantia ?? 0, estado: d.estado
    }));
    fiscalidad.nominas = (await sbQuery('rsp_nominas', 'trabajador_dip', DIP)).map((n) => ({
      id: n.id, periodo: n.periodo, entidad: n.entidad_nombre || null,
      bruto: n.bruto ?? 0, neto: n.neto ?? 0, estado: n.estado
    }));
    if (bancario.usuario) {
      const contribuyente = await sbGetContribuyente(bancario.usuario.placetaId);
      fiscalidad.tributos = contribuyente
        ? { placetaId: contribuyente.placetaId, tipo: contribuyente.tipo_contribucion || null, eip: contribuyente.eip || null }
        : null;
    }
    fuentes.ok.push('fiscalidad');
  } catch (e) { fuentes.error.push('fiscalidad'); }

  // ── Patrimonio ──────────────────────────────────────────────────────────
  const patrimonio = {};
  try {
    patrimonio.activos = (await sbQuery('rsp_activos', 'propietario_dip', DIP)).map((a) => ({
      id: a.id, tipo: a.tipo, nombre: a.nombre, valor: a.valor ?? 0,
      valorFiscal: a.valor_fiscal ?? 0, deudaAsociada: a.deuda_asociada ?? 0,
      porcentajeTitularidad: a.porcentaje_titularidad ?? 100
    }));
    patrimonio.titularidades = (await sbQuery('rsp_titularidades', 'titular_dip', DIP)).map((t) => ({
      id: t.id, cuentaId: t.cuenta_id, porcentaje: t.porcentaje ?? 0, tipo: t.tipo, vigente: t.vigente !== false
    }));
    patrimonio.participaciones = (await sbQuery('rsp_participaciones', 'titular_dip', DIP)).map((p) => ({
      id: p.id, entidad: p.entidad_nombre || null, porcentaje: p.porcentaje ?? 0,
      patrimonioAtribuible: p.patrimonio_atribuible ?? 0
    }));
    patrimonio.totalActivos = patrimonio.activos.reduce((s, a) => s + (a.valorFiscal || 0), 0);
    fuentes.ok.push('patrimonio');
  } catch (e) { fuentes.error.push('patrimonio'); }

  // ── Expedientes y trámites ──────────────────────────────────────────────
  const expedientes = {};
  try {
    expedientes.expedientes = (await sbQuery('rsp_expedientes', 'persona_dip', DIP)).map((x) => ({
      id: x.id, titulo: x.titulo, tipo: x.tipo || 'general', estado: x.estado,
      prioridad: x.prioridad || 'normal', actualizado: x.updated_at || null
    }));
    expedientes.tramites = (await sbQuery('rsp_tramites', 'solicitante_dip', DIP)).map((t) => ({
      id: t.id, tipo: t.tipo, titulo: t.titulo, estado: t.estado, expedienteId: t.expediente_id || null
    }));
    expedientes.incidencias = (await sbQuery('rsp_incidencias', 'usuario_dip', DIP)).map((i) => ({
      id: i.id, titulo: i.titulo, servicio: i.servicio, estado: i.estado, gravedad: i.gravedad || 'media'
    }));
    fuentes.ok.push('expedientes');
  } catch (e) { fuentes.error.push('expedientes'); }

  // ── Notificaciones ───────────────────────────────────────────────────────
  try {
    expedientes.notificaciones = (await sbQuery('rsp_notificaciones', 'destinatario_dip', DIP)).map((n) => ({
      id: n.id, nivel: n.nivel || 'info', titulo: n.titulo, mensaje: n.mensaje || null,
      servicio: n.servicio || null, leida: !!n.leida, fecha: n.fecha || n.created_at || null
    }));
    fuentes.ok.push('notificaciones');
  } catch (e) { fuentes.error.push('notificaciones'); }

  resultado.identidad = identidad;
  resultado.bancario = bancario;
  resultado.fiscalidad = fiscalidad;
  resultado.patrimonio = patrimonio;
  resultado.expedientes = expedientes;
  resultado._fuentes = fuentes;
  return resultado;
}
