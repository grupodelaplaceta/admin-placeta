import { Router } from 'express';
import { sbListSolicitantes, apiPlacetaidRegistros } from '../config/db.js';
import { verificarPermiso } from '../middleware/auth.js';

const router = Router();

// ── Dashboard Administración ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  const ciudadanos = await sbListSolicitantes({ limit: 50 });
  res.render('administracion/dashboard', {
    titulo: 'Administración de La Placeta',
    entidad_actual: 'administracion',
    totalCiudadanos: ciudadanos.length,
    esPresidente: req.session.roles?.includes('presidente')
  });
});

// ── Gestión de Trámites (ETramite) ─────────────────────────────────────────
router.get('/tramites', verificarPermiso('administracion', 'gestion_tramites'), (req, res) => {
  res.render('administracion/tramites', {
    titulo: 'Gestión de Trámites',
    entidad_actual: 'administracion'
  });
});

// ── Gestión de Ciudadanos (Básica) ─────────────────────────────────────────
router.get('/ciudadanos', verificarPermiso('administracion', 'gestion_ciudadanos_basica'), async (req, res) => {
  const ciudadanos = await sbListSolicitantes();
  res.render('administracion/ciudadanos', {
    titulo: 'Ciudadanos',
    entidad_actual: 'administracion',
    ciudadanos, total: ciudadanos.length
  });
});

// ── Gestión de Tributos (Básica) ───────────────────────────────────────────
router.get('/tributos', verificarPermiso('administracion', 'gestion_tributos_basica'), (req, res) => {
  res.render('administracion/tributos-basica', {
    titulo: 'Tributos (Básico)',
    entidad_actual: 'administracion'
  });
});

// ── Gestión de Banco (Básica) ──────────────────────────────────────────────
router.get('/banco', verificarPermiso('administracion', 'gestion_banco_basica'), (req, res) => {
  res.render('administracion/banco-basica', {
    titulo: 'Banco (Básico)',
    entidad_actual: 'administracion'
  });
});

// ── Gestión de Actas y Documentos ──────────────────────────────────────────
router.get('/actas', verificarPermiso('administracion', 'gestion_actas'), (req, res) => {
  res.render('administracion/actas', {
    titulo: 'Actas y Documentos',
    entidad_actual: 'administracion'
  });
});

// ── Inspección de Votaciones ───────────────────────────────────────────────
router.get('/votaciones', verificarPermiso('administracion', 'inspeccion_votaciones'), (req, res) => {
  res.render('administracion/votaciones', {
    titulo: 'Inspección de Votaciones',
    entidad_actual: 'administracion'
  });
});

// ── Gestión Completa de PlacetaID ──────────────────────────────────────────
router.get('/placetaid', verificarPermiso('administracion', 'gestion_placetid_completa'), async (req, res) => {
  const registros = await apiPlacetaidRegistros();
  res.render('administracion/placetaid', {
    titulo: 'PlacetaID - Gestión Completa',
    entidad_actual: 'administracion',
    registros, total: registros.length
  });
});

// ── Gestión de Usuarios Junior ─────────────────────────────────────────────
router.get('/junior', verificarPermiso('administracion', 'gestion_junior'), (req, res) => {
  res.render('administracion/junior', {
    titulo: 'Usuarios Placeta Junior',
    entidad_actual: 'administracion'
  });
});

export default router;
