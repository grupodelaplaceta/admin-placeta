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
export type ContenidoJunior = Record<string, unknown>;
/** Textos de la ficha + (opcional) copia traducida de todo el interior de la actividad. */
export type TextoTraducido = Record<CampoTraduccion, string> & { contenido?: ContenidoJunior };
export type TraduccionesJunior = Record<string, TextoTraducido>;

/** Código de idioma válido: 2 a 5 letras (es, ca, val, zh…). */
export function esCodigoIdioma(codigo: string): boolean {
  return /^[a-z]{2,5}$/.test(codigo);
}

export function nombreIdioma(codigo: string): string {
  return IDIOMAS_JUNIOR.find((lang) => lang.id === codigo)?.label ?? codigo.toUpperCase();
}

export const traduccionVacia = (): TextoTraducido => ({ titulo: '', descripcion: '', categoria: '', portadaUrl: '', miniaturaUrl: '' });

/* ── Interior de la actividad (retos, preguntas, opciones…) ───────────── */

/** Claves de `contenido` que gestiona el panel y que nunca se envían a traducir. */
const CLAVES_META_CONTENIDO = new Set(['traducciones', 'idioma', 'codigoDevai', 'version', 'subvencionada']);
/** Claves cuyo valor es técnico (ids, tipos, soluciones, colores…): jamás se traducen. */
const CLAVES_NO_TRADUCIBLES = new Set(['id', 'tipo', 'forma', 'correcta', 'correcto', 'respuestas', 'color', 'emoji', 'objeto', 'url', 'src', 'imagen', 'portadaUrl', 'miniaturaUrl', 'version']);

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Copia del contenido sin metadatos internos: es lo que hay que traducir. */
export function contenidoTraducible(contenido: unknown): ContenidoJunior | null {
  if (!esObjeto(contenido)) return null;
  const limpio: ContenidoJunior = {};
  for (const [clave, valor] of Object.entries(contenido)) {
    if (CLAVES_META_CONTENIDO.has(clave) || clave.startsWith('__rsp')) continue;
    limpio[clave] = valor;
  }
  return limpio;
}

/** ¿Hay algo que traducir? (al menos un reto, nivel o diapositiva). */
export function tieneInterior(contenido: unknown): boolean {
  const c = contenidoTraducible(contenido);
  if (!c) return false;
  return ['bloques', 'niveles', 'diapositivas'].some((k) => Array.isArray(c[k]) && (c[k] as unknown[]).length > 0);
}

function esTextoTraducible(valor: string, clave: string): boolean {
  if (CLAVES_NO_TRADUCIBLES.has(clave)) return false;
  if (!/\p{L}/u.test(valor)) return false; // solo emojis, números o signos
  if (/^(https?:|data:|\/)/i.test(valor.trim())) return false;
  if (/^#[0-9a-f]{3,8}$/i.test(valor.trim())) return false;
  return true;
}

type Ctx = { avisos: string[]; cambiados: number };

function fusionar(base: unknown, trad: unknown, ruta: string, clave: string, ctx: Ctx): unknown {
  if (typeof base === 'string') {
    if (typeof trad === 'string' && trad.trim() && esTextoTraducible(base, clave)) { if (trad !== base) ctx.cambiados += 1; return trad; }
    return base;
  }
  if (Array.isArray(base)) {
    if (trad === undefined) return base;
    if (!Array.isArray(trad)) { ctx.avisos.push(`${ruta}: se esperaba una lista; se mantiene el original.`); return base; }
    if (trad.length !== base.length) { ctx.avisos.push(`${ruta}: la IA devolvió ${trad.length} elementos y el original tiene ${base.length}; se mantiene el original.`); return base; }
    return base.map((item, i) => fusionar(item, trad[i], `${ruta}[${i + 1}]`, clave, ctx));
  }
  if (esObjeto(base)) {
    const t = esObjeto(trad) ? trad : {};
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(base)) salida[k] = CLAVES_NO_TRADUCIBLES.has(k) ? v : fusionar(v, t[k], ruta ? `${ruta}.${k}` : k, k, ctx);
    return salida;
  }
  return base; // números, booleanos, null
}

function tokens(texto: string): string[] { return texto.trim().split(/\s+/).filter(Boolean).sort(); }

/** Detecta traducciones que rompen la lógica del juego (frases que ya no encajan, parejas rotas). */
function revisarCoherencia(nodo: unknown, avisos: string[], ruta = ''): void {
  if (Array.isArray(nodo)) { nodo.forEach((n, i) => revisarCoherencia(n, avisos, `${ruta}[${i + 1}]`)); return; }
  if (!esObjeto(nodo)) return;
  const datos = esObjeto(nodo.datos) ? nodo.datos : {};
  const nombre = typeof nodo.titulo === 'string' && nodo.titulo ? `«${nodo.titulo}»` : ruta || 'actividad';
  if (nodo.tipo === 'construir_frase' && Array.isArray(datos.palabras) && typeof datos.respuesta === 'string') {
    const a = tokens((datos.palabras as unknown[]).map(String).join(' '));
    const b = tokens(datos.respuesta);
    if (a.length !== b.length || a.some((w, i) => w !== b[i])) avisos.push(`${nombre}: la frase correcta no coincide con las palabras traducidas (revísalo para que se pueda resolver).`);
  }
  if (nodo.tipo === 'memoria' && Array.isArray(datos.tarjetas)) {
    const cuenta = new Map<string, number>();
    (datos.tarjetas as unknown[]).forEach((t) => cuenta.set(String(t), (cuenta.get(String(t)) ?? 0) + 1));
    if ([...cuenta.values()].some((n) => n % 2 !== 0)) avisos.push(`${nombre}: las tarjetas de memoria ya no forman parejas idénticas.`);
  }
  for (const [k, v] of Object.entries(nodo)) if (typeof v === 'object' && v) revisarCoherencia(v, avisos, ruta ? `${ruta}.${k}` : k);
}

/**
 * Aplica un interior traducido sobre el interior base conservando SIEMPRE la estructura base:
 * solo se aceptan textos legibles; ids, soluciones, números, colores y URLs salen del original.
 */
export function aplicarInteriorTraducido(base: unknown, traducido: unknown): { contenido: ContenidoJunior; avisos: string[]; cambiados: number } {
  const ctx: Ctx = { avisos: [], cambiados: 0 };
  const limpioBase = contenidoTraducible(base) ?? {};
  const contenido = fusionar(limpioBase, contenidoTraducible(traducido) ?? {}, '', '', ctx) as ContenidoJunior;
  revisarCoherencia(contenido, ctx.avisos);
  if (ctx.cambiados === 0) ctx.avisos.push('El interior devuelto no contiene textos traducidos distintos del original.');
  return { contenido, avisos: ctx.avisos, cambiados: ctx.cambiados };
}

/** Nº de diferencias de estructura entre el interior base y uno traducido (>0 ⇒ la traducción quedó desfasada). */
export function contarDesajustes(base: unknown, traducido: unknown): number {
  const a = contenidoTraducible(base);
  const b = contenidoTraducible(traducido);
  if (!a || !b) return 0;
  const walk = (x: unknown, y: unknown): number => {
    if (Array.isArray(x)) return !Array.isArray(y) || x.length !== y.length ? 1 : x.reduce<number>((n, item, i) => n + walk(item, y[i]), 0);
    if (esObjeto(x)) return !esObjeto(y) ? 1 : Object.keys(x).reduce((n, k) => n + (k in y ? walk(x[k], y[k]) : 1), 0);
    return 0;
  };
  return walk(a, b);
}

export function buildTranslationPrompt(params: {
  titulo: string;
  descripcion: string;
  categoria: string;
  idiomaBase?: string;
  idiomas: string[];
  /** Interior de la actividad (retos, preguntas…). Si se pasa, también se traduce. */
  contenido?: ContenidoJunior | null;
}): string {
  const idiomas = params.idiomas.filter(esCodigoIdioma);
  const base = nombreIdioma(params.idiomaBase || 'es');
  const lista = idiomas.map((codigo) => `- "${codigo}" → ${nombreIdioma(codigo)}`).join('\n');
  const interior = tieneInterior(params.contenido) ? contenidoTraducible(params.contenido) : null;
  const ficha = JSON.stringify({ titulo: params.titulo, descripcion: params.descripcion, categoria: params.categoria }, null, 2);
  const ejemplo: Record<string, Record<string, unknown>> = {};
  (idiomas.length ? idiomas : ['en']).slice(0, 2).forEach((codigo) => {
    ejemplo[codigo] = { titulo: '…', descripcion: '…', categoria: '…', portadaUrl: '', miniaturaUrl: '', ...(interior ? { contenido: '{ …misma estructura que "contenido" original, con los textos traducidos… }' } : {}) };
  });

  const reglas = [
    `1. Responde ÚNICAMENTE con un objeto JSON válido: sin explicaciones, sin saludos y sin bloques de código markdown.`,
    `2. Las claves del primer nivel son los códigos de idioma (exactamente los de la lista).`,
    interior
      ? `3. Cada idioma contiene SIEMPRE estas 6 claves, sin añadir ni renombrar ninguna: "titulo", "descripcion", "categoria", "portadaUrl", "miniaturaUrl", "contenido".`
      : `3. Cada idioma contiene SIEMPRE estas 5 claves, sin añadir ni renombrar ninguna: "titulo", "descripcion", "categoria", "portadaUrl", "miniaturaUrl".`,
    `4. Traduce "titulo", "descripcion" y "categoria". Si el texto original está vacío, deja la cadena vacía.`,
    `5. "portadaUrl" y "miniaturaUrl" déjalas siempre como cadena vacía "".`,
    `6. Mantén nombres propios y emojis. Escapa correctamente las comillas dentro de los textos.`,
  ];
  if (interior) {
    reglas.push(
      `7. "contenido" es una copia EXACTA del "CONTENIDO ORIGINAL": mismas claves, mismo orden y listas con el mismo número de elementos. Solo cambian los textos que lee el alumno.`,
      `8. Traduce únicamente textos legibles: "titulo", "instrucciones", "pregunta", "opciones", "texto", "nombre", "izq", "der", "palabras", "respuesta", "tarjetas" (si son palabras), "objetivo" (si es un texto), "aria_label", pistas, explicaciones y popups.`,
      `9. NO modifiques: "id", "tipo", "forma", "correcta", "correcto", "respuestas", números, booleanos, coordenadas, colores, URLs ni emojis.`,
      `10. En "construir_frase", "respuesta" debe ser exactamente la frase que se forma con las "palabras" traducidas (las mismas palabras, separadas por espacios).`,
      `11. En "memoria", cada tarjeta debe seguir apareciendo el mismo número de veces (parejas idénticas).`,
      `12. En "test", "correcta" es la posición de la opción correcta: conserva el orden de "opciones".`,
    );
  }

  return [
    `Eres traductor profesional de contenidos educativos para niños y jóvenes de 3 a 17 años (plataforma Placeta Junior).`,
    `Traduce los textos de una actividad desde ${base} a los idiomas indicados, con un lenguaje claro, cercano y adecuado a la edad.`,
    ``,
    `REGLAS`,
    ...reglas,
    ``,
    `IDIOMAS DE DESTINO`,
    lista || '- (elige al menos un idioma)',
    ``,
    `FICHA ORIGINAL (${base})`,
    ficha,
    ...(interior ? [``, `CONTENIDO ORIGINAL (${base})`, JSON.stringify(interior, null, 2)] : []),
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
    if (esObjeto(entrada.contenido)) texto.contenido = entrada.contenido;
    traducciones[codigo] = texto;
  }
  if (!Object.keys(traducciones).length) return { ok: false, error: 'No se ha encontrado ningún idioma válido en el JSON (el español es el idioma base y no se importa).' };
  return { ok: true, traducciones, ignorados };
}

/**
 * Fusiona lo importado con lo existente: los campos vacíos importados nunca borran texto ya escrito.
 * Si llega un `contenido` traducido se valida contra el interior base (`contenidoBase`) para no romper la actividad.
 */
export function mergeTranslations(
  actuales: Record<string, Partial<TextoTraducido>>,
  importadas: TraduccionesJunior,
  contenidoBase?: unknown,
): { traducciones: TraduccionesJunior; avisos: string[]; interiores: number } {
  const avisos: string[] = [];
  let interiores = 0;
  const resultado: TraduccionesJunior = {};
  for (const [codigo, valor] of Object.entries(actuales)) resultado[codigo] = { ...traduccionVacia(), ...valor };
  for (const [codigo, valor] of Object.entries(importadas)) {
    const siguiente: TextoTraducido = { ...(resultado[codigo] ?? traduccionVacia()) };
    for (const campo of CAMPOS_TRADUCCION) if (valor[campo].trim()) siguiente[campo] = valor[campo];
    if (valor.contenido) {
      if (!tieneInterior(contenidoBase)) {
        avisos.push(`${nombreIdioma(codigo)}: la actividad aún no tiene retos, así que se ha ignorado el interior traducido.`);
      } else {
        const r = aplicarInteriorTraducido(contenidoBase, valor.contenido);
        siguiente.contenido = r.contenido;
        interiores += 1;
        r.avisos.forEach((aviso) => avisos.push(`${nombreIdioma(codigo)} · ${aviso}`));
      }
    }
    resultado[codigo] = siguiente;
  }
  return { traducciones: resultado, avisos, interiores };
}
