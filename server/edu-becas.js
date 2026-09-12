/* Baremo de becas propio del ecosistema de La Placeta.
   No representa renta, impuestos ni criterios de un sistema externo.
   Los indicadores y PMB se configuran en RSP y se versionan allí. */

export const INDICADORES_ECOSISTEMA = [
  { id: 'participacionFormativa', max: 40 },
  { id: 'continuidadItinerario', max: 15 },
  { id: 'cargasPrograma', max: 15 },
  { id: 'situacionPrograma', max: 15 },
  { id: 'recursosEcosistema', max: 10 },
  { id: 'costesActividad', max: 5 },
];

export const BAREMO_ECOSISTEMA = [
  { min: 0, max: 24, porcentaje: 0, nivel: 'Sin beca' },
  { min: 25, max: 49, porcentaje: 25, nivel: 'Baja' },
  { min: 50, max: 69, porcentaje: 50, nivel: 'Media' },
  { min: 70, max: 84, porcentaje: 75, nivel: 'Alta' },
  { min: 85, max: 100, porcentaje: 100, nivel: 'Maxima' },
];

const VERSION = process.env.PLACETAEDU_BAREMO_VERSION || 'ecosistema-1';

const numero = (value, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};

export function calcularValoracion(indicadores) {
  const detalle = {};
  let inb = 0;
  for (const indicador of INDICADORES_ECOSISTEMA) {
    const puntos = numero(indicadores?.[indicador.id], indicador.max);
    detalle[indicador.id] = { puntos, max: indicador.max };
    inb += puntos;
  }
  const tramo = BAREMO_ECOSISTEMA.find((item) => inb >= item.min && inb <= item.max) || BAREMO_ECOSISTEMA[0];
  return { inb, detalle, nivel: tramo.nivel, porcentajeReconocido: tramo.porcentaje, baremoVersion: VERSION };
}

export function pmbPara(elementoId) {
  let mapa = {};
  try { mapa = JSON.parse(process.env.PLACETAEDU_PMB_JSON || '{}'); } catch { mapa = {}; }
  const valor = mapa[String(elementoId)] ?? process.env.PLACETAEDU_PMB_DEFAULT ?? 100;
  return Math.max(0, Math.min(100, Number(valor) || 0));
}

export function publicConfig() {
  return { version: VERSION, indicadores: INDICADORES_ECOSISTEMA, baremo: BAREMO_ECOSISTEMA };
}
