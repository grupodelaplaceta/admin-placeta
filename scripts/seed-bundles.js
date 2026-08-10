/**
 * SEED — Placeta Junior Code + Bundle de acceso anticipado
 *
 * Crea:
 *  - Bundle "Placeta Junior Code — Acceso anticipado" (150 Pz)
 *  - Actividades code_blocks de ejemplo (10-15)
 *  - Asocia las actividades al bundle
 *
 * IMPORTANTE: requiere que existan las tablas bundles / bundle_items.
 * Si no existen, ejecuta primero docs/migrar-academia-junior.sql en Supabase.
 *
 * Ejecutar: node scripts/seed-bundles.js
 */
import { supabase } from '../src/config/supabase.js';
import { sbCrearActividad, sbGetActividad, sbUpdateActividad } from '../src/config/junior-actividades.js';

const BUNDLE_ID = 'bundle_code_early_access';

// ── Ayudantes de escenario ─────────────────────────────────────────────
// Cuadrícula base 6x6 para todos los ejercicios.
const GRILLA = { tipo: 'cuadricula', ancho: 6, alto: 6 };

function escenario({ obstaculos = [], monedas = [] } = {}) {
  return { ...GRILLA, obstaculos, monedas };
}

// Ejercicio sencillo: Candela avanza en línea recta hacia la derecha.
function ejAvanzar(nombre, x, { explicacion, pistas = [], bloques = ['avanzar'] } = {}) {
  return {
    titulo: nombre,
    explicacion,
    objetivo_texto: `Lleva a Candela hasta la estrella (${x},0).`,
    escenario: escenario(),
    inicio: { x: 0, y: 0, direccion: 'derecha' },
    objetivo: { posicion: { x, y: 0 }, max_pasos: x + 2 },
    bloques_permitidos: bloques,
    pistas
  };
}

// Ejercicio con giros (Candela cambia de dirección).
function ejGirar(nombre, ruta, { explicacion, pistas = [], bloques = ['avanzar', 'girar'] } = {}) {
  // ruta: array de pasos [{ dx, dy }] ; objetivo = última posición
  const ultimo = ruta[ruta.length - 1];
  return {
    titulo: nombre,
    explicacion,
    objetivo_texto: `Lleva a Candela hasta la estrella (${ultimo.x},${ultimo.y}).`,
    escenario: escenario(),
    inicio: { x: 0, y: 0, direccion: 'derecha' },
    objetivo: { posicion: { x: ultimo.x, y: ultimo.y }, max_pasos: ruta.length * 2 + 3 },
    bloques_permitidos: bloques,
    pistas
  };
}

// Ejercicio con obstáculos que hay que esquivar.
function ejObstaculo(nombre, objetivoPos, { obstaculos = [], explicacion, pistas = [], bloques = ['avanzar', 'girar'], monedas = [] } = {}) {
  return {
    titulo: nombre,
    explicacion,
    objetivo_texto: `Lleva a Candela hasta la estrella (${objetivoPos.x},${objetivoPos.y}).`,
    escenario: escenario({ obstaculos, monedas }),
    inicio: { x: 0, y: 0, direccion: 'derecha' },
    objetivo: { posicion: objetivoPos, max_pasos: 12, ...(monedas.length ? { monedas: monedas.length } : {}) },
    bloques_permitidos: bloques,
    pistas
  };
}

// Ejercicio con bucle REPETIR.
function ejRepetir(nombre, x, { veces, explicacion, pistas = [], bloques = ['avanzar', 'repetir'], debeUsar = ['repetir'] } = {}) {
  return {
    titulo: nombre,
    explicacion,
    objetivo_texto: `Lleva a Candela hasta la estrella (${x},0) usando REPETIR.`,
    escenario: escenario(),
    inicio: { x: 0, y: 0, direccion: 'derecha' },
    objetivo: { posicion: { x, y: 0 }, max_pasos: x + 2, debe_usar: debeUsar },
    bloques_permitidos: bloques,
    pistas
  };
}

// Ejercicio con SI (condicional).
function ejSi(nombre, objetivoPos, { obstaculos = [], monedas = [], explicacion, pistas = [], bloques = ['avanzar', 'girar', 'si'], debeUsar = ['si'] } = {}) {
  return {
    titulo: nombre,
    explicacion,
    objetivo_texto: `Lleva a Candela hasta la estrella (${objetivoPos.x},${objetivoPos.y}) usando SI.`,
    escenario: escenario({ obstaculos, monedas }),
    inicio: { x: 0, y: 0, direccion: 'derecha' },
    objetivo: { posicion: objetivoPos, max_pasos: 14, ...(monedas.length ? { monedas: monedas.length } : {}), debe_usar: debeUsar },
    bloques_permitidos: bloques,
    pistas
  };
}

// ── Actividades de ejemplo (ejercicios progresivos y explicativos) ───
function actividad(id, titulo, descripcion, ejercicios, dificultad = 'facil') {
  return {
    id: `act-code-${id}`,
    titulo,
    descripcion,
    categoria: 'Placeta Junior Code',
    tipo: 'code_blocks',
    edad_recomendada: '6-12',
    dificultad,
    tiempo_estimado: 8,
    num_preguntas: ejercicios.length,
    num_fases: 1,
    es_examen: false,
    contenido: {
      version: 2,
      tipo: 'code_blocks',
      lenguaje: 'placeta_blocks',
      explicacion: 'Programa a Candela 👧 para que llegue a la estrella ⭐. Cada ejercicio es un poco más difícil.',
      ejercicios,
      precio_licencia: 20,
      precio_intento: 0,
      recompensa: 25,
      // Acceso anticipado: subvencionadas = jugables directamente en web/app
      subvencionada: true,
      destacada: false
    },
    estado: 'aprobada',
    publica: true,
    tipo_titular: 'interno',
    autor_nombre: 'Placeta Junior',
    estadisticas: { veces_realizada: 0, aprobados: 0 },
    creado_en: new Date().toISOString()
  };
}

const ACTIVIDADES = [
  // ── Nivel 1 — Secuencias (solo AVANZAR) ──
  actividad('sec-01', 'Primer paseo de Candela', 'Aprende a usar el bloque AVANZAR para mover a Candela.',
    [
      ejAvanzar('Avanza 1 casilla', 1, { explicacion: 'Pulsa el bloque AVANZAR una vez para llevar a Candela a la estrella.', pistas: ['Añade 1 bloque AVANZAR y pulsa ▶ Ejecutar.'] }),
      ejAvanzar('Avanza 2 casillas', 2, { explicacion: '¡Bien! Ahora la estrella está más lejos. Añade 2 bloques AVANZAR.', pistas: ['Necesitas 2 bloques AVANZAR.'] }),
      ejAvanzar('Avanza 3 casillas', 3, { explicacion: '¡Muy bien! La estrella está a 3 casillas. ¿Cuántos AVANZAR necesitas?', pistas: ['Cuenta: 1, 2, 3 → 3 bloques AVANZAR.'] }),
      ejAvanzar('Llega hasta el final', 4, { explicacion: 'Último ejercicio: la estrella está a 4 casillas. ¡Tú puedes!', pistas: ['4 bloques AVANZAR seguidos.'] }),
    ]),
  actividad('sec-02', 'Candela gira', 'Introduce el bloque GIRAR para cambiar de dirección.',
    [
      ejAvanzar('Recto otra vez', 2, { explicacion: 'Repasa: lleva a Candela a la estrella con AVANZAR.', pistas: ['2 bloques AVANZAR.'] }),
      ejGirar('Gira hacia arriba', [{ x: 2, y: 0 }, { x: 2, y: 1 }], { explicacion: 'Ahora la estrella está arriba. Avanza 2 y luego GIRA para subir. Pista: GIRAR a la izquierda.', pistas: ['AVANZAR ×2, GIRAR izquierda, AVANZAR.'] }),
      ejGirar('Gira hacia abajo', [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }], { explicacion: 'La estrella está abajo. Avanza 1 y gira hacia abajo.', pistas: ['AVANZAR, GIRAR derecha, AVANZAR, AVANZAR.'] }),
    ]),
  actividad('sec-03', 'Recoge monedas', 'Aprende a recoger monedas 🪙 mientras avanzas.',
    [
      ejAvanzar('Camino sencillo', 2, { explicacion: 'Primero, llega a la estrella como ya sabes.', pistas: ['2 bloques AVANZAR.'] }),
      ejObstaculo('Recoge 1 moneda', { x: 2, y: 0 }, { monedas: [{ x: 1, y: 0 }], explicacion: 'Hay una moneda en el camino. Pásala por encima para recogerla.', pistas: ['AVANZAR (moneda), AVANZAR (estrella).'], bloques: ['avanzar'] }),
      ejObstaculo('Recoge 2 monedas', { x: 3, y: 0 }, { monedas: [{ x: 1, y: 0 }, { x: 2, y: 0 }], explicacion: '¡Dos monedas! Recógelas todas y llega a la estrella.', pistas: ['AVANZAR, AVANZAR, AVANZAR.'], bloques: ['avanzar'] }),
    ]),
  actividad('sec-04', 'Evita obstáculos', 'Aprende a rodear los obstáculos 🚧.',
    [
      ejGirar('Recto y arriba', [{ x: 2, y: 0 }, { x: 2, y: 1 }], { explicacion: 'Repasa los giros antes del reto.', pistas: ['AVANZAR ×2, GIRAR, AVANZAR.'] }),
      ejObstaculo('Rodea la roca', { x: 3, y: 1 }, { obstaculos: [{ x: 2, y: 0 }], explicacion: '¡Hay una roca! No puedes atravesarla. Sube, pasa y baja.', pistas: ['AVANZAR, GIRAR, AVANZAR, GIRAR, AVANZAR, GIRAR, AVANZAR.'] }),
      ejObstaculo('Dos rocas', { x: 4, y: 0 }, { obstaculos: [{ x: 2, y: 0 }, { x: 2, y: 1 }], explicacion: 'Dos rocas seguidas. Rodéalas con cuidado.', pistas: ['Gira arriba, avanza, pasa, baja y avanza.'] }),
    ]),

  // ── Nivel 2 — Bucles (REPETIR) ──
  actividad('buc-01', 'Repite con Candela', 'Descubre el bloque REPETIR para hacer lo mismo varias veces.',
    [
      ejAvanzar('Calentamiento', 2, { explicacion: 'Recuerda cómo avanza Candela.', pistas: ['2 bloques AVANZAR.'] }),
      ejRepetir('Repite 2 veces', 2, { veces: 2, explicacion: 'En vez de 2 AVANZAR, usa REPETIR 2 veces { AVANZAR }.', pistas: ['REPETIR 2 veces con AVANZAR dentro.'] }),
      ejRepetir('Repite 3 veces', 3, { veces: 3, explicacion: '¡Genial! Ahora la estrella está a 3 casillas. Usa REPETIR 3 veces.', pistas: ['REPETIR 3 veces { AVANZAR }.'] }),
      ejRepetir('Repite 4 veces', 4, { veces: 4, explicacion: 'Último reto de bucles: 4 casillas con REPETIR.', pistas: ['REPETIR 4 veces { AVANZAR }.'] }),
    ]),
  actividad('buc-02', 'Bucles con monedas', 'Combina REPETIR con monedas.',
    [
      ejRepetir('Repite 2 veces', 2, { veces: 2, explicacion: 'Repasa el bucle.', pistas: ['REPETIR 2 veces { AVANZAR }.'] }),
      ejObstaculo('Camino con monedas', { x: 3, y: 0 }, { monedas: [{ x: 1, y: 0 }, { x: 2, y: 0 }], explicacion: 'Recoge 2 monedas y llega a la estrella. Puedes usar REPETIR.', pistas: ['REPETIR 3 veces { AVANZAR } recoge las monedas.'], bloques: ['avanzar', 'repetir'] }),
    ]),
  actividad('buc-03', 'Cuadrado con bucles', 'Usa REPETIR para dibujar un cuadrado.',
    [
      ejGirar('Esquinas', [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }], { explicacion: 'Practica avanzar y girar.', pistas: ['AVANZAR, GIRAR, AVANZAR, AVANZAR.'] }),
      ejGirar('Un cuadrado', [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }], { explicacion: 'Un cuadrado: AVANZAR, GIRAR, repetido 4 veces. ¡Usa REPETIR 4 veces!', pistas: ['REPETIR 4 veces { AVANZAR, GIRAR }. La estrella está donde acaba.'], bloques: ['avanzar', 'girar', 'repetir'], debeUsar: ['repetir'] }),
    ]),

  // ── Nivel 3 — Condicionales (SI) ──
  actividad('con-01', 'Si hay roca, gira', 'Aprende el bloque SI para decidir.',
    [
      ejAvanzar('Repaso', 2, { explicacion: 'Un repaso rápido.', pistas: ['2 AVANZAR.'] }),
      ejSi('Si hay roca…', { x: 2, y: 1 }, { obstaculos: [{ x: 1, y: 0 }], explicacion: 'Usa SI obstáculo para esquivar la roca automáticamente.', pistas: ['SI obstáculo { GIRAR, AVANZAR } y luego AVANZAR.'] }),
    ]),
  actividad('con-02', 'Si hay moneda, recógela', 'Decide con SI si hay moneda.',
    [
      ejSi('Recoge si hay moneda', { x: 2, y: 0 }, { monedas: [{ x: 1, y: 0 }], explicacion: 'Usa SI moneda para recogerla al pasar.', pistas: ['AVANZAR (moneda), AVANZAR (estrella). Usa SI moneda.'] }),
    ]),
  actividad('con-03', 'Reto final', 'Combina todo lo aprendido: secuencias, giros, bucles y condicionales.',
    [
      ejRepetir('Bucle + monedas', 3, { veces: 3, explicacion: 'Calentamiento: llega con REPETIR.', pistas: ['REPETIR 3 veces { AVANZAR }.'] }),
      ejSi('Camino con trampas', { x: 4, y: 1 }, { obstaculos: [{ x: 2, y: 0 }, { x: 3, y: 0 }], monedas: [{ x: 1, y: 0 }], explicacion: 'Hay moneda y rocas. Usa SI y giros para llegar.', pistas: ['Recoge la moneda, esquiva las rocas, llega a la estrella.'], bloques: ['avanzar', 'girar', 'si', 'repetir'] }),
    ]),
];

async function run() {
  console.log('🌱 Seed: Placeta Junior Code + Bundle');

  // 1) Bundle (requiere tabla 'bundles' — migración docs/migrar-academia-junior.sql)
  const { error: bErr } = await supabase.from('bundles').upsert({
    id: BUNDLE_ID,
    nombre: 'Placeta Junior Code — Acceso anticipado',
    descripcion: 'Desbloquea todas las actividades disponibles de Placeta Junior Code durante el acceso anticipado.',
    precio: 150, moneda: 'Pz',
    activo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if (bErr) console.log('Bundle: ⚠️ ' + bErr.message + '  → ejecuta docs/migrar-academia-junior.sql en Supabase');
  else console.log('Bundle: OK ' + BUNDLE_ID);

  // 2) Actividades — crea las nuevas y ACTUALIZA las existentes con el
  //    nuevo formato de ejercicios (evolución progresiva)
  let okAct = 0;
  for (const a of ACTIVIDADES) {
    const yaExiste = await sbGetActividad(a.id);
    // contenido sin las claves económicas (viven como columnas; sbCrearActividad
    // las mueve a contenido como respaldo si la columna no existe aún)
    const { precio_licencia, precio_intento, recompensa, subvencionada, destacada, ...contenidoLimpio } = a.contenido || {};
    const datos = {
      ...a,
      contenido: contenidoLimpio,
      precio_licencia,
      precio_intento,
      recompensa,
      subvencionada,
      destacada
    };
    if (yaExiste) {
      const ok = await sbUpdateActividad(a.id, {
        titulo: a.titulo, descripcion: a.descripcion, contenido: contenidoLimpio,
        num_preguntas: a.num_preguntas, tiempo_estimado: a.tiempo_estimado,
        precio_licencia, precio_intento, recompensa, subvencionada, destacada
      });
      console.log('  ', a.id, ok ? 'ACTUALIZADA' : 'ERR update');
      if (ok) okAct++;
      continue;
    }
    const creada = await sbCrearActividad(datos);
    console.log('  ', a.id, creada ? 'OK' : 'ERR');
    if (creada) okAct++;
  }

  // 3) Items del bundle (requiere tabla 'bundle_items')
  const { error: delErr } = await supabase.from('bundle_items').delete().eq('bundle_id', BUNDLE_ID);
  if (delErr) console.log('  bundle_items:', '⚠️ ' + delErr.message);
  const rows = ACTIVIDADES.map((a, i) => ({ bundle_id: BUNDLE_ID, actividad_id: a.id, orden: i }));
  const { error: iErr } = await supabase.from('bundle_items').insert(rows);
  if (iErr) console.log('  bundle_items:', '⚠️ ' + iErr.message);
  else console.log('  bundle_items: OK (' + rows.length + ')');

  console.log(`✅ Seed completado. ${okAct}/${ACTIVIDADES.length} actividades. Bundle: ${bErr ? 'pendiente de migración' : 'OK'}.`);
}

run();
