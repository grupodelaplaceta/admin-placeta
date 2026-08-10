/**
 * RUTAS DE PLACETA JUNIOR
 * Dashboard, menores, retos semanales, juegos, autorizaciones, cuentas
 */

import { Router } from 'express';
import { getRetoActivo, getRetos } from '../config/junior-retos.js';
import { registrarConexion, TIPO_CONEXION } from '../config/rsp.js';
import { getDocumentosByEntidadAsync, saveDocumentoAsync, ETIQUETAS_DOC } from '../config/documentos.js';
import { sbListActividades, sbGetActividad, sbUpdateActividad, sbDeleteActividad, sbListColaboradores, UMBRAL_EXAMEN, ESTADOS_ACTIVIDAD, TIPOS_TITULAR } from '../config/junior-actividades.js';

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

// ── Academia Placeta Junior: gestión completa (revisar, editar, publicar, eliminar) ──
router.get('/academia', async (req, res) => {
  rspRegistrar('junior', TIPO_CONEXION.CONSULTA, 'GET /junior/academia', req.session.usuario?.nombre);
  const actividades = await sbListActividades({ soloPublicas: false });
  const colaboradores = await sbListColaboradores();
  const conteo = {};
  (actividades || []).forEach(a => { conteo[a.estado] = (conteo[a.estado] || 0) + 1; });
  res.render('junior/academia', {
    titulo: 'Academia Placeta Junior',
    entidad_actual: 'junior',
    actividades: actividades || [],
    colaboradores: colaboradores || [],
    conteo,
    umbralExamen: UMBRAL_EXAMEN,
    layout: 'layouts/admin'
  });
});

// Revisar (Filtro): aprobar / rechazar / modificaciones
router.post('/academia/revisar/:id', async (req, res) => {
  rspRegistrar('junior', TIPO_CONEXION.MODIFICACION, 'POST /junior/academia/revisar/:id', req.session.usuario?.nombre);
  try {
    const { accion, precio_licencia, precio_intento, recompensa, motivo, destacada, subvencionada } = req.body;
    const actividad = await sbGetActividad(req.params.id);
    if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada' });
    if (!['aprobar', 'rechazar', 'modificaciones'].includes(accion)) return res.status(400).json({ error: 'Acción no válida' });
    const cambios = { revisado_por: req.session.usuario?.dip || 'sistema', fecha_revision: new Date().toISOString(), motivo_revision: motivo || '' };
    if (accion === 'aprobar') {
      cambios.estado = 'aprobada';
      cambios.publica = true;
      if (precio_licencia != null) cambios.precio_licencia = Number(precio_licencia) || 0;
      if (precio_intento != null) cambios.precio_intento = Number(precio_intento) || 0;
      if (recompensa != null) cambios.recompensa = Number(recompensa) || 0;
      if (destacada != null) cambios.destacada = !!destacada;
      if (subvencionada != null) cambios.subvencionada = !!subvencionada;
    } else if (accion === 'rechazar') {
      cambios.estado = 'rechazada';
      cambios.publica = false;
    } else {
      cambios.estado = 'modificaciones';
      cambios.publica = false;
    }
    const ok = await sbUpdateActividad(req.params.id, cambios);
    res.json({ success: ok, estado: cambios.estado, mensaje: `Actividad ${cambios.estado}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Editar actividad
router.post('/academia/editar/:id', async (req, res) => {
  rspRegistrar('junior', TIPO_CONEXION.MODIFICACION, 'POST /junior/academia/editar/:id', req.session.usuario?.nombre);
  try {
    const a = await sbGetActividad(req.params.id);
    if (!a) return res.status(404).json({ error: 'Actividad no encontrada' });
    const { titulo, descripcion, categoria, tipo, edad_recomendada, dificultad, tiempo_estimado, num_preguntas, num_fases, contenido, portada_url, precio_licencia, precio_intento, recompensa, destacada, subvencionada } = req.body;
    const cambios = {};
    if (titulo != null) cambios.titulo = titulo;
    if (descripcion != null) cambios.descripcion = descripcion;
    if (categoria != null) cambios.categoria = categoria;
    if (tipo != null) cambios.tipo = tipo;
    if (edad_recomendada != null) cambios.edad_recomendada = edad_recomendada;
    if (dificultad != null) cambios.dificultad = dificultad;
    if (tiempo_estimado != null) cambios.tiempo_estimado = Number(tiempo_estimado) || 10;
    if (num_preguntas != null) { cambios.num_preguntas = Number(num_preguntas) || 0; cambios.es_examen = (Number(num_preguntas) || 0) > UMBRAL_EXAMEN; }
    if (num_fases != null) cambios.num_fases = Number(num_fases) || 1;
    if (contenido != null) {
      // Normaliza el contenido: si llega como string JSON (p. ej. desde el
      // editor de código del panel), se convierte a objeto para no romper
      // el formato { version, bloques } que esperan web y app.
      let c = contenido;
      if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = {}; } }
      if (typeof c === 'object' && c !== null) {
        if (!c.version) c.version = 2;
        cambios.contenido = c;
      }
    }
    if (portada_url != null) cambios.portada_url = portada_url;
    if (precio_licencia != null) cambios.precio_licencia = Number(precio_licencia) || 0;
    if (precio_intento != null) cambios.precio_intento = Number(precio_intento) || 0;
    if (recompensa != null) cambios.recompensa = Number(recompensa) || 0;
    if (destacada != null) cambios.destacada = !!destacada;
    if (subvencionada != null) cambios.subvencionada = !!subvencionada;
    const ok = await sbUpdateActividad(req.params.id, cambios);
    res.json({ success: ok, mensaje: ok ? 'Actividad editada' : 'Error al editar' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Publicar / despublicar
router.post('/academia/publicar/:id', async (req, res) => {
  rspRegistrar('junior', TIPO_CONEXION.MODIFICACION, 'POST /junior/academia/publicar/:id', req.session.usuario?.nombre);
  try {
    const a = await sbGetActividad(req.params.id);
    if (!a) return res.status(404).json({ error: 'Actividad no encontrada' });
    const publicar = req.body.publicar === true || req.body.publicar === 'true';
    const cambios = { publica: publicar, estado: publicar ? 'aprobada' : 'en_revision' };
    const ok = await sbUpdateActividad(req.params.id, cambios);
    res.json({ success: ok, publica: publicar, mensaje: publicar ? 'Actividad publicada' : 'Actividad retirada' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Eliminar actividad
router.post('/academia/eliminar/:id', async (req, res) => {
  rspRegistrar('junior', TIPO_CONEXION.MODIFICACION, 'POST /junior/academia/eliminar/:id', req.session.usuario?.nombre);
  try {
    const ok = await sbDeleteActividad(req.params.id);
    res.json({ success: ok, mensaje: ok ? 'Actividad eliminada' : 'Error al eliminar' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
