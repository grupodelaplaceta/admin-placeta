/**
 * Gestión de Empresas y EIP — Multientidad (Admin, Junta, Banco)
 */
import { Router } from 'express';
import { apiBancoGetState, apiBancoPost } from '../config/db.js';
import { verificarPermiso } from '../middleware/auth.js';

const router = Router();

// ── Listado de Empresas ───────────────────────────────────────────────────
router.get('/empresas', async (req, res) => {
  const state = await apiBancoGetState();
  const cuentas = state?.accounts || [];
  const empresas = cuentas.filter(c => c.type === 'Business' || c.eip);

  // Socio vinculado: si una cuenta personal tiene eip, vinculamos
  const socios = cuentas.filter(c => c.eip && c.type !== 'Business').map(c => ({
    dip: c.placetaId || c.id,
    nombre: c.displayName || c.id,
    cuentaId: c.id,
    eip: c.eip,
    esTitular: false
  }));

  // Construir estructura empresas
  const empresasConSocios = empresas.map(emp => ({
    id: emp.id,
    nombre: emp.displayName || emp.id,
    eip: emp.eip || '—',
    iban: emp.iban || '—',
    saldo: emp.balancePz || 0,
    tipo: emp.type,
    creada: emp.createdAt,
    compliance: emp.complianceStatus || 'Pending',
    socios: socios.filter(s => s.eip === emp.eip),
    // Detectar cuentas vinculadas por EIP
    cuentasVinculadas: cuentas
      .filter(c => c.eip === emp.eip && c.id !== emp.id)
      .map(c => ({ id: c.id, nombre: c.displayName, iban: c.iban, saldo: c.balancePz }))
  }));

  res.render('empresas/lista', {
    titulo: 'Gestión de Empresas y EIP',
    entidad_actual: req.baseUrl.replace('/', ''),
    empresas: empresasConSocios,
    total: empresasConSocios.length
  });
});

// ── API: Crear empresa ────────────────────────────────────────────────────
router.post('/api/empresas/crear', async (req, res) => {
  const { nombre, eip, dipRepresentante } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  if (!eip) return res.status(400).json({ error: 'EIP requerido' });

  const result = await apiBancoPost('crear-empresa', {
    eip, displayName: nombre, placetaId: dipRepresentante
  });
  res.json(result || { error: 'Error al crear empresa' });
});

// ── API: Añadir socio ─────────────────────────────────────────────────────
router.post('/api/empresas/:eip/socio', async (req, res) => {
  const { eip } = req.params;
  const { dip, porcentaje } = req.body;
  if (!dip) return res.status(400).json({ error: 'DIP requerido' });

  // Vincular cuenta del socio a la empresa
  const result = await apiBancoPost('vincular-eip', { eip, placetaId: dip, porcentaje: porcentaje || 0 });
  res.json(result || { success: true });
});

// ── API: Eliminar socio ───────────────────────────────────────────────────
router.post('/api/empresas/:eip/quitar-socio', async (req, res) => {
  const { eip } = req.params;
  const { dip } = req.body;
  // Desvincular EIP
  const result = await apiBancoPost('desvincular-eip', { eip, placetaId: dip });
  res.json(result || { success: true });
});

// ── API: Baja de empresa ──────────────────────────────────────────────────
router.post('/api/empresas/:id/baja', async (req, res) => {
  const result = await apiBancoPost('cerrar-empresa', { accountId: req.params.id });
  res.json(result || { success: true });
});

// ── Vista de Cumplimiento Fiscal ──────────────────────────────────────────
router.get('/empresas/cumplimiento', async (req, res) => {
  const state = await apiBancoGetState();
  const cuentas = state?.accounts || [];
  const empresas = cuentas.filter(c => c.type === 'Business' || c.eip);

  res.render('empresas/cumplimiento', {
    titulo: 'Cumplimiento Fiscal — Empresas',
    entidad_actual: req.baseUrl.replace('/', ''),
    empresas: empresas.map(c => ({
      id: c.id, nombre: c.displayName, eip: c.eip, saldo: c.balancePz,
      tipo: c.type, compliance: c.complianceStatus
    }))
  });
});

export default router;
