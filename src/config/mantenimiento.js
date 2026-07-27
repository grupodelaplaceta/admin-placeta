/**
 * SISTEMA DE MANTENIMIENTO
 * 
 * Modo mantenimiento global o por entidad.
 * Cuando está activo, muestra pantalla completa bloqueante.
 * 
 * Config:
 *   activo: bool - Mantenimiento global
 *   mensaje: string - Mensaje personalizado
 *   entidades: { entidad: { activo, mensaje } } - Por entidad
 *   desdeRSP: bool - Si el estado viene de RSP
 */

const estado = {
  global: {
    activo: false,
    mensaje: '🔧 Admin Placeta está en mantenimiento. Vuelve en unos minutos.',
    desde: null,
    hasta: null
  },
  entidades: {}
};

/**
 * Activa/desactiva mantenimiento global
 */
export function setMantenimientoGlobal(activo, mensaje, desde, hasta) {
  estado.global.activo = activo;
  if (mensaje) estado.global.mensaje = mensaje;
  if (desde) estado.global.desde = desde;
  if (hasta) estado.global.hasta = hasta;
  return estado.global;
}

/**
 * Activa/desactiva mantenimiento por entidad
 */
export function setMantenimientoEntidad(entidad, activo, mensaje) {
  if (!estado.entidades[entidad]) {
    estado.entidades[entidad] = { activo: false, mensaje: '' };
  }
  estado.entidades[entidad].activo = activo;
  if (mensaje) estado.entidades[entidad].mensaje = mensaje;
  return estado.entidades[entidad];
}

/**
 * Verifica si una entidad está en mantenimiento
 */
export function isEnMantenimiento(entidad) {
  if (estado.global.activo) return estado.global;
  const e = estado.entidades[entidad];
  if (e?.activo) return e;
  return null;
}

/**
 * Obtiene el estado completo
 */
export function getEstadoMantenimiento() {
  return { ...estado };
}

export default {
  setMantenimientoGlobal,
  setMantenimientoEntidad,
  isEnMantenimiento,
  getEstadoMantenimiento
};
