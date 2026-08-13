/* ── Autenticación demo del BFF ─────────────────────────────────────────
   Sesión igual que el mock del SPA (superadmin/rsp_admin) para el panel.
   Sustituir por PlacetaID + Supabase en producción. La sesión viaja en
   cookie httpOnly `rsp_session` (mismo flujo que admin-placeta). */
import { Router } from 'express';

const SESSION = {
  usuario: { dip: '23749931M', nombre: 'Mikel Alegre Marcos', email: 'mikel@laplaceta.org', nivel: 'N3' },
  roles: ['superadmin', 'rsp_admin'],
  entidades: ['banco', 'tributos', 'junta', 'administracion', 'rsp', 'junior'],
  permisos: { rsp: [] },
};

export function sesionPara(dip = '23749931M') {
  return {
    ...SESSION,
    usuario: { ...SESSION.usuario, dip: String(dip || '23749931M').toUpperCase() },
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

  router.post('/login/demo', (req, res) => {
    const dip = req.body?.dip;
    const sesion = sesionPara(dip);
    res.cookie('rsp_session', sesion.usuario.dip, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8,
    });
    res.json(sesion);
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie('rsp_session');
    res.json({ ok: true });
  });

  router.get('/api/sesion', (req, res) => {
    const dip = parseCookies(req).rsp_session;
    if (!dip) return res.status(401).json({ error: 'Sin sesión' });
    res.json(sesionPara(dip));
  });

  return router;
}
