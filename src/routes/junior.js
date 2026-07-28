/**
 * RUTAS DE PLACETA JUNIOR
 * Dashboard, menores, retos semanales, juegos, autorizaciones, cuentas
 */

import { Router } from 'express';
import { getRetoActivo, getRetos } from '../config/junior-retos.js';
import { registrarConexion, TIPO_CONEXION } from '../config/rsp.js';
import { getDocumentosByEntidadAsync, saveDocumentoAsync, ETIQUETAS_DOC } from '../config/documentos.js';

const router = Router();
const CRM_URL = (process.env.CRM_BASE_URL || 'https://grupodelaplaceta.vercel.app').replace(/\/+$/, '');

// Helper: proxy fetch al CRM
async function proxyCRM(path) {
  try {
    const r = await fetch(`${CRM_URL}/api${path}`, {
      headers: { 'x-api-key': process.env.CRM_READ_KEY || 'crm-gdlp-shared-key-2026' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

// Registrar conexión RSP en segundo plano
function rspRegistrar(entidad, tipo, endpoint, usuario) {
  setImmediate(() => {
    try {
      registrarConexion({ entidad, tipo, endpoint, usuario: usuario || 'junior', dip: '', detalle: 'Placeta Junior' });
    } catch (e) { console.warn('[Junior] RSP error:', e.message); }
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const reto = getRetoActivo();
  rspRegistrar('junior', TIPO_CONEXION.CONSULTA, 'GET /junior/', req.session.usuario?.nombre);

  // Obtener datos reales del CRM
  const menores = await proxyCRM(`/junior/menores/${req.session.usuario?.dip || ''}`);
  const docsPendientes = await getDocumentosByEntidadAsync('junior');
  const docsCount = docsPendientes?.filter(d => d.estado !== 'Oficial')?.length || 0;

  res.render('junior/dashboard', {
    titulo: 'Placeta Junior',
    entidad_actual: 'junior',
    reto,
    totalMenores: Array.isArray(menores) ? menores.length : 0,
    documentosPendientes: docsCount,
    membresiaActiva: !!menores,
    layout: 'layouts/admin'
  });
});

// ── Retos semanales ───────────────────────────────────────────────────
router.get('/retos', async (req, res) => {
  const reto = getRetoActivo();
  const todos = getRetos();
  rspRegistrar('junior', TIPO_CONEXION.CONSULTA, 'GET /junior/retos', req.session.usuario?.nombre);

  res.render('junior/retos', {
    titulo: 'Retos Semanales - Placeta Junior',
    entidad_actual: 'junior',
    reto,
    todos,
    layout: 'layouts/admin'
  });
});

// ── Menores ───────────────────────────────────────────────────────────
router.get('/menores', async (req, res) => {
  rspRegistrar('junior', TIPO_CONEXION.CONSULTA, 'GET /junior/menores', req.session.usuario?.nombre);
  const menores = await proxyCRM(`/junior/menores/${req.session.usuario?.dip || ''}`);
  const autorizaciones = await proxyCRM(`/junior/autorizaciones/${req.session.usuario?.dip || ''}`);

  res.render('junior/menores', {
    titulo: 'Menores - Placeta Junior',
    entidad_actual: 'junior',
    menores: Array.isArray(menores) ? menores : [],
    autorizaciones: Array.isArray(autorizaciones) ? autorizaciones : [],
    layout: 'layouts/admin'
  });
});

// ── Tutores ───────────────────────────────────────────────────────────
router.get('/tutores', async (req, res) => {
  rspRegistrar('junior', TIPO_CONEXION.CONSULTA, 'GET /junior/tutores', req.session.usuario?.nombre);
  const tutores = await proxyCRM(`/junior/tutores?dip=${req.session.usuario?.dip || ''}`);

  res.render('junior/tutores', {
    titulo: 'Tutores - Placeta Junior',
    entidad_actual: 'junior',
    tutores: Array.isArray(tutores) ? tutores : [],
    layout: 'layouts/admin'
  });
});

// ── Autorizaciones ────────────────────────────────────────────────────
router.get('/autorizaciones', async (req, res) => {
  rspRegistrar('junior', TIPO_CONEXION.CONSULTA, 'GET /junior/autorizaciones', req.session.usuario?.nombre);
  const docs = await getDocumentosByEntidadAsync('junior');
  const pendientes = (docs || []).filter(d => d.estado !== 'Oficial' && d.estado !== 'Rechazado');

  res.render('junior/autorizaciones', {
    titulo: 'Autorizaciones - Placeta Junior',
    entidad_actual: 'junior',
    autorizaciones: pendientes,
    layout: 'layouts/admin'
  });
});

// ── Cuentas ───────────────────────────────────────────────────────────
router.get('/cuentas', async (req, res) => {
  rspRegistrar('junior', TIPO_CONEXION.CONSULTA, 'GET /junior/cuentas', req.session.usuario?.nombre);

  res.render('junior/cuentas', {
    titulo: 'Cuentas Infantiles - Placeta Junior',
    entidad_actual: 'junior',
    layout: 'layouts/admin'
  });
});

// ── API: Autorizar menor ──────────────────────────────────────────────
router.post('/api/autorizar', async (req, res) => {
  const { menorId, accion } = req.body;
  if (!menorId || !accion) return res.status(400).json({ error: 'menorId y accion requeridos' });

  rspRegistrar('junior', TIPO_CONEXION.MODIFICACION, 'POST /junior/api/autorizar', req.session.usuario?.nombre);

  try {
    const result = await proxyCRM(`/junior/autorizar`, { method: 'POST', body: JSON.stringify({ menorId, accion, dip: req.session.usuario?.dip }) });
    if (result) {
      // Crear documento de autorización
      await saveDocumentoAsync('junior', {
        id: `auth-${Date.now()}`,
        tipo: 'alta-junior',
        titulo: `Autorización ${accion} — ${menorId}`,
        datos: { menorId, accion, autorizadoPor: req.session.usuario?.dip, fecha: new Date().toISOString() },
        createdBy: req.session.usuario?.dip || 'sistema',
        estado: 'Oficial'
      });
    }
    res.json(result || { success: false, error: 'CRM no disponible' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
