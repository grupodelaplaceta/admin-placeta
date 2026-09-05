/* ═══════════════════════════════════════════════════════════════════════
   rsp-web — Valores oficiales del BOP (gateway de valores para cálculos)
   -----------------------------------------------------------------------
   Fuente única para TODOS los cálculos del RSP que usan valores numéricos
   o porcentuales (IRM, IGF, IA, IVA, límites de capital, transferencias…):
   los valores se leen del API nueva del BOLP (`/api/valores?todo=1`,
   valores tipados con `numero`, `resumen` y `revision`) y NO se hardcodean.

   Robustez:
     • caché en memoria de 60 s (TTL) con deduplicación de peticiones.
     • cascada: /api/valores?todo=1 → /api/cnic → null (quien llama puede
       añadir su propio fallback a Supabase compartido).
     • si un código concreto no está disponible, `leerNumero(codigo, fb)`
       devuelve el fallback declarado en el punto de llamada (nunca NaN).
   ═══════════════════════════════════════════════════════════════════════ */

const BOP_URL = (process.env.BOP_URL || 'https://bop.laplaceta.org').replace(/\/+$/, '');
const TTL_MS = 60_000;

let cache = { at: 0, data: null, revision: null, fuente: null, error: null };
let inflight = null;

function adaptarFila(row, fuente) {
  const codigo = row.codigo || row.canonico || row.cnic || '';
  const tipoValor = row.tipo || row.tipo_valor || 'porcentaje';
  const numero = Number(row.numero ?? row.valor ?? NaN);
  const derogado = row.vigente === false || String(row.estado || '').toLowerCase() === 'derogado';
  return {
    codigo,
    etiqueta: row.etiqueta || codigo,
    tipoValor,
    valor: Number.isFinite(numero) ? numero : row.valor, // numérico (los % van en tanto por ciento)
    numero: Number.isFinite(numero) ? numero : null,
    valorCrudo: String(row.valor ?? ''),
    resumen: row.resumen || null,
    unidad: row.unidad || (tipoValor === 'porcentaje' ? '%' : ''),
    vigente: !derogado,
    estado: derogado ? 'derogado' : 'vigente',
    fuente,
    articulo: row.articulo || row.norma || '',
    bopUrl: `https://bop.laplaceta.org/cnic?codigo=${encodeURIComponent(codigo)}`,
    historial: Array.isArray(row.historial) ? row.historial : [],
  };
}

async function desdeValores() {
  const r = await fetch(`${BOP_URL}/api/valores?todo=1`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`BOP /api/valores respondió ${r.status}`);
  const payload = await r.json();
  if (payload.servicio !== 'bop.valores' || !payload.valores) throw new Error('Respuesta de valores inválida');
  const lista = Object.keys(payload.valores).map((k) => {
    const v = { ...payload.valores[k] };
    return adaptarFila({ ...v, codigo: v.codigo || k }, '/api/valores?todo=1');
  });
  return { lista, revision: payload.revision || null };
}

async function desdeCnic() {
  const r = await fetch(`${BOP_URL}/api/cnic`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`BOP /api/cnic respondió ${r.status}`);
  const payload = await r.json();
  const rows = Array.isArray(payload) ? payload : (payload.cnic || []);
  const lista = rows.map((row) => adaptarFila(row, '/api/cnic'));
  return { lista, revision: payload.revision || payload.actualizado || null };
}

/** Catálogo canónico (vigente) del BOP. Devuelve un array o null. */
async function cargarCatalogo(opts = {}) {
  if (!opts.fuerza && cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  if (!opts.fuerza && inflight) return inflight;
  inflight = (async () => {
    let ok = false;
    try {
      const { lista, revision } = await desdeValores();
      cache = { at: Date.now(), data: lista.filter((r) => r.vigente), revision, fuente: '/api/valores?todo=1', error: null };
      ok = true;
    } catch (e) {
      try {
        const { lista, revision } = await desdeCnic();
        cache = { at: Date.now(), data: lista.filter((r) => r.vigente), revision, fuente: '/api/cnic (fallback)', error: null };
        ok = true;
      } catch (e2) {
        cache = { ...cache, at: Date.now(), data: null, error: `${e.message} · ${e2.message}` };
      }
    }
    if (!ok && cache.data) return cache.data; // devuelve la última copia válida
    return cache.data;
  })();
  try { return await inflight; } finally { inflight = null; }
}

/** CNIC vigentes en el contrato que esperan el motor fiscal y la facturación. */
async function cargarVigentes(opts = {}) {
  const cat = await cargarCatalogo(opts);
  if (!cat) return null;
  return cat.filter((r) => r.estado === 'vigente');
}

/** Número de un CNIC (canónico). Devuelve el fallback si no existe o no es numérico. */
async function leerNumero(codigo, fallback) {
  const vigentes = await cargarVigentes();
  if (!vigentes) return fallback;
  const r = vigentes.find((x) => String(x.codigo || '').toUpperCase() === String(codigo || '').toUpperCase());
  if (!r) return fallback;
  const n = Number(r.numero ?? r.valor ?? NaN);
  return Number.isFinite(n) ? n : fallback;
}

/** Resumen/estado para el endpoint de diagnóstico. */
async function diagnostico(opts = {}) {
  const vigentes = await cargarCatalogo({ ...opts, fuerza: opts.fuerza });
  return {
    servicio: 'bop.valores',
    url: `${BOP_URL}/api/valores?todo=1`,
    revision: cache.revision || null,
    fuente: cache.fuente || null,
    error: cache.error || null,
    total: Array.isArray(vigentes) ? vigentes.length : 0,
    codigos: Array.isArray(vigentes) ? vigentes.map((r) => r.codigo) : [],
    at: new Date(cache.at || 0).toISOString(),
  };
}

function limpiarCache() {
  cache = { at: 0, data: null, revision: null, fuente: null, error: null };
  inflight = null;
}

export { BOP_URL, cargarCatalogo, cargarVigentes, leerNumero, diagnostico, limpiarCache };
