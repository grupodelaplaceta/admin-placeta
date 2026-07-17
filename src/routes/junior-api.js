/**
 * JUNIOR API — Proxy to GDLP CRM + Documentos generales locales
 * 
 * PlacetaID Móvil llama a admin-placeta para:
 * - Junior: menores, documentos pendientes, firma de documentos
 * - Documentos generales: cualquier documento pendiente de firma en el sistema
 * 
 * Los endpoints junior viven en el CRM de GDLP (proxy).
 * Los endpoints de documentos generales usan el sistema local de admin-placeta.
 * 
 * Rutas:
 *   GET  /api/junior/menores/:dipTutor           → CRM /api/junior/menores/:dipTutor
 *   GET  /api/junior/documentos-pendientes/:id    → CRM /api/junior/legal/documentos-pendientes/:id
 *   POST /api/junior/firmar-documento            → CRM /api/junior/legal/firmar-documento
 *   POST /api/firma/firmar-manuscrito            → CRM /api/firma/firmar-manuscrito
 *   GET  /api/junior/perfil                      → CRM /api/junior/perfil
 *   GET  /api/admin/junior/documentos            → Documentos locales (TODAS las entidades)
 */
import { Router } from 'express';
import { createHash } from 'crypto';
import { verificarSesion } from '../middleware/auth.js';
import { getDocumentosByEntidad, DOCUMENTOS_AUTOMATICOS, ETIQUETAS_DOC } from '../config/documentos.js';

const router = Router();

// URL del CRM GDLP (la misma que usa el resto de admin-placeta)
const CRM_URL = (process.env.CRM_BASE_URL || 'https://grupodelaplaceta.vercel.app').replace(/\/+$/, '');
const CRM_KEY = process.env.CRM_READ_KEY || 'crm-gdlp-shared-key-2026';

const ENTIDADES = ['banco', 'tributos', 'junta', 'administracion'];

/**
 * Helper: proxy fetch genérico
 */
async function proxyFetch(path, options = {}) {
  const url = `${CRM_URL}${path}`;
  const headers = {
    'X-CRM-Key': CRM_KEY,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const fetchOpts = {
    method: options.method || 'GET',
    headers,
    signal: AbortSignal.timeout(options.timeout || 15000)
  };

  if (options.body) {
    fetchOpts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const r = await fetch(url, fetchOpts);
  const text = await r.text();
  try {
    return { ok: r.ok, status: r.status, data: JSON.parse(text) };
  } catch {
    return { ok: r.ok, status: r.status, data: text };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  JUNIOR — Menores vinculados a un tutor
// ═══════════════════════════════════════════════════════════════════════════

router.get('/junior/menores/:dipTutor', verificarSesion, async (req, res) => {
  try {
    const result = await proxyFetch(`/api/junior/menores/${req.params.dipTutor}`);
    if (!result.ok) return res.status(result.status).json(result.data);
    res.json(result.data);
  } catch (e) {
    console.error('[JuniorProxy] Error en menores:', e.message);
    res.status(502).json({ error: 'CRM no disponible', detalle: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  JUNIOR — Perfil del junior
// ═══════════════════════════════════════════════════════════════════════════

router.get('/junior/perfil', verificarSesion, async (req, res) => {
  try {
    const result = await proxyFetch('/api/junior/perfil', { headers: req.headers });
    if (!result.ok) return res.status(result.status).json(result.data);
    res.json(result.data);
  } catch (e) {
    res.status(502).json({ error: 'CRM no disponible', detalle: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  JUNIOR LEGAL — Documentos pendientes de firma
// ═══════════════════════════════════════════════════════════════════════════

router.get('/junior/documentos-pendientes/:juniorId', verificarSesion, async (req, res) => {
  try {
    const result = await proxyFetch(`/api/junior/legal/documentos-pendientes/${req.params.juniorId}`);
    if (!result.ok) return res.status(result.status).json(result.data);
    res.json(result.data);
  } catch (e) {
    console.error('[JuniorProxy] Error en documentos-pendientes:', e.message);
    res.status(502).json({ error: 'CRM no disponible', detalle: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  JUNIOR LEGAL — Firmar documento
// ═══════════════════════════════════════════════════════════════════════════

router.post('/junior/firmar-documento', verificarSesion, async (req, res) => {
  try {
    const result = await proxyFetch('/api/junior/legal/firmar-documento', {
      method: 'POST',
      body: req.body
    });
    if (!result.ok) return res.status(result.status).json(result.data);
    res.json(result.data);
  } catch (e) {
    console.error('[JuniorProxy] Error en firmar-documento:', e.message);
    res.status(502).json({ error: 'CRM no disponible', detalle: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  FIRMA MANUSCRITA — Endpoint general de firma
// ═══════════════════════════════════════════════════════════════════════════

router.post('/firma/firmar-manuscrito', verificarSesion, async (req, res) => {
  try {
    const result = await proxyFetch('/api/firma/firmar-manuscrito', {
      method: 'POST',
      body: req.body
    });
    if (!result.ok) return res.status(result.status).json(result.data);
    res.json(result.data);
  } catch (e) {
    console.error('[JuniorProxy] Error en firmar-manuscrito:', e.message);
    res.status(502).json({ error: 'CRM no disponible', detalle: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  DOCUMENTOS PENDIENTES — Documentos del usuario filtrados por identidad
//  Busca en TODAS las entidades del sistema, filtrados por DIP del usuario.
//  Igual que las votaciones, que se muestran según la identidad/rol.
// ═══════════════════════════════════════════════════════════════════════════

function listarDocumentosPorDip(dip) {
  const todos = [];
  for (const entidad of ENTIDADES) {
    const docs = getDocumentosByEntidad(entidad);
    for (const d of docs) {
      if (d.id?.startsWith('auto-')) continue;
      const datos = d.datos || {};
      const dipEnDatos = datos.dip || datos.destinatarioDip || datos.firmadoPor;
      const dipEnCreador = d.createdBy;
      const perteneceAlUsuario = dip && (
        dipEnDatos === dip ||
        dipEnCreador === dip ||
        d.refId === dip
      );
      if (!dip || perteneceAlUsuario) {
        todos.push({
          codigo: d.id,
          nombre: d.titulo || ETIQUETAS_DOC[d.tipo] || d.tipo,
          titulo: d.titulo || ETIQUETAS_DOC[d.tipo] || d.tipo,
          tipo: d.tipo,
          entidad,
          estado: d.estado,
          firmado: d.firmado ? 1 : 0,
          creadoEn: d.createdAt,
          identidad: dip || ''
        });
      }
    }
  }
  todos.sort((a, b) => {
    if (a.firmado !== b.firmado) return a.firmado - b.firmado;
    return (b.creadoEn || '').localeCompare(a.creadoEn || '');
  });
  return todos;
}

// Endpoint principal (sin "junior" en la ruta)
router.get('/documentos/pendientes', verificarSesion, async (req, res) => {
  try {
    const dip = req.query.dip || req.session.usuario?.dip;
    res.json(listarDocumentosPorDip(dip));
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar documentos', detalle: e.message });
  }
});

// Alias legacy para retrocompatibilidad (redirige al nuevo)
router.get('/admin/junior/documentos', verificarSesion, async (req, res) => {
  try {
    const dip = req.query.dip || req.session.usuario?.dip;
    res.json(listarDocumentosPorDip(dip));
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar documentos', detalle: e.message });
  }
});

export default router;
