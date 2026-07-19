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
import { createHash, randomUUID } from 'crypto';
import { verificarSesion } from '../middleware/auth.js';
import { getDocumentosByEntidadAsync, saveDocumentoAsync, ETIQUETAS_DOC } from '../config/documentos.js';

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

router.get('/junior/menores/:dipTutor', async (req, res) => {
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

router.get('/junior/perfil', async (req, res) => {
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

router.get('/junior/documentos-pendientes/:juniorId', async (req, res) => {
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

router.post('/junior/firmar-documento', async (req, res) => {
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

router.post('/firma/firmar-manuscrito', async (req, res) => {
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

async function listarDocumentosPorDipAsync(dip) {
  const todos = [];
  for (const entidad of ENTIDADES) {
    const docs = await getDocumentosByEntidadAsync(entidad);
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
router.get('/documentos/pendientes', async (req, res) => {
  try {
    const dip = req.query.dip;
    res.json(await listarDocumentosPorDipAsync(dip));
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar documentos', detalle: e.message });
  }
});

// Alias legacy para retrocompatibilidad (redirige al nuevo)
router.get('/admin/junior/documentos', async (req, res) => {
  try {
    const dip = req.query.dip;
    res.json(await listarDocumentosPorDipAsync(dip));
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar documentos', detalle: e.message });
  }
});

export default router;

// ── API: Solicitar alta de menor ────────────────────────────────────────
// Crea el documento legal de autorización y lo envía al tutor vía PLID
router.post('/api/junior/solicitar-alta', verificarSesion, async (req, res) => {
  try {
    const { nombre, apellidos, fecha_nacimiento, nombre_tutor, apellidos_tutor, dni_tutor, email, fecha_nacimiento_tutor, tutor_ya_existe } = req.body;
    if (!nombre || !apellidos || !dni_tutor) return res.status(400).json({ error: 'nombre, apellidos y dni_tutor requeridos' });

    const docId = `junior-alta-${Date.now()}-${randomUUID().slice(0,6)}`;
    const csv = createHash('sha256').update(docId).digest('hex').slice(0, 16);

    const doc = await saveDocumentoAsync('junta', {
      id: docId, tipo: 'alta-junior',
      titulo: `Autorización legal - ${nombre} ${apellidos}`,
      descripcion: `Alta de menor ${nombre} ${apellidos} - Tutor: ${nombre_tutor} ${apellidos_tutor} (${dni_tutor})`,
      datos: { menor: { nombre, apellidos, fecha_nacimiento }, tutor: { nombre: nombre_tutor, apellidos: apellidos_tutor, dip: dni_tutor, email, fecha_nacimiento: fecha_nacimiento_tutor }, csv, estado: 'pendiente_firma_tutor', fechaSolicitud: new Date().toISOString() },
      createdBy: dni_tutor || 'sistema', estado: 'final', firmado: false, hash: csv
    });

    // Notificar a PLID
    try {
      const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
      await fetch(`${PLACETAID_API}/admin/documentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb' },
        body: JSON.stringify({ id: doc.id, titulo: doc.titulo, tipo: 'alta-junior', entidad: 'junta', csv, destinatariosDIP: [dni_tutor], contenido: `Documento de autorización legal para que ${nombre} ${apellidos} use Placeta Junior.` }),
        signal: AbortSignal.timeout(5000)
      }).catch(() => {});
    } catch {}

    res.json({ success: true, documento: doc, mensaje: 'Solicitud registrada. El tutor recibirá un documento para firmar.' });
  } catch (e) { console.error('[Junior] Error:', e.message); res.status(500).json({ error: e.message }); }
});
