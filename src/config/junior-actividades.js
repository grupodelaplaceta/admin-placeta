/**
 * PLACETA JUNIOR — Actividades, colaboradores, diplomas y puntos
 *
 * Sistema oficial de la Academia Placeta Junior:
 * - Actividades individuales (test, sopas, relacionar, verdadero/falso, etc.)
 * - Creadores: mayores de 18 con ACUERDO DE COLABORADOR firmado vía PlacetaID
 *   (documento oficial del sistema de documentos de admin-placeta)
 * - Filtro de Placeta Junior: aprobación/rechazo/modificaciones
 * - Titulares: entidades con EIP, profesores colaboradores, contenido interno
 * - Precios con IVA incluido (Capitalia lo abona) — ver junior-precios.js
 * - Exámenes: actividades con >10 preguntas → diploma PDF oficial
 * - Retos de Candela: semanales, gratuitos, siempre con diploma
 * - Puntos Verdes (progreso) y Puntos Rojos (errores), canje por Placetas
 */
import { supabase } from './supabase.js';

// ── TIPOS DE ACTIVIDAD (spec §4) ───────────────────────────────────────
export const TIPOS_ACTIVIDAD = [
  'test', 'sopa_letras', 'relacionar_conceptos', 'relacionar_imagenes',
  'completar_frases', 'ordenar_elementos', 'verdadero_falso',
  'calculo_mental', 'retos_interactivos', 'logica', 'otro'
];

// ── ESTADOS DEL FILTRO (spec §6) ───────────────────────────────────────
export const ESTADOS_ACTIVIDAD = ['borrador', 'en_revision', 'aprobada', 'rechazada', 'modificaciones'];

// ── TIPOS DE TITULAR (spec §7) ─────────────────────────────────────────
export const TIPOS_TITULAR = {
  EIP: 'entidad_eip',        // Entidad con EIP → recibe % de ingresos
  PROFESOR: 'profesor',      // Profesor colaborador → ingresos de Placeta Junior salvo acuerdo
  INTERNO: 'interno'         // Contenido anónimo/interno → 100% Placeta Junior
};

// ── EXÁMENES: >10 preguntas = examen (spec §11) ────────────────────────
export const UMBRAL_EXAMEN = 10;
export const APROBADO_MIN = 70;

// ═══════════════════════════════════════════════════════════════════════
//  ACTIVIDADES (tabla junior_actividades)
// ═══════════════════════════════════════════════════════════════════════

export async function sbCrearActividad(data) {
  if (!supabase) return null;
  try {
    const { data: res, error } = await supabase.from('junior_actividades').insert(data).select().single();
    if (error) throw new Error(error.message);
    return res;
  } catch { return null; }
}

export async function sbGetActividad(id) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('junior_actividades').select('*').eq('id', id).maybeSingle();
    return data;
  } catch { return null; }
}

export async function sbListActividades({ estado, categoria, soloPublicas = false } = {}) {
  if (!supabase) return [];
  try {
    let q = supabase.from('junior_actividades').select('*');
    if (estado) q = q.eq('estado', estado);
    if (categoria) q = q.eq('categoria', categoria);
    if (soloPublicas) q = q.eq('publica', true);
    q = q.order('creado_en', { ascending: false }).limit(200);
    const { data } = await q;
    return data || [];
  } catch { return []; }
}

export async function sbUpdateActividad(id, data) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('junior_actividades').update(data).eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  } catch { return false; }
}

export async function sbDeleteActividad(id) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('junior_actividades').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  } catch { return false; }
}

export async function sbListColaboradores({ firmado } = {}) {
  if (!supabase) return [];
  try {
    let q = supabase.from('junior_colaboradores').select('*');
    if (firmado != null) q = q.eq('firmado', firmado);
    q = q.order('creado_en', { ascending: false }).limit(200);
    const { data } = await q;
    return data || [];
  } catch { return []; }
}

export async function sbIncrementActividadStats(id, { veces = 0, aprobados = 0 }) {
  if (!supabase) return;
  try {
    const act = await sbGetActividad(id);
    if (!act) return;
    const stats = act.estadisticas || {};
    const nuevo = {
      ...stats,
      veces_realizada: (stats.veces_realizada || 0) + veces,
      aprobados: (stats.aprobados || 0) + aprobados,
      ultimo_acceso: new Date().toISOString()
    };
    await supabase.from('junior_actividades').update({ estadisticas: nuevo }).eq('id', id);
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════
//  COLABORADORES (tabla junior_colaboradores) — acuerdo 18+ firmado
// ═══════════════════════════════════════════════════════════════════════

export async function sbGetColaborador(dip) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('junior_colaboradores').select('*').eq('dip', dip).maybeSingle();
    return data;
  } catch { return null; }
}

export async function sbCrearColaborador(data) {
  if (!supabase) return null;
  try {
    const { data: res, error } = await supabase.from('junior_colaboradores').insert(data).select().single();
    if (error) throw new Error(error.message);
    return res;
  } catch { return null; }
}

export async function sbUpdateColaborador(dip, data) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('junior_colaboradores').update(data).eq('dip', dip);
    if (error) throw new Error(error.message);
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════════
//  PUNTOS VERDES / ROJOS (tabla junior_puntos)
// ═══════════════════════════════════════════════════════════════════════

export async function sbGetPuntos(juniorId) {
  if (!supabase) return { junior_id: juniorId, puntos_verdes: 0, puntos_rojos: 0, canjeado: 0 };
  try {
    const { data } = await supabase.from('junior_puntos').select('*').eq('junior_id', juniorId).maybeSingle();
    return data || { junior_id: juniorId, puntos_verdes: 0, puntos_rojos: 0, canjeado: 0 };
  } catch { return { junior_id: juniorId, puntos_verdes: 0, puntos_rojos: 0, canjeado: 0 }; }
}

export async function sbUpsertPuntos(juniorId, { verdes = 0, rojos = 0 }) {
  if (!supabase) return;
  try {
    const actual = await sbGetPuntos(juniorId);
    const nuevo = {
      junior_id: juniorId,
      puntos_verdes: (actual.puntos_verdes || 0) + verdes,
      puntos_rojos: (actual.puntos_rojos || 0) + rojos,
      canjeado: actual.canjeado || 0,
      actualizado_en: new Date().toISOString()
    };
    const { error } = await supabase.from('junior_puntos').upsert(nuevo);
    if (error) throw new Error(error.message);
  } catch {}
}

export async function sbCanjearPuntos(juniorId, puntosACanjear, placetas) {
  if (!supabase) return false;
  try {
    const actual = await sbGetPuntos(juniorId);
    if ((actual.puntos_verdes || 0) < puntosACanjear) return false;
    const nuevo = {
      junior_id: juniorId,
      puntos_verdes: (actual.puntos_verdes || 0) - puntosACanjear,
      puntos_rojos: actual.puntos_rojos || 0,
      canjeado: (actual.canjeado || 0) + placetas,
      actualizado_en: new Date().toISOString()
    };
    const { error } = await supabase.from('junior_puntos').upsert(nuevo);
    if (error) throw new Error(error.message);
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════════
//  DIPLOMAS (tabla junior_diplomas)
// ═══════════════════════════════════════════════════════════════════════

export async function sbCrearDiploma(data) {
  if (!supabase) return null;
  try {
    const { data: res, error } = await supabase.from('junior_diplomas').insert(data).select().single();
    if (error) throw new Error(error.message);
    return res;
  } catch { return null; }
}

export async function sbListDiplomas(juniorId) {
  if (!supabase) return [];
  try {
    const { data } = await supabase.from('junior_diplomas')
      .select('*').eq('junior_id', juniorId)
      .order('creado_en', { ascending: false }).limit(50);
    return data || [];
  } catch { return []; }
}
