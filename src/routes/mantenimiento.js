/**
 * RUTAS DE MANTENIMIENTO Y ESTADO RSP
 */

import { Router } from 'express';
import { verificarSesion, verificarPermiso } from '../middleware/auth.js';
import { setMantenimientoGlobal, setMantenimientoEntidad, isEnMantenimiento, getEstadoMantenimiento } from '../config/mantenimiento.js';

const router = Router();

// ── Panel de administración de mantenimiento ──────────────────────────
router.get('/mantenimiento', verificarSesion, verificarPermiso('administracion', 'gestion_tramites'), (req, res) => {
  const estado = getEstadoMantenimiento();

  res.render('parciales/admin-mantenimiento', {
    titulo: 'Mantenimiento - Administración',
    entidad_actual: 'administracion',
    estado,
    layout: 'layouts/admin'
  });
});

// ── API: Estado actual de mantenimiento ───────────────────────────────
router.get('/api/mantenimiento', (req, res) => {
  const entidad = req.query.entidad || '';
  if (entidad) {
    const mnt = isEnMantenimiento(entidad);
    return res.json({ enMantenimiento: !!mnt, detalle: mnt });
  }
  res.json(getEstadoMantenimiento());
});

// ── API: Activar/desactivar mantenimiento global ──────────────────────
router.post('/api/mantenimiento/global', verificarSesion, verificarPermiso('administracion', 'gestion_tramites'), (req, res) => {
  const { activo, mensaje } = req.body;
  const result = setMantenimientoGlobal(activo === true || activo === 'true', mensaje);
  res.json({ success: true, estado: result });
});

// ── API: Activar/desactivar mantenimiento por entidad ─────────────────
router.post('/api/mantenimiento/entidad', verificarSesion, verificarPermiso('administracion', 'gestion_tramites'), (req, res) => {
  const { entidad, activo, mensaje } = req.body;
  if (!entidad) return res.status(400).json({ error: 'Entidad requerida' });
  const result = setMantenimientoEntidad(entidad, activo === true || activo === 'true', mensaje);
  res.json({ success: true, entidad, estado: result });
});

export default router;
