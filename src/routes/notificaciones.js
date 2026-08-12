/**
 * NOTIFICACIONES UNIFICADAS — Rutas (FASE 17)
 * Montado en /rsp/notificaciones
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarNotificaciones, crearNotificacion, marcarLeida,
  marcarTodasLeidas, estadoNotificaciones, NIVELES_NOTIF,
} from '../config/notificaciones.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_notificaciones'), async (req, res) => {
  const [notificaciones, estado] = await Promise.all([listarNotificaciones(req.query), estadoNotificaciones()]);
  res.render('rsp/notificaciones/panel', {
    titulo: 'Centro de Notificaciones',
    entidad_actual: 'rsp',
    notificaciones, estado, NIVELES_NOTIF,
    filtroNivel: req.query.nivel || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

// ═══ API ════════════════════════════════════════════════════════════════

// Endpoint para que CUALQUIER servicio del ecosistema cree notificaciones
router.post('/api/notificaciones', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_notificaciones'), async (req, res) => {
  try {
    const n = await crearNotificacion(req.body);
    res.json({ success: true, notificacion: n });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/notificaciones/:id/leida', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  const leida = req.body.leida !== false;
  await marcarLeida(req.params.id, leida);
  res.json({ success: true });
});

router.post('/api/notificaciones/marcar-todas', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  await marcarTodasLeidas(actor(req).dip);
  res.json({ success: true });
});

router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoNotificaciones());
});

export default router;
