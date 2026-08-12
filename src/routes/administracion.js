import { Router } from 'express';
import { sbListSolicitantes, apiPlacetaidRegistros } from '../config/db.js';
import { construirPadron, sincronizar, recuperarPasswordTemporal } from '../config/placetaid-sincronizacion.js';
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

// ── Alta automática PlacetaID + Ciudadanos (padrón del banco) ──────────────
router.get('/placetaid/sincronizacion', verificarPermiso('administracion', 'gestion_placetid_completa'), async (req, res) => {
  let padron = null;
  let error = null;
  try {
    padron = await construirPadron();
  } catch (err) {
    error = err.message || 'Error al construir el padrón';
  }
  res.render('administracion/placetaid-sincronizacion', {
    titulo: 'PlacetaID - Alta automática desde el Banco',
    entidad_actual: 'administracion',
    padron, error, resultado: null
  });
});

router.post('/placetaid/sincronizacion/ejecutar', verificarPermiso('administracion', 'gestion_placetid_completa'), async (req, res) => {
  let padron = null;
  let resultado = null;
  let error = null;
  try {
    resultado = await sincronizar();
    try { padron = await construirPadron(); } catch { padron = null; }
  } catch (err) {
    error = err.message || 'Error durante la sincronización';
  }
  res.render('administracion/placetaid-sincronizacion', {
    titulo: 'PlacetaID - Alta automática desde el Banco',
    entidad_actual: 'administracion',
    padron, error, resultado
  });
});

router.post('/placetaid/sincronizacion/password', verificarPermiso('administracion', 'gestion_placetid_completa'), async (req, res) => {
  const { dip } = req.body || {};
  if (!dip) return res.status(400).json({ ok: false, error: 'DIP requerido' });
  const r = await recuperarPasswordTemporal(dip);
  return res.json(r.ok ? { ok: true, ...r.data } : { ok: false, error: (r.data && r.data.error) || 'No se pudo recuperar la contraseña' });
});

// ── Documentación ─────────────────────────────────────────────────────────
router.get('/documentos', verificarPermiso('administracion', 'gestion_tramites'), (req, res) => {
  res.render('documentos', {
    titulo: 'Documentación - Administración de La Placeta',
    entidad_actual: 'administracion'
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
