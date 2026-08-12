/**
 * NORMATIVA DINÁMICA desde el BOP (FASE 5)
 * ----------------------------------------
 * El BOP (Boletín Oficial) es la fuente de la normativa variable. Este
 * servicio lee los CNIC (`bop_cnic` en Supabase: codigo, tipo_valor, valor,
 * vigente, historial, fecha_aplicacion) y expone `getParametro(codigo)` con
 * caché TTL. Un cambio publicado en el BOP actualiza los cálculos del RSP
 * sin tocar código.
 *
 * - 5.1 getParametro(codigo, {fecha})  -> valor vigente tipado (o histórico)
 * - 5.2 catálogo RSP → CNIC
 * - 5.4 refreshNormativa()             -> invalida caché (al publicar CNIC)
 * - 5.5 getParametroEnFecha(codigo, fecha) -> valor vigente en una fecha
 * - 5.6 trazabilidad: cada getParametro devuelve codigo+version usados
 */
import { supabase } from './supabase.js';

const TTL_MS = 60 * 1000; // 1 minuto de caché
let cache = null;
let cacheAt = 0;

// Snapshot síncrono de valores numéricos (para funciones síncronas como tarifas)
let snapshot = {};
let snapshotCargado = false;

/** Carga (o recarga) el snapshot síncrono con los valores vigentes. */
export async function cargarSnapshot() {
  for (const clave of Object.keys(CATALOGO)) {
    const r = await getParametro(clave);
    snapshot[clave] = r ? r.valor : CATALOGO[clave].def;
  }
  snapshotCargado = true;
  return snapshot;
}

/** Lectura síncrona de un valor (usa el snapshot; si no, el fallback). */
export function getSnapshot(clave) {
  const val = snapshot[clave];
  return val !== undefined && val !== null ? val : (CATALOGO[clave]?.def ?? null);
}

export function snapshotListo() { return snapshotCargado; }

// ── Catálogo RSP → CNIC (5.2) ────────────────────────────────────────────
// Cada valor hoy hardcodeado tiene su código CNIC. Si el CNIC aún no existe
// en el BOP se usa `def` (fallback seguro = valor actual).
export const CATALOGO = {
  IVA:                    { codigo: 'CNIC-4.4',   def: 0.12,   tipo: 'porcentaje' },
  TASA_TRANSFERENCIA:     { codigo: 'CNIC-4.3',   def: 0.12,   tipo: 'porcentaje' },
  RBU_SEMANAL:            { codigo: 'CNIC-4.6',   def: 5,      tipo: 'placeta' },
  EXENCION_IGF_EMPRESA:   { codigo: 'CNIC-4.15',  def: 20000,  tipo: 'placeta' },
  LIMITE_EMISION_USUARIO: { codigo: 'CNIC-9-1',   def: 7500,   tipo: 'placeta' },
  LIMITE_PERSONAL:        { codigo: 'CNIC-4.1',   def: 500000, tipo: 'placeta' },
  LIMITE_EMPRESA:         { codigo: 'CNIC-4.1',   def: 10000000, tipo: 'placeta' },
  MAX_RETRIBUCION_MENSUAL:{ codigo: 'CNIC-4.12-01', def: 250,  tipo: 'placeta' },
  SMI:                    { codigo: 'CNIC-4.7',   def: 150,    tipo: 'placeta' },
  SALARIO_MAXIMO:         { codigo: 'CNIC-4.7',   def: 1750,   tipo: 'placeta' },
  // Plazos de trámites (días) — FASE 3 usa estos mismos códigos
  PLAZO_REVISION:         { codigo: 'CNIC-PLAZO-REVISION',     def: 15, tipo: 'entero' },
  PLAZO_SUBSANACION:      { codigo: 'CNIC-PLAZO-SUBSANACION',  def: 10, tipo: 'entero' },
  PLAZO_FIRMA:            { codigo: 'CNIC-PLAZO-FIRMA',        def: 7,  tipo: 'entero' },
  PLAZO_JUSTIFICACION:    { codigo: 'CNIC-PLAZO-JUSTIFICACION', def: 20, tipo: 'entero' }
};

// ── Tipado ───────────────────────────────────────────────────────────────
function tipar(cnic) {
  const tipo = cnic.tipo_valor || 'texto';
  const raw = String(cnic.valor ?? '');
  switch (tipo) {
    case 'porcentaje':
    case 'placeta':
    case 'entero': {
      const n = Number(raw.replace(/[^0-9.,-]/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    case 'fecha':
      return raw;
    default:
      return raw;
  }
}

async function cargar() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  if (!supabase) return {};
  try {
    const { data, error } = await supabase.from('bop_cnic').select('*').limit(500);
    if (error) { cache = {}; cacheAt = Date.now(); return cache; }
    cache = (data || []).reduce((acc, c) => { acc[c.codigo] = c; return acc; }, {});
    cacheAt = Date.now();
    return cache;
  } catch {
    cache = cache || {};
    cacheAt = Date.now();
    return cache;
  }
}

/** Invalida la caché (5.4) — se llama al publicar un CNIC desde el BOP. */
export async function refreshNormativa() {
  cache = null;
  cacheAt = 0;
  return cargar();
}

function entrarEnHistorial(historial, fecha) {
  if (!Array.isArray(historial) || historial.length === 0) return null;
  const target = fecha ? new Date(fecha) : new Date();
  let mejor = null;
  for (const h of historial) {
    if (!h || !h.desde) continue;
    const desde = new Date(h.desde);
    if (desde <= target && (!mejor || new Date(mejor.desde) < desde)) mejor = h;
  }
  return mejor;
}

/**
 * Valor vigente (tipado) de un código CNIC.
 * @param {string} clave - clave del catálogo RSP (p.ej. 'IVA') o código CNIC directo
 * @param {{fecha?: string|Date}} [opts]
 * @returns {{ codigo, valor, tipo, unidad, vigente, version, desde, fuente, cn }|null}
 */
export async function getParametro(clave, opts = {}) {
  const cat = CATALOGO[clave] || { codigo: clave, def: null, tipo: 'texto' };
  const datos = await cargar();
  const cnic = datos[cat.codigo];
  if (!cnic || cnic.vigente === false) {
    if (!cnic && cat.def === null) return null;
    // CNIC no publicado aún → fallback seguro al valor actual
    return {
      codigo: cat.codigo,
      valor: cat.def,
      tipo: cat.tipo,
      unidad: cnic?.unidad || null,
      vigente: !!cnic,
      version: null,
      desde: null,
      fuente: 'fallback',
      cn: cnic || null
    };
  }
  let valor = tipar(cnic);
  let desde = cnic.fecha_aplicacion || null;
  let version = null;

  // Vigencia por fecha (5.5): usar el valor del historial vigente en esa fecha
  if (opts.fecha) {
    const h = entrarEnHistorial(cnic.historial, opts.fecha);
    if (h) {
      const n = Number(String(h.valor || '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
      if (Number.isFinite(n)) valor = n;
      desde = h.desde || desde;
    }
  }
  // Versión = nº de cambios del historial (trazabilidad 5.6)
  version = Array.isArray(cnic.historial) ? cnic.historial.length + 1 : 1;

  return {
    codigo: cnic.codigo,
    valor,
    tipo: cnic.tipo_valor || cat.tipo,
    unidad: cnic.unidad || null,
    vigente: cnic.vigente !== false,
    version,
    desde,
    fuente: 'bop',
    cn: cnic
  };
}

/** Atajo: getParametro(...).valor con fallback tipado. */
export async function getParametroValor(clave, opts = {}) {
  const r = await getParametro(clave, opts);
  return r ? r.valor : null;
}
