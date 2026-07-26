/**
 * Middleware RSP — Medición de Conexiones
 * 
 * Intercepta llamadas API para registrar y facturar conexiones
 * a la Red de Servicios de La Placeta.
 * 
 * Uso:
 *   router.get('/api/datos', rspMeter('consulta'), handler);
 *   router.post('/api/datos', rspMeter('modificacion'), handler);
 */

import { registrarConexion, TIPO_CONEXION } from '../config/rsp.js';

/**
 * Crea middleware de medición RSP
 * @param {string} tipo - 'consulta' o 'modificacion'
 * @param {object} opts - Opciones adicionales
 * @param {string} opts.entidad - Entidad que realiza la conexión (auto-detectada si no se provee)
 * @param {boolean} opts.omitir - Si true, no registra (útil para rutas internas)
 */
export function rspMeter(tipo = TIPO_CONEXION.CONSULTA, opts = {}) {
  return (req, res, next) => {
    // No medir si se omite explícitamente
    if (opts.omitir) return next();

    // No medir requests internos del sistema RSP
    if (req.path.startsWith('/rsp/') || req.path.startsWith('/api/rsp/')) return next();

    const entidad = opts.entidad || detectarEntidad(req);
    const usuario = req.session?.usuario?.nombre || 'sistema';
    const dip = req.session?.usuario?.dip || '';

    // Registrar la conexión (asíncrono, no bloquea)
    setImmediate(() => {
      try {
        registrarConexion({
          entidad,
          tipo,
          endpoint: req.method + ' ' + req.path,
          usuario,
          dip,
          detalle: req.headers['referer'] || ''
        });
      } catch (err) {
        console.warn('[RSP Meter] Error registrando conexión:', err.message);
      }
    });

    next();
  };
}

/**
 * Detecta la entidad a partir de la ruta de la request
 */
function detectarEntidad(req) {
  const path = req.path;
  if (path.startsWith('/banco/') || path.startsWith('/api/banco/')) return 'banco';
  if (path.startsWith('/tributos/') || path.startsWith('/api/tributos/')) return 'tributos';
  if (path.startsWith('/junta/') || path.startsWith('/api/junta/')) return 'junta';
  if (path.startsWith('/administracion/') || path.startsWith('/api/administracion/')) return 'administracion';
  if (path.startsWith('/api/placetaid/')) return 'placetaid';
  if (path.startsWith('/api/crm/')) return 'crm';
  return 'general';
}

export default { rspMeter };
