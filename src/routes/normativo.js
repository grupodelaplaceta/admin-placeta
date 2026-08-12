/**
 * MOTOR NORMATIVO CNIC — Rutas web + API (FASE 9 / 23)
 * Montado en /rsp/normativo
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarCNIC, getCNIC, getVersiones, crearCNIC, nuevaVersionCNIC,
  cambiarEstadoCNIC, editarCNIC, simularCambioCNIC, estadoCNIC, ESTADOS_CNIC, TIPOS_CNIC,
} from '../config/motor-normativo.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();

// ── Página principal ─────────────────────────────────────────────────────
router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_normativa'), async (req, res) => {
  const [reglas, estado, contadores] = await Promise.all([
    listarCNIC(),
    estadoCNIC(),
    (async () => {
      try {
        const { estadoIdentificadores } = await import('../config/identificadores.js');
        return await estadoIdentificadores();
      } catch { return null; }
    })(),
  ]);

  res.render('rsp/normativo/panel', {
    titulo: 'Centro Normativo — Motor CNIC',
    entidad_actual: 'rsp',
    reglas,
    estado,
    contadores,
    ESTADOS_CNIC,
    TIPOS_CNIC,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

// ── Detalle de una regla (versiones + simular) ───────────────────────────
router.get('/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_normativa'), async (req, res) => {
  const [regla, versiones] = await Promise.all([getCNIC(req.params.id), getVersiones(req.params.id.split('-v')[0])]);
  if (!regla) return res.status(404).render('parciales/error', { titulo: '404', error: 'Regla CNIC no encontrada', enlace: '/rsp/normativo' });
  const simulacion = await simularCambioCNIC(regla.id).catch(() => null);
  res.render('rsp/normativo/detalle', {
    titulo: `${regla.codigo} v${regla.version} — Centro Normativo`,
    entidad_actual: 'rsp',
    regla, versiones, simulacion,
    ESTADOS_CNIC,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

// ═══ API ════════════════════════════════════════════════════════════════

const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

// Crear / nueva versión
router.post('/api/cnic', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'editar_normativa'), async (req, res) => {
  try {
    const regla = await crearCNIC(req.body, actor(req));
    await registrarAuditoria({
      usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'CNIC', objeto_id: regla.id,
      valor_nuevo: { codigo: regla.codigo, version: regla.version, valor: regla.valor }, motivo: req.body.notas_cambio || 'Creación de regla',
    });
    res.json({ success: true, regla });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Editar (solo borrador/validación)
router.put('/api/cnic/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'editar_normativa'), async (req, res) => {
  try {
    const antes = await getCNIC(req.params.id);
    const regla = await editarCNIC(req.params.id, req.body, actor(req));
    await registrarAuditoria({
      usuario: actor(req), servicio: 'rsp', accion: 'editar', objeto_tipo: 'CNIC', objeto_id: regla.id,
      valor_anterior: antes ? { valor: antes.valor } : null,
      valor_nuevo: { valor: regla.valor, nombre: regla.nombre },
      motivo: req.body.notas_cambio || 'Edición de regla',
    });
    res.json({ success: true, regla });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Nueva versión explícita
router.post('/api/cnic/:codigo/nueva-version', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'editar_normativa'), async (req, res) => {
  try {
    const regla = await nuevaVersionCNIC(req.params.codigo, req.body, actor(req));
    await registrarAuditoria({
      usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'CNIC', objeto_id: regla.id,
      valor_nuevo: { codigo: regla.codigo, version: regla.version }, motivo: 'Nueva versión',
    });
    res.json({ success: true, regla });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Cambiar estado (workflow)
router.post('/api/cnic/:id/estado', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'aprobar_normativa'), async (req, res) => {
  try {
    const { estado, motivo } = req.body;
    const regla = await cambiarEstadoCNIC(req.params.id, estado, actor(req), motivo);
    await registrarAuditoria({
      usuario: actor(req), servicio: 'rsp', accion: 'aprobar', objeto_tipo: 'CNIC', objeto_id: regla.id,
      valor_anterior: null,
      valor_nuevo: { estado: regla.estado },
      motivo: motivo || `Cambio de estado a ${estado}`,
    });
    res.json({ success: true, regla });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Simular cambio
router.post('/api/cnic/:id/simular', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_normativa'), async (req, res) => {
  try {
    const resultado = await simularCambioCNIC(req.params.id, req.body || {});
    res.json({ success: true, ...resultado });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Estado del motor
router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoCNIC());
});

// Lista (para selects externos)
router.get('/api/cnic', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_normativa'), async (req, res) => {
  const reglas = await listarCNIC();
  if (req.query.solo_vigentes) {
    return res.json(reglas.filter(r => r.estado === 'vigente'));
  }
  res.json(reglas);
});

export default router;
