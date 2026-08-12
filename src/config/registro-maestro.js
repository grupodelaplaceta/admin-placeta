/**
 * REGISTRO MAESTRO DE IDENTIDAD (FASE 4)
 * --------------------------------------
 * Tabla `rsp_ciudadanos`: fuente única derivada de identidad para RSP.
 * - 4.2 upsertCiudadanoMaestro(dip): sincroniza desde PlacetaID + banco + Supabase
 * - 4.3 resolverCiudadano(dip): usado por trámites, patrimonio, fiscalidad, contexto
 * - 4.4 Niveles de verificación N1→N3 (sin biometría) con beneficios
 */
import { supabase } from './supabase.js';
import { apiBancoGetState, apiPlacetaidRegistros, sbFindSolicitanteByDip } from './db.js';

const TABLA = 'rsp_ciudadanos';

// ── Niveles de verificación (4.4) — sin biometría ─────────────────────────
export const NIVELES = {
  N1: {
    label: 'N1 — Registrado',
    requisitos: ['Cuenta bancaria activa o alta en PlacetaID', 'DIP validado'],
    beneficios: ['Acceso a su banca en línea', 'Consultar su contexto', 'Presentar trámites'],
    sinBiometria: true
  },
  N2: {
    label: 'N2 — Verificado',
    requisitos: ['N1 + datos de contacto confirmados', 'Censo tributario (si aplica)'],
    beneficios: ['Límites de operación ampliados', 'Subvenciones y ayudas', 'Firma de documentos'],
    sinBiometria: true
  },
  N3: {
    label: 'N3 — Verificación reforzada',
    requisitos: ['N2 + verificación presencial o documental por la Administración', 'Justificación de fondos cuando proceda'],
    beneficios: ['Gestión de entidades y cuentas empresariales', 'Cotitularidades y gestores', 'Actos de especial cuantía'],
    sinBiometria: true
  }
};

function nivelDe(placetaidReg, solicitante, bancoUser) {
  // N3: entidades / cuentas empresariales o verificado documentalmente
  if (bancoUser?.eip || solicitante?.verificado_documental) return 'N3';
  // N2: censado en tributos o datos de contacto
  if (bancoUser?.tributosCensusDate || solicitante?.email) return 'N2';
  return 'N1';
}

/** 4.2 — Recalcula y guarda (upsert) el registro maestro de un DIP. */
export async function upsertCiudadanoMaestro(dip) {
  const DIP = String(dip || '').trim().toUpperCase();
  if (!DIP) return null;
  const [banco, registros, solicitante] = await Promise.all([
    apiBancoGetState().catch(() => null),
    apiPlacetaidRegistros().catch(() => []),
    sbFindSolicitanteByDip(DIP).catch(() => null)
  ]);
  const placetaReg = (registros || []).find(r => String(r.dip || '').toUpperCase() === DIP);
  const bancoUser = (banco?.users || []).find(u => String(u.dip || '').toUpperCase() === DIP);
  const placetaId = bancoUser?.placetaId || placetaReg?.placetaId || placetaReg?.placeid || DIP;
  const cuentas = (banco?.accounts || []).filter(a => String(a.placetaId || '').toUpperCase() === String(placetaId || DIP).toUpperCase());
  const principal = bancoUser?.primaryAccountId || cuentas[0]?.id || null;
  const nombre = bancoUser?.displayName || placetaReg?.nombreCompleto || solicitante?.nombre || `${placetaReg?.nombre || ''} ${placetaReg?.apellidos || ''}`.trim() || DIP;

  const fila = {
    dip: DIP,
    placeta_id: placetaId,
    nombre,
    estado: 'activo',
    nivel: nivelDe(placetaReg, solicitante, bancoUser),
    cuenta_principal: principal,
    canal_preferido: solicitante?.canal_preferido || 'email',
    fuente: bancoUser || placetaReg ? 'sincronizado' : 'derivado',
    verificado_en: placetaReg ? new Date().toISOString() : null,
    tributos_censado: !!bancoUser?.tributosCensusDate,
    updated_at: new Date().toISOString()
  };
  if (!supabase) return fila;
  try {
    await supabase.from(TABLA).upsert(fila, { onConflict: 'dip' });
  } catch { /* fallback: devolver fila calculada */ }
  return fila;
}

/** 4.3 — Resuelve el ciudadano maestro (persistido o derivado al vuelo). */
export async function resolverCiudadano(dip) {
  const DIP = String(dip || '').trim().toUpperCase();
  if (!DIP) return null;
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA).select('*').eq('dip', DIP).maybeSingle();
      if (data) return data;
    } catch { /* derivar */ }
  }
  return upsertCiudadanoMaestro(DIP);
}

/** Listado del registro maestro (filtros opcionales). */
export async function listarCiudadanosMaestros(filtros = {}) {
  if (!supabase) return [];
  try {
    let q = supabase.from(TABLA).select('*').order('nombre', { ascending: true }).limit(filtros.limit || 200);
    if (filtros.nivel) q = q.eq('nivel', filtros.nivel);
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    const { data } = await q;
    return data || [];
  } catch { return []; }
}
