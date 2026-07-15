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
    const { token, error } = req.query;

    if (error) {
      return res.render('auth/login', { titulo: 'Admin Placeta - Error', layout: false, error: 'Autenticación cancelada o rechazada' });
    }

    // Extraer DIP del token JWT o de parámetros
    let dip = '';
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded?.dip) dip = decoded.dip;
      } catch {}
    }

    // Si no hay DIP en el token, extraer de query params
    if (!dip) {
      // PlacetaID puede pasar user como JSON string o como params individuales
      for (const key of ['dip', 'user', 'userId', 'sub', 'placetaId']) {
        if (req.query[key]) {
          try {
            const parsed = JSON.parse(decodeURIComponent(req.query[key]));
            if (parsed?.dip) { dip = parsed.dip; break; }
            if (parsed?.userId) { dip = parsed.userId; break; }
          } catch {
            if (key === 'dip') { dip = req.query[key]; break; }
          }
        }
      }
    }

    if (!dip) {
      // Último recurso: el DIP está en la URL como /callback?23749931M
      const pathParts = req.path.split('/');
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && lastPart.length > 5 && /^\d{7,9}[A-Z]$/i.test(lastPart)) dip = lastPart;
    }

    if (!dip) {
      console.log('[Auth] Callback sin DIP. Query:', JSON.stringify(req.query));
      return res.render('auth/login', { titulo: 'Admin Placeta - Error', layout: false, error: 'No se recibió el DIP. Usa el acceso directo o contacta con soporte.' });
    }

    // Buscar usuario en CRM (con timeout)
    let usuario = null;
    try {
      usuario = await Promise.race([
        sbFindSolicitanteByDip(dip),
        new Promise(r => setTimeout(() => r(null), 5000))
      ]);
    } catch {}

    if (!usuario) {
      usuario = { dip, nombre_real: dip, email: '', alias: dip, estado: 'activo', rol: 'externo' };
    }

    // Cargar roles y permisos
    const [cargos, permisosAlmacenados] = await Promise.all([
      sbFindCargosByDip(dip).catch(() => []),
      sbFindPermisosByDip(dip).catch(() => [])
    ]);
    const roles = determinarRoles(cargos, permisosAlmacenados, dip);
    const entidades = getEntidadesPermitidas(roles);

    // Guardar sesión
    req.session.usuario = {
      dip: usuario.dip, nombre: usuario.nombre_real || usuario.alias || dip,
      email: usuario.email || '', alias: usuario.alias || '', rol: usuario.rol || 'externo'
    };
    req.session.roles = roles;
    req.session.entidades_permitidas = entidades;
    req.session.cargos = cargos;
    req.session.permisos_almacenados = permisosAlmacenados;

    if (entidades.length === 0) {
      return res.render('auth/login', { titulo: 'Admin Placeta - Sin Acceso', layout: false, error: 'No tienes permisos. Contacta con la Junta.' });
    }

    res.redirect('/dashboard');
  } catch (err) {
    console.error('[Auth] Error en callback:', err?.message || err);
    try { res.render('auth/login', { titulo: 'Admin Placeta - Error', layout: false, error: 'Error: ' + (err?.message || 'desconocido') }); } catch {}
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
    const roles = determinarRoles(cargos, permisosAlmacenados, dip);
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
