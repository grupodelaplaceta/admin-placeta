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
  saveDocumentoAsync, deleteDocumentoAsync,
  generarPDF, getPlantilla, TIPOS_DOCUMENTO, DOCUMENTOS_COMUNES, DOCUMENTOS_AUTOMATICOS,
  ETIQUETAS_DOC
} from '../config/documentos.js';

const router = Router();

// ── Editor de documentos ─────────────────────────────────────────────────
router.get('/documentos/editor', verificarSesion, async (req, res) => {
  res.render('editor-documentos', {
    titulo: 'Editor de Documentos',
    layout: 'layouts/admin',
    entidad_actual: req.session.entidades_permitidas?.[0] || 'banco',
    TIPOS_DOCUMENTO, DOCUMENTOS_COMUNES, ETIQUETAS_DOC
  });
});

// ── API: Crear documento desde el editor ─────────────────────────────────
router.post('/api/documentos/crear', verificarSesion, async (req, res) => {
  const { entidad, tipo, titulo, titular, dip, iban, descripcion, expone, fundamentos, resuelve, notas, destinatariosDIP } = req.body;
  if (!entidad || !tipo) return res.status(400).json({ error: 'Entidad y tipo requeridos' });
  const DEFAULT_NOTAS = 'AVISO LEGAL: El Grupo de La Placeta se rige por sus Estatutos y el Código Normativo Interno vigente. Al firmar digitalmente este documento vía PlacetaID Móvil le está proporcionando autenticidad y dándole la misma validez que a una firma en papel.';
  try {
    const doc = await saveDocumentoAsync(entidad, {
      id: `doc-${Date.now()}-${randomUUID().slice(0,6)}`,
      tipo: tipo || 'editor-personalizado',
      titulo: titulo || ETIQUETAS_DOC[tipo] || tipo,
      descripcion: descripcion || '',
      datos: {
        titular: titular || '—',
        dip: dip || '—',
        iban: iban || '—',
        expone,
        fundamentos,
        resuelve,
        notas: notas || DEFAULT_NOTAS,
        fecha: new Date().toISOString()
      },
      createdBy: req.session.usuario?.dip || 'sistema',
      estado: 'final',
      firmado: false,
      hash: createHash('sha256').update(Date.now().toString()).digest('hex').slice(0,16)
    });
    res.json({ success: true, documento: doc });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

  try {
    const doc = await saveDocumentoAsync(entidad, {
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
  } catch (e) {
    console.error('[Docs] Error creando documento:', e.message);
    res.status(500).json({ error: e.message || 'Error al crear documento' });
  }
});

// ── API: Actualizar documento ─────────────────────────────────────────────
router.put('/api/:entidad/documentos/:id', verificarSesion, async (req, res) => {
  const { entidad, id } = req.params;
  const existente = getDocumentoById(entidad, id);
  if (!existente) return res.status(404).json({ error: 'Documento no encontrado' });

  const { titulo, descripcion, datos, estado, firmado } = req.body;
  const doc = await saveDocumentoAsync(entidad, {
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

  const doc = await saveDocumentoAsync(entidad, {
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
  // Buscar el documento primero
  const { getDocumentoByIdAsync } = await import('../config/documentos.js');
  const doc = await getDocumentoByIdAsync(entidad, id);
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  // No permitir eliminar documentos firmados
  if (doc.firmado || doc.estado === 'firmado') {
    return res.status(403).json({ error: 'No se puede eliminar un documento firmado' });
  }
  await deleteDocumentoAsync(entidad, id);
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

// ── Endpoint público para actualizar firma (desde PLID) ─────────────────
router.put('/publico/:entidad/documentos/:id/firmar', verificarApiKey, async (req, res) => {
  const { entidad, id } = req.params;
  const { saveDocumentoAsync, getDocumentoByIdAsync, getDocumentosByEntidadAsync } = await import('../config/documentos.js');
  let doc = await getDocumentoByIdAsync(entidad, id);
  if (!doc) {
    const allDocs = await getDocumentosByEntidadAsync(entidad);
    doc = allDocs.find(d => d.id === id);
  }
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
  try {
    const { estado, firmado, datos } = req.body;
    const updated = await saveDocumentoAsync(entidad, {
      ...doc,
      estado: estado || doc.estado,
      firmado: firmado !== undefined ? firmado : doc.firmado,
      datos: datos ? { ...doc.datos, ...datos } : doc.datos
    });
    res.json({ success: true, documento: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Diagnóstico del sistema de documentos ─────────────────────────────────
router.get('/api/documentos/diagnostico', async (req, res) => {
  const documentosConfig = await import('../config/documentos.js');
  const { initDocsTable, getDocumentos } = documentosConfig;
  
  // Verificar Supabase
  let supabaseModule = null;
  try { supabaseModule = await import('../config/supabase.js'); } catch {}
  const hasSupabaseModule = !!supabaseModule;
  const hasSupabaseClient = supabaseModule?.supabase ? 'si' : 'no';
  
  // Verificar env vars (sin mostrar el valor completo)
  const envKeys = {
    SUPABASE_URL: process.env.SUPABASE_URL ? 'definida' : 'no definida',
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? `definida (${process.env.SUPABASE_SERVICE_KEY.length} chars)` : 'no definida',
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ? 'definida' : 'no definida',
    mostrar_preview: process.env.SUPABASE_SERVICE_KEY ? process.env.SUPABASE_SERVICE_KEY.substring(0, 10) + '...' : 'N/A'
  };
  
  const sbOk = await initDocsTable();
  const memBanco = getDocumentos('banco')?.length || 0;
  
  let estado = { conectado: sbOk, docs_en_supabase: 0, escritura: 'no probado', docs: [], error_init: null };
  
  if (!sbOk) {
    // Diagnosticar POR QUÉ falló initDocsTable
    try {
      const { supabase: sb } = supabaseModule;
      if (!sb) {
        estado.error_init = 'supabase client is null';
      } else {
        const test1 = await sb.from('documentos').select('id').limit(1);
        estado.error_init = `select error: ${test1?.error?.message || 'unknown'}, status: ${test1?.status || 'no status'}`;
        // Also try another table to see if it's a table-specific issue
        const test2 = await sb.from('solicitantes').select('id').limit(1);
        estado.error_init += ` | solicitantes: ${test2?.error?.message || 'ok'}, status: ${test2?.status || 'no status'}`;
        // Try raw fetch to Supabase REST API
        const SUPABASE_URL = process.env.SUPABASE_URL || 'https://htikrqaywapshlkdonvs.supabase.co';
        const key = process.env.SUPABASE_SERVICE_KEY || '';
        if (key) {
          try {
            const r = await fetch(`${SUPABASE_URL}/rest/v1/documentos?select=id&limit=1`, {
              headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
            });
            const txt = await r.text();
            estado.error_init += ` | raw_api: ${r.status} ${txt.substring(0, 100)}`;
          } catch (e) {
            estado.error_init += ` | raw_api exception: ${e.message}`;
          }
        } else {
          estado.error_init += ` | no SERVICE_KEY env var for raw API test`;
        }
      }
    } catch (e) {
      estado.error_init = `exception: ${e.message}`;
    }
  }
  
  if (sbOk) {
    try {
      const { supabase } = supabaseModule;
      // 1. Leer
      const { data, error } = await supabase.from('documentos').select('id, entidad, titulo, tipo, estado, created_at').limit(20).order('created_at', { ascending: false });
      if (error) { estado.lectura = `error: ${error.message}`; }
      else {
        estado.lectura = 'ok';
        estado.docs_en_supabase = data.length;
        estado.docs = data;
      }
      
      // 2. Probar escritura real
      const testId = 'diag-' + Date.now();
      const { error: writeErr } = await supabase.from('documentos').insert({
        id: testId, entidad: 'banco', tipo: 'test-diagnostico',
        titulo: 'Test escritura', descripcion: 'Auto-generado',
        datos: {}, estado: 'borrador', firmado: false, hash: 'test'
      });
      if (writeErr) estado.escritura = `error: ${writeErr.message}`;
      else {
        await supabase.from('documentos').delete().eq('id', testId);
        estado.escritura = 'ok (insert+delete OK)';
      }
    } catch (e) { estado.escritura = `excepción: ${e.message}`; }
  }

  res.json({
    timestamp: new Date().toISOString(),
    supabase: {
      modulo_cargado: hasSupabaseModule,
      cliente_disponible: hasSupabaseClient,
      init_docs_table: sbOk ? 'ok' : 'falló',
      env: envKeys
    },
    lectura: estado.lectura || 'no probado',
    escritura: estado.escritura,
    docs_en_supabase: estado.docs_en_supabase,
    docs: estado.docs,
    memoria: { banco: memBanco }
  });
});

export default router;
