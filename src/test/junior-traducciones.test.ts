import { describe, expect, it } from 'vitest';
import { buildTranslationPrompt, mergeTranslations, parseTranslationsJson } from '../pages/junior/traduccionesModel';

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
    const r = mergeTranslations(actuales, importadas);
    expect(r.ca).toMatchObject({ titulo: 'Manual', descripcion: 'Nova', portadaUrl: 'a.png' });
    expect(r.en.titulo).toBe('T');
  });
});
