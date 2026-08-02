/**
 * PLACETA JUNIOR — Catálogo oficial de precios y recompensas (Academia Placeta Junior)
 *
 * MODELO ECONÓMICO (según especificación de la Academia):
 * - TODOS los precios incluyen IVA (12%) que abona CAPITALIA (Placeta Junior)
 *   a Tributos (TGLP). El precio visible es el total que paga el usuario.
 * - Las compras reales se hacen con la cuenta bancaria del junior (historial
 *   bancario) y los fondos se envían a Capitalia (CAPITALIA_BANK).
 * - Los admins pagan las regalías a los titulares desde su propia cuenta.
 *
 * DESGLOSE IVA:
 *   precio_con_iva = precio_base + iva
 *   iva = ceil(precio_base * 12 / 100)
 */

// IVA estándar del ecosistema La Placeta
export const IVA_PERCENT = 12;

// ── TABLA DE PRECIOS POR COMPLEJIDAD (spec §9) ─────────────────────────
// precio_licencia / precio_intento son los PRECIOS TOTALES (IVA incluido)
export const TABLA_PRECIOS = [
  { complejidad: 'Muy pequeña', preguntas_min: 1,  preguntas_max: 5,  fases_min: 1, fases_max: 3, precio_licencia: 3,   precio_intento: 1,  recompensa: 2 },
  { complejidad: 'Pequeña',      preguntas_min: 6,  preguntas_max: 10, fases_min: 1, fases_max: 5, precio_licencia: 10,  precio_intento: 2,  recompensa: 4 },
  { complejidad: 'Media',        preguntas_min: 11, preguntas_max: 20, fases_min: 1, fases_max: 2, precio_licencia: 20,  precio_intento: 4,  recompensa: 8 },
  { complejidad: 'Grande',       preguntas_min: 21, preguntas_max: 35, fases_min: 2, fases_max: 3, precio_licencia: 35,  precio_intento: 7,  recompensa: 12 },
  { complejidad: 'Muy grande',   preguntas_min: 36, preguntas_max: 50, fases_min: 3, fases_max: 4, precio_licencia: 50,  precio_intento: 10, recompensa: 18 },
  { complejidad: 'Extensa',      preguntas_min: 51, preguntas_max: 75, fases_min: 4, fases_max: 6, precio_licencia: 75,  precio_intento: 15, recompensa: 25 },
  { complejidad: 'Máxima',       preguntas_min: 76, preguntas_max: null, fases_min: 6, fases_max: null, precio_licencia: 100, precio_intento: 20, recompensa: 35 }
];

// ── COSTO DE DESBLOQUEO DE NIVELES DE LA ACADEMIA CLÁSICA (nivel 2+) ──
// Precios TOTALES (IVA incluido) que abona el junior desde su cuenta bancaria
export const COSTO_DESBLOQUEO_POR_NIVEL = {
  2: 10, 3: 25, 4: 50, 5: 75, 6: 100, 7: 150, 8: 200, 9: 300, 10: 500,
  11: 750, 12: 1000, 13: 1500, 14: 2000, 15: 3000, 16: 4000, 17: 5000,
  18: 6000, 19: 7500, 20: 9000, 21: 10000, 22: 12000, 23: 14000,
  24: 16000, 25: 18000, 26: 20000, 27: 22000, 28: 25000, 29: 28000,
  30: 30000, 31: 35000, 32: 40000, 33: 45000, 34: 50000, 35: 60000
};

// ── RECOMPENSAS DE PUNTOS VERDES / PLACETAS (spec §10) ─────────────────
export const RECOMPENSAS_POR_COMPLEJIDAD = {
  'Muy pequeña': 2,
  'Pequeña': 4,
  'Media': 8,
  'Grande': 12,
  'Muy grande': 18,
  'Extensa': 25,
  'Máxima': 35
};

// ── CANJE DE PUNTOS VERDES → PLACETAS (spec §16) ──────────────────────
export const TABLA_CANJE_PUNTOS_VERDES = [
  { puntos_verdes: 100,  placetas: 5 },
  { puntos_verdes: 250,  placetas: 15 },
  { puntos_verdes: 500,  placetas: 35 },
  { puntos_verdes: 1000, placetas: 80 }
];

/**
 * Calcula el desglose con IVA para un precio total (IVA incluido).
 * Precio visible = total. Se calcula la base y el IVA que abona Capitalia.
 */
export function desglosarPrecioConIva(total) {
  const totalNum = Number(total) || 0;
  // base = total / (1 + 0.12) redondeado hacia abajo; iva = total - base
  const base = Math.floor((totalNum * 100) / (100 + IVA_PERCENT));
  const iva = totalNum - base;
  return {
    precio_total_iva_incluido: totalNum,
    precio_base: base,
    iva: iva,
    iva_porcentaje: IVA_PERCENT,
    abona_iva: 'CAPITALIA_BANK', // Capitalia (Placeta Junior) abona el IVA a TGLP
    recibe_iva: 'TGLP'
  };
}

/**
 * Devuelve el tramo de complejidad para un número de preguntas dado.
 */
export function getComplejidadPorPreguntas(numPreguntas) {
  const n = Number(numPreguntas) || 0;
  return TABLA_PRECIOS.find(t =>
    n >= t.preguntas_min && (t.preguntas_max === null || n <= t.preguntas_max)
  ) || TABLA_PRECIOS[0];
}

/**
 * Precio de licencia con IVA incluido para una actividad con N preguntas.
 */
export function precioLicenciaPara(numPreguntas) {
  const tramo = getComplejidadPorPreguntas(numPreguntas);
  return {
    complejidad: tramo.complejidad,
    precio: tramo.precio_licencia,
    ...desglosarPrecioConIva(tramo.precio_licencia),
    recompensa: tramo.recompensa
  };
}

/**
 * Precio por intento con IVA incluido para una actividad con N preguntas.
 */
export function precioIntentoPara(numPreguntas) {
  const tramo = getComplejidadPorPreguntas(numPreguntas);
  return {
    complejidad: tramo.complejidad,
    precio: tramo.precio_intento,
    ...desglosarPrecioConIva(tramo.precio_intento),
    recompensa: tramo.recompensa
  };
}
