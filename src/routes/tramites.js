/**
 * TRÁMITES / WORKFLOW — Rutas del RSP
 * Montado en:
 *   /rsp/tramites  → lista, detalle, wizard, API
 *   /rsp/bandeja   → Mi bandeja (acciones pendientes del usuario)
 *   /rsp/trabajo   → Bandeja de trabajo (admin)
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarTramites, getTramite, crearTramite, avanzarTramite, anadirComunicacion,
  actualizarTramite, estadoTramites, bandejaDe, trabajoPendiente, TRAMITES, ESTADOS, ESTADO_UI,
} from '../config/tramites.js';
import { apiBancoGetState } from '../config/db.js';
import { registrarAuditoria } from '../config/auditoria.js';

const tramitesRouter = Router();
const bandejaRouter = Router();
const trabajoRouter = Router();

const actor = (req) => ({
  dip: req.session?.usuario?.dip || '',
  nombre: req.session?.usuario?.nombre || 'web',
  rol: req.session?.roles?.includes('superadmin') || req.session?.roles?.includes('rsp_admin') ? 'admin' : 'solicitante',
});
const esAdmin = (req) => req.session?.roles?.includes('superadmin') || req.session?.roles?.includes('rsp_admin');

/* ═══ LISTA DE TRÁMITES ═══════════════════════════════════════ */
tramitesRouter.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_tramites'), async (req, res) => {
  const [tramites, estado] = await Promise.all([listarTramites(req.query), estadoTramites()]);
  res.render('rsp/tramites/lista', {
    titulo: 'Trámites — RSP', entidad_actual: 'rsp',
    tramites, estado, TRAMITES, ESTADOS, ESTADO_UI,
    filtroEstado: req.query.estado || '',
    filtroTipo: req.query.tipo || '',
    esAdmin: esAdmin(req),
  });
});

/* ═══ WIZARD NUEVO TRÁMITE ════════════════════════════════════ */
tramitesRouter.get('/nuevo', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_tramites'), async (req, res) => {
  const tipo = req.query.tipo || '';
  const cfg = TRAMITES[tipo] || null;
  res.render('rsp/tramites/nuevo', {
    titulo: 'Nuevo trámite — RSP', entidad_actual: 'rsp',
    TRAMITES, tipo, cfg, esAdmin: esAdmin(req),
  });
});

/* ═══ DETALLE DE TRÁMITE ══════════════════════════════════════ */
tramitesRouter.get('/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_tramites'), async (req, res) => {
  const t = await getTramite(req.params.id);
  if (!t) return res.status(404).render('parciales/error', { titulo: '404', error: 'Trámite no encontrado', enlace: '/rsp/tramites' });
  const cfg = TRAMITES[t.tipo] || {};
  const progreso = (await import('../config/tramites.js')).progresoDe(t);
  res.render('rsp/tramites/detalle', {
    titulo: `${t.id} — ${t.titulo}`, entidad_actual: 'rsp',
    t, cfg, progreso, ESTADO_UI, esAdmin: esAdmin(req),
    acciones: (cfg.acciones || {})[t.estado] || [],
  });
});

/* ═══ API ═════════════════════════════════════════════════════ */

// Crear trámite (borrador)
tramitesRouter.post('/api/tramites', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_tramites'), async (req, res) => {
  try {
    const t = await crearTramite({ ...req.body, solicitante_dip: req.body.solicitante_dip || actor(req).dip, solicitante_nombre: req.body.solicitante_nombre || actor(req).nombre }, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'TRAMITE', objeto_id: t.id, valor_nuevo: { tipo: t.tipo, titulo: t.titulo }, motivo: 'Creación de trámite' });
    res.json({ success: true, tramite: t });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Avanzar trámite (acción de workflow)
tramitesRouter.post('/api/tramites/:id/accion', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_tramites'), async (req, res) => {
  try {
    const { accion, nota = '', datos = {} } = req.body;
    const r = await avanzarTramite(req.params.id, { accion, nota, datos }, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion, objeto_tipo: 'TRAMITE', objeto_id: r.tramite.id, valor_nuevo: { estado: r.tramite.estado }, motivo: nota || `Acción ${accion}` });
    res.json({ success: true, mensaje: r.mensaje, tramite: r.tramite });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Comunicación en el hilo
tramitesRouter.post('/api/tramites/:id/comunicacion', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_tramites'), async (req, res) => {
  try {
    const t = await anadirComunicacion(req.params.id, { texto: req.body.texto }, actor(req));
    res.json({ success: true, tramite: t });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Actualizar responsable / prioridad (admin)
tramitesRouter.put('/api/tramites/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_tramites'), async (req, res) => {
  try {
    const t = await actualizarTramite(req.params.id, req.body, actor(req));
    res.json({ success: true, tramite: t });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Reutilización de datos: resuelve un ciudadano/entidad desde PlacetaID + banco
tramitesRouter.get('/api/ciudadano', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  try {
    const q = String(req.query.dip || '').trim().toUpperCase();
    if (!q) return res.json({ success: false, error: 'DIP requerido' });
    const banco = await apiBancoGetState().catch(() => null);
    const users = banco?.users || [];
    const accounts = banco?.accounts || [];
    const norm = (s) => String(s || '').trim().toUpperCase();
    const user = users.find(u => norm(u.placetaId) === q || norm(u.dip) === q);
    const cuentas = accounts.filter(a => norm(a.placetaId) === q);
    const nombre = user?.nombre || cuentas[0]?.nombre || null;
    res.json({
      success: true,
      ciudadano: {
        dip: q, nombre, enPlacetaID: !!user, tieneCuenta: cuentas.length > 0, numCuentas: cuentas.length,
        entidades: [...new Set(accounts.filter(a => norm(a.eip)).map(a => a.eip))].slice(0, 20),
      },
    });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

tramitesRouter.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoTramites());
});

/* ═══ MI BANDEJA ═════════════════════════════════════════════ */
bandejaRouter.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_tramites'), async (req, res) => {
  const dip = req.session?.usuario?.dip;
  const [acciones, estado] = await Promise.all([bandejaDe(dip), estadoTramites()]);
  res.render('rsp/bandeja', {
    titulo: 'Mi bandeja — RSP', entidad_actual: 'rsp',
    acciones, estado, ESTADO_UI, TRAMITES, esAdmin: esAdmin(req),
  });
});

/* ═══ BANDEJA DE TRABAJO (ADMIN) ══════════════════════════════ */
trabajoRouter.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_bandeja'), async (req, res) => {
  const [trabajo, estado] = await Promise.all([trabajoPendiente(), estadoTramites()]);
  res.render('rsp/trabajo', {
    titulo: 'Bandeja de trabajo — RSP', entidad_actual: 'rsp',
    trabajo, estado, ESTADO_UI, TRAMITES, esAdmin: esAdmin(req),
  });
});

export default tramitesRouter;
export { bandejaRouter, trabajoRouter };
