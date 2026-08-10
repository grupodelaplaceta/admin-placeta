/**
 * JUNIOR LEGAL (nativo en RSP) — Documentos legales de Placeta Junior
 *
 * Migrado desde el CRM de GDLP (junior-legal.js) al RSP para que toda la
 * gestión legal de Placeta Junior viva en el RSP (admin-placeta).
 *
 * Endpoints (montado en /api/junior):
 *   GET  /documentos-pendientes/:juniorId   → lista los 3 documentos + estado
 *   POST /firmar-documento                  → firma manuscrita (base64 PNG)
 *   GET  /documento-contenido/:codigo       → contenido del documento legal
 *   GET  /documento-verificable/:docId      → HTML verificable con logo+firma+hash
 *
 * Exporta además:
 *   firmarDocumentoGeneral()                → usado por PlacetaID Móvil
 */
import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { sbFindSolicitanteByDip, sbUpdateJunior, sbCreateJuniorLog } from '../config/db.js';
import { registrarConexion, TIPO_CONEXION } from '../config/rsp.js';

const router = Router();

// ── Registro de conexión RSP (tarificación) — Documentos legales junior ──
function rspRegistrar(tipo, endpoint, usuario = '', dip = '') {
  setImmediate(() => {
    try {
      registrarConexion({
        entidad: 'junior',
        tipo,
        endpoint: `[Legal] ${endpoint}`,
        usuario: usuario || 'junior-api',
        dip: dip || '',
        detalle: 'Documentos legales Placeta Junior (RSP)'
      });
    } catch (e) { /* silencioso */ }
  });
}

// ── Documentos legales requeridos para Placeta Junior ────────────────────
const DOCUMENTOS_REQUERIDOS = [
  { codigo: 'PJ-TYC-001', nombre: 'Términos y Condiciones', orden: 1 },
  { codigo: 'PJ-PRV-001', nombre: 'Política de Privacidad', orden: 2 },
  { codigo: 'PJ-CON-001', nombre: 'Consentimiento Tutor Legal', orden: 3 }
];

// ═══════════════════════════════════════════════════════════════════════════
//  LISTAR documentos pendientes de firma para un junior
// ═══════════════════════════════════════════════════════════════════════════

router.get('/documentos-pendientes/:juniorId', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/legal/documentos-pendientes/:juniorId');
  try {
    const { juniorId } = req.params;

    // Get junior info
    const { data: junior, error: jErr } = await supabase
      .from('junior_menores')
      .select('id, dip, nombre, apellidos, tutor_dip, tutor_nombre, estado')
      .eq('id', juniorId)
      .single();

    if (jErr || !junior) return res.status(404).json({ error: 'Junior no encontrado' });

    // Get already signed documents (look up by tutor's solicitante ID)
    const tutorSol = await sbFindSolicitanteByDip(junior.tutor_dip);
    const tutorId = tutorSol?.id || null;

    const { data: firmados, error: fErr } = await supabase
      .from('documentos_firmados')
      .select('codigo_modelo')
      .eq('firmado_por', tutorId)
      .eq('estado', 'firmado')
      .ilike('codigo_modelo', `%::junior::${juniorId}`);

    if (fErr) console.warn('[Legal] Error leyendo firmados:', fErr.message);
    const firmadosSet = new Set((firmados || []).map(f => f.codigo_modelo.split('::')[0]));

    // Build pending list
    const pendientes = DOCUMENTOS_REQUERIDOS
      .filter(d => !firmadosSet.has(d.codigo))
      .map(d => ({ codigo: d.codigo, nombre: d.nombre, orden: d.orden, firmado: false }));

    const todosFirmados = pendientes.length === 0;

    res.json({
      success: true,
      junior: {
        id: junior.id,
        dip: junior.dip,
        nombre: junior.nombre,
        apellidos: junior.apellidos,
        tutor_dip: junior.tutor_dip,
        tutor_nombre: junior.tutor_nombre,
        estado: junior.estado
      },
      documentos: DOCUMENTOS_REQUERIDOS.map(d => ({
        codigo: d.codigo, nombre: d.nombre, orden: d.orden,
        firmado: firmadosSet.has(d.codigo)
      })),
      pendientes,
      todos_firmados: todosFirmados
    });
  } catch (err) {
    console.error('[Legal] Error listando documentos:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  FIRMAR documento con firma manuscrita (base64 PNG)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/firmar-documento', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/legal/firmar-documento', '', req.body?.firmante_dip);
  try {
    const { junior_id, codigo_documento, firma_base64, firmante_dip, firmante_nombre, ip } = req.body;

    if (!junior_id || !codigo_documento || !firma_base64 || !firmante_dip) {
      return res.status(400).json({ error: 'Faltan datos obligatorios: junior_id, codigo_documento, firma_base64, firmante_dip' });
    }

    // Validate document code
    const docDef = DOCUMENTOS_REQUERIDOS.find(d => d.codigo === codigo_documento);
    if (!docDef) return res.status(400).json({ error: 'Código de documento no válido' });

    // Get junior
    const { data: junior, error: jErr } = await supabase
      .from('junior_menores')
      .select('id, dip, nombre, apellidos, tutor_dip, estado')
      .eq('id', junior_id)
      .single();

    if (jErr || !junior) return res.status(404).json({ error: 'Junior no encontrado' });

    // Verify the signer is the tutor
    if (junior.tutor_dip !== firmante_dip) {
      return res.status(403).json({ error: 'Solo el tutor legal puede firmar estos documentos' });
    }

    // Find the tutor's solicitante record for FK
    const tutorSol = await sbFindSolicitanteByDip(firmante_dip);
    const tutorId = tutorSol?.id || null;
    const clientIp = ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const ahora = new Date().toISOString();
    const firmaHash = crypto.createHash('sha256').update(firma_base64 + ahora).digest('hex');

    // Insert signed document using existing Supabase table columns
    const { data: doc, error: insErr } = await supabase
      .from('documentos_firmados')
      .insert({
        usuario_id: tutorId,
        codigo_modelo: `${codigo_documento}::junior::${junior.id}`,
        titulo_documento: docDef.nombre,
        url_firma: firma_base64,
        hash_documento: firmaHash,
        firmado_por: tutorId,
        estado: 'firmado'
      })
      .select()
      .single();

    if (insErr) {
      if (insErr.code === '23505') {
        return res.json({ success: true, ya_firmado: true, message: 'Documento ya firmado anteriormente' });
      }
      console.error('[Legal] Error insertando firma:', JSON.stringify(insErr));
      return res.status(500).json({ error: `Error al guardar la firma: ${insErr.message}` });
    }

    // Log
    await sbCreateJuniorLog({
      junior_id: junior.id,
      accion: 'firma_documento',
      detalle: `Firma manuscrita: ${docDef.nombre} (${codigo_documento}) por ${firmante_dip}`,
      ip: clientIp
    });

    // Check if all documents are now signed (by codigo_modelo pattern)
    const { data: firmados } = await supabase
      .from('documentos_firmados')
      .select('codigo_modelo')
      .eq('firmado_por', tutorId)
      .eq('estado', 'firmado')
      .ilike('codigo_modelo', `%::junior::${junior.id}`);

    const firmadosSet = new Set((firmados || []).map(f => f.codigo_modelo.split('::')[0]));
    const todosFirmados = DOCUMENTOS_REQUERIDOS.every(d => firmadosSet.has(d.codigo));

    // If all signed, activate the junior account
    let cuentaActivada = false;
    if (todosFirmados && junior.estado === 'pendiente_firma_tutor') {
      const ok = await sbUpdateJunior(junior.id, { estado: 'activo' });
      if (ok) {
        await supabase.from('solicitantes')
          .update({ estado: 'activo' })
          .eq('dip', junior.dip);
        await sbCreateJuniorLog({
          junior_id: junior.id,
          accion: 'cuenta_activada',
          detalle: 'Todos los documentos firmados. Cuenta junior activada.',
          ip: clientIp
        });
        cuentaActivada = true;
        console.log(`[Legal] ✅ Cuenta junior ${junior.dip} ACTIVADA - todos los documentos firmados`);
      } else {
        console.error('[Legal] Error activando cuenta:', 'sbUpdateJunior falló');
      }
    }

    res.json({
      success: true,
      documento: docDef.nombre,
      todos_firmados: todosFirmados,
      cuenta_activada: cuentaActivada,
      message: todosFirmados
        ? 'Documento firmado. ¡Todos los documentos completados! Cuenta activada.'
        : `"${docDef.nombre}" firmado correctamente. Quedan ${DOCUMENTOS_REQUERIDOS.length - firmadosSet.size} documento(s) pendiente(s).`
    });
  } catch (err) {
    console.error('[Legal] Error firmando documento:', err);
    res.status(500).json({ error: 'Error interno al procesar la firma' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  CONTENIDO de un documento legal
// ═══════════════════════════════════════════════════════════════════════════

router.get('/documento-contenido/:codigo', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/legal/documento-contenido/:codigo', '', req.params.codigo);
  const contenidos = {
    'PJ-TYC-001': {
      titulo: 'Términos y Condiciones — Placeta Junior',
      contenido: `TÉRMINOS Y CONDICIONES DE PLACETA JUNIOR\n\n1. PARTES\n1.1. De una parte, el Grupo de La Placeta (en adelante, "GDLP"), con sede en La Placeta.\n1.2. De otra parte, el tutor legal (en adelante, "el Tutor"), actuando en representación del menor (en adelante, "el Menor").\n\n2. OBJETO\n2.1. Placeta Junior es un servicio financiero-educativo para menores de 16 años.\n2.2. Incluye monedero digital en Placeta (Pz), academia de educación financiera, y herramientas de ahorro.\n\n3. RESPONSABILIDAD DEL TUTOR\n3.1. El Tutor es el único responsable de las acciones del Menor en la plataforma.\n3.2. El Tutor puede establecer límites de gasto y supervisar la actividad del Menor.\n\n4. PROTECCIÓN DE DATOS\n4.1. Los datos del Menor se tratan conforme al RGPD y la LOPDGDD.\n4.2. El Tutor puede ejercer los derechos ARCO en cualquier momento.\n\n5. VIGENCIA\n5.1. Este acuerdo entra en vigor en la fecha de firma digital manuscrita.\n5.2. Al cumplir 16 años, el Menor debe migrar a PlacetaID estándar.`,
      version: '1.0',
      fecha: '2026-07-13'
    },
    'PJ-PRV-001': {
      titulo: 'Política de Privacidad — Placeta Junior',
      contenido: `POLÍTICA DE PRIVACIDAD — PLACETA JUNIOR\n\n1. RESPONSABLE\nGrupo de La Placeta (GDLP)\n\n2. DATOS RECOGIDOS\n• Datos identificativos del Menor: nombre, apellidos, fecha de nacimiento.\n• Datos del Tutor: DNI, nombre, email, firma manuscrita digitalizada.\n• Datos de uso: transacciones, progreso en academia, conexiones.\n\n3. FINALIDAD\n• Gestión del monedero digital y cuenta bancaria infantil.\n• Formación financiera en la Academia GDLP.\n• Cumplimiento legal y prevención de fraude.\n\n4. BASE LEGAL\n• Consentimiento explícito del tutor legal (Art. 6.1.a y Art. 8 RGPD).\n• Interés legítimo en la protección del menor.\n\n5. CONSERVACIÓN\nLos datos se conservan mientras la cuenta esté activa y hasta 5 años después de la baja.\n\n6. DERECHOS\nEl Tutor puede ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad.\n\n7. MEDIDAS DE SEGURIDAD\n• Firma manuscrita digitalizada con hash SHA-256.\n• Datos bancarios aislados en backend-banco.\n• Comunicaciones cifradas TLS 1.3.`,
      version: '1.0',
      fecha: '2026-07-13'
    },
    'PJ-CON-001': {
      titulo: 'Consentimiento del Tutor Legal',
      contenido: `CONSENTIMIENTO DEL TUTOR LEGAL — PLACETA JUNIOR\n\nYo, el abajo firmante, en calidad de tutor legal del menor,\n\nDECLARO Y CONSENTO:\n\n1. Que autorizo al menor a utilizar Placeta Junior, incluyendo:\n   a) Monedero digital en Placeta (Pz).\n   b) Acceso a la Academia GDLP de educación financiera.\n   c) Recepción de bonos y recompensas educativas.\n\n2. Que he leído y acepto los Términos y Condiciones.\n3. Que he leído y acepto la Política de Privacidad.\n4. Que soy el tutor legal y tengo capacidad para otorgar este consentimiento.\n5. Que entiendo que puedo revocar este consentimiento en cualquier momento.\n6. Que me hago responsable de supervisar la actividad del menor.\n\nLa firma manuscrita digitalizada tiene la misma validez legal que la firma en papel,\nconforme al Reglamento eIDAS (UE 910/2014) y la Ley 6/2020 de servicios electrónicos de confianza.`,
      version: '1.0',
      fecha: '2026-07-13'
    }
  };

  const doc = contenidos[req.params.codigo];
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  res.json(doc);
});

// ═══════════════════════════════════════════════════════════════════════════
//  PDF VERIFICABLE — Documento legal con logo, firma y hash (requiere token)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/documento-verificable/:docId', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/legal/documento-verificable/:docId', '', req.params.docId);
  try {
    const { data: doc, error } = await supabase
      .from('documentos_firmados')
      .select('*')
      .eq('id', req.params.docId)
      .single();

    if (error || !doc) return res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;padding:40px">🔒 Documento no encontrado</h1>');

    // ── Security: require token (derived from hash) unless has session ──
    const expectedToken = (doc.hash_documento || doc.id?.toString() || '').substring(0, 12);
    const providedToken = req.query.token || '';
    const isAdmin = req.session?.usuario?.rol === 'administrador';
    if (!isAdmin && providedToken !== expectedToken) {
      return res.status(403).send(`<html><head><meta charset="UTF-8"><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#1c005f;color:#fff;text-align:center;margin:0}</style></head><body><div><h1>🔒 Acceso Restringido</h1><p>Este documento es privado. Solo el tutor legal y los administradores pueden verlo.</p><p style="font-size:0.8rem;opacity:0.7;margin-top:24px">Placeta Junior · Grupo de La Placeta</p></div></body></html>`);
    }

    // Get junior info from codigo_modelo
    const parts = (doc.codigo_modelo || '').split('::');
    const juniorId = parts[2] || null;
    let junior = null;
    if (juniorId) {
      const { data: j } = await supabase.from('junior_menores')
        .select('dip,nombre,apellidos,tutor_dip,tutor_nombre')
        .eq('id', juniorId).single();
      junior = j;
    }

    let tutorNombre = '—';
    if (doc.firmado_por) {
      const { data: sol } = await supabase.from('solicitantes')
        .select('nombre_real,dip')
        .eq('id', doc.firmado_por).single();
      if (sol) tutorNombre = sol.nombre_real || sol.dip || '—';
    }

    const docCode = parts[0] || doc.codigo_modelo;
    const fecha = doc.creado_en ? new Date(doc.creado_en).toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    const fechaCorta = doc.creado_en ? new Date(doc.creado_en).toLocaleDateString('es-ES') : '—';
    const firmaImg = doc.url_firma
      ? (doc.url_firma.startsWith('data:') ? doc.url_firma : `data:image/png;base64,${doc.url_firma}`)
      : null;

    const contenidos = {
      'PJ-TYC-001': '1. PARTES\n1.1. Grupo de La Placeta (GDLP).\n1.2. El tutor legal, en representación del menor.\n\n2. OBJETO\n2.1. Placeta Junior es un servicio financiero-educativo para menores de 16 años.\n2.2. Incluye monedero digital, academia, y herramientas de ahorro.\n\n3. RESPONSABILIDAD DEL TUTOR\n3.1. El Tutor es responsable de las acciones del Menor.\n3.2. Puede establecer límites y supervisar la actividad.\n\n4. PROTECCIÓN DE DATOS\n4.1. Conforme al RGPD y LOPDGDD.\n4.2. El Tutor puede ejercer derechos ARCO.\n\n5. VIGENCIA\n5.1. Desde la firma digital manuscrita.\n5.2. Al cumplir 16 años debe migrar a PlacetaID estándar.',
      'PJ-PRV-001': '1. RESPONSABLE: Grupo de La Placeta (GDLP).\n\n2. DATOS RECOGIDOS:\n• Identificativos del Menor.\n• Datos del Tutor (DNI, nombre, email, firma).\n• Datos de uso (transacciones, progreso academia).\n\n3. FINALIDAD: Gestión del monedero digital, formación financiera, cumplimiento legal.\n\n4. BASE LEGAL: Consentimiento explícito del tutor (Art. 6.1.a y Art. 8 RGPD).\n\n5. CONSERVACIÓN: Mientras la cuenta esté activa + 5 años.\n\n6. DERECHOS: Acceso, rectificación, supresión, oposición, limitación, portabilidad.\n\n7. SEGURIDAD: Firma SHA-256, datos bancarios aislados, TLS 1.3.',
      'PJ-CON-001': 'El abajo firmante, como tutor legal del menor, DECLARA Y CONSENTE:\n\n1. Autoriza al menor a usar Placeta Junior (monedero Pz, Academia GDLP, bonos).\n2. Ha leído y acepta los Términos y Condiciones.\n3. Ha leído y acepta la Política de Privacidad.\n4. Es el tutor legal con capacidad para consentir.\n5. Puede revocar este consentimiento en cualquier momento.\n6. Se responsabiliza de supervisar al menor.\n\nLa firma manuscrita digitalizada tiene validez legal conforme a eIDAS (UE 910/2014) y Ley 6/2020.'
    };
    const docInfo = contenidos[docCode] || doc.titulo_documento || 'Documento Legal';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${doc.titulo_documento || 'Documento Legal'} — Placeta Junior</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
    :root {
      --primary: #3f00d8; --primary-dark: #1c005f; --accent: #FF6600;
      --text: #1a1a2e; --text-light: #666; --border: #e0ddf0; --bg: #faf9fd;
    }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Outfit',system-ui,sans-serif; background:#f0edf7; color:var(--text); line-height:1.6; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .document { max-width:210mm; margin:20px auto; background:#fff; box-shadow:0 4px 24px rgba(0,0,0,.08); }
    .doc-header { background:linear-gradient(135deg,var(--primary-dark),var(--primary)); color:#fff; padding:32px 40px; position:relative; overflow:hidden; }
    .doc-header::before { content:''; position:absolute; top:-50px; right:-50px; width:200px; height:200px; background:rgba(255,255,255,.03); border-radius:50%; }
    .doc-header::after { content:''; position:absolute; bottom:-30px; right:60px; width:100px; height:100px; background:rgba(255,255,255,.04); border-radius:50%; }
    .doc-logo { font-size:36px; font-weight:900; letter-spacing:-1px; position:relative; z-index:1; display:flex; align-items:center; gap:12px; }
    .doc-logo span { color:var(--accent); }
    .doc-logo img { height:44px; width:auto; }
    .doc-subtitle { font-size:12px; opacity:.75; margin-top:4px; position:relative; z-index:1; }
    .doc-stamp { position:absolute; top:24px; right:32px; border:3px solid rgba(255,255,255,.25); border-radius:50%; width:80px; height:80px; display:flex; align-items:center; justify-content:center; transform:rotate(-12deg); font-weight:900; font-size:10px; text-transform:uppercase; color:rgba(255,255,255,.4); text-align:center; line-height:1.2; z-index:1; }
    .doc-body { padding:40px; }
    .doc-body h2 { color:var(--primary-dark); font-size:20px; margin-bottom:20px; border-bottom:2px solid var(--accent); padding-bottom:8px; display:inline-block; }
    .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; background:var(--bg); border-radius:10px; padding:16px 20px; margin-bottom:24px; border-left:3px solid var(--primary); font-size:13px; }
    .meta-grid div { display:flex; justify-content:space-between; padding:3px 0; }
    .meta-label { color:var(--primary); font-weight:600; }
    .meta-value { color:var(--text); text-align:right; }
    .doc-content { background:#fff; border:1px solid var(--border); border-radius:10px; padding:24px; margin:20px 0; white-space:pre-line; font-size:13px; line-height:1.8; }
    .sig-section { margin:24px 0; }
    .sig-section h3 { color:var(--primary-dark); font-size:15px; margin-bottom:12px; }
    .sig-box { text-align:center; padding:20px; border:2px dashed var(--border); border-radius:12px; background:#fff; }
    .sig-box img { max-width:350px; max-height:120px; }
    .sig-label { font-size:11px; color:#999; margin-top:6px; }
    .verify-box { background:var(--primary-dark); color:#fff; padding:20px 24px; border-radius:10px; margin-top:24px; font-size:11px; }
    .verify-box h4 { color:var(--accent); margin-bottom:8px; font-size:13px; }
    .verify-box code { background:rgba(255,255,255,.1); padding:2px 6px; border-radius:3px; font-size:10px; word-break:break-all; }
    .verify-box .hash { font-family:monospace; font-size:9px; opacity:.8; }
    .doc-footer { text-align:center; padding:20px 40px; color:#aaa; font-size:10px; border-top:1px solid var(--border); }
    .doc-footer strong { color:var(--primary); }
    @media print {
      @page { size:A4; margin:15mm; }
      body { background:#fff; }
      .document { box-shadow:none; max-width:100%; margin:0; }
      .doc-header { background:var(--primary-dark) !important; }
      .doc-body { padding:25px 0; }
      .meta-grid { background:#f9f9f9 !important; }
    }
    .watermark { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-30deg); font-size:120px; color:rgba(0,0,0,.015); font-weight:900; pointer-events:none; z-index:0; white-space:nowrap; }
  </style>
</head>
<body>
  <div class="watermark">PLACETA JUNIOR</div>
  <div class="document">
    <div class="doc-header">
      <div class="doc-stamp">FIRMADO<br>✓</div>
      <div class="doc-logo"><img src="/img/logojunior.jpg" alt="Placeta Junior" style="height:44px;width:auto"> Placeta<span>Junior</span></div>
      <div class="doc-subtitle">Grupo de La Placeta — Documento Legal Verificable</div>
    </div>

    <div class="doc-body">
      <h2>📜 ${doc.titulo_documento || 'Documento Legal'}</h2>

      <div class="meta-grid">
        <div><span class="meta-label">Código</span><span class="meta-value">${docCode}</span></div>
        <div><span class="meta-label">Versión</span><span class="meta-value">1.0</span></div>
        <div><span class="meta-label">Firmado por</span><span class="meta-value">${tutorNombre}</span></div>
        <div><span class="meta-label">Fecha</span><span class="meta-value">${fechaCorta}</span></div>
        ${junior ? `<div><span class="meta-label">Menor</span><span class="meta-value">${junior.nombre} ${junior.apellidos}</span></div>` : ''}
        ${junior ? `<div><span class="meta-label">DIP Menor</span><span class="meta-value">${junior.dip}</span></div>` : ''}
        <div><span class="meta-label">ID Documento</span><span class="meta-value">PJ-${doc.id}</span></div>
        <div><span class="meta-label">Estado</span><span class="meta-value">${doc.estado}</span></div>
      </div>

      <h3 style="color:var(--primary);font-size:14px;margin-bottom:8px">📋 Contenido del documento</h3>
      <div class="doc-content">${(typeof docInfo === 'string' ? docInfo : docInfo).replace(/\n/g, '<br>')}</div>

      ${firmaImg ? `
      <div class="sig-section">
        <h3>✍️ Firma manuscrita del tutor legal</h3>
        <div class="sig-box">
          <img src="${firmaImg}" alt="Firma manuscrita" />
          <div class="sig-label">Firma digitalizada de <strong>${tutorNombre}</strong> — Válida conforme a eIDAS (UE 910/2014) y Ley 6/2020</div>
        </div>
      </div>` : ''}

      <div class="verify-box">
        <h4>🔐 Verificación criptográfica</h4>
        <p>Este documento ha sido firmado digitalmente con plena validez legal.</p>
        <p style="margin-top:6px"><strong>Hash SHA-256:</strong> <code class="hash">${doc.hash_documento || '—'}</code></p>
        <p style="margin-top:4px"><strong>ID de verificación:</strong> <code>PJ-${doc.id}-${docCode}</code></p>
        <p style="margin-top:6px;font-size:10px;opacity:.7">Documento generado el ${fecha}. Para verificar la autenticidad, contacte con Grupo de La Placeta.</p>
      </div>
    </div>

    <div class="doc-footer">
      <strong>Placeta Junior</strong> · Grupo de La Placeta · ${fecha}<br>
      Documento legalmente vinculante. Cualquier modificación o alteración invalida su autenticidad.<br>
      Conforme al Reglamento eIDAS (UE 910/2014) y Ley 6/2020 de servicios electrónicos de confianza.
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (err) {
    console.error('[Legal] Error generando documento:', err);
    res.status(500).send('<h1>Error</h1>');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  GENERAL SIGNING API — Usado por PlacetaID Móvil para cualquier documento
// ═══════════════════════════════════════════════════════════════════════════

export async function firmarDocumentoGeneral({ codigo_modelo, titulo, firma_base64, firmante_dip, firmante_nombre, metadata = {} }) {
  if (!supabase) return { success: false, error: 'Base de datos no disponible' };
  const tutorSol = await sbFindSolicitanteByDip(firmante_dip);
  const tutorId = tutorSol?.id || null;
  const ahora = new Date().toISOString();
  const firmaHash = crypto.createHash('sha256').update(firma_base64 + ahora).digest('hex');

  const { data, error } = await supabase.from('documentos_firmados').insert({
    usuario_id: tutorId,
    codigo_modelo: codigo_modelo,
    titulo_documento: titulo,
    url_firma: firma_base64,
    hash_documento: firmaHash,
    firmado_por: tutorId,
    estado: 'firmado',
    creado_en: ahora
  }).select().single();

  if (error) {
    if (error.code === '23505') return { success: true, ya_firmado: true, message: 'Documento ya firmado' };
    return { success: false, error: error.message };
  }

  return { success: true, doc_id: data.id, hash: firmaHash, message: 'Documento firmado correctamente' };
}

export { DOCUMENTOS_REQUERIDOS };
export default router;
