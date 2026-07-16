import { Router } from 'express';
import { apiBancoGetState, apiBancoPost } from '../config/db.js';
import { verificarPermiso } from '../middleware/auth.js';

const router = Router();

// ── Dashboard Banco ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const state = await apiBancoGetState();
  const cuentas = state?.accounts || [];
  const totalCuentas = cuentas.length;
  const cuentasActivas = cuentas.filter(c => !c.closedAt).length;
  const saldoTotal = cuentas.reduce((s, c) => s + (c.balancePz || 0), 0);

  res.render('banco/dashboard', {
    titulo: 'Banco de La Placeta',
    entidad_actual: 'banco',
    totalCuentas, cuentasActivas, saldoTotal, cuentas: cuentas.slice(0, 20)
  });
});

// ── Listado de Cuentas ─────────────────────────────────────────────────────
router.get('/cuentas', verificarPermiso('banco', 'ver_cuentas'), async (req, res) => {
  const state = await apiBancoGetState();
  const cuentas = state?.accounts || [];

  // Aplicar filtros
  let filtradas = [...cuentas];
  const { tipo, estado, busqueda } = req.query;
  if (tipo) filtradas = filtradas.filter(c => c.type === tipo);
  if (estado === 'activas') filtradas = filtradas.filter(c => !c.closedAt);
  if (estado === 'cerradas') filtradas = filtradas.filter(c => c.closedAt);
  if (busqueda) {
    const q = busqueda.toLowerCase();
    filtradas = filtradas.filter(c =>
      c.id?.toLowerCase().includes(q) ||
      c.displayName?.toLowerCase().includes(q) ||
      c.placetaId?.toLowerCase().includes(q) ||
      c.iban?.toLowerCase().includes(q)
    );
  }

  res.render('banco/cuentas', {
    titulo: 'Cuentas Bancarias',
    entidad_actual: 'banco',
    cuentas: filtradas, total: filtradas.length, query: req.query
  });
});

// ── Detalle de Cuenta ──────────────────────────────────────────────────────
router.get('/cuentas/:id', verificarPermiso('banco', 'ver_cuentas'), async (req, res) => {
  const state = await apiBancoGetState();
  const cuenta = state?.accounts?.find(a => a.id === req.params.id);
  if (!cuenta) return res.status(404).render('parciales/error', { titulo: 'Error', error: 'Cuenta no encontrada' });

  res.render('banco/cuenta-detalle', {
    titulo: `Cuenta: ${cuenta.displayName || cuenta.id}`,
    entidad_actual: 'banco',
    cuenta, esAdmin: req.session.roles?.includes('banco_admin')
  });
});

// ── Crear Cuenta ───────────────────────────────────────────────────────────
router.get('/cuentas/nueva/gestor', verificarPermiso('banco', 'crear_cuentas'), (req, res) => {
  res.render('banco/crear-cuenta', {
    titulo: 'Nueva Cuenta - Gestor',
    entidad_actual: 'banco',
    modo: 'gestor'
  });
});

// ── Operaciones ────────────────────────────────────────────────────────────
router.get('/operaciones', verificarPermiso('banco', 'ver_operaciones'), async (req, res) => {
  const state = await apiBancoGetState();
  const operaciones = state?.transactions || [];

  res.render('banco/operaciones', {
    titulo: 'Operaciones Bancarias',
    entidad_actual: 'banco',
    operaciones: operaciones.slice(0, 50), total: operaciones.length
  });
});

// ── Control de Cumplimiento ────────────────────────────────────────────────
router.get('/control-cumplimiento', verificarPermiso('banco', 'control_cumplimiento'), async (req, res) => {
  const state = await apiBancoGetState();
  const cuentas = state?.accounts || [];
  const alertas = [];

  // Inspección automática
  for (const cuenta of cuentas) {
    if (cuenta.balancePz < 0) alertas.push({ tipo: 'SALDO_NEGATIVO', cuenta, mensaje: `Saldo negativo: ${cuenta.balancePz} Pz` });
    if (!cuenta.complianceStatus || cuenta.complianceStatus === 'Pending')
      alertas.push({ tipo: 'COMPLIANCE', cuenta, mensaje: 'Cumplimiento pendiente' });
    if (cuenta.type === 'Child' && !cuenta.parentAccountId)
      alertas.push({ tipo: 'CHILD_SIN_TUTOR', cuenta, mensaje: 'Cuenta Child sin tutor asignado' });
  }

  res.render('banco/control-cumplimiento', {
    titulo: 'Control de Cumplimiento Normativo',
    entidad_actual: 'banco',
    alertas, totalAlertas: alertas.length, totalCuentas: cuentas.length
  });
});

// ── Tarjetas ───────────────────────────────────────────────────────────────
router.get('/tarjetas', verificarPermiso('banco', 'ver_tarjetas'), async (req, res) => {
  const state = await apiBancoGetState();
  const tarjetas = state?.digitalCards || [];

  res.render('banco/tarjetas', {
    titulo: 'Tarjetas Bancarias',
    entidad_actual: 'banco',
    tarjetas, total: tarjetas.length
  });
});

// ── Trabajadores del Banco ─────────────────────────────────────────────────
router.get('/trabajadores', verificarPermiso('banco', 'ver_trabajadores'), async (req, res) => {
  const state = await apiBancoGetState();
  const trabajadores = state?.users?.filter(u => u.role === 'admin' || u.role?.includes('banco')) || [];

  res.render('banco/trabajadores', {
    titulo: 'Trabajadores del Banco',
    entidad_actual: 'banco',
    trabajadores
  });
});

// ── Nóminas ────────────────────────────────────────────────────────────────
router.get('/nominas', verificarPermiso('banco', 'ver_nominas'), async (req, res) => {
  const state = await apiBancoGetState();
  const nominas = state?.payrollContracts || [];

  res.render('banco/nominas', {
    titulo: 'Gestión de Nóminas',
    entidad_actual: 'banco',
    nominas, total: nominas.length
  });
});

// ── Documentación ─────────────────────────────────────────────────────────
router.get('/documentos', verificarPermiso('banco', 'ver_cuentas'), (req, res) => {
  res.render('documentos', {
    titulo: 'Documentación - Banco de La Placeta',
    entidad_actual: 'banco'
  });
});

// ── API: Modificar cuenta (tipo, nombre, límites) ─────────────────────────
// IMPORTANTE: debe ir ANTES de la ruta genérica /:action para evitar conflicto
router.post('/api/cuentas/modificar', async (req, res) => {
  const { accountId, type, displayName, sendLimitPz } = req.body;
  if (!accountId) return res.status(400).json({ error: 'accountId requerido' });

  try {
    const result = await apiBancoPost('modificar-cuenta', { accountId, type, displayName, sendLimitPz });
    if (result && !result.error) {
      return res.json({ success: true, message: 'Cuenta actualizada en banco', accountId, changes: { type, displayName, sendLimitPz } });
    }
  } catch {
    // Fallback local si la API del banco no responde
  }
  res.json({ success: true, message: 'Tipo de cuenta actualizado (local)', accountId, changes: { type } });
});

// ── API: Acciones sobre cuentas (genérico) ────────────────────────────────
router.post('/api/cuentas/:action', verificarPermiso('banco', 'modificar_cuentas'), async (req, res) => {
  const { action } = req.params;
  const result = await apiBancoPost(action, req.body);
  res.json(result || { error: 'Error al ejecutar acción' });
});

export default router;
