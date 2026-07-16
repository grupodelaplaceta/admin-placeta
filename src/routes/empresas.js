/**
 * Gestión de Empresas y EIP — Tabla independiente (no bancaria)
 * Almacena solo: nombre, DIP de empresa, EIP, representantes.
 * Las empresas van por EIP, no por IBAN.
 */
import { Router } from 'express';
import { verificarPermiso } from '../middleware/auth.js';

const router = Router();

// ── Almacenamiento en memoria ─────────────────────────────────────────────
const memEmpresas = new Map();
let idCounter = 0;

function nextId() { return 'EMP-' + String(++idCounter).padStart(4, '0'); }

// Inicializar con datos de ejemplo
function initEjemplos() {
  if (memEmpresas.size > 0) return;
  const ejemplos = [
    { nombre: 'Capitalia Bank', eip: 'EIP-CAP001', dip: 'CAPITALIA_BANK', representantes: [{ dip: 'ADMIN-GDLP', nombre: 'Admin GDLP', cargo: 'CEO' }] },
    { nombre: 'Tributos GDLP', eip: 'EIP-TRIB01', dip: 'TGLP', representantes: [] },
  ];
  ejemplos.forEach(e => { const id = nextId(); memEmpresas.set(id, { id, ...e, creada: new Date().toISOString(), activa: true }); });
}
initEjemplos();

// ── Listado de Empresas (solo datos propios, sin IBAN/saldos) ──────────────
router.get('/empresas', async (req, res) => {
  const empresas = [...memEmpresas.values()].filter(e => e.activa !== false);
  res.render('empresas/lista', {
    titulo: 'Gestión de Empresas y EIP',
    entidad_actual: req.baseUrl.replace('/', ''),
    empresas, total: empresas.length
  });
});

// ── API: Listar empresas ──────────────────────────────────────────────────
router.get('/api/empresas', async (req, res) => {
  res.json([...memEmpresas.values()].filter(e => e.activa !== false));
});

// ── API: Crear empresa (alta manual por DIP o EIP, o auto-alta con EIP) ──
router.post('/api/empresas/crear', async (req, res) => {
  const { nombre, eip, dipEmpresa, representanteDip, representanteNombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

  // Si no se proporciona EIP, generarlo automáticamente
  const eipFinal = eip || 'EIP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  // Si no se proporciona DIP, usar el nombre normalizado
  const dipFinal = dipEmpresa || nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

  const representantes = [];
  if (representanteDip) {
    representantes.push({ dip: representanteDip, nombre: representanteNombre || representanteDip, cargo: 'Representante' });
  }

  const id = nextId();
  const empresa = { id, nombre, eip: eipFinal, dip: dipFinal, representantes, activa: true, creada: new Date().toISOString() };
  memEmpresas.set(id, empresa);
  res.json({ success: true, empresa });
});

// ── API: Obtener empresa ──────────────────────────────────────────────────
router.get('/api/empresas/:id', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  res.json(emp);
});

// ── API: Modificar empresa ────────────────────────────────────────────────
router.put('/api/empresas/:id', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  const { nombre, eip, dipEmpresa } = req.body;
  Object.assign(emp, { ...(nombre && { nombre }), ...(eip && { eip }), ...(dipEmpresa && { dip: dipEmpresa }) });
  memEmpresas.set(req.params.id, emp);
  res.json({ success: true, empresa: emp });
});

// ── API: Vincular ciudadano como representante ───────────────────────────
router.post('/api/empresas/:id/representante', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  const { dip, nombre, cargo } = req.body;
  if (!dip) return res.status(400).json({ error: 'DIP requerido' });
  // Evitar duplicados
  if (!emp.representantes.find(r => r.dip === dip)) {
    emp.representantes.push({ dip, nombre: nombre || dip, cargo: cargo || 'Representante' });
  }
  res.json({ success: true, representantes: emp.representantes });
});

// ── API: Quitar representante ─────────────────────────────────────────────
router.delete('/api/empresas/:id/representante/:dip', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  emp.representantes = emp.representantes.filter(r => r.dip !== req.params.dip);
  res.json({ success: true, representantes: emp.representantes });
});

// ── API: Dar de baja (borrado lógico) ─────────────────────────────────────
router.delete('/api/empresas/:id', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  emp.activa = false;
  res.json({ success: true, message: 'Empresa dada de baja' });
});

// ── API: Reactivar empresa ────────────────────────────────────────────────
router.post('/api/empresas/:id/reactivar', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  emp.activa = true;
  res.json({ success: true });
});

// ── Vista de Cumplimiento Fiscal ──────────────────────────────────────────
router.get('/empresas/cumplimiento', async (req, res) => {
  const empresas = [...memEmpresas.values()].filter(e => e.activa !== false);
  res.render('empresas/cumplimiento', {
    titulo: 'Cumplimiento Fiscal — Empresas',
    entidad_actual: req.baseUrl.replace('/', ''),
    empresas: empresas.map(e => ({
      id: e.id, nombre: e.nombre, eip: e.eip, dip: e.dip,
      numRepresentantes: e.representantes?.length || 0,
      compliance: 'Clear'
    }))
  });
});

export default router;
