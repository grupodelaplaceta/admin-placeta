/**
 * CONTABILIDAD DE ENTIDADES — Rutas (FASE 7 + punto 13)
 * Montado en /rsp/contabilidad
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  initPlanContable, listarPlanContable, crearCuenta,
  listarAsientos, getAsiento, crearAsiento, libroMayor, estadoFinanciero,
} from '../config/contabilidad.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_contabilidad'), async (req, res) => {
  await initPlanContable();
  const [plan, asientos] = await Promise.all([listarPlanContable(), listarAsientos(req.query)]);
  const eip = req.query.entidad_eip || '';
  const mayor = eip ? await libroMayor(eip) : [];
  const fin = eip ? await estadoFinanciero(eip) : null;
  res.render('rsp/contabilidad/panel', {
    titulo: 'Contabilidad de Entidades',
    entidad_actual: 'rsp',
    plan, asientos, mayor, fin,
    filtroEIP: eip,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

router.get('/asiento/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_contabilidad'), async (req, res) => {
  const asiento = await getAsiento(req.params.id);
  if (!asiento) return res.status(404).render('parciales/error', { titulo: '404', error: 'Asiento no encontrado', enlace: '/rsp/contabilidad' });
  res.render('rsp/contabilidad/asiento', { titulo: `Asiento ${asiento.id}`, entidad_actual: 'rsp', asiento });
});

// ═══ API ════════════════════════════════════════════════════════════════

router.post('/api/cuentas', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_contabilidad'), async (req, res) => {
  try {
    const cta = await crearCuenta(req.body);
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'PLAN_CONTABLE', objeto_id: cta.codigo, valor_nuevo: { nombre: cta.nombre }, motivo: 'Alta de cuenta del plan contable' });
    res.json({ success: true, cuenta: cta });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/asientos', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_contabilidad'), async (req, res) => {
  try {
    const asiento = await crearAsiento(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'ASIENTO', objeto_id: asiento.id, valor_nuevo: { entidad: asiento.entidad_eip, total: asiento.total_debe }, motivo: asiento.concepto || 'Asiento contable' });
    res.json({ success: true, asiento });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/mayor/:eip', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_contabilidad'), async (req, res) => {
  const mayor = await libroMayor(req.params.eip);
  res.json({ success: true, mayor });
});

router.get('/api/financiero/:eip', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_contabilidad'), async (req, res) => {
  res.json({ success: true, ...(await estadoFinanciero(req.params.eip)) });
});

export default router;
