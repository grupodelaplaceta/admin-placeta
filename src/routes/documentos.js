/**
 * Rutas del Sistema de Documentación Global
 * GET/POST/PUT/DELETE por entidad + generación PDF
 * Endpoint público para otras plataformas
 */
import { Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import { verificarSesion, verificarPermiso } from '../middleware/auth.js';
import {
  getDocumentos, getDocumentoById, getDocumentosPorRef, getDocumentosPorRefAsync,
  getDocumentosByEntidadAsync,
  saveDocumento, deleteDocumento,
  generarPDF, getPlantilla, TIPOS_DOCUMENTO, DOCUMENTOS_COMUNES,
  ETIQUETAS_DOC
} from '../config/documentos.js';

const router = Router();

// ── API: Listar documentos de una entidad ─────────────────────────────────
router.get('/api/:entidad/documentos', verificarSesion, async (req, res) => {
  const { entidad } = req.params;
  const entidadesPermitidas = req.session.entidades_permitidas || [];
  if (!entidadesPermitidas.includes(entidad) && !req.session.roles?.includes('superadmin')) {
    return res.status(403).json({ error: 'Sin acceso a esta entidad' });
  }
  const docs = await getDocumentosByEntidadAsync(entidad);
  const { tipo, estado, busqueda } = req.query;
  let filtrados = [...docs];
  if (tipo) filtrados = filtrados.filter(d => d.tipo === tipo);
  if (estado) filtrados = filtrados.filter(d => d.estado === estado);
  if (busqueda) {
    const q = busqueda.toLowerCase();
    filtrados = filtrados.filter(d => d.titulo?.toLowerCase().includes(q) || d.tipo?.toLowerCase().includes(q));
  }
  res.json({ documentos: filtrados, total: filtrados.length });
});

// ── API: Documentos por referencia (cuenta, tarjeta, etc.) ────────────────
router.get('/api/:entidad/documentos/por-ref/:refTipo/:refId', verificarSesion, async (req, res) => {
  const { entidad, refTipo, refId } = req.params;
  const docs = await getDocumentosPorRefAsync(entidad, refTipo, refId);
  res.json({ documentos: docs, total: docs.length });
});

// ── API: Obtener un documento ─────────────────────────────────────────────
router.get('/api/:entidad/documentos/:id', verificarSesion, async (req, res) => {
  const { entidad, id } = req.params;
  // Buscar en Supabase + memoria
  const { getDocumentoByIdAsync } = await import('../config/documentos.js');
  let doc = await getDocumentoByIdAsync(entidad, id);
  if (!doc) {
    const allDocs = await getDocumentosByEntidadAsync(entidad);
    doc = allDocs.find(d => d.id === id);
  }
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  res.json(doc);
});

// ── API: Crear documento ──────────────────────────────────────────────────
router.post('/api/:entidad/documentos', verificarSesion, async (req, res) => {
  const { entidad } = req.params;
  const { tipo, titulo, descripcion, datos, refId, refTipo } = req.body;
  if (!tipo) return res.status(400).json({ error: 'Tipo de documento requerido' });

  const doc = saveDocumento(entidad, {
    tipo,
    titulo: titulo || ETIQUETAS_DOC[tipo] || tipo,
    descripcion: descripcion || '',
    datos: datos || {},
    refId: refId || null,
    refTipo: refTipo || null,
    createdBy: req.session.usuario?.dip || 'sistema',
    estado: 'borrador',
    hash: createHash('sha256').update(tipo + Date.now()).digest('hex').slice(0, 16)
  });

  // Sync con PlacetaID para firma distribuida (notificación asíncrona)
  if (req.body.enviarFirma !== false) {
    try {
      const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
      const destinatariosDIP = req.body.destinatariosDIP || (req.session.usuario?.dip ? [req.session.usuario.dip] : []);
      fetch(`${PLACETAID_API}/admin/documentos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb'
        },
        body: JSON.stringify({
          id: doc.id,
          titulo: doc.titulo,
          tipo: doc.tipo,
          entidad,
          csv: doc.hash,
          destinatariosDIP,
          contenido: `Documento generado desde Admin Placeta: ${doc.titulo} (${ETIQUETAS_DOC[doc.tipo] || doc.tipo})`
        }),
        signal: AbortSignal.timeout(5000)
      }).catch(() => {});
    } catch { /* ignore */ }
  }

  res.json(doc);
});

// ── API: Actualizar documento ─────────────────────────────────────────────
router.put('/api/:entidad/documentos/:id', verificarSesion, async (req, res) => {
  const { entidad, id } = req.params;
  const existente = getDocumentoById(entidad, id);
  if (!existente) return res.status(404).json({ error: 'Documento no encontrado' });

  const { titulo, descripcion, datos, estado, firmado } = req.body;
  const doc = saveDocumento(entidad, {
    ...existente,
    titulo: titulo || existente.titulo,
    descripcion: descripcion !== undefined ? descripcion : existente.descripcion,
    datos: datos || existente.datos,
    estado: estado || existente.estado,
    firmado: firmado !== undefined ? firmado : existente.firmado
  });
  res.json(doc);
});

// ── API: Firmar documento ─────────────────────────────────────────────────
router.post('/api/:entidad/documentos/:id/firmar', verificarSesion, async (req, res) => {
  const { entidad, id } = req.params;
  const existente = getDocumentoById(entidad, id);
  if (!existente) return res.status(404).json({ error: 'Documento no encontrado' });

  const doc = saveDocumento(entidad, {
    ...existente,
    estado: 'firmado',
    firmado: true,
    datos: { ...existente.datos, firmadoPor: req.session.usuario?.dip || 'sistema', fechaFirma: new Date().toISOString() }
  });

  // Sincronizar con PlacetaID: notificar firma a la plataforma de identidad
  try {
    const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
    await fetch(`${PLACETAID_API}/admin/documentos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb'
      },
      body: JSON.stringify({
        id: doc.id,
        titulo: doc.titulo || existente.titulo,
        tipo: doc.tipo,
        entidad,
        csv: doc.hash || `CSV-${Date.now().toString(36).toUpperCase()}`,
        destinatariosDIP: req.session.usuario?.dip ? [req.session.usuario.dip] : [],
        contenido: `Documento firmado electrónicamente: ${doc.titulo} (${ETIQUETAS_DOC[doc.tipo] || doc.tipo})`
      }),
      signal: AbortSignal.timeout(5000)
    }).catch(() => {/* PlacetaID no disponible, firma local ok */});
  } catch { /* ignore */ }

  res.json(doc);
});

// ── API: Generar PDF ──────────────────────────────────────────────────────
router.get('/api/:entidad/documentos/:id/pdf', verificarSesion, async (req, res) => {
  const { entidad, id } = req.params;
  let doc = getDocumentoById(entidad, id);
  if (!doc) {
    const allDocs = await getDocumentosByEntidadAsync(entidad);
    doc = allDocs.find(d => d.id === id);
  }
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  try {
    const pdfBuffer = await generarPDF(entidad, doc);
    const nombreArchivo = `${doc.tipo}-${doc.id.slice(0, 8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[Docs] Error generando PDF:', err);
    res.status(500).json({ error: 'Error al generar PDF: ' + err.message });
  }
});

// ── API: Eliminar documento ───────────────────────────────────────────────
router.delete('/api/:entidad/documentos/:id', verificarSesion, async (req, res) => {
  const { entidad, id } = req.params;
  deleteDocumento(entidad, id);
  res.json({ success: true });
});

// ── API: Obtener tipos de documento disponibles ───────────────────────────
router.get('/api/:entidad/tipos-documento', verificarSesion, async (req, res) => {
  const { entidad } = req.params;
  const tipos = TIPOS_DOCUMENTO[entidad] || {};
  const categorias = Object.entries(tipos).map(([cat, docs]) => ({
    categoria: cat,
    documentos: docs.map(d => ({
      tipo: d,
      etiqueta: ETIQUETAS_DOC[d] || d,
      plantilla: getPlantilla(d, entidad)
    }))
  }));
  res.json({
    entidad,
    categorias,
    comunes: DOCUMENTOS_COMUNES.map(d => ({ tipo: d, etiqueta: ETIQUETAS_DOC[d] || d })),
  });
});

// ── API: Obtener plantilla de un tipo ──────────────────────────────────────
router.get('/api/:entidad/plantilla/:tipo', verificarSesion, async (req, res) => {
  const { entidad, tipo } = req.params;
  const plantilla = getPlantilla(tipo, entidad);
  if (!plantilla) return res.status(404).json({ error: 'Tipo no encontrado' });
  res.json(plantilla);
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINTS PÚBLICOS (para otras plataformas con API Key)
// ═══════════════════════════════════════════════════════════════════════════
const API_KEYS = (process.env.DOCS_API_KEYS || 'docs-shared-key-2026').split(',');

function verificarApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key || !API_KEYS.includes(key)) {
    return res.status(401).json({ error: 'API Key requerida o inválida' });
  }
  next();
}

// Listar documentos públicos de una entidad
router.get('/publico/:entidad/documentos', verificarApiKey, async (req, res) => {
  const { entidad } = req.params;
  const docs = await getDocumentosByEntidadAsync(entidad);
  // Solo devolver documentos en estado 'final' o 'firmado'
  const publicos = docs.filter(d => d.estado === 'final' || d.estado === 'firmado');
  res.json({ documentos: publicos, total: publicos.length });
});

// Obtener PDF público
router.get('/publico/:entidad/documentos/:id/pdf', verificarApiKey, async (req, res) => {
  const { entidad, id } = req.params;
  const { getDocumentoByIdAsync } = await import('../config/documentos.js');
  let doc = await getDocumentoByIdAsync(entidad, id);
  if (!doc) {
    const allDocs = await getDocumentosByEntidadAsync(entidad);
    doc = allDocs.find(d => d.id === id);
  }
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  try {
    const pdfBuffer = await generarPDF(entidad, doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.tipo}-${doc.id.slice(0, 8)}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

export default router;
