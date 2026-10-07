export const JUNIOR_ACTIVITY_TYPES = [
  { id: 'test', label: 'Pregunta', icon: '💡', hint: 'Preguntas de opción múltiple con una respuesta correcta.' },
  { id: 'clic', label: 'Busca y pulsa', icon: '👆', hint: 'Encuentra objetos concretos en una colección.' },
  { id: 'arrastrar', label: 'Arrastra y clasifica', icon: '🧲', hint: 'Coloca cada elemento en su categoría.' },
  { id: 'lineas', label: 'Une con líneas', icon: '🔗', hint: 'Relaciona cada elemento de la izquierda con su pareja.' },
  { id: 'construir_frase', label: 'Ordena palabras', icon: '🧩', hint: 'Toca las palabras en el orden correcto.' },
  { id: 'memoria', label: 'Parejas de memoria', icon: '🃏', hint: 'Encuentra dos tarjetas que formen pareja.' },
  { id: 'dibujo', label: 'Dibuja y traza', icon: '✏️', hint: 'Practica formas y trazos sobre un lienzo táctil.' },
  { id: 'fisica_objetos', label: 'Física de objetos', icon: '⚽', hint: 'Prueba cómo influyen la fuerza y el ángulo en un lanzamiento.' },
] as const;

export const JUNIOR_LANGUAGES = [
  { id: 'es', label: 'Español', flag: '🇪🇸' },
  { id: 'ca', label: 'Català', flag: '🇦🇩' },
  { id: 'eu', label: 'Euskara', flag: '🇪🇺' },
  { id: 'val', label: 'Valencià', flag: '🇪🇸' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
] as const;

export type JuniorActivityType = (typeof JUNIOR_ACTIVITY_TYPES)[number]['id'];
export type JuniorLanguage = (typeof JUNIOR_LANGUAGES)[number]['id'];

export type JuniorActivityLocaleText = {
  titulo?: string;
  descripcion?: string;
  categoria?: string;
  portadaUrl?: string;
  miniaturaUrl?: string;
  detalles?: string;
  [key: string]: unknown;
};

export function resolveActivityLocale(
  activity: Partial<{ idioma: string; titulo: string; descripcion: string; categoria: string; portadaUrl: string; miniaturaUrl: string; detalles: string; traducciones: Record<string, JuniorActivityLocaleText> }> | null | undefined,
  locale?: string,
) {
  const requested = locale && typeof locale === 'string' && locale.trim() ? locale.trim() : (activity?.idioma ?? 'es');
  const actualLocale = JUNIOR_LANGUAGES.some((lang) => lang.id === requested) ? requested : 'es';
  const baseValues = {
    titulo: activity?.titulo ?? '',
    descripcion: activity?.descripcion ?? '',
    categoria: activity?.categoria ?? '',
    portadaUrl: activity?.portadaUrl ?? activity?.miniaturaUrl ?? '',
    miniaturaUrl: activity?.miniaturaUrl ?? activity?.portadaUrl ?? '',
    detalles: activity?.detalles ?? '',
  };
  const translation = activity?.traducciones?.[actualLocale] ?? {};
  const resolved = { ...baseValues };

  const keys = Object.keys(baseValues) as Array<keyof typeof baseValues>;
  for (const key of keys) {
    const translatedValue = translation[key];
    if (actualLocale !== 'es' && typeof translatedValue === 'string' && translatedValue.trim()) {
      resolved[key] = translatedValue;
    }
  }

  const missing = actualLocale !== 'es'
    ? ['titulo', 'descripcion', 'categoria'].filter((key) => {
        const translatedValue = translation[key];
        const baseValue = baseValues[key];
        return typeof translatedValue !== 'string' || !translatedValue.trim() && !!String(baseValue ?? '').trim();
      })
    : [];

  const warning = actualLocale !== 'es' && missing.length > 0
    ? `Hay ${missing.length} campos que no están traducidos; se muestran en español.`
    : '';

  return {
    locale: actualLocale,
    fallbackLocale: 'es',
    bases: baseValues,
    titulo: resolved.titulo,
    descripcion: resolved.descripcion,
    categoria: resolved.categoria,
    portadaUrl: resolved.portadaUrl,
    miniaturaUrl: resolved.miniaturaUrl,
    detalles: resolved.detalles,
    missing,
    warning,
  };
}
export type JuniorActivityBlock = {
  tipo: string;
  titulo: string;
  instrucciones: string;
  datos: Record<string, unknown>;
  [key: string]: unknown;
};

export type JuniorActivityContent = {
  version: number;
  bloques: JuniorActivityBlock[];
  [key: string]: unknown;
};

const DEFAULT_CONTENT: JuniorActivityContent = { version: 2, bloques: [] };

export function parseActivityContent(source: string): JuniorActivityContent {
  const parsed: unknown = JSON.parse(source);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('El contenido debe ser un objeto JSON.');
  }
  const content = parsed as Record<string, unknown>;
  if (!Array.isArray(content.bloques)) throw new Error('El contenido debe incluir un array "bloques".');
  if (!content.bloques.every((block) => block && typeof block === 'object' && !Array.isArray(block))) {
    throw new Error('Cada bloque debe ser un objeto.');
  }
  return { ...content, version: Number(content.version) || 2, bloques: content.bloques as JuniorActivityBlock[] };
}

export function createActivityBlock(tipo: JuniorActivityType, index = 0): JuniorActivityBlock {
  const base = { titulo: `Reto ${index + 1}`, instrucciones: '¡Vamos a jugar!', datos: {} };
  switch (tipo) {
    case 'test':
      return { ...base, tipo, preguntas: [{ pregunta: '¿Cuál es la respuesta?', opciones: ['Opción A', 'Opción B'], correcta: 0 }] };
    case 'clic':
      return { ...base, tipo, instrucciones: 'Pulsa todos los animales.', datos: { objetivo: 2, objetos: [{ id: 'gato', texto: 'Gato', emoji: '🐱', correcto: true }, { id: 'perro', texto: 'Perro', emoji: '🐶', correcto: true }, { id: 'coche', texto: 'Coche', emoji: '🚗', correcto: false }] } };
    case 'arrastrar':
      return { ...base, tipo, instrucciones: 'Coloca cada animal en su grupo.', datos: { elementos: [{ id: 'gato', texto: 'Gato', emoji: '🐱' }, { id: 'perro', texto: 'Perro', emoji: '🐶' }], zonas: [{ id: 'granja', nombre: 'Granja' }, { id: 'casa', nombre: 'Casa' }], respuestas: { gato: 'casa', perro: 'casa' } } };
    case 'lineas':
      return { ...base, tipo, instrucciones: 'Une cada animal con su sonido.', datos: { pares: [{ id: 'gato', izq: '🐱 Gato', der: 'Miau' }, { id: 'perro', izq: '🐶 Perro', der: 'Guau' }] } };
    case 'construir_frase':
      return { ...base, tipo, instrucciones: 'Ordena las palabras para formar una frase.', datos: { palabras: ['El', 'sol', 'brilla'], respuesta: 'El sol brilla' } };
    case 'memoria':
      return { ...base, tipo, instrucciones: 'Encuentra parejas iguales.', datos: { tarjetas: ['🐱', '🐱', '🐶', '🐶'] } };
    case 'dibujo':
      return { ...base, tipo, instrucciones: 'Repasa los puntos y dibuja la forma.', datos: { objetivo: 'Una montaña', forma: 'montana', puntos: [{ x: 0.15, y: 0.8 }, { x: 0.5, y: 0.2 }, { x: 0.85, y: 0.8 }] } };
    case 'fisica_objetos':
      return { ...base, tipo, instrucciones: 'Ajusta la fuerza y el ángulo para alcanzar la meta.', datos: { objeto: '⚽', objetivo: '🥅', distancia: 65, potencia: 65, angulo: 45, gravedad: 9.8, intentos: 3 } };
  }
}

export function validateActivityContent(content: JuniorActivityContent): string[] {
  const errors: string[] = [];
  if (content.bloques.length === 0) errors.push('Añade al menos un reto antes de guardar.');
  content.bloques.forEach((block, index) => {
    const number = index + 1;
    const data = block.datos && typeof block.datos === 'object' ? block.datos : {};
    if (!block.tipo?.trim()) errors.push(`Reto ${number}: falta elegir un tipo.`);
    if (!block.titulo?.trim()) errors.push(`Reto ${number}: añade un título.`);
    if (block.tipo === 'test') {
      const questions = Array.isArray(block.preguntas) ? block.preguntas as Array<Record<string, unknown>> : [];
      const options = Array.isArray(questions[0]?.opciones) ? questions[0].opciones : [];
      if (!questions.length || !questions[0].pregunta || options.length < 2) errors.push(`Reto ${number}: añade una pregunta y al menos dos opciones.`);
      else if (!Number.isInteger(questions[0].correcta) || Number(questions[0].correcta) < 0 || Number(questions[0].correcta) >= options.length) errors.push(`Reto ${number}: marca una respuesta correcta.`);
    }
    if (block.tipo === 'clic') {
      const objects = Array.isArray(data.objetos) ? data.objetos as Array<Record<string, unknown>> : [];
      const target = Number(data.objetivo);
      if (!objects.length || !Number.isInteger(target) || target < 1 || objects.filter((object) => object.correcto === true).length !== target) errors.push(`Reto ${number}: indica los objetos correctos y ajusta cuántos hay que encontrar.`);
    }
    if (block.tipo === 'arrastrar') {
      const items = Array.isArray(data.elementos) ? data.elementos as Array<Record<string, unknown>> : [];
      const zones = Array.isArray(data.zonas) ? data.zonas as Array<Record<string, unknown>> : [];
      const answers = data.respuestas && typeof data.respuestas === 'object' ? data.respuestas as Record<string, unknown> : {};
      if (!items.length || zones.length < 2 || items.some((item) => !answers[String(item.id)] || !zones.some((zone) => zone.id === answers[String(item.id)]))) errors.push(`Reto ${number}: cada elemento debe tener una categoría válida.`);
    }
    if (block.tipo === 'lineas') {
      const pairs = Array.isArray(data.pares) ? data.pares as Array<Record<string, unknown>> : [];
      if (pairs.length < 2 || pairs.some((pair) => !pair.izq || !pair.der)) errors.push(`Reto ${number}: crea al menos dos parejas completas.`);
    }
    if (block.tipo === 'construir_frase') {
      const words = Array.isArray(data.palabras) ? data.palabras : [];
      if (words.length < 2 || !String(data.respuesta || '').trim()) errors.push(`Reto ${number}: añade las palabras y la frase correcta.`);
    }
    if (block.tipo === 'memoria') {
      const cards = Array.isArray(data.tarjetas) ? data.tarjetas as string[] : [];
      if (cards.length < 4 || cards.length % 2 !== 0) errors.push(`Reto ${number}: añade al menos cuatro tarjetas, en parejas.`);
    }
    if (block.tipo === 'dibujo') {
      const points = Array.isArray(data.puntos) ? data.puntos as Array<Record<string, unknown>> : [];
      if (points.length < 2) errors.push(`Reto ${number}: añade al menos dos puntos para guiar el dibujo.`);
      else if (points.some((point) => !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y)) || Number(point.x) < 0 || Number(point.x) > 1 || Number(point.y) < 0 || Number(point.y) > 1)) errors.push(`Reto ${number}: los puntos del dibujo deben estar entre 0 y 1.`);
    }
    if (block.tipo === 'fisica_objetos') {
      const distance = Number(data.distancia);
      const power = Number(data.potencia);
      const attempts = Number(data.intentos ?? 3);
      if (!data.objeto || !data.objetivo || !Number.isFinite(distance) || distance < 10 || distance > 90 || !Number.isFinite(power) || power < 10 || power > 100 || !Number.isInteger(attempts) || attempts < 1 || attempts > 10) errors.push(`Reto ${number}: configura los objetos, distancia (10–90), potencia (10–100) e intentos (1–10).`);
    }
  });
  return errors;
}

export function serializeActivityContent(content: JuniorActivityContent): string {
  return JSON.stringify(content, null, 2);
}

export function createEmptyActivityContent(): string {
  return serializeActivityContent(DEFAULT_CONTENT);
}
