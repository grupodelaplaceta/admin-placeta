/**
 * COMPROBACIÓN DEL ECOSISTEMA — Rutas (FASE 27 + punto 15)
 * Montado en /rsp/comprobacion
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  comprobarEcosistema, listarComprobaciones, estadoComprobacion,
  registrarResultado, RESULTADOS,
} from '../config/comprobacion.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_comprobacion'), async (req, res) => {
  const [checks, estado] = await Promise.all([listarComprobaciones(req.query), estadoComprobacion()]);
  res.render('rsp/comprobacion/panel', {
    titulo: 'Comprobación del Ecosistema',
    entidad_actual: 'rsp',
    checks, estado, RESULTADOS,
    filtroResultado: req.query.resultado || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

// ═══ API ════════════════════════════════════════════════════════════════

// Ejecuta la comprobación global (con datos que se pasen o vacíos)
router.post('/api/ejecutar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const resultado = await comprobarEcosistema(req.body || {});
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'auditar', objeto_tipo: 'COMPROBACION', objeto_id: `CHK-${Date.now()}`, valor_nuevo: { total: resultado.total, inconsistencias: resultado.inconsistencias, diferencias: resultado.diferencias }, motivo: 'Comprobación del ecosistema' });
    res.json({ success: true, ...resultado });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Registro individual (para otros módulos)
router.post('/api/registrar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const check = await registrarResultado(req.body);
    res.json({ success: true, check });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoComprobacion());
});

export default router;
