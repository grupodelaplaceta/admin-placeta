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
import { sbCrearActividad, sbGetActividad } from '../src/config/junior-actividades.js';

const BUNDLE_ID = 'bundle_code_early_access';

// ── Actividades de ejemplo (Nivel 1: Secuencias) ─────────────────────
function actividad(id, titulo, objetivoPos, { obstaculos = [], monedas = [], bloques = ['avanzar', 'girar'], maxPasos = 12, pistas = [], texto, debeUsar = [] } = {}) {
  return {
    id: `act-code-${id}`,
    titulo,
    descripcion: texto || `Reto de Placeta Junior Code: ${titulo}`,
    categoria: 'Placeta Junior Code',
    tipo: 'code_blocks',
    edad_recomendada: '6-12',
    dificultad: 'facil',
    tiempo_estimado: 5,
    num_preguntas: 1,
    num_fases: 1,
    es_examen: false,
    // Los campos económicos van DENTRO de contenido porque la tabla aún no
    // tiene las columnas subvencionada/destacada/precio_* (migración pendiente).
    // normalizarActividad() los promueve al leer.
    contenido: {
      version: 2,
      tipo: 'code_blocks',
      lenguaje: 'placeta_blocks',
      objetivo_texto: texto || `Lleva a Candela hasta la estrella (${objetivoPos.x},${objetivoPos.y}).`,
      bloques_permitidos: bloques,
      max_bloques: maxPasos,
      escenario: { tipo: 'cuadricula', ancho: 6, alto: 6, obstaculos, monedas },
      inicio: { x: 0, y: 0, direccion: 'derecha' },
      objetivo: { posicion: objetivoPos, ...(monedas.length ? { monedas: monedas.length } : {}), max_pasos: maxPasos, ...(debeUsar.length ? { debe_usar: debeUsar } : {}) },
      pistas,
      precio_licencia: 20,
      precio_intento: 0,
      recompensa: 25,
      subvencionada: false,
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
  // ── Nivel 1 — Secuencias ──
  actividad('sec-01', 'Mueve a Candela', { x: 1, y: 0 }, { pistas: ['Candela está en la casilla 0,0.', 'Usa AVANZAR para acercarla.'] }),
  actividad('sec-02', 'Llega hasta la estrella', { x: 3, y: 0 }, { pistas: ['Avanza hacia la derecha.', 'Necesitas avanzar 3 veces.'] }),
  actividad('sec-03', 'Sigue el camino', { x: 2, y: 2 }, { monedas: [{ x: 1, y: 0 }, { x: 2, y: 0 }], pistas: ['Recoge las monedas del camino.'] }),
  actividad('sec-04', 'Gira correctamente', { x: 1, y: 1 }, { bloques: ['avanzar', 'girar'], pistas: ['Avanza y gira para subir.'] }),
  actividad('sec-05', 'Evita el obstáculo', { x: 3, y: 0 }, { obstaculos: [{ x: 2, y: 0 }], bloques: ['avanzar', 'girar'], pistas: ['Hay una roca en (2,0).', 'Rodéala girando.'] }),

  // ── Nivel 2 — Bucles ──
  actividad('buc-01', 'Repite el camino', { x: 4, y: 0 }, { bloques: ['avanzar', 'repetir'], debeUsar: ['repetir'], pistas: ['Puedes usar REPETIR 4 veces AVANZAR.'] }),
  actividad('buc-02', 'Recoge las monedas', { x: 3, y: 0 }, { monedas: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], bloques: ['avanzar', 'repetir'], debeUsar: ['repetir'], pistas: ['Recoge las 3 monedas con un bucle.'] }),
  actividad('buc-03', 'Dibuja un cuadrado', { x: 0, y: 0 }, { bloques: ['avanzar', 'girar', 'repetir'], debeUsar: ['repetir'], maxPasos: 16, pistas: ['Un cuadrado: repite 4 veces avanzar+girar.'] }),
  actividad('buc-04', 'Limpia el tablero', { x: 4, y: 4 }, { bloques: ['avanzar', 'girar', 'repetir'], maxPasos: 20, pistas: ['Combina bucles y giros.'] }),
  actividad('buc-05', 'Encuentra la salida', { x: 5, y: 0 }, { obstaculos: [{ x: 3, y: 0 }, { x: 3, y: 1 }], bloques: ['avanzar', 'girar', 'repetir'], pistas: ['Hay obstáculos; rodéalos con un bucle.'] }),

  // ── Nivel 3 — Condicionales ──
  actividad('con-01', 'Si hay un obstáculo, gira', { x: 2, y: 1 }, { obstaculos: [{ x: 1, y: 0 }], bloques: ['avanzar', 'girar', 'si'], pistas: ['Usa SI obstaculo para esquivarlo.'] }),
  actividad('con-02', 'Si hay moneda, recógela', { x: 2, y: 0 }, { monedas: [{ x: 1, y: 0 }], bloques: ['avanzar', 'si'], pistas: ['Usa SI moneda.'] }),
  actividad('con-03', 'Elige el camino correcto', { x: 3, y: 1 }, { obstaculos: [{ x: 2, y: 0 }], bloques: ['avanzar', 'girar', 'si'], pistas: ['Decide según el obstáculo.'] }),
  actividad('con-04', 'Programa el robot', { x: 4, y: 1 }, { obstaculos: [{ x: 2, y: 0 }, { x: 2, y: 1 }], monedas: [{ x: 1, y: 0 }], bloques: ['avanzar', 'girar', 'si', 'repetir'], pistas: ['Combina condicionales y bucles.'] }),
  actividad('con-05', 'Reto final', { x: 4, y: 4 }, { obstaculos: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 2 }], monedas: [{ x: 1, y: 0 }, { x: 3, y: 0 }], bloques: ['avanzar', 'girar', 'si', 'repetir'], maxPasos: 24, pistas: ['El reto final combina todo lo aprendido.'] }),
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

  // 2) Actividades — con sbCrearActividad (maneja columnas pendientes) y skip si ya existen
  let okAct = 0;
  for (const a of ACTIVIDADES) {
    const yaExiste = await sbGetActividad(a.id);
    if (yaExiste) { console.log('  ', a.id, 'ya existe'); okAct++; continue; }
    // contenido sin las claves económicas (viven como columnas; sbCrearActividad
    // las mueve a contenido como respaldo si la columna no existe aún)
    const { precio_licencia, precio_intento, recompensa, subvencionada, destacada, ...contenidoLimpio } = a.contenido || {};
    const creada = await sbCrearActividad({
      ...a,
      contenido: contenidoLimpio,
      precio_licencia,
      precio_intento,
      recompensa,
      subvencionada,
      destacada
    });
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
