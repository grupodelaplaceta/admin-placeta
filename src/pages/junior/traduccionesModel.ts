/**
 * Utilidades para generar traducciones de una actividad Junior con ayuda de una IA:
 *  1. `buildTranslationPrompt` crea un prompt listo para pegar en cualquier asistente.
 *  2. `parseTranslationsJson` valida el JSON que devuelve la IA.
 *  3. `mergeTranslations` lo fusiona con las traducciones existentes sin perder nada.
 */

export const IDIOMAS_JUNIOR = [
  { id: 'es', label: 'Español', flag: '🇪🇸' },
  { id: 'ca', label: 'Català', flag: '🇦🇩' },
  { id: 'eu', label: 'Euskara', flag: '🇪🇺' },
  { id: 'val', label: 'Valencià', flag: '🇪🇸' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'gl', label: 'Galego', flag: '🇪🇸' },
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { id: 'it', label: 'Italiano', flag: '🇮🇹' },
  { id: 'pt', label: 'Português', flag: '🇵🇹' },
  { id: 'ro', label: 'Română', flag: '🇷🇴' },
  { id: 'ar', label: 'العربية', flag: '🇸🇦' },
  { id: 'zh', label: '中文', flag: '🇨🇳' },
  { id: 'uk', label: 'Українська', flag: '🇺🇦' },
] as const;

export const CAMPOS_TRADUCCION = ['titulo', 'descripcion', 'categoria', 'portadaUrl', 'miniaturaUrl'] as const;
export type CampoTraduccion = (typeof CAMPOS_TRADUCCION)[number];
export type TextoTraducido = Record<CampoTraduccion, string>;
export type TraduccionesJunior = Record<string, TextoTraducido>;

/** Código de idioma válido: 2 a 5 letras (es, ca, val, zh…). */
export function esCodigoIdioma(codigo: string): boolean {
  return /^[a-z]{2,5}$/.test(codigo);
}

export function nombreIdioma(codigo: string): string {
  return IDIOMAS_JUNIOR.find((lang) => lang.id === codigo)?.label ?? codigo.toUpperCase();
}

export const traduccionVacia = (): TextoTraducido => ({ titulo: '', descripcion: '', categoria: '', portadaUrl: '', miniaturaUrl: '' });

export function buildTranslationPrompt(params: {
  titulo: string;
  descripcion: string;
  categoria: string;
  idiomaBase?: string;
  idiomas: string[];
}): string {
  const idiomas = params.idiomas.filter(esCodigoIdioma);
  const base = nombreIdioma(params.idiomaBase || 'es');
  const lista = idiomas.map((codigo) => `- "${codigo}" → ${nombreIdioma(codigo)}`).join('\n');
  const origen = JSON.stringify({ titulo: params.titulo, descripcion: params.descripcion, categoria: params.categoria }, null, 2);
  const ejemplo: Record<string, TextoTraducido> = {};
  (idiomas.length ? idiomas : ['en']).slice(0, 2).forEach((codigo) => { ejemplo[codigo] = { titulo: '…', descripcion: '…', categoria: '…', portadaUrl: '', miniaturaUrl: '' }; });

  return [
    `Eres traductor profesional de contenidos educativos para niños y jóvenes de 3 a 17 años (plataforma Placeta Junior).`,
    `Traduce los textos de una actividad desde ${base} a los idiomas indicados, con un lenguaje claro, cercano y adecuado a la edad.`,
    ``,
    `REGLAS`,
    `1. Responde ÚNICAMENTE con un objeto JSON válido: sin explicaciones, sin saludos y sin bloques de código markdown.`,
    `2. Las claves del primer nivel son los códigos de idioma (exactamente los de la lista).`,
    `3. Cada idioma contiene SIEMPRE estas 5 claves, sin añadir ni renombrar ninguna: "titulo", "descripcion", "categoria", "portadaUrl", "miniaturaUrl".`,
    `4. Traduce "titulo", "descripcion" y "categoria". Si el texto original está vacío, deja la cadena vacía.`,
    `5. "portadaUrl" y "miniaturaUrl" déjalas siempre como cadena vacía "".`,
    `6. Mantén nombres propios, emojis y signos de puntuación propios del idioma de destino. Escapa correctamente las comillas dentro de los textos.`,
    ``,
    `IDIOMAS DE DESTINO`,
    lista || '- (elige al menos un idioma)',
    ``,
    `TEXTO ORIGINAL (${base})`,
    origen,
    ``,
    `FORMATO DE RESPUESTA ESPERADO`,
    JSON.stringify(ejemplo, null, 2),
  ].join('\n');
}

export type ResultadoImportacion =
  | { ok: true; traducciones: TraduccionesJunior; ignorados: string[] }
  | { ok: false; error: string };

/** Quita ```json … ``` y texto alrededor del primer objeto JSON, por si la IA añade ruido. */
function extraerJson(raw: string): string {
  const sinVallas = raw.replace(/```(?:json)?/gi, '').trim();
  const inicio = sinVallas.indexOf('{');
  const fin = sinVallas.lastIndexOf('}');
  return inicio >= 0 && fin > inicio ? sinVallas.slice(inicio, fin + 1) : sinVallas;
}

export function parseTranslationsJson(raw: string): ResultadoImportacion {
  if (!raw.trim()) return { ok: false, error: 'Pega primero el JSON que ha devuelto la IA.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(extraerJson(raw));
  } catch {
    return { ok: false, error: 'El JSON no es válido. Pídele a la IA que responda solo con el JSON, sin texto adicional.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'El JSON debe ser un objeto con un idioma por clave.' };

  let origen = parsed as Record<string, unknown>;
  const envuelto = origen.traducciones;
  if (envuelto && typeof envuelto === 'object' && !Array.isArray(envuelto)) origen = envuelto as Record<string, unknown>;

  const traducciones: TraduccionesJunior = {};
  const ignorados: string[] = [];
  for (const [clave, valor] of Object.entries(origen)) {
    const codigo = clave.trim().toLowerCase();
    if (!esCodigoIdioma(codigo) || codigo === 'es' || !valor || typeof valor !== 'object' || Array.isArray(valor)) {
      ignorados.push(clave);
      continue;
    }
    const entrada = valor as Record<string, unknown>;
    const texto = traduccionVacia();
    for (const campo of CAMPOS_TRADUCCION) texto[campo] = typeof entrada[campo] === 'string' ? (entrada[campo] as string) : '';
    traducciones[codigo] = texto;
  }
  if (!Object.keys(traducciones).length) return { ok: false, error: 'No se ha encontrado ningún idioma válido en el JSON (el español es el idioma base y no se importa).' };
  return { ok: true, traducciones, ignorados };
}

/** Fusiona lo importado con lo existente: los campos vacíos importados nunca borran texto ya escrito. */
export function mergeTranslations(actuales: Record<string, Partial<TextoTraducido>>, importadas: TraduccionesJunior): TraduccionesJunior {
  const resultado: TraduccionesJunior = {};
  for (const [codigo, valor] of Object.entries(actuales)) resultado[codigo] = { ...traduccionVacia(), ...valor };
  for (const [codigo, valor] of Object.entries(importadas)) {
    const previo = resultado[codigo] ?? traduccionVacia();
    const siguiente = { ...previo };
    for (const campo of CAMPOS_TRADUCCION) if (valor[campo].trim()) siguiente[campo] = valor[campo];
    resultado[codigo] = siguiente;
  }
  return resultado;
}
