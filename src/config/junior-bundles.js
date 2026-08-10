/**
 * PLACETA JUNIOR — Sistema genérico de BUNDLES
 *
 * Un Bundle es un conjunto de actividades agrupadas bajo un producto
 * (reutilizable para cualquier temática: Code, Matemáticas, Navidad…).
 *
 * Modelo de acceso (prioridad, spec):
 *   1. Actividad gratuita.
 *   2. Acceso administrativo.
 *   3. Actividad adquirida individualmente (user_activities).
 *   4. Bundle adquirido que contiene la actividad (user_bundles + bundle_items).
 *   5. No disponible.
 *
 * Moneda: Placetas (Pz). No hay pago en euros en la primera fase.
 */
import { supabase } from './supabase.js';
import { sbGetActividad } from './junior-actividades.js';
import { sbFindJuniorByDip } from './db.js';

// ── BUNDLES ────────────────────────────────────────────────────────────

/** Crea un Bundle. */
export async function sbCrearBundle(data) {
  if (!supabase) return null;
  try {
    const { data: res, error } = await supabase.from('bundles').insert(data).select().single();
    if (error) throw new Error(error.message);
    return res;
  } catch { return null; }
}

/** Devuelve un Bundle por id. */
export async function sbGetBundle(id) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('bundles').select('*').eq('id', id).maybeSingle();
    return data;
  } catch { return null; }
}

/** Lista Bundles (opcional: solo activos). */
export async function sbListBundles({ soloActivos = false } = {}) {
  if (!supabase) return [];
  try {
    let q = supabase.from('bundles').select('*');
    if (soloActivos) q = q.eq('activo', true);
    q = q.order('created_at', { ascending: true });
    const { data } = await q;
    return data || [];
  } catch { return []; }
}

/** Actualiza un Bundle. */
export async function sbUpdateBundle(id, data) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('bundles').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
    return !error;
  } catch { return false; }
}

/** Elimina un Bundle (cascade elimina bundle_items y user_bundles). */
export async function sbDeleteBundle(id) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('bundles').delete().eq('id', id);
    return !error;
  } catch { return false; }
}

// ── ITEMS DEL BUNDLE ───────────────────────────────────────────────────

/** Asigna actividades a un Bundle (borra y reinserta en el orden dado). */
export async function sbSetBundleItems(bundleId, actividadIds = []) {
  if (!supabase) return false;
  try {
    await supabase.from('bundle_items').delete().eq('bundle_id', bundleId);
    if (actividadIds.length) {
      const rows = actividadIds.map((actividadId, i) => ({ bundle_id: bundleId, actividad_id: actividadId, orden: i }));
      const { error } = await supabase.from('bundle_items').insert(rows);
      if (error) throw new Error(error.message);
    }
    return true;
  } catch { return false; }
}

/** Devuelve los ids de actividades de un Bundle, en orden. */
export async function sbGetBundleItems(bundleId) {
  if (!supabase) return [];
  try {
    const { data } = await supabase.from('bundle_items')
      .select('actividad_id').eq('bundle_id', bundleId).order('orden', { ascending: true });
    return (data || []).map(r => r.actividad_id);
  } catch { return []; }
}

/** Devuelve los Bundles que contienen una actividad concreta. */
export async function sbGetBundlesConActividad(actividadId) {
  if (!supabase) return [];
  try {
    const { data } = await supabase.from('bundle_items')
      .select('bundle_id').eq('actividad_id', actividadId);
    const ids = (data || []).map(r => r.bundle_id);
    if (!ids.length) return [];
    const { data: bundles } = await supabase.from('bundles').select('*').in('id', ids);
    return bundles || [];
  } catch { return []; }
}

// ── ADQUISICIONES ─────────────────────────────────────────────────────

/** Registra la compra de un Bundle por un junior (origen). */
export async function sbAddUserBundle(juniorId, bundleId, { precioPagado = 0, moneda = 'Pz', origen = 'bundle' } = {}) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('user_bundles')
      .upsert({ user_id: juniorId, bundle_id: bundleId, precio_pagado: precioPagado, moneda, origen },
        { onConflict: 'user_id,bundle_id' });
    return !error;
  } catch { return false; }
}

/** Comprueba si un junior tiene un Bundle. */
export async function sbHasUserBundle(juniorId, bundleId) {
  if (!supabase) return false;
  try {
    const { data } = await supabase.from('user_bundles')
      .select('id').eq('user_id', juniorId).eq('bundle_id', bundleId).maybeSingle();
    return !!data;
  } catch { return false; }
}

/** Desbloquea una actividad individualmente para un junior. */
export async function sbAddUserActivity(juniorId, actividadId, { origen = 'individual' } = {}) {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('user_activities')
      .upsert({ user_id: juniorId, actividad_id: actividadId, origen }, { onConflict: 'user_id,actividad_id' });
    return !error;
  } catch { return false; }
}

/** Comprueba si un junior tiene una actividad desbloqueada individualmente. */
export async function sbHasUserActivity(juniorId, actividadId) {
  if (!supabase) return false;
  try {
    const { data } = await supabase.from('user_activities')
      .select('id').eq('user_id', juniorId).eq('actividad_id', actividadId).maybeSingle();
    return !!data;
  } catch { return false; }
}

/**
 * Comprueba el ACCESO de un junior a una actividad según la prioridad spec:
 * 1) gratuita → 2) admin → 3) individual → 4) bundle → 5) bloqueada.
 * Devuelve el estado completo para que web/app muestren compra o bundle.
 */
export async function comprobarAccesoActividad(actividadId, dip) {
  const act = await sbGetActividad(actividadId);
  if (!act) return { success: false, error: 'Actividad no encontrada' };

  const esGratis = !((act.precio_licencia || 0) > 0 || (act.precio_intento || 0) > 0);
  const subvencionada = !!act.subvencionada;

  let junior = null;
  let juniorId = null;
  if (dip) {
    junior = await sbFindJuniorByDip(dip).catch(() => null);
    juniorId = junior?.id || null;
  }

  // 1) Gratuita / subvencionada → abierta
  if (esGratis || subvencionada) {
    return { success: true, desbloqueada: true, es_gratis: esGratis, subvencionada, motivo: 'gratis' };
  }

  // Sin junior identificado y de pago → bloqueada (mostrar compra)
  if (!juniorId) {
    return { success: true, desbloqueada: false, es_gratis: false, subvencionada: false, motivo: 'bloqueada', precio_licencia: act.precio_licencia || 0, precio_intento: act.precio_intento || 0 };
  }

  // 2) Acceso administrativo / profesor (se concede sin pago)
  const esAdmin = !!junior.es_admin || junior.tipo_titular === 'profesor' || !!junior.admin_acceso;
  if (esAdmin) {
    return { success: true, desbloqueada: true, es_gratis: false, subvencionada: false, motivo: 'admin' };
  }

  // 3) Licencia previa (junior_licencias) o desbloqueo individual
  const licencia = await sbHasUserActivity(juniorId, act.id).catch(() => false)
    || await tieneLicencia(juniorId, act.id);
  if (licencia) {
    return { success: true, desbloqueada: true, es_gratis: false, subvencionada: false, motivo: 'individual' };
  }

  // 4) Bundle adquirido que contiene la actividad
  const bundleIds = await sbGetBundlesConActividad(act.id);
  for (const b of bundleIds) {
    const tiene = await sbHasUserBundle(juniorId, b.id);
    if (tiene) {
      return { success: true, desbloqueada: true, es_gratis: false, subvencionada: false, motivo: 'bundle', bundle_id: b.id, bundle_nombre: b.nombre };
    }
  }

  // 5) Bloqueada → mostrar compra individual y bundles disponibles
  return {
    success: true, desbloqueada: false, es_gratis: false, subvencionada: false, motivo: 'bloqueada',
    precio_licencia: act.precio_licencia || 0,
    precio_intento: act.precio_intento || 0,
    bundles: bundleIds.filter(b => b.activo !== false).map(b => ({ id: b.id, nombre: b.nombre, descripcion: b.descripcion, precio: b.precio || 0, moneda: b.moneda || 'Pz', imagen_url: b.imagen_url }))
  };
}

/** Comprueba si el junior ya tiene una licencia clásica de la actividad. */
async function tieneLicencia(juniorId, actividadId) {
  if (!supabase) return false;
  try {
    const { data } = await supabase.from('junior_licencias')
      .select('id').eq('junior_id', juniorId).eq('actividad_id', actividadId).maybeSingle();
    return !!data;
  } catch { return false; }
}

/** Entrega el Bundle de acceso anticipado a un junior si es elegible. */
export async function entregarBundleEarlyAccess(juniorId, bundleId) {
  if (!juniorId || !bundleId) return { entregado: false, motivo: 'sin_datos' };
  const yaTiene = await sbHasUserBundle(juniorId, bundleId);
  if (yaTiene) return { entregado: false, motivo: 'ya_tiene' };
  const ok = await sbAddUserBundle(juniorId, bundleId, { precioPagado: 0, origen: 'early_access' });
  return { entregado: ok, motivo: ok ? 'early_access' : 'error' };
}
