/**
 * PLACETA JUNIOR CODE — Motor de evaluación de actividades code_blocks
 *
 * Ejecuta programas de bloques en un escenario de cuadrícula controlado
 * (NO ejecuta código arbitrario del alumno en el servidor).
 *
 * Un programa es una lista de instrucciones con parámetros:
 *   [ { op: 'avanzar' }, { op: 'girar', dir: 'derecha'|'izquierda' },
 *     { op: 'repetir', veces: 3, bloques: [...] }, { op: 'si', condicion: 'obstaculo', bloques: [...] } ]
 *
 * Los bloques permitidos se restringen por actividad (bloques_permitidos).
 */

// ── Bloques disponibles (primera fase: movimientos y control) ─────────
export const BLOQUES_CODE = {
  avanzar:    { cat: 'movimiento', nombre: 'AVANZAR', params: [], desc: 'Avanza una casilla' },
  retroceder: { cat: 'movimiento', nombre: 'RETROCEDER', params: [], desc: 'Retrocede una casilla' },
  girar:      { cat: 'movimiento', nombre: 'GIRAR', params: ['dir'], desc: 'Gira a la derecha o izquierda' },
  saltar:     { cat: 'movimiento', nombre: 'SALTAR', params: [], desc: 'Salta a la siguiente casilla' },
  repetir:    { cat: 'control', nombre: 'REPETIR', params: ['veces'], bloques: true, desc: 'Repite un bloque N veces' },
  si:         { cat: 'control', nombre: 'SI', params: ['condicion'], bloques: true, desc: 'Si la condición se cumple, ejecuta' },
};

// Direcciones: 0=derecha, 1=abajo, 2=izquierda, 3=arriba (sentido horario)
const DELTAS = [
  { x: 1, y: 0 },   // derecha
  { x: 0, y: 1 },   // abajo
  { x: -1, y: 0 },  // izquierda
  { x: 0, y: -1 },  // arriba
];

/**
 * Normaliza el programa: acepta strings de bloques o el formato de la app.
 */
function normalizarPrograma(programa) {
  if (!Array.isArray(programa)) return [];
  return programa.map(b => {
    if (typeof b === 'string') {
      const [op, ...rest] = b.split(/\s+/);
      const p = {};
      if (op === 'repetir' && rest[0]) p.veces = parseInt(rest[0], 10) || 1;
      if (op === 'si' && rest[0]) p.condicion = rest[0];
      if (op === 'girar' && rest[0]) p.dir = rest[0].toLowerCase();
      return { op, ...p, bloques: [] };
    }
    if (b && typeof b === 'object') {
      return {
        op: b.op || b.tipo || 'avanzar',
        veces: b.veces != null ? Number(b.veces) : 1,
        dir: b.dir || b.direccion || 'derecha',
        condicion: b.condicion || b.si || 'obstaculo',
        bloques: normalizarPrograma(b.bloques || b.bloques_ok || []),
      };
    }
    return { op: 'avanzar', bloques: [] };
  });
}

/**
 * Ejecuta un programa en el escenario y devuelve la posición final,
 * casillas visitadas y errores (pasos máximos, fuera de rango).
 */
export function ejecutarCode(escenario, inicio, programa, { maxPasos = 200 } = {}) {
  const ancho = escenario?.ancho || 6;
  const alto = escenario?.alto || 6;
  let x = inicio?.x ?? 0;
  let y = inicio?.y ?? 0;
  let dir = ['derecha', 'abajo', 'izquierda', 'arriba'].indexOf(inicio?.direccion || 'derecha');
  if (dir < 0) dir = 0;

  // Obstáculos (celdas bloqueadas)
  const obstaculos = new Set((escenario?.obstaculos || []).map(o => `${o.x},${o.y}`));
  // Monedas (celdas que otorgan puntos si se pisan)
  const monedas = new Set((escenario?.monedas || []).map(o => `${o.x},${o.y}`));
  const monedasRecogidas = [];

  const visitadas = new Set([`${x},${y}`]);
  let pasos = 0;
  let fin = false;
  const error = { tipo: null, mensaje: '' };
  let posicionFinal = { x, y };
  let maxBloquesUsados = 0;

  const dentro = (cx, cy) => cx >= 0 && cx < ancho && cy >= 0 && cy < alto;
  const hayObstaculo = (cx, cy) => obstaculos.has(`${cx},${cy}`);

  function ejecutarBloque(b, profundidad) {
    if (fin || pasos >= maxPasos) return;
    if (profundidad > 4) { fin = true; error.tipo = 'profundidad'; error.mensaje = 'Demasiados bloques anidados.'; return; }
    maxBloquesUsados = Math.max(maxBloquesUsados, profundidad);

    switch (b.op) {
      case 'avanzar': {
        pasos++;
        const nx = x + DELTAS[dir].x;
        const ny = y + DELTAS[dir].y;
        if (!dentro(nx, ny)) { fin = true; error.tipo = 'fuera'; error.mensaje = 'Candela se salió del tablero.'; return; }
        if (hayObstaculo(nx, ny)) { fin = true; error.tipo = 'obstaculo'; error.mensaje = 'Candela chocó con un obstáculo.'; return; }
        x = nx; y = ny;
        visitadas.add(`${x},${y}`);
        posicionFinal = { x, y };
        if (monedas.has(`${x},${y}`) && !monedasRecogidas.includes(`${x},${y}`)) monedasRecogidas.push(`${x},${y}`);
        break;
      }
      case 'retroceder': {
        pasos++;
        const nx = x - DELTAS[dir].x;
        const ny = y - DELTAS[dir].y;
        if (!dentro(nx, ny)) { fin = true; error.tipo = 'fuera'; error.mensaje = 'Candela se salió del tablero.'; return; }
        if (hayObstaculo(nx, ny)) { fin = true; error.tipo = 'obstaculo'; error.mensaje = 'Candela chocó con un obstáculo.'; return; }
        x = nx; y = ny;
        visitadas.add(`${x},${y}`);
        posicionFinal = { x, y };
        break;
      }
      case 'saltar': {
        pasos++;
        const nx = x + DELTAS[dir].x * 2;
        const ny = y + DELTAS[dir].y * 2;
        if (!dentro(nx, ny)) { fin = true; error.tipo = 'fuera'; error.mensaje = 'Candela saltó fuera del tablero.'; return; }
        x = nx; y = ny;
        visitadas.add(`${x},${y}`);
        posicionFinal = { x, y };
        break;
      }
      case 'girar': {
        pasos++;
        const d = String(b.dir || 'derecha').toLowerCase();
        if (d === 'izquierda' || d === 'izq' || d === '-') dir = (dir + 3) % 4;
        else dir = (dir + 1) % 4;
        break;
      }
      case 'repetir': {
        const veces = Math.min(Math.max(Number(b.veces) || 0, 0), 50);
        for (let i = 0; i < veces; i++) {
          for (const sub of (b.bloques || [])) ejecutarBloque(sub, profundidad + 1);
          if (fin) return;
        }
        break;
      }
      case 'si': {
        const cond = String(b.condicion || 'obstaculo').toLowerCase();
        const nx = x + DELTAS[dir].x;
        const ny = y + DELTAS[dir].y;
        let cumple = false;
        if (cond.includes('obstac') || cond.includes('bloqueo')) cumple = !dentro(nx, ny) || hayObstaculo(nx, ny);
        else if (cond.includes('moneda')) cumple = monedas.has(`${nx},${ny}`);
        else if (cond.includes('libre') || cond.includes('vacio')) cumple = dentro(nx, ny) && !hayObstaculo(nx, ny);
        if (cumple) for (const sub of (b.bloques || [])) ejecutarBloque(sub, profundidad + 1);
        break;
      }
      default: break;
    }
  }

  const prog = normalizarPrograma(programa);
  for (const b of prog) { ejecutarBloque(b, 0); if (fin) break; }

  return {
    posicion_final: posicionFinal,
    direccion_final: ['derecha', 'abajo', 'izquierda', 'arriba'][dir],
    visitadas: [...visitadas],
    monedas_recogidas: monedasRecogidas,
    pasos,
    max_pasos: maxPasos,
    error: error.tipo ? error : null,
    finalizado: !error.tipo,
  };
}

/**
 * Evalúa si el resultado cumple los objetivos de la actividad.
 * objetivos: { posicion: {x,y}, monedas: N, max_pasos: N, debe_usar: ['repetir'] }
 */
export function evaluarCode(escenario, inicio, objetivo, programa, resultado) {
  const objetivos = objetivo || {};
  const fallos = [];

  // Objetivo posicional
  if (objetivos.posicion) {
    const pf = resultado.posicion_final;
    const ok = pf && pf.x === Number(objetivos.posicion.x) && pf.y === Number(objetivos.posicion.y);
    if (!ok) fallos.push(`La posición final (${pf?.x},${pf?.y}) no es la objetivo (${objetivos.posicion.x},${objetivos.posicion.y}).`);
  }

  // Monedas requeridas
  if (objetivos.monedas) {
    const recogidas = resultado.monedas_recogidas?.length || 0;
    if (recogidas < Number(objetivos.monedas)) fallos.push(`Faltan monedas: ${recogidas}/${objetivos.monedas}.`);
  }

  // Máximo de pasos
  if (objetivos.max_pasos) {
    if ((resultado.pasos || 0) > Number(objetivos.max_pasos)) fallos.push(`Demasiados pasos: ${resultado.pasos} (máx ${objetivos.max_pasos}).`);
  }

  // Debe usar un bloque concreto (enseñanza progresiva)
  if (objetivos.debe_usar && Array.isArray(objetivos.debe_usar)) {
    const usados = new Set();
    (function recorrer(prog) {
      (prog || []).forEach(b => { usados.add(b.op); if (b.bloques) recorrer(b.bloques); });
    })(normalizarPrograma(programa));
    for (const op of objetivos.debe_usar) {
      if (!usados.has(op)) fallos.push(`Debes usar el bloque ${BLOQUES_CODE[op]?.nombre || op}.`);
    }
  }

  // Error de ejecución
  if (resultado.error) fallos.push(resultado.error.mensaje);

  const superado = fallos.length === 0;
  return { superado, fallos, aciertos: superado ? 1 : 0, errores: superado ? 0 : Math.max(1, fallos.length) };
}

/** Devuelve los bloques permitidos para una actividad (default: todos los de movimiento). */
export function bloquesPermitidos(actividad) {
  const contenido = actividad.contenido || {};
  const permitidos = contenido.bloques_permitidos;
  if (Array.isArray(permitidos) && permitidos.length) return permitidos;
  return Object.keys(BLOQUES_CODE);
}
