/* ── Autenticación del BFF ──────────────────────────────────────────────
   Login con credenciales (DIP + contraseña) verificadas contra la variable
   de entorno ADMIN_USERS. La sesión es un token aleatorio guardado en
   memoria y servido en cookie httpOnly (no falsificable desde el cliente).
   Sustituir por PlacetaID + Supabase en producción. */
import { Router } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const COOKIE = 'rsp_session';
const TTL = 1000 * 60 * 60 * 8; // 8 horas
const SESIONES = new Map(); // token -> { dip, expira }

const PLACETAID_URL = process.env.PLACETAID_AUTH_URL || 'https://id.laplaceta.org';
const PLACETAID_CLIENT_ID = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';

// ADMIN_USERS = JSON: [{"dip":"23749931M","password":"...","nombre":"...","roles":["superadmin","rsp_admin"]}]
function cargarUsuarios() {
  const lista = [];
  const raw = process.env.ADMIN_USERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) lista.push(...parsed);
    } catch {
      /* ADMIN_USERS malformado: se ignora */
    }
  }
  // El presidente (23749931M) es administrador de TODO siempre. Su clave es
  // ADMIN_PASSWORD (recomendado); si no se define, usa 'demo' (cambiar en producción).
  const yaPresi = lista.some((u) => String(u.dip).toUpperCase() === '23749931M');
  if (!yaPresi) {
    lista.push({
      dip: '23749931M',
      password: process.env.ADMIN_PASSWORD || 'demo',
      nombre: process.env.ADMIN_NOMBRE || 'Mikel Alegre Marcos',
      roles: ['superadmin', 'rsp_admin'],
    });
  }
  return lista;
}

const USUARIOS = cargarUsuarios();

/** Solo los DIPs administradores pueden entrar (ADMIN_DIPS separados por comas,
 *  o los dips de ADMIN_USERS, o el presidente 23749931M). */
function esAdmin(dip) {
  const d = String(dip || '').toUpperCase();
  // El presidente es administrador de todo el ecosistema, siempre.
  if (d === '23749931M') return true;
  const lista = (process.env.ADMIN_DIPS || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (lista.length) return lista.includes(d);
  const deUsuarios = USUARIOS.map((u) => String(u.dip).toUpperCase());
  if (deUsuarios.length) return deUsuarios.includes(d);
  return process.env.NODE_ENV !== 'production' && d === '23749931M';
}

/** Decodifica el payload de un JWT (base64url) sin verificar la firma. */
function decodificarJwt(token) {
  try {
    const partes = String(token).split('.');
    if (partes.length !== 3) return null;
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Verifica la firma HMAC si hay PLACETAID_JWT_SECRET; sin secreto se acepta (como admin-placeta). */
function verificarFirmaJwt(token) {
  const secret = process.env.PLACETAID_JWT_SECRET;
  if (!secret) return true;
  const partes = String(token).split('.');
  if (partes.length !== 3) return false;
  const firmado = `${partes[0]}.${partes[1]}`;
  const esperado = createHmac('sha256', secret).update(firmado).digest('base64url');
  try {
    return esperado.length === partes[2].length && timingSafeEqual(Buffer.from(esperado), Buffer.from(partes[2]));
  } catch {
    return false;
  }
}

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
    if (!usuario || !esAdmin(usuario.dip)) {
      return res.status(401).json({ error: `Acceso denegado: ${dip || 'DIP vacío'} no es administrador.` });
    }
    if (!verificarPassword(password, usuario.password)) {
      return res.status(401).json({ error: `Contraseña incorrecta para ${dip}.` });
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

  // ── SSO con PlacetaID móvil: devuelve la URL de la fase 1 ──────────
  // `service` es el nombre que PlacetaID muestra al ciudadano ("accedes a X").
  router.post('/login/placetaid', (req, res) => {
    const state = randomBytes(16).toString('hex');
    const redirectUri = `${req.protocol}://${req.get('host')}/login/callback`;
    const service = 'Red de Servicios de La Placeta (RSP)';
    const authUrl = `${PLACETAID_URL}/api/auth/fase1?from=${encodeURIComponent(redirectUri)}`
      + `&client_id=${encodeURIComponent(PLACETAID_CLIENT_ID)}&state=${state}&platform=web`
      + `&service=${encodeURIComponent(service)}`;
    res.json({ redirect: authUrl });
  });

  // ── Callback del SSO: valida el token, exige admin y crea sesión ──
  router.get('/login/callback', (req, res) => {
    const denegar = (mensaje) => res.status(403).send(
      `<meta charset="utf-8"><h1>Acceso denegado</h1><p>${mensaje}</p><p><a href="/">Volver</a></p>`,
    );
    const { token, error } = req.query;
    if (error) return denegar('Autenticación cancelada o rechazada.');
    if (!token || !verificarFirmaJwt(token)) return denegar('Token inválido.');
    const payload = decodificarJwt(token);
    const dip = String(payload?.dip || payload?.sub || req.query.dip || '').toUpperCase();
    if (!dip) return denegar('No se recibió el DIP.');
    if (!esAdmin(dip)) return denegar('No eres administrador del RSP.');
    const usuario = USUARIOS.find((u) => String(u.dip).toUpperCase() === dip)
      || { dip, nombre: dip, roles: ['superadmin', 'rsp_admin'] };
    const sess = randomBytes(32).toString('hex');
    SESIONES.set(sess, { dip: usuario.dip, expira: Date.now() + TTL });
    res.cookie(COOKIE, sess, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: TTL,
    });
    res.redirect('/');
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
