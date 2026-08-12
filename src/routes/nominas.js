/**
 * SISTEMA DE NÓMINAS — Rutas (FASE 6)
 * Montado en /rsp/nominas
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarNominas, getNomina, crearNomina, generarOrdenBancaria,
  confirmarPagoNomina, estadoNominas, calcularNomina,
} from '../config/nominas.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_operaciones'), async (req, res) => {
  const [nominas, estado] = await Promise.all([listarNominas(req.query), estadoNominas()]);
  res.render('rsp/nominas/panel', {
    titulo: 'Sistema de Nóminas',
    entidad_actual: 'rsp',
    nominas, estado,
    filtroPeriodo: req.query.periodo || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

router.get('/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_operaciones'), async (req, res) => {
  const nomina = await getNomina(req.params.id);
  if (!nomina) return res.status(404).render('parciales/error', { titulo: '404', error: 'Nómina no encontrada', enlace: '/rsp/nominas' });
  res.render('rsp/nominas/detalle', { titulo: `${nomina.id} — Nómina`, entidad_actual: 'rsp', nomina, esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin') });
});

// ═══ API ════════════════════════════════════════════════════════════════

router.post('/api/nominas', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_operaciones'), async (req, res) => {
  try {
    const nomina = await crearNomina(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'nominas', accion: 'crear', objeto_tipo: 'NOMINA', objeto_id: nomina.id, valor_nuevo: { trabajador: nomina.trabajador_dip, bruto: nomina.bruto, neto: nomina.neto, periodo: nomina.periodo }, motivo: `Nómina ${nomina.periodo}` });
    res.json({ success: true, nomina });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/nominas/:id/orden', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_operaciones'), async (req, res) => {
  try {
    const nomina = await generarOrdenBancaria(req.params.id, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'nominas', accion: 'pagar', objeto_tipo: 'NOMINA', objeto_id: nomina.id, valor_nuevo: { estado: nomina.estado, orden: nomina.orden_bancaria?.orden_id }, motivo: 'Orden bancaria generada' });
    res.json({ success: true, nomina });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/nominas/:id/pagar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_operaciones'), async (req, res) => {
  try {
    const nomina = await confirmarPagoNomina(req.params.id, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'nominas', accion: 'pagar', objeto_tipo: 'NOMINA', objeto_id: nomina.id, valor_nuevo: { estado: nomina.estado }, motivo: 'Pago confirmado' });
    res.json({ success: true, nomina });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/previsualizar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_operaciones'), (req, res) => {
  try {
    const calculada = calcularNomina(req.body);
    res.json({ success: true, ...calculada });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoNominas());
});

export default router;
