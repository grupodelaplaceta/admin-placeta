/**
 * OPERATION ENGINE — Rutas (FASE 4)
 * Montado en /rsp/operaciones
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  procesarOperacion, cambiarEtapa, listarOperaciones, getOperacion,
  estadoOperationEngine, clasificarOperacion, ETAPAS_MOTOR,
} from '../config/operation-engine.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_operaciones'), async (req, res) => {
  const [operaciones, estado] = await Promise.all([listarOperaciones(req.query), estadoOperationEngine()]);
  res.render('rsp/operaciones/panel', {
    titulo: 'Operation Engine',
    entidad_actual: 'rsp',
    operaciones, estado, ETAPAS_MOTOR,
    filtroEstado: req.query.estado_motor || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

router.get('/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_operaciones'), async (req, res) => {
  const op = await getOperacion(req.params.id);
  if (!op) return res.status(404).render('parciales/error', { titulo: '404', error: 'Operación no encontrada', enlace: '/rsp/operaciones' });
  res.render('rsp/operaciones/detalle', { titulo: `${op.id} — Operación`, entidad_actual: 'rsp', op, ETAPAS_MOTOR, esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin') });
});

// ═══ API ════════════════════════════════════════════════════════════════

router.post('/api/operaciones', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_operaciones'), async (req, res) => {
  try {
    const op = await procesarOperacion(req.body, req.body.ctx || {}, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'OPERACION', objeto_id: op.id, valor_nuevo: { concepto: op.concepto, clasificacion: op.clasificacion, estado: op.estado_motor }, motivo: 'Operación procesada por el motor' });
    res.json({ success: true, operacion: op });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/operaciones/:id/etapa', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_operaciones'), async (req, res) => {
  try {
    const op = await cambiarEtapa(req.params.id, req.body.etapa, actor(req), req.body.motivo);
    res.json({ success: true, operacion: op });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/clasificar', verificarSesion, verificarAccesoEntidad('rsp'), (req, res) => {
  const resultado = clasificarOperacion({ concepto: req.query.concepto || '' });
  res.json({ success: true, ...resultado });
});

router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoOperationEngine());
});

export default router;
