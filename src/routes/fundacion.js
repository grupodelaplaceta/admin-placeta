/**
 * FUNDACIÓN BANCO DE LA PLACETA — Rutas (FASE 11/12)
 * Montado en /rsp/fundacion
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarProgramas, crearPrograma, listarSolicitudes, getSolicitud,
  crearSolicitud, cambiarEstadoSolicitud, concederSolicitud, ordenarPagoSolicitud,
  listarCampanas, getCampana, crearCampana, registrarIngresoCampana, cambiarEstadoCampana,
  estadoFundacion, ESTADOS_SOLICITUD, TIPOS_PROGRAMA,
} from '../config/fundacion.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_fundacion'), async (req, res) => {
  const [programas, solicitudes, campanas, estado] = await Promise.all([
    listarProgramas(), listarSolicitudes(req.query), listarCampanas(), estadoFundacion(),
  ]);
  res.render('rsp/fundacion/panel', {
    titulo: 'Fundación Banco de La Placeta',
    entidad_actual: 'rsp',
    programas, solicitudes, campanas, estado, ESTADOS_SOLICITUD, TIPOS_PROGRAMA,
    filtroEstado: req.query.estado || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

router.get('/solicitud/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_fundacion'), async (req, res) => {
  const sol = await getSolicitud(req.params.id);
  if (!sol) return res.status(404).render('parciales/error', { titulo: '404', error: 'Solicitud no encontrada', enlace: '/rsp/fundacion' });
  res.render('rsp/fundacion/solicitud', { titulo: `${sol.id} — Solicitud`, entidad_actual: 'rsp', sol, ESTADOS_SOLICITUD, esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin') });
});

// ═══ API ════════════════════════════════════════════════════════════════

router.post('/api/programas', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_fundacion'), async (req, res) => {
  try {
    const prog = await crearPrograma(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'fundacion', accion: 'crear', objeto_tipo: 'PROGRAMA', objeto_id: prog.id, valor_nuevo: { nombre: prog.nombre, presupuesto: prog.presupuesto }, motivo: 'Alta de programa' });
    res.json({ success: true, programa: prog });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/solicitudes', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_fundacion'), async (req, res) => {
  try {
    const sol = await crearSolicitud(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'fundacion', accion: 'crear', objeto_tipo: 'SOLICITUD', objeto_id: sol.id, valor_nuevo: { solicitante: sol.solicitante_dip, importe: sol.importe_solicitado, rbu: sol.rbu }, motivo: 'Nueva solicitud' });
    res.json({ success: true, solicitud: sol });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/solicitudes/:id/estado', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_fundacion'), async (req, res) => {
  try {
    const { estado, nota } = req.body;
    const sol = await cambiarEstadoSolicitud(req.params.id, estado, actor(req), nota);
    await registrarAuditoria({ usuario: actor(req), servicio: 'fundacion', accion: 'editar', objeto_tipo: 'SOLICITUD', objeto_id: sol.id, valor_nuevo: { estado: sol.estado }, motivo: nota || `Estado → ${estado}` });
    res.json({ success: true, solicitud: sol });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/solicitudes/:id/conceder', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_fundacion'), async (req, res) => {
  try {
    const sol = await concederSolicitud(req.params.id, req.body.importe, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'fundacion', accion: 'aprobar', objeto_tipo: 'SOLICITUD', objeto_id: sol.id, valor_nuevo: { estado: sol.estado, importe: sol.importe_concedido }, motivo: 'Concesión' });
    res.json({ success: true, solicitud: sol });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/solicitudes/:id/pagar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_fundacion'), async (req, res) => {
  try {
    const sol = await ordenarPagoSolicitud(req.params.id, req.body.importe, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'fundacion', accion: 'pagar', objeto_tipo: 'SOLICITUD', objeto_id: sol.id, valor_nuevo: { estado: sol.estado, pagos: sol.pagos }, motivo: 'Orden de pago' });
    res.json({ success: true, solicitud: sol });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Campañas
router.post('/api/campanas', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_fundacion'), async (req, res) => {
  try {
    const camp = await crearCampana(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'fundacion', accion: 'crear', objeto_tipo: 'CAMPAÑA', objeto_id: camp.id, valor_nuevo: { nombre: camp.nombre }, motivo: 'Alta de campaña' });
    res.json({ success: true, campana: camp });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/campanas/:id/ingreso', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_fundacion'), async (req, res) => {
  try {
    const camp = await registrarIngresoCampana(req.params.id, req.body);
    res.json({ success: true, campana: camp });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/campanas/:id/estado', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_fundacion'), async (req, res) => {
  try {
    const camp = await cambiarEstadoCampana(req.params.id, req.body.estado, actor(req));
    res.json({ success: true, campana: camp });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoFundacion());
});

export default router;
