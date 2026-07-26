/**
 * FIRMAS — Sistema unificado de documentos, trámites y firma PlacetaID Móvil
 * 
 * Proporciona a todas las entidades públicas:
 *   1. Creación de documentos oficiales desde cada workspace
 *   2. Envío automático a PlacetaID Móvil para firma
 *   3. Recepción de callback cuando se firma
 *   4. Gestión del estado de documentos pendientes/firmados
 *   5. Visualización y descarga de PDF
 * 
 * Integración con PlacetaID:
 *   - POST /api/admin/documentos → Enviar documento a la app móvil
 *   - POST /webhook/firma → Callback cuando el usuario firma
 * 
 * Endpoints:
 *   GET    /:entidad/documentos       → Listado de documentos
 *   GET    /:entidad/documentos/nueva → Formulario nuevo documento
 *   POST   /:entidad/documentos       → Crear documento + enviar a firma
 *   GET    /:entidad/documentos/:id   → Ver detalle / PDF
 *   POST   /api/firmas/enviar         → API: enviar documento a PlacetaID
 *   POST   /api/firmas/webhook        → Webhook: PlacetaID notifica firma
 *   GET    /api/firmas/pendientes/:dip→ API: docs pendientes para un DIP
 */

import { Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import { saveDocumentoAsync, getDocumentosByEntidadAsync, getDocumentoByIdAsync, generarPDF, ETIQUETAS_DOC, TIPOS_DOCUMENTO } from '../config/documentos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
const PLACETAID_KEY = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';

// ── Almacén temporal de solicitudes de firma ──────────────────────────
const solicitudes = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// VISTAS WEB
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /:entidad/documentos — Listado de documentos
 */
router.get('/', async (req, res) => {
  const entidad = req.entidad || 'banco';
  const docs = await getDocumentosByEntidadAsync(entidad);
  const pendientes = docs.filter(d => d.estado !== 'firmado' && d.estado !== 'anulado');
  const firmados = docs.filter(d => d.estado === 'firmado');
  const categorias = TIPOS_DOCUMENTO[entidad] || {};

  res.render('parciales/documentos-entidad', {
    titulo: `Documentos - ${req.workspace?.nombre || entidad}`,
    entidad_actual: entidad,
    documentos: [...docs].reverse(),
    pendientes: pendientes.length,
    firmados: firmados.length,
    total: docs.length,
    categorias,
    layout: 'layouts/admin'
  });
});

/**
 * GET /:entidad/documentos/nuevo — Formulario de nuevo documento
 */
router.get('/nuevo', (req, res) => {
  const entidad = req.entidad || 'banco';
  const categorias = TIPOS_DOCUMENTO[entidad] || {};
  const listaTipos = [];
  for (const [cat, tipos] of Object.entries(categorias)) {
    tipos.forEach(t => listaTipos.push({ categoria: cat, tipo: t, etiqueta: ETIQUETAS_DOC[t] || t }));
  }

  res.render('parciales/nuevo-documento', {
    titulo: `Nuevo Documento - ${req.workspace?.nombre || entidad}`,
    entidad_actual: entidad,
    tipos: listaTipos,
    categorias: Object.keys(categorias),
    layout: 'layouts/admin'
  });
});

/**
 * GET /:entidad/documentos/:id — Ver detalle y descargar PDF
 */
router.get('/:id', async (req, res) => {
  const entidad = req.entidad || 'banco';
  const doc = await getDocumentoByIdAsync(entidad, req.params.id);

  if (!doc) {
    return res.status(404).render('parciales/error', {
      titulo: 'Documento no encontrado',
      error: 'El documento solicitado no existe',
      entidad_actual: entidad
    });
  }

  // Si pide PDF
  if (req.query.pdf === '1') {
    try {
      const pdf = await generarPDF(entidad, doc);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.titulo?.replace(/[^a-zA-Z0-9]/g,'_') || 'documento'}.pdf"`);
      return res.send(pdf);
    } catch (err) {
      return res.status(500).render('parciales/error', {
        titulo: 'Error PDF',
        error: `Error generando PDF: ${err.message}`,
        entidad_actual: entidad
      });
    }
  }

  // Vista detalle
  res.render('parciales/detalle-documento', {
    titulo: doc.titulo,
    entidad_actual: entidad,
    documento: doc,
    layout: 'layouts/admin'
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// API — CREAR DOCUMENTO Y ENVIAR A FIRMA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /:entidad/documentos — Crear documento y enviar a PlacetaID
 */
router.post('/', async (req, res) => {
  const entidad = req.entidad || 'banco';
  const { tipo, titulo, datos = {}, dipFirma } = req.body;

  if (!tipo) {
    return res.status(400).json({ error: 'El tipo de documento es requerido' });
  }

  try {
    const docId = `doc-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const hash = createHash('sha256').update(docId + Date.now()).digest('hex');
    const csv = hash.slice(0, 20).toUpperCase();

    const doc = await saveDocumentoAsync(entidad, {
      id: docId,
      tipo,
      titulo: titulo || ETIQUETAS_DOC[tipo] || tipo,
      descripcion: `Creado desde ${entidad} por ${req.session?.usuario?.nombre || 'sistema'}`,
      datos: {
        ...datos,
        creadoPor: req.session?.usuario?.dip || 'sistema',
        creadoPorNombre: req.session?.usuario?.nombre || 'Sistema',
        fechaCreacion: new Date().toISOString(),
        csv
      },
      createdBy: req.session?.usuario?.dip || 'sistema',
      estado: 'pendiente-firma',
      firmado: false,
      hash,
      csv
    });

    // Enviar a PlacetaID Móvil para firma
    const destinoDIP = dipFirma || req.session?.usuario?.dip || '';
    const envioPlacetaID = await enviarAPlacetaID(docId, doc.titulo, tipo, entidad, csv, destinoDIP, hash);

    // Guardar solicitud
    solicitudes.set(docId, {
      docId,
      entidad,
      tipo,
      estado: 'pendiente-firma',
      dip: destinoDIP,
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      documento: { id: docId, titulo: doc.titulo, estado: 'pendiente-firma' },
      placetaid: envioPlacetaID,
      mensaje: envioPlacetaID
        ? '✅ Documento creado y enviado a PlacetaID Móvil para firma'
        : '⚠️ Documento creado pero no se pudo enviar a PlacetaID (modo offline)'
    });

  } catch (err) {
    console.error('[Firmas] Error creando documento:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// API — WEBHOOK DE FIRMA (llamado por PlacetaID)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/firmas/webhook — PlacetaID notifica que se firmó un documento
 * 
 * PlacetaID envía: { documentoId, dip, firma_base64, timestamp, hash_valido }
 */
router.post('/api/webhook', async (req, res) => {
  const { documentoId, dip, firma_base64, timestamp } = req.body;

  if (!documentoId) {
    return res.status(400).json({ error: 'documentoId requerido' });
  }

  try {
    // Buscar el documento en todas las entidades
    const entidades = ['banco', 'tributos', 'junta', 'administracion', 'rsp'];
    let docEncontrado = null;
    let entidadDoc = null;

    for (const e of entidades) {
      const d = await getDocumentoByIdAsync(e, documentoId);
      if (d) { docEncontrado = d; entidadDoc = e; break; }
    }

    if (!docEncontrado) {
      // Puede ser una solicitud pendiente
      const sol = solicitudes.get(documentoId);
      if (sol) {
        solicitudes.set(documentoId, { ...sol, estado: 'firmado', dip, firma_base64, timestamp: timestamp || new Date().toISOString() });
        return res.json({ success: true, estado: 'firmado', mensaje: 'Solicitud de firma actualizada' });
      }
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    // Actualizar estado del documento
    docEncontrado.estado = 'firmado';
    docEncontrado.firmado = true;
    docEncontrado.datos = docEncontrado.datos || {};
    docEncontrado.datos.firmadoPor = dip || docEncontrado.datos.firmadoPor;
    docEncontrado.datos.fechaFirma = timestamp || new Date().toISOString();
    if (firma_base64) docEncontrado.datos.firma_base64 = firma_base64;

    // Persistir cambios
    await saveDocumentoAsync(entidadDoc, docEncontrado);

    res.json({
      success: true,
      estado: 'firmado',
      documentoId,
      entidad: entidadDoc
    });

  } catch (err) {
    console.error('[Firmas] Error en webhook:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// API — CONSULTAR PENDIENTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/firmas/pendientes/:dip — Documentos pendientes de firma para un DIP
 */
router.get('/api/pendientes/:dip', async (req, res) => {
  const { dip } = req.params;
  const entidades = ['banco', 'tributos', 'junta', 'administracion', 'rsp'];
  const pendientes = [];

  for (const e of entidades) {
    const docs = await getDocumentosByEntidadAsync(e);
    docs.forEach(d => {
      if (d.estado !== 'firmado' && d.estado !== 'anulado') {
        const dipDoc = d.datos?.dip || d.createdBy || '';
        if (dipDoc === dip) {
          pendientes.push({ ...d, entidad: e });
        }
      }
    });
  }

  // También incluir solicitudes activas
  for (const [id, sol] of solicitudes) {
    if (sol.dip === dip && sol.estado === 'pendiente-firma') {
      if (!pendientes.find(p => p.id === id)) {
        pendientes.push({ id, entidad: sol.entidad, tipo: sol.tipo, estado: sol.estado, createdAt: sol.createdAt });
      }
    }
  }

  res.json({ success: true, total: pendientes.length, pendientes });
});

// ═══════════════════════════════════════════════════════════════════════════
// API — VERIFICAR ESTADO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/firmas/estado/:docId — Estado de un documento
 */
router.get('/api/estado/:docId', async (req, res) => {
  const { docId } = req.params;
  const entidades = ['banco', 'tributos', 'junta', 'administracion', 'rsp'];

  for (const e of entidades) {
    const d = await getDocumentoByIdAsync(e, docId);
    if (d) {
      return res.json({
        success: true,
        documento: {
          id: d.id, titulo: d.titulo, tipo: d.tipo, estado: d.estado,
          firmado: d.firmado, entidad: e,
          fechaFirma: d.datos?.fechaFirma || null,
          firmadoPor: d.datos?.firmadoPor || null
        }
      });
    }
  }

  const sol = solicitudes.get(docId);
  if (sol) {
    return res.json({ success: true, solicitud: sol });
  }

  res.status(404).json({ error: 'Documento no encontrado' });
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Enviar documento a PlacetaID Móvil
// ═══════════════════════════════════════════════════════════════════════════

async function enviarAPlacetaID(docId, titulo, tipo, entidad, csv, dip, hash) {
  try {
    const resp = await fetch(`${PLACETAID_API}/admin/documentos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': PLACETAID_KEY
      },
      body: JSON.stringify({
        id: docId,
        titulo,
        tipo,
        entidad,
        csv,
        destinatariosDIP: dip ? [dip] : [],
        contenido: `Documento oficial de ${entidad}: ${titulo}. ` +
                   `Firme desde PlacetaID Móvil para dar validez al trámite.\n\n` +
                   `CSV: ${csv}\nHash: ${hash?.slice(0, 16)}`
      }),
      signal: AbortSignal.timeout(8000)
    });
    return resp.ok;
  } catch (err) {
    console.warn('[Firmas] Error enviando a PlacetaID:', err.message);
    return false;
  }
}

/**
 * POST /api/firmas/:docId/reenviar — Reenviar documento a PlacetaID
 */
router.post('/api/reenviar/:docId', async (req, res) => {
  const { docId } = req.params;
  const entidades = ['banco', 'tributos', 'junta', 'administracion', 'rsp'];

  for (const e of entidades) {
    const doc = await getDocumentoByIdAsync(e, docId);
    if (doc && doc.estado !== 'firmado') {
      const ok = await enviarAPlacetaID(docId, doc.titulo, doc.tipo, e, doc.datos?.csv, doc.createdBy, doc.hash);
      return res.json({
        success: ok,
        mensaje: ok ? 'Reenviado a PlacetaID Móvil' : 'No se pudo reenviar (modo offline)'
      });
    }
  }

  res.status(404).json({ success: false, error: 'Documento no encontrado o ya firmado' });
});

export default router;
export { enviarAPlacetaID };
