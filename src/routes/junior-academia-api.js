/**
 * JUNIOR ACADEMIA API — Sistema completo de la Academia Placeta Junior
 *
 * Implementa el spec de la Academia:
 * - Actividades individuales con catálogo (Studio → Filtro → Publicación)
 * - Creadores: mayores de 18 con ACUERDO DE COLABORADOR firmado vía PlacetaID
 *   (documento oficial del sistema de documentos de admin-placeta)
 * - Titulares: EIP (reciben %), profesores, contenido interno (100% PJ)
 * - Precios con IVA incluido (Capitalia lo abona) + recompensas
 * - Exámenes (>10 preguntas) → diploma PDF oficial
 * - Retos de Candela (semanales, gratuitos, siempre con diploma)
 * - Puntos Verdes (progreso) y Puntos Rojos (errores) + canje por Placetas
 *
 * Montado en server.js bajo /api/junior (RSP billing automático)
 */
import { Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import { supabase } from '../config/supabase.js';
import {
  sbFindJuniorByDip, sbUpdateJunior, sbFindSolicitanteByDip,
  sbUpdatePlacetaBalance, sbCreatePlacetaTransaction, sbCreateJuniorLog
} from '../config/db.js';
import { apiBancoPost } from '../config/db.js';
import { registrarConexion, TIPO_CONEXION } from '../config/rsp.js';
import { getRetoActivo, getRetos } from '../config/junior-retos.js';
import {
  TIPOS_ACTIVIDAD, ESTADOS_ACTIVIDAD, TIPOS_TITULAR,
  UMBRAL_EXAMEN, APROBADO_MIN,
  sbCrearActividad, sbGetActividad, sbListActividades, sbUpdateActividad, sbIncrementActividadStats,
  sbGetColaborador, sbCrearColaborador, sbUpdateColaborador,
  sbGetPuntos, sbUpsertPuntos, sbCanjearPuntos, sbCanjearPuntosRojos,
  sbCrearDiploma, sbListDiplomas, normalizarActividad, esDipDemo, esActividadPublica
} from '../config/junior-actividades.js';
import { TABLA_CANJE_PUNTOS_VERDES, TABLA_CANJE_PUNTOS_ROJOS, desglosarPrecioConIva, getTablaCanje, PUNTOS_ROJOS_POR_INTENTO } from '../config/junior-precios.js';
import {
  sbCrearBundle, sbGetBundle, sbListBundles, sbUpdateBundle, sbDeleteBundle,
  sbSetBundleItems, sbGetBundleItems, sbGetBundlesConActividad,
  sbAddUserBundle, sbHasUserBundle, sbAddUserActivity, sbHasUserActivity,
  comprobarAccesoActividad, entregarBundleEarlyAccess
} from '../config/junior-bundles.js';
import { ejecutarCode, evaluarCode, bloquesPermitidos, obtenerEjercicios, BLOQUES_CODE } from '../config/junior-code.js';
import { saveDocumentoAsync, generarPDF, getDocumentoByIdAsync, ETIQUETAS_DOC } from '../config/documentos.js';

const router = Router();
const CAPITALIA = 'CAPITALIA_BANK'; // cuenta empresarial que abona IVA y gestiona cobros
const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
const PLACETAID_KEY = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';
const EDAD_MIN_PUBLICAR = 18;

// ── Registro RSP ───────────────────────────────────────────────────────
function rspRegistrar(tipo, endpoint, usuario = '', dip = '') {
  setImmediate(() => {
    try {
      registrarConexion({ entidad: 'junior', tipo, endpoint: `[Academia] ${endpoint}`, usuario: usuario || 'junior-api', dip: dip || '', detalle: 'Academia Placeta Junior' });
    } catch (e) { /* silencioso */ }
  });
}

// ── Verificación de junior ─────────────────────────────────────────────
async function verificarJunior(req, res, next) {
  const dip = req.query.dip || req.body?.dip || req.headers['x-junior-dip'];
  if (!dip) return res.status(401).json({ error: 'No autorizado. Debes iniciar sesión.' });
  try {
    const junior = await sbFindJuniorByDip(dip);
    if (!junior) return res.status(401).json({ error: 'Perfil no encontrado.' });
    req.juniorDip = dip;
    req.juniorId = junior.id;
    req.juniorData = junior;
    next();
  } catch (e) { res.status(500).json({ error: 'Error verificando identidad.' }); }
}

// ── Calcular edad a partir de fecha de nacimiento ──────────────────────
function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento);
  if (isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

// ── Enviar documento a PlacetaID para firma (sistema de documentos oficiales) ──
async function enviarAPlacetaID(docId, titulo, tipo, entidad, csv, dip, hash) {
  try {
    const resp = await fetch(`${PLACETAID_API}/admin/documentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PLACETAID_KEY },
      body: JSON.stringify({
        id: docId, titulo, tipo, entidad, csv,
        destinatariosDIP: dip ? [dip] : [],
        contenido: `Documento oficial de ${entidad}: ${titulo}. Firme desde PlacetaID Móvil.\n\nCSV: ${csv}\nHash: ${hash?.slice(0, 16)}`
      }),
      signal: AbortSignal.timeout(8000)
    });
    return resp.ok;
  } catch (err) { console.warn('[Academia] PlacetaID offline:', err.message); return false; }
}

// ═══════════════════════════════════════════════════════════════════════
//  ACUERDO DE COLABORADOR — mayor de 18, firma vía PlacetaID
//  Usa el SISTEMA DE DOCUMENTOS OFICIALES de admin-placeta (no uno específico)
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /junior/colaborador/solicitar
 * Body: { dip, tipo_titular?, eip?, nombre_entidad? }
 * - Verifica que el solicitante es mayor de 18 (solicitantes)
 * - Crea un documento oficial tipo "acuerdo-colaborador" (sistema de documentos)
 * - Lo envía a PlacetaID Móvil para firma
 */
router.post('/junior/colaborador/solicitar', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/colaborador/solicitar', '', req.juniorDip);
  try {
    const { dip, tipo_titular = 'profesor', eip, nombre_entidad } = req.body;
    const junior = req.juniorData;

    // Verificar mayoría de edad: si es junior (<16) no puede. Buscar al solicitante adulto por DIP.
    const solicitante = await sbFindSolicitanteByDip(dip);
    const edad = solicitante?.fecha_nacimiento ? calcularEdad(solicitante.fecha_nacimiento)
      : (junior?.fecha_nacimiento ? calcularEdad(junior.fecha_nacimiento) : null);

    if (edad !== null && edad < EDAD_MIN_PUBLICAR) {
      return res.status(403).json({
        error: `Debes ser mayor de ${EDAD_MIN_PUBLICAR} años para publicar contenido en la Academia. Tu edad registrada: ${edad} años.`,
        edad_registrada: edad, edad_minima: EDAD_MIN_PUBLICAR
      });
    }

    // Verificar que no exista ya un acuerdo firmado
    const existente = await sbGetColaborador(dip);
    if (existente?.firmado) {
      return res.json({ success: true, ya_firmado: true, colaborador: existente, mensaje: 'Ya eres colaborador verificado de Placeta Junior.' });
    }

    // Crear documento oficial (sistema de documentos)
    const docId = `colab-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const hash = createHash('sha256').update(docId + Date.now()).digest('hex');
    const csv = hash.slice(0, 20).toUpperCase();

    const clausulas = [
      '1. El colaborador declara ser mayor de 18 años y tener plena capacidad legal.',
      '2. Las actividades creadas pasarán por el Filtro de Placeta Junior antes de publicarse.',
      '3. Placeta Junior tiene la decisión final sobre aprobación, rechazo, modificaciones, precio y recompensa.',
      '4. El colaborador recibirá un porcentaje de los ingresos según su tipo de titularidad.',
      '5. Todo el contenido debe ser original y no infringir derechos de autor.',
      '6. El contenido debe ser adecuado por edades y cumplir la normativa de La Placeta.',
      '7. Placeta Junior puede retirar contenido que incumpla las condiciones.'
    ];

    const doc = await saveDocumentoAsync('junior', {
      id: docId,
      tipo: 'acuerdo-colaborador',
      titulo: 'Acuerdo de Colaborador — Academia Placeta Junior',
      descripcion: `Acuerdo legal para publicar contenido educativo. Colaborador: ${dip} (${junior.nombre || ''} ${junior.apellidos || ''})`,
      datos: {
        dip, csv, hash,
        colaborador_nombre: `${junior.nombre || ''} ${junior.apellidos || ''}`.trim(),
        tipo_titular, eip: eip || null, nombre_entidad: nombre_entidad || null,
        clausulas,
        creadoPor: dip, fechaCreacion: new Date().toISOString(),
        estado: 'pendiente_firma_colaborador'
      },
      createdBy: dip, estado: 'pendiente-firma', firmado: false, hash, csv
    });

    // Enviar a PlacetaID para firma
    const envioPlacetaID = await enviarAPlacetaID(docId, doc.titulo, 'acuerdo-colaborador', 'junior', csv, dip, hash);

    // Registrar el colaborador pendiente de firma
    await sbCrearColaborador({
      dip, nombre: `${junior.nombre || ''} ${junior.apellidos || ''}`.trim(),
      tipo_titular, eip: eip || null, nombre_entidad: nombre_entidad || null,
      documento_id: docId, csv, firmado: false, estado: 'pendiente_firma',
      creado_en: new Date().toISOString()
    });

    await sbCreateJuniorLog({
      junior_id: junior.id, accion: 'acuerdo_colaborador_solicitado',
      detalle: `Solicitud de acuerdo de colaborador (${tipo_titular}). Documento ${docId}. Edad: ${edad}`, ip: req.headers['x-forwarded-for']?.split(',')[0] || 'unknown'
    });

    res.json({
      success: true,
      documento: { id: docId, titulo: doc.titulo, csv, estado: 'pendiente-firma' },
      placetaid: envioPlacetaID,
      mensaje: envioPlacetaID
        ? '✅ Acuerdo de colaborador enviado a PlacetaID Móvil para tu firma (mayoría de edad verificada).'
        : '⚠️ Acuerdo creado. Conéctate a PlacetaID Móvil para firmarlo.'
    });
  } catch (err) {
    console.error('[Academia] Error acuerdo colaborador:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /junior/colaborador/estado/:dip — Estado del acuerdo de colaborador
 */
router.get('/junior/colaborador/estado/:dip', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/colaborador/estado/:dip');
  try {
    const colaborador = await sbGetColaborador(req.params.dip);
    if (!colaborador) return res.json({ success: true, colaborador: null, firmado: false });

    // Si el documento se firmó en PlacetaID, actualizar estado
    if (!colaborador.firmado && colaborador.documento_id) {
      const doc = await getDocumentoByIdAsync('junior', colaborador.documento_id).catch(() => null);
      if (doc?.firmado || doc?.estado === 'firmado') {
        await sbUpdateColaborador(req.params.dip, { firmado: true, estado: 'activo', fecha_firma: doc.datos?.fechaFirma || new Date().toISOString() });
        colaborador.firmado = true;
        colaborador.estado = 'activo';
      }
    }

    res.json({ success: true, colaborador, firmado: colaborador.firmado === true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
//  ACTIVIDADES — catálogo (Studio → Filtro → Publicación)
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /junior/actividades — Crear actividad
 * Titularidad (spec §7): entidad_eip (EIP) | profesor (18+ con acuerdo) | interno (anónimo, todo va a junior)
 * Body: { tipo_titular, dip?, eip?, nombre_entidad?, titulo, descripcion, categoria,
 *         edad_recomendada, dificultad, tiempo_estimado, tipo, contenido, num_preguntas, num_fases, portada_url }
 */
router.post('/junior/actividades', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/actividades', '', req.body?.dip || '');
  try {
    const {
      tipo_titular = TIPOS_TITULAR.INTERNO, dip, eip, nombre_entidad, nombre_autor,
      titulo, descripcion, categoria, edad_recomendada, dificultad, tiempo_estimado,
      tipo, contenido, num_preguntas, num_fases, portada_url, pictograma,
      precio_licencia, precio_intento, recompensa, subvencionada, destacada
    } = req.body;

    if (!titulo || !descripcion || !categoria) {
      return res.status(400).json({ error: 'Título, descripción y categoría son obligatorios' });
    }
    if (!TIPOS_ACTIVIDAD.includes(tipo)) {
      return res.status(400).json({ error: `Tipo de actividad no válido. Válidos: ${TIPOS_ACTIVIDAD.join(', ')}` });
    }

    // ── Precio / recompensa ─────────────────────────────────────────
    // El Studio/DevAI pueden enviarlos en el body, o dentro del propio
    // JSON de la actividad (claves raíz precio_licencia, etc.). Se leen
    // de ambos sitios para no perderlos al guardar "código nuevo".
    let c = contenido;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = {}; } }
    const precioLicencia = precio_licencia != null ? Number(precio_licencia)
      : (c && c.precio_licencia != null ? Number(c.precio_licencia) : 0);
    const precioIntento = precio_intento != null ? Number(precio_intento)
      : (c && c.precio_intento != null ? Number(c.precio_intento) : 0);
    const recompensaFinal = recompensa != null ? Number(recompensa)
      : (c && c.recompensa != null ? Number(c.recompensa) : 0);
    const subvencionadaFinal = subvencionada != null ? (subvencionada === true || subvencionada === 'true' || subvencionada === 'on')
      : !!(c && c.subvencionada);
    const destacadaFinal = destacada != null ? (destacada === true || destacada === 'true' || destacada === 'on')
      : !!(c && c.destacada);

    // ── Autor / titularidad ──────────────────────────────────────────
    let autorDip = null;
    let autorNombre = 'Placeta Junior';
    let eipFinal = null;
    let entidadNombre = null;
    let titular = TIPOS_TITULAR.INTERNO; // anónimo → todo va a junior

    if (tipo_titular === TIPOS_TITULAR.EIP) {
      if (!eip) return res.status(400).json({ error: 'Indica el código EIP de la entidad.' });
      titular = TIPOS_TITULAR.EIP;
      eipFinal = eip;
      entidadNombre = nombre_entidad || `EIP ${eip}`;
      autorNombre = entidadNombre;
      autorDip = dip || null; // opcional: quién sube el contenido
    } else if (tipo_titular === TIPOS_TITULAR.PROFESOR) {
      // Los profesores se registran con Google u otro proveedor (sin DIP)
      titular = TIPOS_TITULAR.PROFESOR;
      autorNombre = nombre_autor || 'Profesor de Placeta Junior';
      if (dip) {
        // Si se identifica con DIP y tiene acuerdo firmado, se usa su perfil
        const colaborador = await sbGetColaborador(dip);
        if (colaborador?.firmado) {
          autorDip = dip;
          autorNombre = colaborador.nombre || autorNombre;
          eipFinal = colaborador.eip || null;
          entidadNombre = colaborador.nombre_entidad || null;
        }
      }
    }
    // else → anónimo / interno (Placeta Junior)

    const nPreguntas = Number(num_preguntas) || 0;
    const nFases = Number(num_fases) || 1;
    const esExamen = nPreguntas > UMBRAL_EXAMEN; // >10 preguntas = examen (spec §11)

    // Limpia del contenido las claves económicas (viven en columnas propias,
    // no dentro del JSON de bloques) para no duplicarlas ni romper el formato.
    if (c && typeof c === 'object') {
      delete c.precio_licencia; delete c.precio_intento; delete c.recompensa;
      delete c.subvencionada; delete c.destacada;
    }

    const actividad = await sbCrearActividad({
      id: `act-${Date.now()}-${randomUUID().slice(0, 6)}`,
      titulo, descripcion, categoria, tipo,
      edad_recomendada: edad_recomendada || '6-12',
      dificultad: dificultad || 'media',
      tiempo_estimado: tiempo_estimado || 10,
      num_preguntas: nPreguntas, num_fases: nFases,
      es_examen: esExamen,
      contenido: pictograma ? { ...(c || {}), pictograma } : (c || {}),
      autor_dip: autorDip,
      autor_nombre: autorNombre,
      tipo_titular: titular,
      eip: eipFinal,
      nombre_entidad: entidadNombre,
      estado: 'en_revision',          // → Filtro de Placeta Junior
      publica: false,
      precio_licencia: precioLicencia,
      precio_intento: precioIntento,
      recompensa: recompensaFinal,
      subvencionada: subvencionadaFinal,
      destacada: destacadaFinal,
      portada_url: portada_url || null,
      estadisticas: { veces_realizada: 0, aprobados: 0 },
      creado_en: new Date().toISOString()
    });

    // Log si hay junior identificado (opcional)
    if (autorDip) {
      const junior = await sbFindJuniorByDip(autorDip).catch(() => null);
      if (junior?.id) {
        await sbCreateJuniorLog({
          junior_id: junior.id, accion: 'actividad_creada',
          detalle: `Actividad "${titulo}" (${tipo}) enviada a revisión. Titular: ${titular}. Examen: ${esExamen}`, ip: req.headers['x-forwarded-for']?.split(',')[0] || 'unknown'
        });
      }
    }

    res.json({
      success: true,
      actividad: normalizarActividad(actividad),
      mensaje: esExamen
        ? '✅ Actividad creada. Por tener más de 10 preguntas se tratará como EXAMEN (genera diploma).'
        : '✅ Actividad creada y enviada al Filtro de Placeta Junior para revisión.'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /junior/actividades — Listar actividades (aprobadas = públicas)
 */
router.get('/junior/actividades', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/actividades');
  try {
    const { estado, categoria, solo_publicas = '1', dip } = req.query;
    // El DIP demo (16381756J) puede ver además las actividades "en revisión"
    // para probarlas antes de su publicación; el resto solo ve publicadas.
    const esDemo = esDipDemo(dip);
    const actividades = await sbListActividades({
      estado: esDemo ? undefined : (estado || (solo_publicas === '1' ? 'aprobada' : undefined)),
      estados: esDemo ? ['aprobada', 'en_revision'] : undefined,
      categoria,
      soloPublicas: esDemo ? false : solo_publicas === '1'
    });
    res.json({ success: true, total: actividades.length, actividades });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /junior/actividades/:id — Detalle de una actividad
 * Las actividades "en revisión" (aún no publicadas) solo las puede ver
 * el DIP demo (16381756J); el resto recibe 404.
 */
router.get('/junior/actividades/:id', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, `GET /junior/actividades/:id`);
  try {
    const actividad = await sbGetActividad(req.params.id);
    if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada' });
    const esDemo = esDipDemo(req.query.dip);
    if (!esActividadPublica(actividad) && !esDemo) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }
    res.json({ success: true, actividad });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /junior/actividades/:id/revisar — FILTRO de Placeta Junior (admin)
 * Body: { accion: 'aprobar'|'rechazar'|'modificaciones', adminDip, precio_licencia?, precio_intento?, recompensa?, motivo? }
 */
router.post('/junior/actividades/:id/revisar', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, `POST /junior/actividades/:id/revisar`);
  try {
    const { accion, adminDip, precio_licencia, precio_intento, recompensa, motivo, destacada, subvencionada } = req.body;
    const actividad = await sbGetActividad(req.params.id);
    if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada' });

    if (!['aprobar', 'rechazar', 'modificaciones'].includes(accion)) {
      return res.status(400).json({ error: 'Acción no válida. Usa: aprobar, rechazar, modificaciones' });
    }

    const cambios = { revisado_por: adminDip || 'sistema', fecha_revision: new Date().toISOString(), motivo_revision: motivo || '' };

    if (accion === 'aprobar') {
      cambios.estado = 'aprobada';
      cambios.publica = true;
      // El Filtro fija precio definitivo y recompensa (spec §6)
      if (precio_licencia != null) cambios.precio_licencia = Number(precio_licencia);
      if (precio_intento != null) cambios.precio_intento = Number(precio_intento);
      if (recompensa != null) cambios.recompensa = Number(recompensa);
      // Destacada (carrusel de la web)
      if (destacada != null) cambios.destacada = Boolean(destacada);
      // Subvencionada: de pago cubierta por el Fondo Público de Acceso
      if (subvencionada != null) cambios.subvencionada = Boolean(subvencionada);
    } else if (accion === 'rechazar') {
      cambios.estado = 'rechazada';
      cambios.publica = false;
    } else {
      cambios.estado = 'modificaciones';
      cambios.publica = false;
    }

    const ok = await sbUpdateActividad(req.params.id, cambios);
    res.json({ success: ok, estado: cambios.estado, mensaje: `Actividad ${cambios.estado}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
//  ACCESO PREMIUM — pago por licencia o por intento (spec §6, §10)
//  · Licencia: se paga una vez y la actividad queda desbloqueada (junior_licencias)
//  · Intento: se paga cada intento antes de jugar
//  El pago es real (Banco de La Placeta, junior → CAPITALIA) con IVA incluido.
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /junior/actividades/:id/acceso?dip= — Comprobar si el junior puede jugar
 * Prioridad: gratuita → admin → individual → bundle → bloqueada (spec bundles).
 */
router.get('/junior/actividades/:id/acceso', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, `GET /junior/actividades/:id/acceso`);
  try {
    const dip = String(req.query.dip || '').trim();
    // Actividad en revisión: solo accesible para el DIP demo.
    const act = await sbGetActividad(req.params.id);
    if (!act) return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
    if (!esActividadPublica(act) && !esDipDemo(dip)) {
      return res.status(404).json({ success: false, error: 'Actividad no encontrada' });
    }
    const resultado = await comprobarAccesoActividad(req.params.id, dip);
    if (!resultado.success) {
      return res.status(404).json(resultado);
    }
    res.json(resultado);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /junior/actividades/:id/pagar — Pagar licencia o un intento
 * Body: { dip, modo: 'licencia' | 'intento' }
 */
router.post('/junior/actividades/:id/pagar', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, `POST /junior/actividades/:id/pagar`, '', req.juniorDip);
  try {
    const junior = req.juniorData;
    const act = await sbGetActividad(req.params.id);
    if (!act) return res.status(404).json({ error: 'Actividad no encontrada' });
    if (!esActividadPublica(act) && !esDipDemo(req.juniorDip)) {
      return res.status(403).json({ error: 'Actividad no publicada.' });
    }
    const modo = req.body?.modo === 'intento' ? 'intento' : 'licencia';

    const esGratis = !((act.precio_licencia || 0) > 0 || (act.precio_intento || 0) > 0);
    const subvencionada = !!act.subvencionada;
    if (esGratis || subvencionada) {
      return res.json({ success: true, desbloqueada: true, mensaje: 'Acceso gratuito o subvencionado. ¡A jugar!' });
    }

    // Licencia ya comprada → no volver a cobrar
    if (modo === 'licencia') {
      let ya = null;
      try {
        ya = await supabase.from('junior_licencias')
          .select('id').eq('junior_id', junior.id).eq('actividad_id', act.id).maybeSingle();
      } catch (e) { ya = { data: null }; }
      if (ya?.data) return res.json({ success: true, desbloqueada: true, licencia: true, mensaje: 'Ya tienes la licencia de esta actividad.' });
    }

    const precio = modo === 'licencia' ? (act.precio_licencia || 0) : (act.precio_intento || 0);
    if (precio <= 0) return res.json({ success: true, desbloqueada: true, mensaje: 'Sin coste.' });

    const saldo = junior.placetas_saldo || 0;
    if (saldo < precio) {
      return res.status(400).json({ error: `Saldo insuficiente (tienes ${saldo} Pz) para pagar ${precio} Pz.` });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const desg = desglosarPrecioConIva(precio);

    // Movimiento real: cuenta del junior → CAPITALIA (con IVA incluido)
    try {
      await apiBancoPost('transferir', {
        from: junior.cuenta_banco || junior.dip,
        to: CAPITALIA,
        cantidad: precio,
        concepto: `Pago ${modo} — ${act.titulo}`,
        juniorDip: junior.dip, tutorDip: junior.tutor_dip, ip
      });
    } catch (e) { console.warn('[Pagar Premium] Banco:', e.message); }

    const nuevoSaldo = saldo - precio;
    await sbUpdatePlacetaBalance(junior.id, nuevoSaldo);
    await sbCreatePlacetaTransaction({
      junior_id: junior.id, tipo: 'gastar',
      concepto: `Pago ${modo === 'licencia' ? 'licencia' : 'intento'} — ${act.titulo}`,
      cantidad: -precio, saldo_resultante: nuevoSaldo, ip
    });
    await sbCreateJuniorLog({
      junior_id: junior.id, accion: 'pago_premium',
      detalle: `Pago ${modo} de ${precio} Pz (IVA ${desg.iva} Pz) — ${act.titulo}`, ip
    }).catch(() => {});

    if (modo === 'licencia') {
      try {
        await supabase.from('junior_licencias')
          .upsert({ junior_id: junior.id, actividad_id: act.id }, { onConflict: 'junior_id,actividad_id' });
      } catch (e) { /* la licencia ya existe o la tabla aún no está creada */ }
    }

    // Puntos rojos por intento: cada intento PAGADO de una actividad de pago
    // por intento otorga puntos rojos (canjeables por Placetas).
    let puntosRojosGanados = 0;
    if (modo === 'intento') {
      puntosRojosGanados = PUNTOS_ROJOS_POR_INTENTO || 1;
      await sbUpsertPuntos(junior.id, { rojos: puntosRojosGanados });
    }

    res.json({
      success: true, modo, precio, desbloqueada: modo === 'licencia',
      saldo_actual: nuevoSaldo, puntos_rojos_ganados: puntosRojosGanados,
      mensaje: modo === 'licencia'
        ? `Licencia comprada por ${precio} Pz (IVA incluido). ¡Ya puedes jugar!`
        : `Pago realizado (${precio} Pz). ¡A jugar este intento!`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
//  BUNDLES — sistema genérico de packs de actividades
//  · Listar, ver detalle (con actividades), comprar bundle y desbloquear
//    actividad individualmente. Reutilizable para cualquier temática.
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /junior/bundles — Listar bundles (activos para el público)
 */
router.get('/junior/bundles', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/bundles');
  try {
    const bundles = await sbListBundles({ soloActivos: true });
    res.json({ success: true, total: bundles.length, bundles });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /junior/bundles/:id — Detalle de un bundle con sus actividades
 */
router.get('/junior/bundles/:id', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, `GET /junior/bundles/:id`);
  try {
    const bundle = await sbGetBundle(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Bundle no encontrado' });
    const ids = await sbGetBundleItems(bundle.id);
    const esDemo = esDipDemo(req.query.dip);
    const actividades = [];
    for (const id of ids) {
      const a = await sbGetActividad(id);
      // Las actividades en revisión solo se incluyen para el DIP demo.
      if (a && (esActividadPublica(a) || esDemo)) actividades.push(a);
    }
    res.json({ success: true, bundle, actividades });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /junior/bundles/:id/comprar — Comprar un bundle con Placetas
 * Body: { dip }
 * Desbloquea todas las actividades del bundle (origen: bundle).
 */
router.post('/junior/bundles/:id/comprar', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, `POST /junior/bundles/:id/comprar`, '', req.juniorDip);
  try {
    const junior = req.juniorData;
    const bundle = await sbGetBundle(req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Bundle no encontrado' });
    if (bundle.activo === false) return res.status(400).json({ error: 'Bundle no disponible' });

    const yaTiene = await sbHasUserBundle(junior.id, bundle.id);
    if (yaTiene) {
      return res.json({ success: true, ya_tenia: true, mensaje: `Ya tienes el bundle "${bundle.nombre}".` });
    }

    const precio = bundle.precio || 0;
    const saldo = junior.placetas_saldo || 0;
    if (saldo < precio) {
      return res.status(400).json({ error: `Saldo insuficiente (tienes ${saldo} Pz) para el bundle de ${precio} Pz.` });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (precio > 0) {
      try {
        await apiBancoPost('transferir', {
          from: junior.cuenta_banco || junior.dip, to: CAPITALIA, cantidad: precio,
          concepto: `Bundle — ${bundle.nombre}`, juniorDip: junior.dip, tutorDip: junior.tutor_dip, ip
        });
      } catch (e) { console.warn('[Bundle] Banco:', e.message); }
      const nuevoSaldo = saldo - precio;
      await sbUpdatePlacetaBalance(junior.id, nuevoSaldo);
      await sbCreatePlacetaTransaction({
        junior_id: junior.id, tipo: 'gastar',
        concepto: `Bundle — ${bundle.nombre}`, cantidad: -precio, saldo_resultante: nuevoSaldo, ip
      });
    }

    await sbAddUserBundle(junior.id, bundle.id, { precioPagado: precio, origen: 'bundle' });

    // Desbloquea cada actividad del bundle (origen: bundle) para acceso directo
    const ids = await sbGetBundleItems(bundle.id);
    for (const actividadId of ids) {
      await sbAddUserActivity(junior.id, actividadId, { origen: 'bundle' }).catch(() => {});
    }

    await sbCreateJuniorLog({
      junior_id: junior.id, accion: 'bundle_comprado',
      detalle: `Bundle "${bundle.nombre}" por ${precio} Pz (${ids.length} actividades)`, ip
    }).catch(() => {});

    res.json({
      success: true, bundle_id: bundle.id, bundle_nombre: bundle.nombre,
      actividades_desbloqueadas: ids.length, precio_pagado: precio,
      mensaje: `🎁 Bundle "${bundle.nombre}" desbloqueado (${ids.length} actividades).`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /junior/actividades/:id/desbloquear — Comprar una actividad individual
 * Body: { dip }
 * Precio individual = precio_licencia de la actividad (20 Pz por defecto).
 */
router.post('/junior/actividades/:id/desbloquear', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, `POST /junior/actividades/:id/desbloquear`, '', req.juniorDip);
  try {
    const junior = req.juniorData;
    const act = await sbGetActividad(req.params.id);
    if (!act) return res.status(404).json({ error: 'Actividad no encontrada' });
    if (!esActividadPublica(act) && !esDipDemo(req.juniorDip)) {
      return res.status(403).json({ error: 'Actividad no publicada.' });
    }

    const esGratis = !((act.precio_licencia || 0) > 0 || (act.precio_intento || 0) > 0);
    if (esGratis || !!act.subvencionada) {
      await sbAddUserActivity(junior.id, act.id, { origen: 'gratuito' }).catch(() => {});
      return res.json({ success: true, desbloqueada: true, mensaje: 'Actividad gratuita.' });
    }

    const yaTiene = await sbHasUserActivity(junior.id, act.id).catch(() => false)
      || await supabase.from('junior_licencias').select('id').eq('junior_id', junior.id).eq('actividad_id', act.id).maybeSingle().then(r => !!r?.data).catch(() => false);
    if (yaTiene) {
      return res.json({ success: true, desbloqueada: true, mensaje: 'Ya tienes esta actividad.' });
    }

    const precio = act.precio_licencia || 0;
    if (precio <= 0) {
      await sbAddUserActivity(junior.id, act.id, { origen: 'gratuito' }).catch(() => {});
      return res.json({ success: true, desbloqueada: true, mensaje: 'Sin coste.' });
    }

    const saldo = junior.placetas_saldo || 0;
    if (saldo < precio) {
      return res.status(400).json({ error: `Saldo insuficiente (tienes ${saldo} Pz) para desbloquear (${precio} Pz).` });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    try {
      await apiBancoPost('transferir', {
        from: junior.cuenta_banco || junior.dip, to: CAPITALIA, cantidad: precio,
        concepto: `Desbloquear — ${act.titulo}`, juniorDip: junior.dip, tutorDip: junior.tutor_dip, ip
      });
    } catch (e) { console.warn('[Desbloquear] Banco:', e.message); }
    const nuevoSaldo = saldo - precio;
    await sbUpdatePlacetaBalance(junior.id, nuevoSaldo);
    await sbCreatePlacetaTransaction({
      junior_id: junior.id, tipo: 'gastar',
      concepto: `Desbloquear — ${act.titulo}`, cantidad: -precio, saldo_resultante: nuevoSaldo, ip
    });
    await sbAddUserActivity(junior.id, act.id, { origen: 'individual' });
    await sbCreateJuniorLog({
      junior_id: junior.id, accion: 'actividad_desbloqueada',
      detalle: `Desbloqueada "${act.titulo}" por ${precio} Pz`, ip
    }).catch(() => {});

    res.json({
      success: true, desbloqueada: true, actividad_id: act.id,
      precio_pagado: precio, saldo_actual: nuevoSaldo,
      mensaje: `🔓 Actividad desbloqueada por ${precio} Pz. ¡A jugar!`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
//  PLACETA JUNIOR CODE — evaluación de programas de bloques (code_blocks)
//  El motor valida y ejecuta en un escenario controlado (sin código
//  arbitrario del alumno en el servidor).
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /junior/code/evaluar
 * Body: { dip, actividad_id, ejercicio?, programa: [...bloques] }
 * Ejecuta el programa en el escenario del ejercicio indicado y evalúa.
 * La actividad code_blocks puede tener varios ejercicios progresivos;
 * la recompensa se otorga al superar el ÚLTIMO ejercicio (actividad completa).
 */
router.post('/junior/code/evaluar', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/code/evaluar', '', req.juniorDip);
  try {
    const junior = req.juniorData;
    const { actividad_id, programa = [], ejercicio = 0 } = req.body;
    if (!actividad_id) return res.status(400).json({ error: 'actividad_id requerido' });

    const actividad = await sbGetActividad(actividad_id);
    if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada' });
    if (actividad.tipo !== 'code_blocks') {
      return res.status(400).json({ error: 'La actividad no es de tipo code_blocks.' });
    }
    // El DIP demo puede probar actividades en revisión; el resto no.
    if (!esActividadPublica(actividad) && !esDipDemo(req.juniorDip)) {
      return res.status(403).json({ error: 'Actividad no publicada.' });
    }

    // Comprobación de acceso (gratuita / admin / individual / bundle)
    const acceso = await comprobarAccesoActividad(actividad.id, req.juniorDip);
    if (acceso.success && !acceso.desbloqueada) {
      return res.status(403).json({
        error: 'Actividad bloqueada. Desbloquéala o compra el bundle.',
        bloqueada: true, motivo: acceso.motivo,
        precio_licencia: acceso.precio_licencia || 0,
        bundles: acceso.bundles || []
      });
    }

    const contenido = actividad.contenido || {};
    const ejercicios = obtenerEjercicios(contenido);
    const totalEjercicios = ejercicios.length;
    const ejIdx = Math.min(Math.max(Number(ejercicio) || 0, 0), totalEjercicios - 1);
    const ej = ejercicios[ejIdx] || {};
    const escenario = ej.escenario || { tipo: 'cuadricula', ancho: 6, alto: 6 };
    const inicio = ej.inicio || { x: 0, y: 0, direccion: 'derecha' };
    const objetivo = ej.objetivo || {};
    const esUltimo = ejIdx === totalEjercicios - 1;

    // Validar que solo usa bloques permitidos (los del ejercicio)
    const permitidos = bloquesPermitidos(actividad, ejIdx);
    const usados = new Set();
    (function recorrer(prog) {
      (prog || []).forEach(b => {
        const op = typeof b === 'string' ? b.split(/\s+/)[0] : (b.op || b.tipo || 'avanzar');
        usados.add(op);
        if (b && typeof b === 'object' && b.bloques) recorrer(b.bloques);
      });
    })(programa);
    const noPermitidos = [...usados].filter(op => !permitidos.includes(op));
    if (noPermitidos.length) {
      return res.status(400).json({ error: `Bloque(s) no permitidos: ${noPermitidos.join(', ')}`, bloques_permitidos: permitidos });
    }

    // Ejecutar en el sandbox
    const maxPasos = ej.max_bloques ? ej.max_bloques * 20 : 200;
    const resultado = ejecutarCode(escenario, inicio, programa, { maxPasos });
    const evalRes = evaluarCode(escenario, inicio, objetivo, programa, resultado);

    // Registrar puntos verdes/rojos si hay junior (best effort)
    await sbUpsertPuntos(junior.id, { verdes: evalRes.superado ? 1 : 0, rojos: evalRes.superado ? 0 : 1 }).catch(() => {});
    await sbIncrementActividadStats(actividad.id, { veces: 1, aprobados: evalRes.superado ? 1 : 0 }).catch(() => {});

    // ── Recompensa (Placetas) al superar el ÚLTIMO ejercicio ────────
    let placetasGanadas = 0;
    let nuevoSaldo = junior.placetas_saldo || 0;
    const recompensaCode = (contenido.recompensa && contenido.recompensa.activa) ? contenido.recompensa : null;
    const placetasReto = recompensaCode ? (Number(recompensaCode.placetas) || 0) : (Number(actividad.recompensa) || 0);
    if (evalRes.superado && esUltimo && placetasReto > 0) {
      const yaSuperado = await sbHasUserActivity(junior.id, actividad.id).catch(() => false);
      if (!yaSuperado) {
        nuevoSaldo += placetasReto;
        await sbUpdatePlacetaBalance(junior.id, nuevoSaldo).catch(() => {});
        await sbCreatePlacetaTransaction({
          junior_id: junior.id, tipo: 'ganar',
          concepto: `Code: ${actividad.titulo}`,
          cantidad: placetasReto, saldo_resultante: nuevoSaldo,
          ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
        }).catch(() => {});
        placetasGanadas = placetasReto;
        // Marca como realizada para no repetir la recompensa
        await sbAddUserActivity(junior.id, actividad.id, { origen: 'individual' }).catch(() => {});
      }
    }

    res.json({
      success: true,
      superado: evalRes.superado,
      fallos: evalRes.fallos,
      ejercicio: ejIdx,
      total_ejercicios: totalEjercicios,
      es_ultimo: esUltimo,
      ejercicio_titulo: ej.titulo || `Ejercicio ${ejIdx + 1}`,
      ejercicio_explicacion: ej.explicacion || '',
      resultado: {
        posicion_final: resultado.posicion_final,
        direccion_final: resultado.direccion_final,
        monedas_recogidas: resultado.monedas_recogidas,
        pasos: resultado.pasos,
        error: resultado.error,
        trazado: resultado.trazado || null
      },
      bloques_permitidos: permitidos,
      placetas_ganadas: placetasGanadas,
      saldo_actual: nuevoSaldo,
      recompensa: recompensaCode || { activa: false, placetas: 0, puntos_verdes: 0, puntos_rojos: 0 },
      mensaje: evalRes.superado
        ? (esUltimo
            ? (placetasGanadas > 0 ? `🎉 ¡Actividad completada! +${placetasGanadas} Pz.` : '🎉 ¡Actividad completada! Has superado todos los retos.')
            : '🎉 ¡Reto superado! Sigue al siguiente ejercicio.')
        : '💪 Casi… revisa el programa y vuelve a intentarlo.'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
//  REALIZAR ACTIVIDAD — evaluación, puntos verdes/rojos, placetas, diploma
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /junior/actividades/:id/realizar
 * Body: { dip, respuestas: [{ idx, correcta }], pago_licencia? }
 */
router.post('/junior/actividades/:id/realizar', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, `POST /junior/actividades/:id/realizar`, '', req.juniorDip);
  try {
    const junior = req.juniorData;
    const actividad = await sbGetActividad(req.params.id);
    if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada' });
    // El DIP demo puede probar actividades en revisión; el resto no.
    if (!esActividadPublica(actividad) && !esDipDemo(req.juniorDip)) {
      return res.status(403).json({ error: 'Actividad no publicada.' });
    }

    // Comprobación de acceso: gratuita / admin / individual / bundle
    const acceso = await comprobarAccesoActividad(actividad.id, req.juniorDip);
    if (acceso.success && !acceso.desbloqueada) {
      return res.status(403).json({
        error: 'Actividad bloqueada. Desbloquéala o compra el bundle.',
        bloqueada: true, motivo: acceso.motivo,
        precio_licencia: acceso.precio_licencia || 0,
        bundles: acceso.bundles || []
      });
    }

    const { respuestas = [] } = req.body;
    const contenido = actividad.contenido || {};
    const preguntas = contenido.preguntas || [];
    const totalPreguntasBase = preguntas.length || actividad.num_preguntas || respuestas.length || 1;

    let aciertos = 0;
    let errores = 0;
    for (const r of respuestas) {
      if (r.correcta) aciertos++;
      else errores++;
    }
    const respondidas = respuestas.length;
    const totalPreguntas = Math.max(totalPreguntasBase, respondidas);
    const porcentaje = totalPreguntas > 0 ? Math.round((aciertos / totalPreguntas) * 100) : 0;
    const aprobado = porcentaje >= (actividad.es_examen ? APROBADO_MIN : 50);

    // ── RECOMPENSA PROPORCIONAL (spec §10) ──────────────────────────
    // `actividad.recompensa` es el MÁXIMO que puede ganar el junior. Según
    // su rendimiento (puntos verdes/aciertos vs puntos rojos/errores) recibe
    // ese máximo o una cantidad menor, ajustada a cada actividad.
    //   · Acierta todo (0 errores) → recompensa máxima.
    //   · Cada error descuenta la mitad de su peso sobre el máximo.
    //   · No aprobada → 0 Pz.
    const recompensaMax = actividad.recompensa || 0;
    const recompensaGanada = calcularRecompensa(recompensaMax, aciertos, errores, totalPreguntas, aprobado);
    let nuevoSaldo = junior.placetas_saldo || 0;
    if (aprobado && recompensaGanada > 0) {
      nuevoSaldo += recompensaGanada;
      await sbUpdatePlacetaBalance(junior.id, nuevoSaldo);
      await sbCreatePlacetaTransaction({
        junior_id: junior.id, tipo: 'ganar',
        concepto: `Actividad: ${actividad.titulo}`,
        cantidad: recompensaGanada, saldo_resultante: nuevoSaldo,
        ip: req.headers['x-forwarded-for']?.split(',')[0] || 'unknown'
      });
    }

    // Puntos Verdes / Rojos (spec §16, §17)
    await sbUpsertPuntos(junior.id, { verdes: aciertos, rojos: errores });

    // Estadísticas de la actividad
    await sbIncrementActividadStats(req.params.id, { veces: 1, aprobados: aprobado ? 1 : 0 });

    // Log
    await sbCreateJuniorLog({
      junior_id: junior.id, accion: 'actividad_realizada',
      detalle: `Actividad "${actividad.titulo}": ${aciertos}/${totalPreguntas} (${porcentaje}%). ${aprobado ? 'Aprobada' : 'No aprobada'}. Recompensa: +${recompensaGanada}/${recompensaMax} Pz`, ip: req.headers['x-forwarded-for']?.split(',')[0] || 'unknown'
    });

    // ── DIPLOMA: si es examen y aprobado (spec §11) ──────────────
    let diploma = null;
    if (actividad.es_examen && aprobado) {
      const reconocimiento = porcentaje === 100 ? 'Excelencia' : (porcentaje >= 90 ? 'Mención especial' : 'Diploma');
      const dipId = `dip-${Date.now()}-${randomUUID().slice(0, 6)}`;
      diploma = await sbCrearDiploma({
        id: dipId,
        junior_id: junior.id, junior_dip: junior.dip, junior_nombre: `${junior.nombre} ${junior.apellidos}`.trim(),
        actividad_id: actividad.id, actividad_titulo: actividad.titulo,
        resultado: porcentaje, reconocimiento, aprobado: true,
        fecha: new Date().toISOString(), identificador: csvIdentificador(),
        firma_digital: 'Placeta Junior — Firma digital oficial'
      });
    }

    res.json({
      success: true,
      aciertos, errores, total: totalPreguntas, porcentaje, aprobado,
      recompensa_max: recompensaMax,
      recompensa: recompensaGanada,
      placetas_ganadas: recompensaGanada,
      saldo_actual: nuevoSaldo,
      puntos: await sbGetPuntos(junior.id),
      es_examen: actividad.es_examen,
      diploma: diploma ? { id: diploma.id, reconocimiento: diploma.reconocimiento } : null,
      mensaje: diploma
        ? `🎓 ¡Examen aprobado! Reconocimiento: ${diploma.reconocimiento}. Diploma generado.`
        : (aprobado
            ? (recompensaGanada > 0
                ? `🎉 ¡Actividad superada! Recompensa: +${recompensaGanada} Pz (máximo ${recompensaMax} Pz).`
                : '🎉 ¡Actividad superada!')
            : '💪 Sigue practicando, los errores también enseñan.')
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Identificador único para diplomas (CSV oficial)
function csvIdentificador() {
  return createHash('sha256').update(Date.now() + randomUUID()).digest('hex').slice(0, 16).toUpperCase();
}

/**
 * Calcula la recompensa real que recibe el junior al completar una actividad.
 *
 * `recompensaMax` es el MÁXIMO configurado para esa actividad. Según el
 * rendimiento (puntos verdes = aciertos, puntos rojos = errores) se entrega
 * ese máximo o una cantidad proporcional menor:
 *
 *   · Acierta TODO (0 errores)  → recompensa máxima.
 *   · Con errores, cada fallo descuenta la mitad de su peso sobre el máximo:
 *       recompensa = max · (aciertos/total) − max · (errores/total)/2
 *   · No aprobada               → 0 Pz.
 *   · Redondeo al entero y nunca negativa ni por encima del máximo.
 */
function calcularRecompensa(recompensaMax, aciertos, errores, total, aprobado) {
  const max = Number(recompensaMax) || 0;
  if (max <= 0 || !aprobado || total <= 0) return 0;
  const proporcion = aciertos / total;                 // 0..1
  const penalizacion = (errores / total) * 0.5;        // los rojos descuentan la mitad de su peso
  const bruto = max * Math.max(0, proporcion - penalizacion);
  return Math.max(0, Math.min(max, Math.round(bruto)));
}

// ═══════════════════════════════════════════════════════════════════════
//  PUNTOS — consultar y canjear (spec §16)
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /junior/puntos/:dip — Puntos Verdes/Rojos del junior
 * De solo lectura: no exige perfil completo; si el DIP no está registrado
 * como junior devuelve el marcador a 0 y la tabla de canje (sin error).
 */
router.get('/junior/puntos/:dip', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/puntos/:dip', '', req.params.dip);
  try {
    const junior = await sbFindJuniorByDip(req.params.dip).catch(() => null);
    const juniorId = junior?.id || null;
    const puntos = await sbGetPuntos(juniorId);
    const [tablaV, tablaR] = await Promise.all([getTablaCanje('verdes'), getTablaCanje('rojos')]);
    res.json({ success: true, puntos, tabla_canje: tablaV, tabla_canje_rojos: tablaR });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /junior/puntos/canjear — Canjear Puntos Verdes por Placetas
 * Body: { dip, puntos_verdes } — usa la tabla de canje (spec §16)
 */
router.post('/junior/puntos/canjear', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/puntos/canjear', '', req.juniorDip);
  try {
    const junior = req.juniorData;
    const tipo = req.body?.tipo === 'rojos' ? 'rojos' : 'verdes';
    const cantidad = Math.floor(Number(req.body?.puntos_verdes ?? req.body?.puntos_rojos) || 0);
    const puntos = await sbGetPuntos(junior.id);

    const disponible = tipo === 'rojos' ? (puntos.puntos_rojos || 0) : (puntos.puntos_verdes || 0);
    if (disponible < cantidad) {
      return res.status(400).json({ error: `No tienes suficientes Puntos ${tipo === 'rojos' ? 'Rojos' : 'Verdes'}`, disponibles: disponible });
    }

    const tabla = await getTablaCanje(tipo);
    const clave = tipo === 'rojos' ? 'puntos_rojos' : 'puntos_verdes';
    const tramo = [...tabla].sort((a, b) => b[clave] - a[clave]).find(t => cantidad >= t[clave]);
    if (!tramo || tramo[clave] !== cantidad) {
      return res.status(400).json({
        error: `Cantidad no válida para canje. Usa una de la tabla: ${tabla.map(t => t[clave]).join(', ')}`,
        tabla_canje: tabla
      });
    }

    const ok = tipo === 'rojos'
      ? await sbCanjearPuntosRojos(junior.id, cantidad, tramo.placetas)
      : await sbCanjearPuntos(junior.id, cantidad, tramo.placetas);
    if (!ok) return res.status(400).json({ error: 'No se pudo canjear' });

    const nuevoSaldo = (junior.placetas_saldo || 0) + tramo.placetas;
    await sbUpdatePlacetaBalance(junior.id, nuevoSaldo);
    await sbCreatePlacetaTransaction({
      junior_id: junior.id, tipo: 'ganar',
      concepto: `Canje de ${cantidad} Puntos ${tipo === 'rojos' ? 'Rojos' : 'Verdes'}`,
      cantidad: tramo.placetas, saldo_resultante: nuevoSaldo,
      ip: req.headers['x-forwarded-for']?.split(',')[0] || 'unknown'
    });

    res.json({ success: true, tipo, puntos_canjeados: cantidad, placetas_obtenidas: tramo.placetas, saldo_actual: nuevoSaldo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
//  DIPLOMAS — listar y generar PDF (spec §11, §13)
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /junior/diplomas/:dip — Diplomas del junior
 * De solo lectura: si el DIP no está registrado devuelve lista vacía.
 */
router.get('/junior/diplomas/:dip', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/diplomas/:dip', '', req.params.dip);
  try {
    const junior = await sbFindJuniorByDip(req.params.dip).catch(() => null);
    const juniorId = junior?.id || null;
    const diplomas = juniorId ? await sbListDiplomas(juniorId) : [];
    res.json({ success: true, total: diplomas.length, diplomas });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
//  RETOS DE CANDELA (spec §12, §13) — semanales, gratuitos, con diploma
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /junior/retos — Retos de Candela (activos y próximos)
 */
router.get('/junior/retos', (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/retos');
  const reto = getRetoActivo();
  const todos = getRetos();
  res.json({ success: true, reto_activo: reto, retos: todos, siempre_diploma: true, gratuitos: true });
});

export default router;
