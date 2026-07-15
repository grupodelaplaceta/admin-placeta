import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sbFindSolicitanteByDip, sbFindCargosByDip, sbFindPermisosByDip } from '../config/db.js';
import { determinarRoles, getEntidadesPermitidas } from '../config/permisos.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'admin-placeta-jwt-secret-2026';
const PLACETAID_URL = process.env.PLACETAID_AUTH_URL || 'https://id.laplaceta.org';
const CLIENT_ID = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';

// ── Login - Iniciar sesión vía PlacetaID ──────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session?.usuario) return res.redirect('/dashboard');
  res.render('auth/login', { titulo: 'Admin Placeta - Iniciar Sesión', layout: false });
});

// ── Login - Redirigir a PlacetaID OAuth ───────────────────────────────────
router.post('/login/placetaid', (req, res) => {
  const state = crypto.randomUUID();
  req.session.oauth_state = state;

  const redirectUri = `${req.protocol}://${req.get('host')}/login/callback`;
  const authUrl = `${PLACETAID_URL}/api/auth/fase1?` +
    `from=${encodeURIComponent(redirectUri)}` +
    `&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&state=${encodeURIComponent(state)}` +
    `&platform=web`;

  res.json({ redirect: authUrl });
});

// ── Callback OAuth PlacetaID ──────────────────────────────────────────────
router.get('/login/callback', async (req, res) => {
  try {
    const { token, user: userJson, state, error } = req.query;

    if (error) {
      return res.render('auth/login', {
        titulo: 'Admin Placeta - Error', layout: false,
        error: 'Autenticación cancelada o rechazada'
      });
    }

    if (!token) {
      return res.render('auth/login', {
        titulo: 'Admin Placeta - Error', layout: false,
        error: 'Token de autenticación no recibido'
      });
    }

    // Verificar JWT
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      // Si no es nuestro JWT, decodificar sin verificar (PlacetaID token)
      decoded = jwt.decode(token);
    }

    const dip = decoded?.dip || userJson || req.query.dip;
    if (!dip) {
      return res.render('auth/login', {
        titulo: 'Admin Placeta - Error', layout: false,
        error: 'No se pudo obtener el DIP del usuario'
      });
    }

    // Buscar usuario en CRM
    let usuario = await sbFindSolicitanteByDip(dip);

    // Si no existe en CRM, usar datos de PlacetaID
    if (!usuario) {
      let userData = null;
      try { userData = JSON.parse(userJson); } catch {}
      usuario = {
        dip: dip,
        nombre_real: userData?.nombre || decoded?.nombre || 'Usuario PlacetaID',
        email: userData?.email || decoded?.email || '',
        alias: dip,
        estado: 'activo',
        rol: 'externo'
      };
    }

    // Cargar cargos y permisos
    const cargos = await sbFindCargosByDip(dip);
    const permisosAlmacenados = await sbFindPermisosByDip(dip);

    // Determinar roles y entidades
    const roles = determinarRoles(cargos, permisosAlmacenados);
    const entidades = getEntidadesPermitidas(roles);

    // Guardar sesión
    req.session.usuario = {
      dip: usuario.dip,
      nombre: usuario.nombre_real || usuario.alias || dip,
      email: usuario.email || '',
      alias: usuario.alias || '',
      rol: usuario.rol || 'externo'
    };
    req.session.roles = roles;
    req.session.entidades_permitidas = entidades;
    req.session.cargos = cargos;
    req.session.permisos_almacenados = permisosAlmacenados;
    req.session.jwt = token;

    // Verificar si tiene acceso a alguna entidad
    if (entidades.length === 0) {
      return res.render('auth/login', {
        titulo: 'Admin Placeta - Sin Acceso', layout: false,
        error: 'No tienes permisos asignados para acceder al panel de administración. Contacta con la Junta Directiva.'
      });
    }

    res.redirect('/dashboard');
  } catch (err) {
    console.error('[Auth] Error en callback:', err);
    res.render('auth/login', {
      titulo: 'Admin Placeta - Error', layout: false,
      error: 'Error procesando la autenticación: ' + err.message
    });
  }
});

// ── Login Directo (demo/desarrollo) ────────────────────────────────────────
router.post('/login/demo', async (req, res) => {
  try {
    const { dip } = req.body;
    if (!dip) return res.status(400).json({ error: 'DIP requerido' });

    const usuario = await sbFindSolicitanteByDip(dip);
    if (!usuario) return res.status(401).json({ error: 'DIP no encontrado' });

    const cargos = await sbFindCargosByDip(dip);
    const permisosAlmacenados = await sbFindPermisosByDip(dip);
    const roles = determinarRoles(cargos, permisosAlmacenados);
    const entidades = getEntidadesPermitidas(roles);

    req.session.usuario = {
      dip: usuario.dip,
      nombre: usuario.nombre_real || usuario.alias || dip,
      email: usuario.email || '',
      alias: usuario.alias || '',
      rol: usuario.rol || 'externo'
    };
    req.session.roles = roles;
    req.session.entidades_permitidas = entidades;
    req.session.cargos = cargos;
    req.session.permisos_almacenados = permisosAlmacenados;

    res.json({ success: true, redirect: '/dashboard', entidades });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Logout ─────────────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ success: true, redirect: '/login' });
});

export default router;
