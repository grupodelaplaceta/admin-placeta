/* ── Capa de datos del BFF ───────────────────────────────────────────────
   Abstrae Supabase (Postgres) con conversión camelCase ↔ snake_case.
   Si Supabase no está configurado, cada colección opera en memoria
   (la API sigue funcionando, sin persistencia entre reinicios).

   Uso:
     const tramites = coleccion('rsp_tramites');
     await tramites.listar();          // SELECT * (camelizado)
     await tramites.insertar(row);     // INSERT (snake_case)
     await tramites.actualizar(id, patch);
     await tramites.borrar(id);
   ──────────────────────────────────────────────────────────────────────── */
import { supabase } from './supabase.js';

const toSnake = (s) => String(s).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s) => String(s).replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function snakize(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) out[toSnake(k)] = v;
  return out;
}
function camelize(obj) {
  if (Array.isArray(obj)) return obj.map(camelize);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[toCamel(k)] = camelize(v);
    return out;
  }
  return obj;
}

export function coleccion(tabla, { idCol = 'id', orderCol = 'created_at' } = {}) {
  const memoria = [];
  let cargada = false;
  const tieneId = (fila) => fila && fila[idCol] != null;

  async function cargar() {
    if (!supabase || cargada) return;
    try {
      let q = supabase.from(tabla).select('*');
      if (orderCol) q = q.order(orderCol, { ascending: false });
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      memoria.length = 0;
      for (const row of data || []) memoria.push(camelize(row));
    } catch {
      /* tabla no disponible aún: se deja vacía */
    }
    cargada = true;
  }

  return {
    get disponible() { return !!supabase; },
    get tabla() { return tabla; },

    async listar({ filtros = {} } = {}) {
      await cargar();
      if (supabase) {
        // Refresco desde Supabase para ver datos nuevos de otras instancias.
        try {
          let q = supabase.from(tabla).select('*');
          for (const [k, v] of Object.entries(filtros)) q = q.eq(toSnake(k), v);
          if (orderCol) q = q.order(orderCol, { ascending: false });
          const { data, error } = await q.limit(1000);
          if (!error && Array.isArray(data)) return data.map(camelize);
        } catch { /* cae a memoria */ }
      }
      let out = memoria;
      for (const [k, v] of Object.entries(filtros)) out = out.filter((r) => r[k] === v);
      return out;
    },

    async obtener(id) {
      await cargar();
      if (supabase) {
        try {
          const { data, error } = await supabase.from(tabla).select('*').eq(idCol, id).maybeSingle();
          if (!error && data) return camelize(data);
        } catch { /* cae a memoria */ }
      }
      return memoria.find((r) => r[idCol] === id) ?? null;
    },

    async insertar(fila) {
      const filaSnake = snakize(fila);
      memoria.unshift(fila);
      if (supabase) {
        try {
          const { data, error } = await supabase.from(tabla).insert(filaSnake).select().maybeSingle();
          if (!error && data) return camelize(data);
          if (error) return { ...fila, __dbError: error.message };
        } catch { /* sin persistencia */ }
      }
      return fila;
    },

    async actualizar(id, patch) {
      const enMemoria = memoria.find((r) => r[idCol] === id);
      if (enMemoria) Object.assign(enMemoria, patch);
      if (supabase) {
        try {
          const { error } = await supabase.from(tabla).update(snakize(patch)).eq(idCol, id);
          if (error) return { ok: false, error: error.message };
        } catch { /* sin persistencia */ }
      }
      return { ok: true };
    },

    async borrar(id) {
      const i = memoria.findIndex((r) => r[idCol] === id);
      if (i >= 0) memoria.splice(i, 1);
      if (supabase) {
        try {
          const { error } = await supabase.from(tabla).delete().eq(idCol, id);
          if (error) return { ok: false, error: error.message };
        } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
      }
      return { ok: true };
    },

    // Para compatibilidad con el código que mutaba arrays en memoria.
    _memoria: memoria,
  };
}

/** Acceso genérico rápido (sin colección cacheada). */
export const db = {
  get disponible() { return !!supabase; },
  async listar(tabla, filtros = {}) {
    if (!supabase) return [];
    try {
      let q = supabase.from(tabla).select('*');
      for (const [k, v] of Object.entries(filtros)) q = q.eq(toSnake(k), v);
      const { data, error } = await q.limit(1000);
      if (error) return [];
      return (data || []).map(camelize);
    } catch {
      return [];
    }
  },
  async insertar(tabla, fila) {
    if (!supabase) return fila;
    try {
      const { data, error } = await supabase.from(tabla).insert(snakize(fila)).select().maybeSingle();
      if (error) return fila;
      return camelize(data) || fila;
    } catch {
      return fila;
    }
  },
};
