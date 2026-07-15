import { Router } from 'express';
import { apiBancoGetState } from '../config/db.js';
import { verificarPermiso } from '../middleware/auth.js';

const router = Router();

// ── Dashboard Tributos ─────────────────────────────────────────────────────
router.get('/', verificarPermiso('tributos', 'ver_contribuyentes'), async (req, res) => {
  const state = await apiBancoGetState();
  const contribuyentes = state?.accounts?.filter(a => a.tributosCensusDate) || [];
  const ingresos = contribuyentes.reduce((s, c) => s + (c.balancePz || 0), 0);

  res.render('tributos/dashboard', {
    titulo: 'Tributos de La Placeta',
    entidad_actual: 'tributos',
    totalContribuyentes: contribuyentes.length,
    ingresos,
    esAdmin: req.session.roles?.includes('tributos_admin'),
    esInspector: req.session.roles?.includes('tributos_inspector')
  });
});

// ── Listado de Contribuyentes ──────────────────────────────────────────────
router.get('/contribuyentes', verificarPermiso('tributos', 'ver_contribuyentes'), async (req, res) => {
  const state = await apiBancoGetState();
  const contribuyentes = state?.accounts?.filter(a => a.tributosCensusDate) || [];

  const { busqueda, regimen } = req.query;
  let filtrados = [...contribuyentes];
  if (busqueda) {
    const q = busqueda.toLowerCase();
    filtrados = filtrados.filter(c =>
      c.id?.toLowerCase().includes(q) ||
      c.displayName?.toLowerCase().includes(q) ||
      c.placetaId?.toLowerCase().includes(q)
    );
  }

  res.render('tributos/contribuyentes', {
    titulo: 'Contribuyentes',
    entidad_actual: 'tributos',
    contribuyentes: filtrados, total: filtrados.length
  });
});

// ── Declaraciones ──────────────────────────────────────────────────────────
router.get('/declaraciones', verificarPermiso('tributos', 'crear_declaraciones'), async (req, res) => {
  const state = await apiBancoGetState();
  const contribuyentes = state?.accounts?.filter(a => a.tributosCensusDate) || [];
  res.render('tributos/declaraciones', {
    titulo: 'Declaraciones',
    entidad_actual: 'tributos',
    esAdmin: req.session.roles?.includes('tributos_admin'),
    totalContribuyentes: contribuyentes.length
  });
});

// ── Inspección Automática ──────────────────────────────────────────────────
router.get('/inspeccion', verificarPermiso('tributos', 'inspeccion_automatica'), async (req, res) => {
  const state = await apiBancoGetState();
  const cuentas = state?.accounts || [];
  const incidencias = [];

  for (const c of cuentas) {
    if (c.balancePz < -100) incidencias.push({ tipo: 'DEUDA_ALTA', cuenta: c, mensaje: `Deuda superior a 100 Pz: ${c.balancePz}` });
    if (c.type === 'Business' && !c.eip) incidencias.push({ tipo: 'SIN_EIP', cuenta: c, mensaje: 'Empresa sin EIP' });
  }

  res.render('tributos/inspeccion', {
    titulo: 'Inspección Automática',
    entidad_actual: 'tributos',
    incidencias, total: incidencias.length
  });
});

// ── Regímenes Tributarios ──────────────────────────────────────────────────
router.get('/regimenes', verificarPermiso('tributos', 'gestionar_regimenes'), (req, res) => {
  res.render('tributos/regimenes', {
    titulo: 'Regímenes Tributarios',
    entidad_actual: 'tributos',
    esAdmin: req.session.roles?.includes('tributos_admin')
  });
});

// ── Incidencias ────────────────────────────────────────────────────────────
router.get('/incidencias', verificarPermiso('tributos', 'gestionar_incidencias'), (req, res) => {
  res.render('tributos/incidencias', {
    titulo: 'Incidencias en Declaraciones',
    entidad_actual: 'tributos'
  });
});

// ── Documentación ─────────────────────────────────────────────────────────
router.get('/documentos', verificarPermiso('tributos', 'ver_contribuyentes'), (req, res) => {
  res.render('documentos', {
    titulo: 'Documentación - Tributos de La Placeta',
    entidad_actual: 'tributos'
  });
});

// ── Trabajadores de Tributos ───────────────────────────────────────────────
router.get('/trabajadores', verificarPermiso('tributos', 'ver_trabajadores_tributos'), (req, res) => {
  res.render('tributos/trabajadores', {
    titulo: 'Trabajadores de Tributos',
    entidad_actual: 'tributos'
  });
});

export default router;
