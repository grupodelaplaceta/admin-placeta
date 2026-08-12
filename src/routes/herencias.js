/**
 * BAJAS / HERENCIAS / TESTAMENTO — Rutas (puntos 17-21)
 * Montado en /rsp/herencias
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarBajas, darDeBaja, reactivarBaja,
  listarTestamentos, crearTestamento,
  listarHerencias, getHerencia, iniciarHerencia, transmitirBien,
  aplicarSustitucion, fondosSinHerederoAFundacion, participacionSinHeredero, cerrarHerencia,
  estadoHerencias,
} from '../config/herencias.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_comprobacion'), async (req, res) => {
  const [bajas, testamentos, herencias, estado] = await Promise.all([
    listarBajas(), listarTestamentos(), listarHerencias(), estadoHerencias(),
  ]);
  res.render('rsp/herencias/panel', {
    titulo: 'Bajas, Herencias y Testamento Digital',
    entidad_actual: 'rsp',
    bajas, testamentos, herencias, estado,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

router.get('/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_comprobacion'), async (req, res) => {
  const h = await getHerencia(req.params.id);
  if (!h) return res.status(404).render('parciales/error', { titulo: '404', error: 'Herencia no encontrada', enlace: '/rsp/herencias' });
  res.render('rsp/herencias/detalle', { titulo: `${h.id} — Herencia`, entidad_actual: 'rsp', h, esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin') });
});

// ═══ API ════════════════════════════════════════════════════════════════

router.post('/api/bajas', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const baja = await darDeBaja(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'administrar', objeto_tipo: 'BAJA', objeto_id: baja.id, valor_nuevo: { dip: baja.dip, estado: baja.estado }, motivo: 'Baja de usuario' });
    res.json({ success: true, baja });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/bajas/:id/reactivar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const baja = await reactivarBaja(req.params.id, req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'administrar', objeto_tipo: 'BAJA', objeto_id: baja.id, valor_nuevo: { estado: baja.estado, dip: baja.dip }, motivo: 'Reactivación de usuario' });
    res.json({ success: true, baja });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/testamentos', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const test = await crearTestamento(req.body, actor(req));
    res.json({ success: true, testamento: test });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/herencias', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const h = await iniciarHerencia(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'HERENCIA', objeto_id: h.id, valor_nuevo: { causante: h.causante_dip }, motivo: 'Apertura de proceso de herencia' });
    res.json({ success: true, herencia: h });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/herencias/:id/transmitir', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const h = await transmitirBien(req.params.id, req.body.bienIndex, req.body.herederoDip, actor(req));
    res.json({ success: true, herencia: h });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/herencias/:id/sustitucion', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const h = await aplicarSustitucion(req.params.id, req.body.herederoDip, req.body.sustitutoDip, actor(req));
    res.json({ success: true, herencia: h });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/herencias/:id/fondos-fundacion', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const h = await fondosSinHerederoAFundacion(req.params.id, req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'fundacion', accion: 'pagar', objeto_tipo: 'HERENCIA', objeto_id: h.id, valor_nuevo: { fondos: h.fondos_sin_heredero }, motivo: 'Fondos sin heredero → Fundación' });
    res.json({ success: true, herencia: h });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/herencias/:id/participacion', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const h = await participacionSinHeredero(req.params.id, req.body.participacionIndex, req.body, actor(req));
    res.json({ success: true, herencia: h });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/herencias/:id/cerrar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const h = await cerrarHerencia(req.params.id, actor(req));
    res.json({ success: true, herencia: h });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoHerencias());
});

export default router;
