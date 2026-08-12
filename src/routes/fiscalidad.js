/**
 * FISCALIDAD AMPLIADA — Rutas (puntos 1, 8-12, 17-21)
 * Montado en /rsp/fiscalidad
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarBloqueos, comprobarLimiteCapital, justificarBloqueo, desbloquearCuenta, regularizarExcedente,
  listarDesgravaciones, registrarDesgravacionIVA, registrarDesgravacionDonacion, desgravacionesAcumuladas,
  listarRetribuciones, registrarRetribucion, ordenarRetribucion, procesarTributosAutomaticos,
  listarPatrimonioAfecto, registrarPatrimonioAfecto,
  estadoFiscalidadAmpliada,
} from '../config/fiscalidad-ampliada.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_comprobacion'), async (req, res) => {
  const [bloqueos, retribuciones, desgravaciones, patrimonioAfecto, estado] = await Promise.all([
    listarBloqueos(), listarRetribuciones(), listarDesgravaciones(), listarPatrimonioAfecto(), estadoFiscalidadAmpliada(),
  ]);
  res.render('rsp/fiscalidad/panel', {
    titulo: 'Fiscalidad Ampliada',
    entidad_actual: 'rsp',
    bloqueos, retribuciones, desgravaciones, patrimonioAfecto, estado,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

// ═══ API ════════════════════════════════════════════════════════════════

// Límite 500k
router.post('/api/limite/comprobar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const bloqueo = await comprobarLimiteCapital(req.body.cuenta || {}, actor(req));
    res.json({ success: true, bloqueo, excede: !!bloqueo });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/limite/:id/justificar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const b = await justificarBloqueo(req.params.id, req.body.justificacion, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'tributos', accion: 'editar', objeto_tipo: 'BLOQUEO_LIMITE', objeto_id: b.id, valor_nuevo: { estado: b.estado }, motivo: 'Justificación de exceso de límite' });
    res.json({ success: true, bloqueo: b });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/limite/:id/desbloquear', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const b = await desbloquearCuenta(req.params.id, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'tributos', accion: 'editar', objeto_tipo: 'BLOQUEO_LIMITE', objeto_id: b.id, valor_nuevo: { estado: b.estado }, motivo: 'Desbloqueo por justificación' });
    res.json({ success: true, bloqueo: b });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/limite/:id/regularizar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const b = await regularizarExcedente(req.params.id, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'tributos', accion: 'editar', objeto_tipo: 'BLOQUEO_LIMITE', objeto_id: b.id, valor_nuevo: { estado: b.estado, excedente_retirado: b.excedente_retirado }, motivo: `Regularización: retirada del excedente (no multa)` });
    res.json({ success: true, bloqueo: b });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Desgravaciones
router.post('/api/desgravaciones/iva', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const d = await registrarDesgravacionIVA(req.body);
    res.json({ success: true, desgravacion: d });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/desgravaciones/donacion', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const d = await registrarDesgravacionDonacion(req.body);
    res.json({ success: true, desgravacion: d });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/desgravaciones/acumuladas/:dip', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_comprobacion'), async (req, res) => {
  const cuota = parseFloat(req.query.cuota) || 0;
  res.json({ success: true, ...(await desgravacionesAcumuladas(req.params.dip, cuota)) });
});

// Retribución 250 Pz
router.post('/api/retribuciones', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const r = await registrarRetribucion(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'tributos', accion: 'crear', objeto_tipo: 'RETRIBUCION', objeto_id: r.id, valor_nuevo: { beneficiario: r.beneficiario_dip, entidad: r.entidad_eip, cuantia: r.cuantia_mensual, mes: r.mes }, motivo: 'Retribución propietario sin remuneración' });
    res.json({ success: true, retribucion: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/retribuciones/:id/ordenar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const r = await ordenarRetribucion(req.params.id, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'tributos', accion: 'pagar', objeto_tipo: 'RETRIBUCION', objeto_id: r.id, valor_nuevo: { estado: r.estado }, motivo: 'Orden de pago (Fondo de Apoyo)' });
    res.json({ success: true, retribucion: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoFiscalidadAmpliada());
});

// ⚙️ Cálculo automático de tributos y retribuciones (datos reales)
// Body: { mes?: 'YYYY-MM' } — genera retribuciones 250 Pz desde participaciones
// y registra desgravaciones del 6% IVA desde las operaciones reales del banco.
router.post('/api/calcular-automatico', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const mes = req.body?.mes || new Date().toISOString().slice(0, 7);
    const resultado = await procesarTributosAutomaticos(mes, actor(req));
    await registrarAuditoria({
      usuario: actor(req), servicio: 'tributos', accion: 'crear', objeto_tipo: 'CALCULO_AUTOMATICO',
      objeto_id: mes, valor_nuevo: { resumen: resultado.resumen }, motivo: 'Cálculo automático de retribuciones y desgravaciones (datos reales)',
    });
    res.json({ success: true, resultado });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Patrimonio empresarial afecto a actividad (punto 7)
router.post('/api/patrimonio-afecto', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_comprobacion'), async (req, res) => {
  try {
    const p = await registrarPatrimonioAfecto(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'tributos', accion: 'editar', objeto_tipo: 'PATRIMONIO_AFECTO', objeto_id: p.id, valor_nuevo: { entidad: p.entidad_eip, importe: p.importe, tipo: p.tipo }, motivo: 'Registro de patrimonio afecto a actividad' });
    res.json({ success: true, patrimonioAfecto: p });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/patrimonio-afecto', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_comprobacion'), async (req, res) => {
  const lista = await listarPatrimonioAfecto(req.query);
  res.json({ success: true, total: lista.length, lista });
});

export default router;
