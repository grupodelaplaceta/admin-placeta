/* ── Autenticación del BFF ──────────────────────────────────────────────
   Login con credenciales (DIP + contraseña) verificadas contra la variable
   de entorno ADMIN_USERS. La sesión es un token aleatorio guardado en
   memoria y servido en cookie httpOnly (no falsificable desde el cliente).
   Sustituir por PlacetaID + Supabase en producción. */
import { Router } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const COOKIE = 'rsp_session';
const TTL = 1000 * 60 * 60 * 8; // 8 horas
const SESIONES = new Map(); // token -> { dip, expira }

// ADMIN_USERS = JSON: [{"dip":"23749931M","password":"...","nombre":"...","roles":["superadmin","rsp_admin"]}]
function cargarUsuarios() {
  const raw = process.env.ADMIN_USERS;
  if (raw) {
    try {
      const lista = JSON.parse(raw);
      return Array.isArray(lista) ? lista : [];
    } catch {
      return [];
    }
  }
  // Fallback demo SOLO fuera de producción (desarrollo local).
  if (process.env.NODE_ENV !== 'production') {
    return [{ dip: '23749931M', password: 'demo', nombre: 'Mikel Alegre Marcos', roles: ['superadmin', 'rsp_admin'] }];
  }
  return [];
}

const USUARIOS = cargarUsuarios();

function verificarPassword(entrada, esperado) {
  const a = createHash('sha256').update(String(entrada)).digest();
  const b = createHash('sha256').update(String(esperado)).digest();
  return a.length === b.length && timingSafeEqual(a, b);
}

function sesionPara(usuario) {
  return {
    usuario: {
      dip: usuario.dip,
      nombre: usuario.nombre || usuario.dip,
      email: usuario.email || `${String(usuario.dip).toLowerCase()}@laplaceta.org`,
      nivel: 'N3',
    },
    roles: usuario.roles || ['rsp_admin'],
    entidades: ['banco', 'tributos', 'junta', 'administracion', 'rsp', 'junior'],
    permisos: { rsp: [] },
  };
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function authRouter() {
  const router = Router();

  router.post('/login', (req, res) => {
    const dip = String(req.body?.dip || '').trim().toUpperCase();
    const password = req.body?.password || '';
    const usuario = USUARIOS.find((u) => String(u.dip).toUpperCase() === dip);
    if (!usuario || !verificarPassword(password, usuario.password)) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    const token = randomBytes(32).toString('hex');
    SESIONES.set(token, { dip: usuario.dip, expira: Date.now() + TTL });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: TTL,
    });
    res.json(sesionPara(usuario));
  });

  router.post('/logout', (req, res) => {
    const token = parseCookies(req)[COOKIE];
    if (token) SESIONES.delete(token);
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  router.get('/api/sesion', (req, res) => {
    const token = parseCookies(req)[COOKIE];
    const s = token && SESIONES.get(token);
    if (!s || s.expira < Date.now()) {
      if (s) SESIONES.delete(token);
      return res.status(401).json({ error: 'Sin sesión' });
    }
    const usuario = USUARIOS.find((u) => String(u.dip).toUpperCase() === String(s.dip).toUpperCase())
      || { dip: s.dip, nombre: s.dip, roles: ['rsp_admin'] };
    res.json(sesionPara(usuario));
  });

  return router;
}

/** Middleware que protege las rutas de API: exige sesión válida. */
export function requiereSesion(req, res, next) {
  const token = parseCookies(req)[COOKIE];
  const s = token && SESIONES.get(token);
  if (!s || s.expira < Date.now()) {
    if (s) SESIONES.delete(token);
    return res.status(401).json({ error: 'No autenticado' });
  }
  req.usuario = s;
  next();
}
