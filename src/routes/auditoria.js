/**
 * AUDITORÍA CENTRAL — Rutas (FASE 19)
 * Montado en /rsp/auditoria
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import { listarAuditoria, estadisticasAuditoria, historialObjeto } from '../config/auditoria.js';

const router = Router();

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_auditoria'), async (req, res) => {
  const [logs, stats] = await Promise.all([listarAuditoria(req.query), estadisticasAuditoria()]);
  res.render('rsp/auditoria/panel', {
    titulo: 'Auditoría Central',
    entidad_actual: 'rsp',
    logs, stats,
    filtroServicio: req.query.servicio || '',
    filtroAccion: req.query.accion || '',
    filtroUsuario: req.query.usuario_dip || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

router.get('/objeto/:tipo/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_auditoria'), async (req, res) => {
  const historial = await historialObjeto(req.params.tipo, req.params.id);
  res.json({ success: true, tipo: req.params.tipo, id: req.params.id, historial });
});

// API de consulta (para que otros módulos puedan mostrar histórico)
router.get('/api/logs', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_auditoria'), async (req, res) => {
  const logs = await listarAuditoria(req.query);
  res.json({ success: true, total: logs.length, logs });
});

export default router;
