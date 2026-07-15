import { Router } from 'express';
import { sbListSolicitantes, apiPlacetaidRegistros, apiPlacetaidStats } from '../config/db.js';
import { verificarPermiso } from '../middleware/auth.js';

const router = Router();

// ── Dashboard Junta ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const ciudadanos = await sbListSolicitantes({ limit: 100 });
  const placetaidStats = await apiPlacetaidStats();

  res.render('junta/dashboard', {
    titulo: 'Junta de La Placeta',
    entidad_actual: 'junta',
    totalCiudadanos: ciudadanos.length,
    placetaidStats,
    esPresidente: req.session.roles?.includes('presidente'),
    esVicepresidente: req.session.roles?.includes('vicepresidente'),
    esSecretario: req.session.roles?.includes('secretario')
  });
});

// ── Gestión de Ciudadanos ──────────────────────────────────────────────────
router.get('/ciudadanos', verificarPermiso('junta', 'gestion_ciudadanos'), async (req, res) => {
  const ciudadanos = await sbListSolicitantes();
  res.render('junta/ciudadanos', {
    titulo: 'Gestión de Ciudadanos',
    entidad_actual: 'junta',
    ciudadanos, total: ciudadanos.length
  });
});

// ── Gestión de PlacetaID ───────────────────────────────────────────────────
router.get('/placetaid', verificarPermiso('junta', 'gestion_placetaid'), async (req, res) => {
  const registros = await apiPlacetaidRegistros();
  res.render('junta/placetaid', {
    titulo: 'Gestión de PlacetaID',
    entidad_actual: 'junta',
    registros, total: registros.length
  });
});

// ── Gestión de Reclamaciones ───────────────────────────────────────────────
router.get('/reclamaciones', verificarPermiso('junta', 'gestion_reclamaciones'), (req, res) => {
  res.render('junta/reclamaciones', {
    titulo: 'Gestión de Reclamaciones',
    entidad_actual: 'junta'
  });
});

// ── Gestión de Reuniones ───────────────────────────────────────────────────
router.get('/reuniones', verificarPermiso('junta', 'gestion_reuniones'), (req, res) => {
  res.render('junta/reuniones', {
    titulo: 'Gestión de Reuniones',
    entidad_actual: 'junta'
  });
});

// ── Gestión de Votaciones ──────────────────────────────────────────────────
router.get('/votaciones', verificarPermiso('junta', 'crear_votaciones'), (req, res) => {
  res.render('junta/votaciones', {
    titulo: 'Gestión de Votaciones',
    entidad_actual: 'junta',
    esPresidente: req.session.roles?.includes('presidente')
  });
});

// ── Gestión de Cargos ──────────────────────────────────────────────────────
router.get('/cargos', verificarPermiso('junta', 'gestion_cargos'), (req, res) => {
  res.render('junta/cargos', {
    titulo: 'Gestión de Cargos',
    entidad_actual: 'junta'
  });
});

// ── Gestión de Departamentos ───────────────────────────────────────────────
router.get('/departamentos', verificarPermiso('junta', 'gestion_departamentos'), (req, res) => {
  res.render('junta/departamentos', {
    titulo: 'Gestión de Departamentos',
    entidad_actual: 'junta'
  });
});

// ── Gestión de Recursos Digitales ──────────────────────────────────────────
router.get('/recursos', verificarPermiso('junta', 'gestion_recursos'), (req, res) => {
  res.render('junta/recursos', {
    titulo: 'Recursos Digitales',
    entidad_actual: 'junta'
  });
});

// ── Documentación ─────────────────────────────────────────────────────────
router.get('/documentos', verificarPermiso('junta', 'gestion_ciudadanos'), (req, res) => {
  res.render('documentos', {
    titulo: 'Documentación - Junta de La Placeta',
    entidad_actual: 'junta'
  });
});

// ── Gestión de Usuarios Junior ─────────────────────────────────────────────
router.get('/junior', verificarPermiso('junta', 'gestion_junior'), (req, res) => {
  res.render('junta/junior', {
    titulo: 'Usuarios Placeta Junior',
    entidad_actual: 'junta'
  });
});

export default router;
