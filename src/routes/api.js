import { Router } from 'express';
import { apiBancoGetState, apiBancoPost, apiPlacetaidRegistros, apiPlacetaidStats, apiPlacetaidDesbloquear, sbFindSolicitanteByDip, sbListSolicitantes } from '../config/db.js';
import { verificarSesion } from '../middleware/auth.js';

const router = Router();

// ── API Banco ──────────────────────────────────────────────────────────────
router.get('/banco/state', verificarSesion, async (req, res) => {
  const state = await apiBancoGetState();
  res.json(state || { error: 'No disponible' });
});

router.post('/banco/action', verificarSesion, async (req, res) => {
  const { action, ...data } = req.body;
  if (!action) return res.status(400).json({ error: 'action requerido' });
  const result = await apiBancoPost(action, data);
  res.json(result || { error: 'Error' });
});

// ── API PlacetaID ─────────────────────────────────────────────────────────
router.get('/placetaid/registros', verificarSesion, async (req, res) => {
  const raw = await apiPlacetaidRegistros();
  // Normalizar campos de PLID26 (Español/MongoDB) a nombres consistentes
  const registros = (raw || []).map(r => ({
    dip: r.dip, nombre: r.nombre || '',
    apellidos: r.apellidos || '', email: r.correo || r.email || '',
    totpVerificado: r.totpVerified === true, bloqueado: r.bloqueado === true || r.banned === true,
    activo: r.activo !== false, rol: r.rol || 'ciudadano',
    createdAt: r.creadoEn || r.createdAt || '',
    fechaNacimiento: r.fechaNacimiento || '', placeid: r.placeid || '',
    intentosFallidos: r.intentosFallidos || 0
  }));
  res.json(registros);
});

router.get('/placetaid/stats', verificarSesion, async (req, res) => {
  const stats = await apiPlacetaidStats();
  res.json(stats);
});

router.post('/placetaid/desbloquear/:dip', verificarSesion, async (req, res) => {
  const ok = await apiPlacetaidDesbloquear(req.params.dip);
  res.json({ success: ok });
});

// ── API CRM / Supabase ─────────────────────────────────────────────────────
router.get('/crm/solicitantes', verificarSesion, async (req, res) => {
  const solicitantes = await sbListSolicitantes(req.query);
  res.json(solicitantes);
});

router.get('/crm/solicitante/:dip', verificarSesion, async (req, res) => {
  const s = await sbFindSolicitanteByDip(req.params.dip);
  res.json(s || { error: 'No encontrado' });
});

// ── API PlacetaID Bridge — Votaciones ─────────────────────────────────────
const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';

async function apiPlacetaidPost(path, data) {
  try {
    const r = await fetch(`${PLACETAID_API}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

// Enviar votación a PlacetaID (notifica al grupo correspondiente)
router.post('/placetaid/votaciones', verificarSesion, async (req, res) => {
  const result = await apiPlacetaidPost('/admin/votaciones', req.body);
  res.json(result || { success: true, message: 'Votación enviada (simulado)' });
});

// Cerrar votación en PlacetaID
router.put('/placetaid/votaciones/:id/cerrar', verificarSesion, async (req, res) => {
  const result = await apiPlacetaidPost(`/admin/votaciones/${req.params.id}/cerrar`, {});
  res.json(result || { success: true });
});

// Enviar documento para firma a DIPs específicos
router.post('/placetaid/documentos', verificarSesion, async (req, res) => {
  const result = await apiPlacetaidPost('/admin/documentos', req.body);
  res.json(result || { success: true, message: 'Documento enviado (simulado)' });
});

// Obtener DIPs por grupo electoral
router.get('/placetaid/grupos/:grupo/dips', verificarSesion, async (req, res) => {
  try {
    const r = await fetch(`${PLACETAID_API}/admin/grupos/${req.params.grupo}/dips`, {
      headers: { 'X-API-Key': process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return res.json([]);
    const data = await r.json();
    res.json(data.dips || []);
  } catch { res.json([]); }
});

// ── API Sesión actual ──────────────────────────────────────────────────────
router.get('/session', verificarSesion, (req, res) => {
  res.json({
    usuario: req.session.usuario,
    roles: req.session.roles || [],
    entidades_permitidas: req.session.entidades_permitidas || [],
    cargos: req.session.cargos || []
  });
});

export default router;
