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
  const registros = await apiPlacetaidRegistros();
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
