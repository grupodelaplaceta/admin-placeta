/**
 * BORRADOR FISCAL + AUDITORÍA CIUDADANA (FASE 9)
 * ----------------------------------------------
 * 9.1 GET /rsp/api/borrador-fiscal/:dip — borrador calculado desde el
 *     Contexto Único (bancario + fiscalidad + patrimonio) con estado
 *     `borrador | confirmada | corregida | presentada` y trazabilidad CNIC.
 * 9.2 GET /rsp/api/auditoria/:dip — quién vio o alteró mis datos.
 */
import { supabase } from './supabase.js';
import { getContextoCiudadano } from './contexto.js';
import { getSnapshotMeta } from './normativa-dinamica.js';

const TABLA = 'rsp_tributos_borradores';

/** Calcula el borrador fiscal de un DIP desde el Contexto Único. */
export async function calcularBorrador(dip, periodo = new Date().toISOString().slice(0, 4)) {
  const ctx = await getContextoCiudadano(dip);
  const banco = ctx.bancario || {};
  const pat = ctx.patrimonio || {};
  const fis = ctx.fiscalidad || {};

  const patrimonioTotal = banco.saldoTotalPz + (pat.totalActivos || 0);
  const retribucionesMes = (fis.retribuciones || []).filter(r => r.estado !== 'denegada').reduce((s, r) => s + (r.cuantiaMensual || 0), 0);

  const contenido = {
    dip,
    periodo,
    patrimonioBancario: banco.saldoTotalPz,
    activosDeclarados: pat.totalActivos || 0,
    patrimonioTotal,
    retribucionesMes,
    censado: !!ctx.identidad?.maestro?.tributosCensado || !!banco.usuario?.censado,
    nivel: ctx.identidad?.maestro?.nivel || 'N1',
    cuentas: (banco.cuentas || []).map(c => ({ id: c.id, saldo: c.balancePz, tipo: c.type })),
    flagsCumplimiento: (ctx.expedientes?.notificaciones || []).length,
    generadoEn: new Date().toISOString()
  };

  // Trazabilidad CNIC (FASE 5.6): qué versión de normativa se usó
  const cnic = {
    IVA: getSnapshotMeta('IVA'),
    limitePersonal: getSnapshotMeta('LIMITE_PERSONAL'),
    maxRetribucion: getSnapshotMeta('MAX_RETRIBUCION_MENSUAL')
  };

  // Estado persistido (o 'borrador' por defecto)
  let estado = 'borrador';
  let confirmadaEn = null, presentadaEn = null;
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA).select('*').eq('dip', dip).eq('periodo', periodo).maybeSingle();
      if (data) {
        estado = data.estado || 'borrador';
        confirmadaEn = data.confirmada_en || null;
        presentadaEn = data.presentada_en || null;
        // Si fue corregida, recombinar contenido guardado con el calculado
        if (data.contenido && typeof data.contenido === 'object') {
          contenido.correcciones = data.contenido.correcciones || null;
        }
      }
    } catch { /* memoria */ }
  }

  return { dip, periodo, estado, confirmadaEn, presentadaEn, contenido, cnic };
}

/** Actualiza el estado del borrador (confirmada/corregida/presentada). */
export async function setBorradorEstado(dip, estado, { periodo = new Date().toISOString().slice(0, 4), contenido = null } = {}) {
  const validos = ['borrador', 'confirmada', 'corregida', 'presentada'];
  if (!validos.includes(estado)) throw new Error(`Estado inválido: ${estado}`);
  if (!supabase) throw new Error('Supabase no disponible');
  const ahora = new Date().toISOString();
  const fila = {
    dip, periodo, estado,
    contenido: contenido || {},
    cnic_version: { IVA: getSnapshotMeta('IVA'), limitePersonal: getSnapshotMeta('LIMITE_PERSONAL') },
    confirmada_en: estado === 'confirmada' ? ahora : null,
    presentada_en: estado === 'presentada' ? ahora : null,
    updated_at: ahora
  };
  await supabase.from(TABLA).upsert(fila, { onConflict: 'dip,periodo' });
  return fila;
}

/** 9.2 — Auditoría ciudadana: quién vio o alteró datos de un DIP. */
export async function auditoriaDe(dip, limit = 100) {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from('rsp_auditoria')
      .select('*')
      .or(`usuario_dip.eq.${dip},objeto_id.eq.${dip}`)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []).map(a => ({
      id: a.id, fecha: a.fecha || a.created_at, servicio: a.servicio,
      accion: a.accion, objetoTipo: a.objeto_tipo, objetoId: a.objeto_id,
      quien: a.usuario_nombre || a.usuario_dip, motivo: a.motivo || null
    }));
  } catch { return []; }
}
