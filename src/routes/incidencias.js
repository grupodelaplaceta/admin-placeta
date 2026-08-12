/**
 * INCIDENCIAS GLOBALES — Rutas (FASE 18)
 * Montado en /rsp/incidencias
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarIncidencias, getIncidencia, crearIncidencia,
  cambiarEstadoIncidencia, asignarResponsable, estadoIncidencias,
  ESTADOS_INC, ORIGENES_INC,
} from '../config/incidencias.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_incidencias'), async (req, res) => {
  const [incidencias, estado] = await Promise.all([listarIncidencias(req.query), estadoIncidencias()]);
  res.render('rsp/incidencias/panel', {
    titulo: 'Incidencias Globales',
    entidad_actual: 'rsp',
    incidencias, estado, ESTADOS_INC, ORIGENES_INC,
    filtroEstado: req.query.estado || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

router.get('/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_incidencias'), async (req, res) => {
  const inc = await getIncidencia(req.params.id);
  if (!inc) return res.status(404).render('parciales/error', { titulo: '404', error: 'Incidencia no encontrada', enlace: '/rsp/incidencias' });
  res.render('rsp/incidencias/detalle', {
    titulo: `${inc.id} — Incidencia`,
    entidad_actual: 'rsp',
    inc, ESTADOS_INC,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

// ═══ API ════════════════════════════════════════════════════════════════

router.post('/api/incidencias', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_incidencias'), async (req, res) => {
  try {
    const inc = await crearIncidencia(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'INCIDENCIA', objeto_id: inc.id, valor_nuevo: { titulo: inc.titulo }, motivo: 'Apertura de incidencia' });
    res.json({ success: true, incidencia: inc });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/incidencias/:id/estado', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_incidencias'), async (req, res) => {
  try {
    const { estado, nota } = req.body;
    const inc = await cambiarEstadoIncidencia(req.params.id, estado, actor(req), nota);
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'editar', objeto_tipo: 'INCIDENCIA', objeto_id: inc.id, valor_nuevo: { estado: inc.estado }, motivo: nota || `Estado → ${estado}` });
    res.json({ success: true, incidencia: inc });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/incidencias/:id/responsable', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_incidencias'), async (req, res) => {
  try {
    const { dip, nombre } = req.body;
    const inc = await asignarResponsable(req.params.id, dip, nombre, actor(req));
    res.json({ success: true, incidencia: inc });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoIncidencias());
});

export default router;
