/**
 * DASHBOARD ECONÓMICO DEL GRUPO — Rutas (FASE 22)
 * Montado en /rsp/economico
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import { obtenerPanoramaEconomico, resultadoPorEntidad } from '../config/economico.js';

const router = Router();

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_operaciones'), async (req, res) => {
  const [panorama, porEntidad] = await Promise.all([obtenerPanoramaEconomico(), resultadoPorEntidad()]);
  res.render('rsp/economico/panel', {
    titulo: 'Dashboard Económico del Grupo',
    entidad_actual: 'rsp',
    p: panorama,
    porEntidad,
    periodo: req.query.periodo || new Date().toISOString().slice(0, 7),
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

router.get('/api/panorama', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json({ success: true, ...(await obtenerPanoramaEconomico()) });
});

router.get('/api/por-entidad', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json({ success: true, ...(await resultadoPorEntidad()) });
});

export default router;
