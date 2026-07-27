/**
 * RSP GATEWAY — Middleware de conexión, errores y mantenimiento
 * 
 * Proporciona:
 *   1. Verificación de conexión RSP antes de acciones críticas
 *   2. Error handling con códigos de error (RSP-ERR-XXX)
 *   3. Modo mantenimiento global o por entidad
 *   4. Pantalla bloqueante vs slideup según gravedad
 */

import { isEnMantenimiento } from '../config/mantenimiento.js';

// ── CÓDIGOS DE ERROR RSP ─────────────────────────────────────────────
export const RSP_ERRORS = {
  RSP_ERR_001: { code: 'RSP-ERR-001', mensaje: 'No se puede conectar con la Red de Servicios de La Placeta (RSP). Verifica tu conexión.', tipo: 'global' },
  RSP_ERR_002: { code: 'RSP-ERR-002', mensaje: 'La entidad solicitada no está disponible en RSP en este momento.', tipo: 'entidad' },
  RSP_ERR_003: { code: 'RSP-ERR-003', mensaje: 'Tiempo de espera agotado al conectar con RSP. Inténtalo de nuevo.', tipo: 'global' },
  RSP_ERR_004: { code: 'RSP-ERR-004', mensaje: 'La operación requiere conexión a RSP. No se puede realizar en modo offline.', tipo: 'accion' },
  RSP_ERR_005: { code: 'RSP-ERR-005', mensaje: 'Error de autenticación con RSP. La API Key no es válida.', tipo: 'global' },
  RSP_ERR_006: { code: 'RSP-ERR-006', mensaje: 'Límite de conexiones RSP alcanzado. Espera antes de realizar más operaciones.', tipo: 'accion' },
  RSP_ERR_007: { code: 'RSP-ERR-007', mensaje: 'No hay saldo suficiente en la cuenta RSP para esta operación.', tipo: 'accion' },
  RSP_ERR_008: { code: 'RSP-ERR-008', mensaje: 'El servicio RSP no está disponible. Mantenimiento en curso.', tipo: 'global' },
};

/**
 * Middleware: verifica que RSP esté disponible ANTES de ejecutar una acción
 * Si falla, impide la acción y devuelve error estructurado
 */
export function requireRSP(opts = {}) {
  return async (req, res, next) => {
    const entidad = opts.entidad || req.entidad || req.params?.entidad || 'general';

    // 1. Verificar mantenimiento
    const mnt = isEnMantenimiento(entidad);
    if (mnt) {
      const error = RSP_ERRORS.RSP_ERR_008;
      if (opts.globalBlock !== false && (mnt.activo === true)) {
        // Pantalla completa bloqueante
        if (req.path.startsWith('/api/')) {
          return res.status(503).json({
            error: error.code,
            mensaje: mnt.mensaje || error.mensaje,
            mantenimiento: true,
            entidad
          });
        }
        // Para vistas web: renderizar pantalla de mantenimiento
        return res.status(503).render('parciales/mantenimiento', {
          titulo: 'Mantenimiento',
          layout: false,
          mensaje: mnt.mensaje || error.mensaje,
          entidad,
          esGlobal: !entidad || entidad === 'general'
        });
      }
      // Slideup (acciones específicas)
      const errInfo = RSP_ERRORS.RSP_ERR_004;
      return res.status(503).json({
        error: errInfo.code,
        mensaje: mnt.mensaje || errInfo.mensaje,
        slideup: true,
        entidad
      });
    }

    // 2. Verificar conectividad RSP (timeout corto)
    if (opts.checkConnection !== false) {
      try {
        const rspUrl = process.env.RSP_API_URL || 'http://localhost:3002';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), opts.timeout || 3000);

        const resp = await fetch(`${rspUrl}/api/health`, {
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!resp.ok) {
          throw new Error(`RSP health check failed: ${resp.status}`);
        }
      } catch (err) {
        const isTimeout = err.name === 'AbortError';
        const errorInfo = isTimeout ? RSP_ERRORS.RSP_ERR_003 : RSP_ERRORS.RSP_ERR_001;

        if (opts.globalBlock !== false && !isTimeout) {
          // Fallo global → pantalla completa
          if (req.path.startsWith('/api/')) {
            return res.status(503).json({
              error: errorInfo.code,
              mensaje: errorInfo.mensaje,
              detalle: err.message,
              mantenimiento: true
            });
          }
          return res.status(503).render('parciales/mantenimiento', {
            titulo: 'Error de Conexión',
            layout: false,
            mensaje: errorInfo.mensaje,
            codigo: errorInfo.code,
            esGlobal: true
          });
        }

        // Fallo de acción → slideup
        return res.status(503).json({
          error: errorInfo.code,
          mensaje: errorInfo.mensaje,
          slideup: true,
          detalle: err.message
        });
      }
    }

    next();
  };
}

export default { requireRSP, RSP_ERRORS };
