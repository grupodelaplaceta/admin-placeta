/**
 * Middleware de autenticación y autorización
 * 
 * Flujo:
 * 1. Login vía PlacetaID OAuth
 * 2. Verificación de sesión
 * 3. Carga de roles y permisos
 * 4. Verificación de acceso a entidades
 */
import jwt from 'jsonwebtoken';
import { sbFindSolicitanteByDip, sbFindCargosByDip, sbFindPermisosByDip } from '../config/db.js';
import { determinarRoles, getEntidadesPermitidas, tienePermiso } from '../config/permisos.js';

const JWT_SECRET = process.env.JWT_SECRET || 'admin-placeta-jwt-secret-2026';

/**
 * Verifica que el usuario tenga sesión activa
 */
export function verificarSesion(req, res, next) {
  if (!req.session?.usuario) {
    if (req.xhr || req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'No autenticado', redirect: '/login' });
    }
    return res.redirect('/login');
  }
  next();
}

/**
 * Verifica que el usuario tenga acceso a una entidad específica
 */
export function verificarAccesoEntidad(entidad) {
  return (req, res, next) => {
    const entidades = req.session.entidades_permitidas || [];
    if (!entidades.includes(entidad)) {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(403).json({ error: `No tienes acceso a ${entidad}` });
      }
      return res.redirect('/dashboard');
    }
    next();
  };
}

/**
 * Verifica que el usuario tenga un permiso específico en una entidad
 */
export function verificarPermiso(entidad, permiso) {
  return (req, res, next) => {
    const roles = req.session.roles || [];
    if (!tienePermiso(entidad, permiso, roles)) {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(403).json({ error: `Permiso denegado: ${permiso}` });
      }
      return res.redirect(`/${entidad}`);
    }
    next();
  };
}

/**
 * Carga los datos de usuario, roles y entidades permitidas en la sesión
 */
export async function cargarPermisosUsuario(req, res, next) {
  if (!req.session?.usuario?.dip) return next();

  try {
    const dip = req.session.usuario.dip;

    // Cargar cargos de la junta
    const cargos = await sbFindCargosByDip(dip);

    // Cargar permisos de administración
    const permisosAlmacenados = await sbFindPermisosByDip(dip);

    // Determinar roles
    const roles = determinarRoles(cargos, permisosAlmacenados);

    // Obtener entidades permitidas
    const entidades = getEntidadesPermitidas(roles);

    // Guardar en sesión
    req.session.roles = roles;
    req.session.entidades_permitidas = entidades;
    req.session.cargos = cargos;
    req.session.permisos_almacenados = permisosAlmacenados;

    // Variables globales para vistas
    res.locals.roles = roles;
    res.locals.entidades_permitidas = entidades;
    res.locals.usuario = req.session.usuario;
  } catch (err) {
    console.error('[Auth] Error cargando permisos:', err.message);
    req.session.roles = [];
    req.session.entidades_permitidas = [];
  }

  next();
}

/**
 * Genera URL de autenticación PlacetaID
 */
export function buildPlacetaidAuthUrl(options = {}) {
  const {
    authBaseUrl = process.env.PLACETAID_AUTH_URL || 'https://id.laplaceta.org',
    clientId = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb',
    redirectUri,
    state = crypto.randomUUID(),
    platform = 'web'
  } = options;

  const base = authBaseUrl.replace(/\/+$/, '');
  const redirect = redirectUri || `${base}/callback`;

  return `${base}/api/auth/fase1?from=${encodeURIComponent(redirect)}&client_id=${encodeURIComponent(clientId)}&state=${encodeURIComponent(state)}&platform=${encodeURIComponent(platform)}`;
}

import crypto from 'crypto';
