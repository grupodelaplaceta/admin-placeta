/**
 * PATRIMONIO Y ACTIVOS — Rutas (FASE 21 + puntos 2/3/4)
 * Montado en /rsp/patrimonio
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarTitularidades, setTitularidad, patrimonioNetoPersona,
  listarParticipaciones, setParticipacion, patrimonioParticipaciones,
  listarActivos, crearActivo, calcularPatrimonioAutomatico,
} from '../config/patrimonio.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

// ⚙️ Registro automático de patrimonio (participaciones, titularidades y activos)
// desde los datos reales del banco. Deduplicado (re-ejecutar no duplica).
router.post('/api/calcular-automatico', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_patrimonio'), async (req, res) => {
  try {
    const resultado = await calcularPatrimonioAutomatico(actor(req));
    await registrarAuditoria({
      usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'PATRIMONIO_AUTOMATICO',
      objeto_id: 'patrimonio', valor_nuevo: { participaciones: resultado.totalParticipaciones, titularidades: resultado.totalTitularidades, activos: resultado.totalActivos },
      motivo: 'Registro automático de patrimonio desde el banco',
    });
    res.json({ success: true, resultado });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_patrimonio'), async (req, res) => {
  const [titularidades, participaciones, activos] = await Promise.all([
    listarTitularidades(), listarParticipaciones(), listarActivos(),
  ]);
  const dip = req.query.dip || '';
  const patrimonio = dip ? await patrimonioNetoPersona(dip, []) : null;
  res.render('rsp/patrimonio/panel', {
    titulo: 'Patrimonio y Activos',
    entidad_actual: 'rsp',
    titularidades, participaciones, activos, patrimonio, dipFiltro: dip,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

// ═══ API ════════════════════════════════════════════════════════════════

// Titularidades (cuentas compartidas)
router.post('/api/titularidades', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_patrimonio'), async (req, res) => {
  try {
    const t = await setTitularidad(req.body, { ...actor(req), motivo: req.body.motivo });
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'editar', objeto_tipo: 'TITULARIDAD', objeto_id: `${t.cuenta_id}-${t.titular_dip || t.titular_eip}`, valor_nuevo: { porcentaje: t.porcentaje }, motivo: req.body.motivo || 'Registro de titularidad' });
    res.json({ success: true, titularidad: t });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Participaciones empresariales
router.post('/api/participaciones', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_patrimonio'), async (req, res) => {
  try {
    const p = await setParticipacion(req.body, { ...actor(req), motivo: req.body.motivo });
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'editar', objeto_tipo: 'PARTICIPACION', objeto_id: `${p.titular_dip}-${p.entidad_eip}`, valor_nuevo: { porcentaje: p.porcentaje, atribuible: p.patrimonio_atribuible }, motivo: req.body.motivo || 'Registro de participación' });
    res.json({ success: true, participacion: p });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Activos
router.post('/api/activos', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_patrimonio'), async (req, res) => {
  try {
    const a = await crearActivo(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'rsp', accion: 'crear', objeto_tipo: 'ACTIVO', objeto_id: a.id, valor_nuevo: { nombre: a.nombre, valor_fiscal: a.valor_fiscal }, motivo: 'Alta de activo' });
    res.json({ success: true, activo: a });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Patrimonio neto de una persona
router.get('/api/patrimonio-neto/:dip', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_patrimonio'), async (req, res) => {
  const result = await patrimonioNetoPersona(req.params.dip, req.query.cuentas ? JSON.parse(req.query.cuentas) : []);
  res.json({ success: true, ...result });
});

export default router;
