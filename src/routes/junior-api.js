/**
 * JUNIOR API — Rutas de Placeta Junior NATIVAS en RSP (migradas del CRM)
 *
 * PlacetaID Móvil y la app de Placeta Junior llaman a admin-placeta (RSP):
 * - Junior: menores, perfil, documentos legales, firma de documentos
 * - Documentos generales: cualquier documento pendiente de firma en el sistema
 *
 * La lógica legal (junior-legal.js) y de gestión junior ya NO se proxya al
 * CRM: todo vive en el RSP accediendo directamente a Supabase.
 *
 * Rutas:
 *   GET  /api/junior/menores/:dipTutor           → NATIVO (Supabase)
 *   GET  /api/junior/perfil                      → NATIVO (Supabase)
 *   GET  /api/junior/documentos-pendientes/:id    → NATIVO (Supabase)
 *   POST /api/junior/firmar-documento            → NATIVO (Supabase)
 *   GET  /api/junior/legal/documento-contenido/:c → NATIVO (Supabase)
 *   GET  /api/junior/legal/documento-verificable/:id → NATIVO (Supabase)
 *   POST /api/firma/firmar-manuscrito            → NATIVO (Supabase)
 *   POST /api/junior/solicitar-alta              → NATIVO (genera 3 PDFs + PlacetaID)
 *   GET  /api/junior/documentos/:id/pdf          → NATIVO (PDF)
 *   GET  /api/admin/junior/documentos            → Documentos locales (TODAS las entidades)
 */
import { Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import { verificarSesion } from '../middleware/auth.js';
import { getDocumentosByEntidadAsync, saveDocumentoAsync, generarPDF, ETIQUETAS_DOC } from '../config/documentos.js';
import juniorLegalRoutes, { firmarDocumentoGeneral } from './junior-legal.js';
import juniorAuthRoutes from './junior-auth.js';
import { supabase } from '../config/supabase.js';
import { sbFindSolicitanteByDip, sbFindJuniorByDip, sbUpdateJunior, sbCreateJuniorLog, sbFindJuniorByTutor, sbGetParentalLimits } from '../config/db.js';
import { registrarConexion, TIPO_CONEXION } from '../config/rsp.js';

const router = Router();

// ── Registro de conexión RSP (tarificación) — Placeta Junior ──────────
function rspRegistrar(tipo, endpoint, usuario = '', dip = '') {
  setImmediate(() => {
    try {
      registrarConexion({
        entidad: 'junior',
        tipo,
        endpoint: `[Junior API] ${endpoint}`,
        usuario: usuario || 'junior-api',
        dip: dip || '',
        detalle: 'Placeta Junior (RSP)'
      });
    } catch (e) { /* silencioso */ }
  });
}

// Monta la lógica legal de Placeta Junior de forma NATIVA (migrada del CRM)
router.use('/junior/legal', juniorLegalRoutes);

// Monta el registro y login de Placeta Junior de forma NATIVA (migrado del CRM)
router.use('/junior', juniorAuthRoutes);

const ENTIDADES = ['banco', 'tributos', 'junta', 'administracion'];

// ═══════════════════════════════════════════════════════════════════════════
//  JUNIOR — Menores vinculados a un tutor (NATIVO en RSP)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/junior/menores/:dipTutor', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/menores/:dipTutor', '', req.params.dipTutor);
  try {
    const menores = await sbFindJuniorByTutor(req.params.dipTutor);
    return res.json(Array.isArray(menores) ? menores : []);
  } catch (e) {
    console.error('[Junior] Error en menores:', e.message);
    res.status(502).json({ error: 'Error al cargar menores', detalle: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  JUNIOR — Perfil del junior (NATIVO en RSP)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/junior/perfil', async (req, res) => {
  const dip = req.query.dip || req.headers['x-junior-dip'] || '';
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/perfil', '', dip);
  try {
    const junior = dip ? await sbFindJuniorByDip(dip) : null;
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
    const limites = await sbGetParentalLimits(junior.id);
    res.json({ junior, limites_parentales: limites });
  } catch (e) {
    res.status(502).json({ error: 'Error al cargar perfil', detalle: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  JUNIOR LEGAL — Documentos pendientes de firma (NATIVO en RSP)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/junior/documentos-pendientes/:juniorId', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/documentos-pendientes/:juniorId');
  try {
    const { data: junior, error: jErr } = await supabase
      .from('junior_menores')
      .select('id, dip, nombre, apellidos, tutor_dip, tutor_nombre, estado')
      .eq('id', req.params.juniorId)
      .single();
    if (jErr || !junior) return res.status(404).json({ error: 'Junior no encontrado' });

    const tutorSol = await sbFindSolicitanteByDip(junior.tutor_dip);
    const tutorId = tutorSol?.id || null;

    const { data: firmados } = await supabase
      .from('documentos_firmados')
      .select('codigo_modelo')
      .eq('firmado_por', tutorId)
      .eq('estado', 'firmado')
      .ilike('codigo_modelo', `%::junior::${req.params.juniorId}`);

    const firmadosSet = new Set((firmados || []).map(f => f.codigo_modelo.split('::')[0]));
    const DOCS = [
      { codigo: 'PJ-TYC-001', nombre: 'Términos y Condiciones', orden: 1 },
      { codigo: 'PJ-PRV-001', nombre: 'Política de Privacidad', orden: 2 },
      { codigo: 'PJ-CON-001', nombre: 'Consentimiento Tutor Legal', orden: 3 }
    ];

    const pendientes = DOCS.filter(d => !firmadosSet.has(d.codigo)).map(d => ({ codigo: d.codigo, nombre: d.nombre, orden: d.orden, firmado: false }));

    res.json({
      success: true,
      junior: {
        id: junior.id, dip: junior.dip, nombre: junior.nombre,
        apellidos: junior.apellidos, tutor_dip: junior.tutor_dip,
        tutor_nombre: junior.tutor_nombre, estado: junior.estado
      },
      documentos: DOCS.map(d => ({ codigo: d.codigo, nombre: d.nombre, orden: d.orden, firmado: firmadosSet.has(d.codigo) })),
      pendientes,
      todos_firmados: pendientes.length === 0
    });
  } catch (e) {
    console.error('[JuniorLegal] Error en documentos-pendientes:', e.message);
    res.status(502).json({ error: 'Error al cargar documentos pendientes', detalle: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  JUNIOR LEGAL — Firmar documento (NATIVO en RSP)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/junior/firmar-documento', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/firmar-documento', '', req.body?.firmante_dip);
  try {
    const { junior_id, codigo_documento, firma_base64, firmante_dip, ip } = req.body;
    if (!junior_id || !codigo_documento || !firma_base64 || !firmante_dip) {
      return res.status(400).json({ error: 'Faltan datos obligatorios: junior_id, codigo_documento, firma_base64, firmante_dip' });
    }
    const DOCS = ['PJ-TYC-001', 'PJ-PRV-001', 'PJ-CON-001'];
    if (!DOCS.includes(codigo_documento)) return res.status(400).json({ error: 'Código de documento no válido' });

    const { data: junior, error: jErr } = await supabase
      .from('junior_menores')
      .select('id, dip, nombre, apellidos, tutor_dip, estado')
      .eq('id', junior_id)
      .single();
    if (jErr || !junior) return res.status(404).json({ error: 'Junior no encontrado' });
    if (junior.tutor_dip !== firmante_dip) {
      return res.status(403).json({ error: 'Solo el tutor legal puede firmar estos documentos' });
    }

    const nombreDoc = { 'PJ-TYC-001': 'Términos y Condiciones', 'PJ-PRV-001': 'Política de Privacidad', 'PJ-CON-001': 'Consentimiento Tutor Legal' }[codigo_documento];
    const resultado = await firmarDocumentoGeneral({
      codigo_modelo: `${codigo_documento}::junior::${junior.id}`,
      titulo: nombreDoc,
      firma_base64,
      firmante_dip,
      firmante_nombre: req.body.firmante_nombre || ''
    });

    if (!resultado.success && !resultado.ya_firmado) {
      return res.status(500).json({ error: resultado.error || 'Error al guardar la firma' });
    }

    const clientIp = ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    await sbCreateJuniorLog({
      junior_id: junior.id,
      accion: 'firma_documento',
      detalle: `Firma manuscrita: ${nombreDoc} (${codigo_documento}) por ${firmante_dip}`,
      ip: clientIp
    });

    // Ver si ya están todos firmados → activar cuenta
    const tutorSol = await sbFindSolicitanteByDip(firmante_dip);
    const tutorId = tutorSol?.id || null;
    const { data: firmados } = await supabase
      .from('documentos_firmados')
      .select('codigo_modelo')
      .eq('firmado_por', tutorId)
      .eq('estado', 'firmado')
      .ilike('codigo_modelo', `%::junior::${junior.id}`);
    const firmadosSet = new Set((firmados || []).map(f => f.codigo_modelo.split('::')[0]));
    const todosFirmados = DOCS.every(d => firmadosSet.has(d));

    let cuentaActivada = false;
    if (todosFirmados && junior.estado === 'pendiente_firma_tutor') {
      const ok = await sbUpdateJunior(junior.id, { estado: 'activo' });
      if (ok) {
        await supabase.from('solicitantes').update({ estado: 'activo' }).eq('dip', junior.dip);
        await sbCreateJuniorLog({
          junior_id: junior.id, accion: 'cuenta_activada',
          detalle: 'Todos los documentos firmados. Cuenta junior activada.', ip: clientIp
        });
        cuentaActivada = true;
        console.log(`[Legal] ✅ Cuenta junior ${junior.dip} ACTIVADA - todos los documentos firmados`);
      }
    }

    res.json({
      success: true,
      documento: nombreDoc,
      todos_firmados: todosFirmados,
      cuenta_activada: cuentaActivada,
      ya_firmado: !!resultado.ya_firmado,
      message: todosFirmados
        ? 'Documento firmado. ¡Todos los documentos completados! Cuenta activada.'
        : `"${nombreDoc}" firmado correctamente. Quedan ${DOCS.length - firmadosSet.size} documento(s) pendiente(s).`
    });
  } catch (e) {
    console.error('[JuniorLegal] Error en firmar-documento:', e.message);
    res.status(502).json({ error: 'Error al firmar documento', detalle: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  FIRMA MANUSCRITA — Endpoint general de firma (NATIVO en RSP)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/firma/firmar-manuscrito', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /firma/firmar-manuscrito', '', req.body?.firmante_dip);
  try {
    const { codigo_modelo, titulo, firma_base64, firmante_dip, firmante_nombre } = req.body;
    if (!codigo_modelo || !firma_base64 || !firmante_dip) {
      return res.status(400).json({ error: 'Faltan datos: codigo_modelo, firma_base64, firmante_dip' });
    }
    const resultado = await firmarDocumentoGeneral({
      codigo_modelo, titulo, firma_base64, firmante_dip, firmante_nombre
    });
    if (!resultado.success && !resultado.ya_firmado) {
      return res.status(500).json({ error: resultado.error || 'Error al guardar la firma' });
    }
    res.json(resultado);
  } catch (e) {
    console.error('[JuniorLegal] Error en firmar-manuscrito:', e.message);
    res.status(502).json({ error: 'Error al firmar', detalle: e.message });
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
  const dip = req.query.dip;
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /documentos/pendientes', '', dip);
  try {
    res.json(await listarDocumentosPorDipAsync(dip));
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar documentos', detalle: e.message });
  }
});

// Alias legacy para retrocompatibilidad (redirige al nuevo)
router.get('/admin/junior/documentos', async (req, res) => {
  const dip = req.query.dip;
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /admin/junior/documentos', '', dip);
  try {
    res.json(await listarDocumentosPorDipAsync(dip));
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar documentos', detalle: e.message });
  }
});

export default router;

// ── API: Solicitar alta de menor ────────────────────────────────────────
// Crea los 3 documentos legales de Placeta Junior (PJ-TYC-001, PJ-PRV-001,
// PJ-CON-001) que debe firmar el tutor legal, genera sus PDFs y los envía
// al tutor vía PlacetaID Móvil para que se complete el alta.
router.post('/api/junior/solicitar-alta', verificarSesion, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /api/junior/solicitar-alta', '', req.body?.dni_tutor);
  try {
    const { nombre, apellidos, fecha_nacimiento, nombre_tutor, apellidos_tutor, dni_tutor, email, fecha_nacimiento_tutor, tutor_ya_existe } = req.body;
    if (!nombre || !apellidos || !dni_tutor) return res.status(400).json({ error: 'nombre, apellidos y dni_tutor requeridos' });

    const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
    const PLACETAID_KEY = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';
    const datosMenor = { nombre, apellidos, fecha_nacimiento, dip: req.body.dip_menor || null };
    const datosTutor = { nombre: nombre_tutor, apellidos: apellidos_tutor, dip: dni_tutor, email, fecha_nacimiento: fecha_nacimiento_tutor };

    // Los 3 documentos legales que firma el tutor en el alta
    const DOCS_LEGALES = [
      { tipo: 'terminos-junior', codigo: 'PJ-TYC-001', titulo: 'Términos y Condiciones — Placeta Junior (PJ-TYC-001)' },
      { tipo: 'privacidad-junior', codigo: 'PJ-PRV-001', titulo: 'Política de Privacidad — Placeta Junior (PJ-PRV-001)' },
      { tipo: 'consentimiento-junior', codigo: 'PJ-CON-001', titulo: 'Consentimiento Tutor Legal — Placeta Junior (PJ-CON-001)' }
    ];

    const documentos = [];
    for (const leg of DOCS_LEGALES) {
      const docId = `junior-${leg.codigo}-${Date.now()}-${randomUUID().slice(0,6)}`;
      const hash = createHash('sha256').update(docId + Date.now()).digest('hex');
      const csv = hash.slice(0, 16).toUpperCase();

      const doc = await saveDocumentoAsync('junior', {
        id: docId, tipo: leg.tipo,
        titulo: `${leg.titulo} — ${nombre} ${apellidos}`,
        descripcion: `Alta de menor ${nombre} ${apellidos} (${leg.codigo}) - Tutor: ${nombre_tutor} ${apellidos_tutor} (${dni_tutor})`,
        datos: { menor: datosMenor, tutor: datosTutor, csv, hash, estado: 'pendiente_firma_tutor', fechaSolicitud: new Date().toISOString() },
        createdBy: dni_tutor || 'sistema', estado: 'pendiente-firma', firmado: false, hash, csv
      });

      // Generar PDF (no crítico si falla: el documento sigue disponible vía API)
      let pdfBase64 = null;
      try {
        const pdfBuffer = await generarPDF('junior', doc);
        pdfBase64 = pdfBuffer.toString('base64');
      } catch (pdfErr) {
        console.warn('[Junior] No se pudo generar PDF de', leg.codigo, pdfErr.message);
      }

      // Notificar a PLID para firma del tutor
      let enviadoPlacetaID = false;
      try {
        const resp = await fetch(`${PLACETAID_API}/admin/documentos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': PLACETAID_KEY },
          body: JSON.stringify({
            id: docId, titulo: doc.titulo, tipo: leg.tipo, entidad: 'junior',
            csv, destinatariosDIP: [dni_tutor],
            contenido: `Documento legal ${leg.codigo}: ${leg.titulo}. Debe firmarlo el tutor legal para completar el alta de ${nombre} ${apellidos} en Placeta Junior.\n\nCSV: ${csv}\nHash: ${hash.slice(0, 16)}`
          }),
          signal: AbortSignal.timeout(8000)
        });
        enviadoPlacetaID = resp.ok;
      } catch (plidErr) {
        console.warn('[Junior] PlacetaID offline para', leg.codigo, plidErr.message);
      }

      documentos.push({
        id: docId, codigo: leg.codigo, tipo: leg.tipo, titulo: doc.titulo,
        csv, estado: 'pendiente-firma', firmado: false,
        placetaid: enviadoPlacetaID,
        pdfBase64: pdfBase64 ? pdfBase64.slice(0, 40) + '…' : null, // resumen para la respuesta
        pdf: !!pdfBase64
      });
    }

    res.json({
      success: true,
      mensaje: 'Solicitud registrada. El tutor recibirá los 3 documentos legales para firmar desde PlacetaID Móvil.',
      documentos,
      pendientes: documentos.length
    });
  } catch (e) { console.error('[Junior] Error:', e.message); res.status(500).json({ error: e.message }); }
});

// ── API: Obtener PDF de un documento legal de Placeta Junior ────────────
// GET /api/junior/documentos/:id/pdf → devuelve el PDF del documento legal
router.get('/api/junior/documentos/:id/pdf', verificarSesion, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /api/junior/documentos/:id/pdf');
  try {
    const { getDocumentoByIdAsync } = await import('../config/documentos.js');
    const doc = await getDocumentoByIdAsync('junior', req.params.id)
      || await getDocumentoByIdAsync('junta', req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
    const pdfBuffer = await generarPDF('junior', doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.tipo}-${doc.id.slice(0,8)}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error('[Junior] Error generando PDF:', e.message);
    res.status(500).json({ error: 'Error al generar PDF: ' + e.message });
  }
});
