import { describe, expect, it } from 'vitest';
import { aplicarInteriorTraducido, buildTranslationPrompt, contarDesajustes, mergeTranslations, parseTranslationsJson } from '../pages/junior/traduccionesModel';
import { createActivityBlock } from '../pages/junior/activityStudioModel';

describe('Traducciones Junior con IA', () => {
  it('genera un prompt con los idiomas y el texto base', () => {
    const prompt = buildTranslationPrompt({ titulo: 'Animales', descripcion: 'Aprende', categoria: 'Ciencia', idiomas: ['ca', 'fr', 'x!'] });
    expect(prompt).toContain('"ca" → Català');
    expect(prompt).toContain('"fr" → Français');
    expect(prompt).not.toContain('x!');
    expect(prompt).toContain('"titulo": "Animales"');
  });

  it('acepta JSON con vallas markdown y texto alrededor', () => {
    const r = parseTranslationsJson('Aquí tienes:\n```json\n{"CA":{"titulo":"Animals","descripcion":"Aprèn","categoria":"Ciència"}}\n```');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.traducciones.ca).toEqual({ titulo: 'Animals', descripcion: 'Aprèn', categoria: 'Ciència', portadaUrl: '', miniaturaUrl: '' });
  });

  it('acepta el JSON envuelto en "traducciones" e ignora es y claves inválidas', () => {
    const r = parseTranslationsJson('{"traducciones":{"es":{"titulo":"x"},"en":{"titulo":"Animals"},"no valido":{}}}');
    expect(r.ok).toBe(true);
    if (r.ok) { expect(Object.keys(r.traducciones)).toEqual(['en']); expect(r.ignorados).toEqual(['es', 'no valido']); }
  });

  it('da errores claros con JSON vacío o roto', () => {
    expect(parseTranslationsJson('  ')).toMatchObject({ ok: false });
    expect(parseTranslationsJson('{rota')).toMatchObject({ ok: false });
    expect(parseTranslationsJson('[]')).toMatchObject({ ok: false });
  });

  it('al fusionar, un campo vacío importado no borra texto existente', () => {
    const actuales = { ca: { titulo: 'Manual', descripcion: '', categoria: '', portadaUrl: 'a.png', miniaturaUrl: '' } };
    const importadas = { ca: { titulo: '', descripcion: 'Nova', categoria: '', portadaUrl: '', miniaturaUrl: '' }, en: { titulo: 'T', descripcion: '', categoria: '', portadaUrl: '', miniaturaUrl: '' } };
    const r = mergeTranslations(actuales, importadas).traducciones;
    expect(r.ca).toMatchObject({ titulo: 'Manual', descripcion: 'Nova', portadaUrl: 'a.png' });
    expect(r.en.titulo).toBe('T');
  });
});

describe('Traducción del interior de la actividad', () => {
  const base = () => ({
    version: 2,
    subvencionada: true,
    traducciones: { ca: {} },
    bloques: [
      { ...createActivityBlock('test', 0), titulo: 'Animales', instrucciones: 'Elige la respuesta', preguntas: [{ pregunta: '¿Quién ladra?', opciones: ['Gato', 'Perro'], correcta: 1 }] },
      { ...createActivityBlock('construir_frase', 1), titulo: 'Frase', datos: { palabras: ['El', 'sol', 'brilla'], respuesta: 'El sol brilla' } },
      { ...createActivityBlock('arrastrar', 2), datos: { elementos: [{ id: 'gato', texto: 'Gato', emoji: '🐱' }], zonas: [{ id: 'casa', nombre: 'Casa' }, { id: 'granja', nombre: 'Granja' }], respuestas: { gato: 'casa' } } },
    ],
  });

  it('incluye el interior en el prompt sin los metadatos internos', () => {
    const prompt = buildTranslationPrompt({ titulo: 'T', descripcion: 'D', categoria: 'C', idiomas: ['ca'], contenido: base() });
    expect(prompt).toContain('CONTENIDO ORIGINAL');
    expect(prompt).toContain('¿Quién ladra?');
    expect(prompt).not.toContain('subvencionada');
    expect(prompt).toContain('"contenido"');
    expect(buildTranslationPrompt({ titulo: 'T', descripcion: 'D', categoria: 'C', idiomas: ['ca'], contenido: null })).not.toContain('CONTENIDO ORIGINAL');
  });

  it('traduce los textos y conserva ids, soluciones y estructura del original', () => {
    const t = JSON.parse(JSON.stringify(base()));
    t.bloques[0].titulo = 'Animals'; t.bloques[0].preguntas[0] = { pregunta: 'Qui lladra?', opciones: ['Gat', 'Gos'], correcta: 0 };
    t.bloques[1].datos = { palabras: ['El', 'sol', 'brilla'], respuesta: 'El sol brilla' };
    t.bloques[2].datos.elementos[0] = { id: 'HACKED', texto: 'Gat', emoji: '🐶' };
    t.bloques[2].datos.zonas[0].nombre = 'Casa (ca)';
    t.bloques[2].datos.respuestas = { gato: 'granja' };
    const r = aplicarInteriorTraducido(base(), t);
    const b = r.contenido.bloques as any[];
    expect(b[0].titulo).toBe('Animals');
    expect(b[0].preguntas[0]).toEqual({ pregunta: 'Qui lladra?', opciones: ['Gat', 'Gos'], correcta: 1 });
    expect(b[2].datos.elementos[0]).toEqual({ id: 'gato', texto: 'Gat', emoji: '🐱' });
    expect(b[2].datos.respuestas).toEqual({ gato: 'casa' });
    expect(r.contenido).not.toHaveProperty('traducciones');
    expect(r.contenido).not.toHaveProperty('subvencionada');
  });

  it('avisa si la frase correcta ya no coincide con las palabras o cambia el número de elementos', () => {
    const t = JSON.parse(JSON.stringify(base()));
    t.bloques[1].datos = { palabras: ['Le', 'soleil', 'brille'], respuesta: 'Le soleil luit' };
    t.bloques[0].preguntas[0].opciones = ['Solo una'];
    const r = aplicarInteriorTraducido(base(), t);
    expect(r.avisos.some((a) => a.includes('frase correcta no coincide'))).toBe(true);
    expect(r.avisos.some((a) => a.includes('se mantiene el original'))).toBe(true);
    expect((r.contenido.bloques as any[])[0].preguntas[0].opciones).toEqual(['Gato', 'Perro']);
  });

  it('importa el interior desde el JSON de la IA y lo valida contra la base', () => {
    const t = JSON.parse(JSON.stringify(base())); t.bloques[0].titulo = 'Animals';
    const json = JSON.stringify({ en: { titulo: 'Animals', descripcion: 'x', categoria: 'y', portadaUrl: '', miniaturaUrl: '', contenido: t } });
    const parsed = parseTranslationsJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = mergeTranslations({}, parsed.traducciones, base());
    expect(r.interiores).toBe(1);
    expect((r.traducciones.en.contenido!.bloques as any[])[0].titulo).toBe('Animals');
    expect(contarDesajustes(base(), r.traducciones.en.contenido)).toBe(0);
  });

  it('ignora el interior si la actividad base aún no tiene retos', () => {
    const r = mergeTranslations({}, { en: { titulo: 'A', descripcion: '', categoria: '', portadaUrl: '', miniaturaUrl: '', contenido: { bloques: [{ titulo: 'x' }] } } }, { version: 2, bloques: [] });
    expect(r.traducciones.en.contenido).toBeUndefined();
    expect(r.avisos).toHaveLength(1);
  });

  it('detecta traducciones desfasadas cuando cambia el contenido base', () => {
    const traducido = aplicarInteriorTraducido(base(), base()).contenido;
    const nuevo = base(); nuevo.bloques.push(createActivityBlock('memoria', 3) as any);
    expect(contarDesajustes(nuevo, traducido)).toBeGreaterThan(0);
    expect(contarDesajustes(base(), traducido)).toBe(0);
  });
});
