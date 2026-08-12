/**
 * EXPEDIENTES TRANSVERSALES — Rutas (FASE 14)
 * Montado en /rsp/expedientes
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarExpedientes, getExpediente, crearExpediente, actualizarExpediente,
  vincularObjeto, estadoExpedientes, ESTADOS_EXP,
} from '../config/expedientes.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();

const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

// ── Página principal ─────────────────────────────────────────────────────
router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_expedientes'), async (req, res) => {
  const [expedientes, estado] = await Promise.all([listarExpedientes(req.query), estadoExpedientes()]);
  res.render('rsp/expedientes/panel', {
    titulo: 'Expedientes Transversales',
    entidad_actual: 'rsp',
    expedientes, estado, ESTADOS_EXP,
    filtroEstado: req.query.estado || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

// ── Detalle ──────────────────────────────────────────────────────────────
router.get('/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_expedientes'), async (req, res) => {
  const exp = await getExpediente(req.params.id);
  if (!exp) return res.status(404).render('parciales/error', { titulo: '404', error: 'Expediente no encontrado', enlace: '/rsp/expedientes' });
  res.render('rsp/expedientes/detalle', {
    titulo: `${exp.id} — Expediente`,
    entidad_actual: 'rsp',
    exp, ESTADOS_EXP,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

// ═══ API ════════════════════════════════════════════════════════════════

router.post('/api/expedientes', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_expedientes'), async (req, res) => {
  try {
    const exp = await crearExpediente(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'EXPEDIENTE', objeto_id: exp.id, valor_nuevo: { titulo: exp.titulo }, motivo: 'Creación de expediente' });
    res.json({ success: true, expediente: exp });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.put('/api/expedientes/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_expedientes'), async (req, res) => {
  try {
    const exp = await actualizarExpediente(req.params.id, req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'editar', objeto_tipo: 'EXPEDIENTE', objeto_id: exp.id, valor_nuevo: { estado: exp.estado }, motivo: 'Actualización de expediente' });
    res.json({ success: true, expediente: exp });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/expedientes/:id/vincular', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_expedientes'), async (req, res) => {
  try {
    const { tipo, objeto_id, label } = req.body;
    const exp = await vincularObjeto(req.params.id, tipo, objeto_id, label);
    res.json({ success: true, expediente: exp });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoExpedientes());
});

export default router;
