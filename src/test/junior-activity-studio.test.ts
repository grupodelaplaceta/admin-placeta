import { describe, expect, it } from 'vitest';
import {
  createActivityBlock,
  JUNIOR_ACTIVITY_TYPES,
  parseActivityContent,
  resolveActivityLocale,
  serializeActivityContent,
  validateActivityContent,
} from '../pages/junior/activityStudioModel';

describe('Studio de actividades de Placeta Junior', () => {
  it('crea plantillas listas para configurar para todos los tipos', () => {
    const blocks = JUNIOR_ACTIVITY_TYPES.map((type, index) => createActivityBlock(type.id, index));
    const content = { version: 2, bloques: blocks };

    expect(validateActivityContent(content)).toEqual([]);
    expect(blocks[0].preguntas).toEqual([{ pregunta: '¿Cuál es la respuesta?', opciones: ['Opción A', 'Opción B'], correcta: 0 }]);
    expect(parseActivityContent(serializeActivityContent(content))).toEqual(content);
  });

  it('rechaza contenido mal formado con mensajes útiles', () => {
    expect(() => parseActivityContent('[]')).toThrow('objeto JSON');
    expect(() => parseActivityContent('{"version":2}')).toThrow('array "bloques"');
    expect(() => parseActivityContent('{"bloques":[null]}')).toThrow('Cada bloque debe ser un objeto');
  });

  it('no permite guardar preguntas sin respuesta correcta', () => {
    const content = {
      version: 2,
      bloques: [{
        ...createActivityBlock('test'),
        preguntas: [{ pregunta: '¿Cuál?', opciones: [{ texto: 'A', correcta: false }, { texto: 'B', correcta: false }] }],
      }],
    };

    expect(validateActivityContent(content)).toContain('Reto 1: marca una respuesta correcta.');
  });

  it('comprueba que los elementos arrastrables tengan una categoría real', () => {
    const block = createActivityBlock('arrastrar');
    block.datos = {
      elementos: [{ id: 'gato', texto: 'Gato' }],
      zonas: [{ id: 'casa', nombre: 'Casa' }, { id: 'campo', nombre: 'Campo' }],
      respuestas: { gato: 'no-existe' },
    };

    expect(validateActivityContent({ version: 2, bloques: [block] })).toContain('Reto 1: cada elemento debe tener una categoría válida.');
  });

  it('requiere geometría y parámetros de lanzamiento válidos', () => {
    const dibujo = createActivityBlock('dibujo');
    dibujo.datos = { objetivo: 'Una forma', puntos: [{ x: 0.5, y: 0.5 }] };
    const fisica = createActivityBlock('fisica_objetos');
    fisica.datos = { objeto: '⚽', objetivo: '🥅', distancia: 120, potencia: 65 };

    expect(validateActivityContent({ version: 2, bloques: [dibujo, fisica] })).toEqual([
      'Reto 1: añade al menos dos puntos para guiar el dibujo.',
      'Reto 2: configura los objetos, distancia (10–90), potencia (10–100) e intentos (1–10).',
    ]);
  });

  it('usa la traducción del idioma solicitado con fallback a español y marca lo que falta', () => {
    const activity = {
      titulo: 'Cuenta y suma',
      descripcion: 'Aprende a sumar en español.',
      categoria: 'Matemáticas',
      idioma: 'es',
      traducciones: {
        ca: { titulo: 'Compteja i suma', descripcion: 'Aprèn a sumar en català.' },
      },
    };

    const result = resolveActivityLocale(activity, 'ca');

    expect(result.locale).toBe('ca');
    expect(result.titulo).toBe('Compteja i suma');
    expect(result.descripcion).toBe('Aprèn a sumar en català.');
    expect(result.categoria).toBe('Matemáticas');
    expect(result.missing).toEqual(['categoria']);

    const missingResult = resolveActivityLocale({ ...activity, traducciones: { ca: { titulo: 'Compteja i suma' } } }, 'ca');
    expect(missingResult.categoria).toBe('Matemáticas');
    expect(missingResult.missing).toContain('categoria');
    expect(missingResult.warning).toContain('no están traducidos');
  });
});
