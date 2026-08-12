/**
 * SISTEMA DE DOCUMENTACIÓN GLOBAL
 * 
 * Almacena datos en Supabase (persistente) con fallback a memoria.
 * Genera PDFs bajo demanda con pdfkit.
 * Accesible por entidad con permisos. Exportable vía API pública.
 */
import { createHash, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { PLANTILLAS_BANCO } from './plantillas-banco.js';
import { supabase } from './supabase.js';

// Almacenamiento en memoria (fallback cuando Supabase no está disponible)
const memStore = {};

const LOGOS = {
  banco: 'logo-banco.png',
  tributos: 'logo-tributos.png',
  junta: 'logo-gdlp.svg',
  administracion: 'logo-web.png',
  rsp: 'rsp-logo.png',
  junior: 'junior-logo.png',
  placetaid: 'img/logo-placetaid.jpg',
};

// ── TIPOS DE DOCUMENTOS POR ENTIDAD ──────────────────────────────────────
export const TIPOS_DOCUMENTO = {
  banco: {
    cliente: [
      'contrato-apertura', 'contrato-modificacion', 'cambio-titularidad',
      'incorporacion-cotitular', 'desvinculacion-cotitular',
      'vinculacion-eip', 'modificacion-eip',
      'bloqueo-cuenta', 'desbloqueo-cuenta', 'baja-cuenta',
      'contrato-cierre',
      'certificado-titularidad', 'certificado-saldo', 'certificado-movimientos',
      'certificado-iban', 'estado-mensual', 'estado-anual',
      'extracto-personalizado', 'justificante-transferencia',
      'justificante-ingreso', 'justificante-retirada',
      'certificado-productos', 'certificado-cotitulares',
      'certificado-bloqueo', 'resolucion-desbloqueo', 'historial-cuenta'
    ],
    tarjetas: [
      'alta-tarjeta', 'renovacion-tarjeta', 'baja-tarjeta',
      'bloqueo-tarjeta', 'desbloqueo-tarjeta', 'pin-generado',
      'historial-operaciones-tarjeta'
    ],
    productos: [
      'apertura-deposito', 'cancelacion-deposito', 'certificado-deposito',
      'apertura-ahorro', 'cambio-regimen-ahorro'
    ],
    empresas: [
      'vinculacion-eip', 'modificacion-eip',
      'certificado-cuenta-empresa', 'certificado-financiero-empresa'
    ],
    cumplimiento: [
      'informe-aml', 'informe-kyc', 'informe-cumplimiento-automatico',
      'informe-inspeccion', 'informe-incumplimiento',
      'notificacion-fraude', 'resolucion-inspeccion'
    ],
    operaciones: [
      'informe-operacion', 'reversion', 'comprobante',
      'justificante-iva', 'informe-impuestos'
    ],
    personal: [
      'alta-trabajador', 'baja-trabajador',
      'cambio-permisos', 'suspension', 'informe-actividad'
    ]
  },
  tributos: {
    declaraciones: [
      'declaracion-borrador', 'declaracion-definitiva', 'declaracion-rectificada',
      'declaracion-complementaria', 'declaracion-anulada', 'declaracion-historica'
    ],
    // Expediente fiscal automático: la declaración mensual (DFM) + sus anexos
    // específicos (movimientos, IRM, IGF, IVA) + certificados de bonificación
    // y cierre. Se generan automáticamente por sujeto fiscal y periodo.
    expediente: [
      'dfm-mensual', 'anexo-movimientos-fiscales', 'declaracion-irm',
      'declaracion-igf', 'declaracion-iva',
      'certificado-bonificacion-fiscal', 'certificado-cierre-fiscal'
    ],
    liquidaciones: [
      'liquidacion-mensual', 'liquidacion-anual', 'liquidacion-extraordinaria'
    ],
    pagos: [
      'orden-devolucion', 'orden-cobro', 'justificante-pago', 'certificado-devolucion'
    ],
    inspeccion: [
      'informe-inspeccion-trib', 'informe-bancario', 'informe-tributario',
      'informe-iva', 'informe-irm', 'informe-completo-contribuyente'
    ],
    incidencias: [
      'apertura-expediente', 'resolucion-expediente',
      'requerimiento', 'contestacion', 'archivo-expediente'
    ],
    regimenes: [
      'ficha-regimen', 'certificado-asignacion', 'historial-modificaciones'
    ],
    contribuyentes: [
      'certificado-situacion-tributaria', 'certificado-obligaciones', 'historial-declaraciones'
    ],
    trabajadores: [
      'alta-tributos', 'baja-tributos',
      'cambio-permisos-tributos', 'historial-actividad-tributos'
    ]
  },
  junta: {
    ciudadanos: [
      'ficha-ciudadano', 'certificado-ciudadano', 'informe-ciudadano'
    ],
    placetaid: [
      'alta-placetaid', 'cambio-datos-placetaid', 'bloqueo-placetaid',
      'desbloqueo-placetaid', 'historial-accesos', 'historial-cambios'
    ],
    reuniones: [
      'convocatoria', 'orden-del-dia', 'acta', 'acta-firmada',
      'asistentes', 'certificado-reunion'
    ],
    votaciones: [
      'convocatoria-votacion', 'documento-votacion', 'resultado-provisional',
      'resultado-definitivo', 'auditoria-votacion', 'participacion',
      'certificado-anonimizacion'
    ],
    cargos: [
      'nombramiento', 'cese', 'cambio-cargo', 'autorizacion-especial',
      'resolucion-aprobacion', 'historial-cargos'
    ],
    departamentos: [
      'alta-departamento', 'baja-departamento',
      'modificacion-departamento', 'organigrama'
    ],
    recursos: [
      'alta-correo', 'baja-correo', 'licencia',
      'asignacion-licencia', 'revocacion-licencia'
    ],
    junior: [
      'alta-junior', 'baja-junior', 'cambio-tutor', 'historial-junior',
      'terminos-junior', 'privacidad-junior', 'consentimiento-junior',
      'autorizacion-actividad', 'compromiso-colaborador', 'diploma-actividad',
      'certificado-puntos', 'queja-reclamacion'
    ]
  },
  administracion: {
    etramite: [
      'solicitud', 'registro-entrada', 'registro-salida',
      'resolucion-tramite', 'requerimiento-tramite', 'archivo-tramite'
    ],
    ciudadanos: [
      'ficha-administrativa', 'certificado-administrativo', 'historial-administrativo'
    ],
    banco: [
      'informe-resumido-banco', 'estado-bancario', 'certificado-bancario-admin'
    ],
    tributos: [
      'estado-tributario', 'historial-tributario', 'certificado-tributario-admin'
    ],
    documentacion: [
      'acta-admin', 'resolucion-admin', 'certificado-admin',
      'informe-admin', 'oficio', 'comunicacion'
    ],
    placetaid: [
      'informe-identidad', 'historial-identidad', 'certificado-autenticacion'
    ],
    junior: [
      'alta-admin-junior', 'baja-admin-junior',
      'certificado-admin-junior', 'historial-admin-junior'
    ]
  },
  rsp: {
    subvenciones: [
      'subvencion-concesion', 'subvencion-justificacion', 'subvencion-cierre'
    ]
  }
};

// Documentos comunes (todas las entidades)
export const DOCUMENTOS_COMUNES = [
  'informe-pdf', 'expediente-completo', 'resolucion',
  'notificacion', 'comunicacion-oficial', 'oficio',
  'certificado', 'historial-modificaciones', 'historial-auditoria',
  'registro-accesos', 'registro-cambios', 'registro-firmas',
  'informe-cronologico', 'exportacion-csv-pdf', 'exportacion-excel-pdf',
  'resumen-ejecutivo', 'informe-estadistico',
  'informe-anual', 'informe-mensual', 'informe-personalizado'
];

export const DOCUMENTOS_AUTOMATICOS = [
  'informe-diario-sistema', 'informe-semanal', 'informe-mensual-sistema',
  'informe-anual-sistema', 'informe-incidencias', 'informe-errores',
  'informe-auditoria', 'informe-permisos', 'informe-seguridad',
  'informe-apis', 'informe-autenticaciones', 'informe-firmas-digitales',
  'informe-accesos-admin', 'informe-actividad-usuario',
  'informe-copias-seguridad', 'informe-integridad-documental',
  'informe-cumplimiento-normativo', 'registro-cronologico-eventos'
];

// Etiquetas descriptivas para cada tipo
export const ETIQUETAS_DOC = {
  'contrato-apertura': 'Contrato de Apertura de Cuenta (BLP-B-001)',
  'contrato-modificacion': 'Contrato de Modificación de Cuenta (BLP-B-002)',
  'cambio-titularidad': 'Cambio de Titularidad (BLP-B-003)',
  'incorporacion-cotitular': 'Incorporación de Cotitular (BLP-B-004)',
  'desvinculacion-cotitular': 'Desvinculación de Cotitular (BLP-B-005)',
  'vinculacion-eip': 'Vinculación de Empresa EIP (BLP-B-006)',
  'modificacion-eip': 'Modificación Empresa Vinculada (BLP-B-007)',
  'bloqueo-cuenta': 'Resolución de Bloqueo (BLP-B-008)',
  'desbloqueo-cuenta': 'Resolución de Desbloqueo (BLP-B-009)',
  'baja-cuenta': 'Resolución de Baja Definitiva (BLP-B-010)',
  'terminos-junior': 'Términos y Condiciones Placeta Junior (PJ-TYC-001)',
  'privacidad-junior': 'Política de Privacidad Placeta Junior (PJ-PRV-001)',
  'consentimiento-junior': 'Consentimiento Tutor Legal Placeta Junior (PJ-CON-001)',
};
function addLabels(obj, prefix = '') {
  for (const [cat, docs] of Object.entries(obj)) {
    if (Array.isArray(docs)) {
      docs.forEach(d => {
        if (!ETIQUETAS_DOC[d]) {
          ETIQUETAS_DOC[d] = d.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
      });
    } else if (typeof docs === 'object') {
      addLabels(docs, prefix || cat);
    }
  }
}
addLabels(TIPOS_DOCUMENTO);
DOCUMENTOS_COMUNES.forEach(d => {
  ETIQUETAS_DOC[d] = d.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
});
DOCUMENTOS_AUTOMATICOS.forEach(d => {
  ETIQUETAS_DOC[d] = d.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
});

// ── ALMACENAMIENTO (Archivo /tmp + Supabase opcional) ────────────────────
// En Vercel serverless /tmp persiste dentro de la misma instancia.
// Supabase da persistencia global cuando la tabla existe.
// MemStore es el respaldo local/desarrollo.

const DOCS_TABLE = 'documentos';
let sbReady = false;

function storePath() {
  try { return path.join('/tmp', 'admin-placeta-docs.json'); }
  catch { return null; }
}

function loadStoreFromFile() {
  const fp = storePath();
  if (!fp) return {};
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    return JSON.parse(raw);
  } catch { return {}; }
}

function saveStoreToFile(store) {
  const fp = storePath();
  if (!fp) return;
  try { fs.writeFileSync(fp, JSON.stringify(store), 'utf8'); }
  catch {}
}

function getStore() {
  return loadStoreFromFile();
}

function putInStore(entidad, docs) {
  const store = loadStoreFromFile();
  store[entidad] = docs;
  saveStoreToFile(store);
  if (!memStore[entidad]) memStore[entidad] = [];
  memStore[entidad] = docs;
}

export async function initDocsTable(intento = 0) {
  if (sbReady) return true;
  
  // Intentar 1: Usar el cliente Supabase
  if (supabase) {
    try {
      const { error } = await supabase.from(DOCS_TABLE).select('id').limit(1);
      if (!error) { sbReady = true; return true; }
      console.warn('[Docs] initDocsTable con cliente falló:', error?.message);
    } catch (e) {
      console.warn('[Docs] initDocsTable cliente exception:', e.message);
    }
  }
  
  // Intentar 2: Usar fetch directo a Supabase REST API
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'htikrqaywapshlkdonvs.supabase.co';
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 
      process.env.SUPABASE_SECRET_KEY || 
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0aWtycWF5d2Fwc2hsa2RvbnZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjg0MTQ2NywiZXhwIjoyMDk4NDE3NDY3fQ.wiL-rKidW9XawEISg56mOLZEFCfq4UMm1ufil5BdaG0';
    const fullUrl = SUPABASE_URL.startsWith('http') ? SUPABASE_URL : `https://${SUPABASE_URL}`;
    const resp = await fetch(`${fullUrl}/rest/v1/${DOCS_TABLE}?select=id&limit=1`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    });
    if (resp.ok) {
      console.log('[Docs] initDocsTable via REST API OK');
      sbReady = true;
      return true;
    }
    console.warn('[Docs] initDocsTable REST API falló:', resp.status);
  } catch (e) {
    console.warn('[Docs] initDocsTable REST exception:', e.message);
  }
  
  if (intento < 2) {
    await new Promise(r => setTimeout(r, 1500));
    return initDocsTable(intento + 1);
  }
  return false;
}

async function sbListDocs(entidad) {
  await initDocsTable();
  if (sbReady && supabase) {
    try {
      const { data, error } = await supabase.from(DOCS_TABLE).select('*').eq('entidad', entidad).order('created_at', { ascending: false });
      if (!error && data) return data;
    } catch (e) { console.warn('[Docs] sbListDocs exception:', e.message); }
  }
  // Fallback: raw fetch
  try {
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0aWtycWF5d2Fwc2hsa2RvbnZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjg0MTQ2NywiZXhwIjoyMDk4NDE3NDY3fQ.wiL-rKidW9XawEISg56mOLZEFCfq4UMm1ufil5BdaG0';
    const SUPABASE_URL = 'https://htikrqaywapshlkdonvs.supabase.co';
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${DOCS_TABLE}?entidad=eq.${entidad}&order=created_at.desc`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    if (resp.ok) { const data = await resp.json(); return data || []; }
  } catch (e) { console.warn('[Docs] sbListDocs raw fallback exception:', e.message); }
  return null;
}

async function sbSaveDoc(doc, intento = 0) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0aWtycWF5d2Fwc2hsa2RvbnZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mjg0MTQ2NywiZXhwIjoyMDk4NDE3NDY3fQ.wiL-rKidW9XawEISg56mOLZEFCfq4UMm1ufil5BdaG0';
  const SUPABASE_URL = 'https://htikrqaywapshlkdonvs.supabase.co';
  
  await initDocsTable();
  
  // Intentar 1: Cliente Supabase
  if (sbReady && supabase) {
    try {
      const record = {
        id: doc.id, entidad: doc.entidad, tipo: doc.tipo,
        categoria: doc.categoria || 'general', titulo: doc.titulo,
        descripcion: doc.descripcion || '', datos: JSON.stringify(doc.datos || {}),
        ref_id: doc.refId, ref_tipo: doc.refTipo,
        created_by: doc.createdBy, estado: doc.estado || 'borrador',
        firmado: doc.firmado || false, hash: doc.hash || '',
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabase.from(DOCS_TABLE).upsert(record, { onConflict: 'id' }).select().maybeSingle();
      if (!error && data) return data;
    } catch (e) { console.warn('[Docs] sbSaveDoc client exception:', e.message); }
  }
  
  // Intentar 2: Raw fetch
  try {
    const record = {
      id: doc.id, entidad: doc.entidad, tipo: doc.tipo,
      categoria: doc.categoria || 'general', titulo: doc.titulo,
      descripcion: doc.descripcion || '', datos: JSON.stringify(doc.datos || {}),
      ref_id: doc.refId, ref_tipo: doc.refTipo,
      created_by: doc.createdBy, estado: doc.estado || 'borrador',
      firmado: doc.firmado || false, hash: doc.hash || '',
      updated_at: new Date().toISOString()
    };
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${DOCS_TABLE}?on_conflict=id`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(record)
    });
    if (resp.ok) { const data = await resp.json(); return Array.isArray(data) ? data[0] : data; }
    console.warn('[Docs] sbSaveDoc raw fallback error:', resp.status);
  } catch (e) { console.warn('[Docs] sbSaveDoc raw exception:', e.message); }
  
  if (intento < 2) {
    await new Promise(r => setTimeout(r, 1000));
    return sbSaveDoc(doc, intento + 1);
  }
  console.warn('[Docs] sbSaveDoc: todos los intentos fallaron');
  return null;
}

async function sbDeleteDoc(id) {
  if (!supabase) return false;
  await initDocsTable();
  if (!sbReady) return false;
  try { await supabase.from(DOCS_TABLE).delete().eq('id', id); return true; }
  catch { return false; }
}

async function sbGetDoc(id) {
  if (!supabase) return null;
  await initDocsTable();
  if (!sbReady) return null;
  try {
    const { data } = await supabase.from(DOCS_TABLE).select('*').eq('id', id).maybeSingle();
    return data;
  } catch { return null; }
}

export function getDocumentos(entidad) {
  if (!memStore[entidad]) memStore[entidad] = [];
  // Si memStore está vacío, intentar cargar desde archivo
  if (memStore[entidad].length === 0) {
    const store = loadStoreFromFile();
    if (store[entidad]) memStore[entidad] = store[entidad];
  }
  return memStore[entidad];
}

export async function getDocumentosAsync(entidad) {
  // Intentar Supabase primero
  const sbData = await sbListDocs(entidad);
  if (sbData) {
    const docs = sbData.map(normalizarDoc);
    putInStore(entidad, docs);
    return docs;
  }
  return getDocumentos(entidad);
}

function normalizarDoc(sb) {
  return {
    id: sb.id, entidad: sb.entidad, tipo: sb.tipo,
    categoria: sb.categoria || 'general',
    titulo: sb.titulo, descripcion: sb.descripcion || '',
    datos: typeof sb.datos === 'string' ? JSON.parse(sb.datos || '{}') : (sb.datos || {}),
    refId: sb.ref_id || null, refTipo: sb.ref_tipo || null,
    createdBy: sb.created_by || 'sistema',
    createdAt: sb.created_at || sb.createdAt || new Date().toISOString(),
    updatedAt: sb.updated_at || sb.updatedAt || new Date().toISOString(),
    estado: sb.estado || 'borrador', firmado: sb.firmado || false,
    hash: sb.hash || ''
  };
}

export function getDocumentoById(entidad, id) {
  return getDocumentos(entidad).find(d => d.id === id) || null;
}

export async function getDocumentoByIdAsync(entidad, id) {
  // Intentar de Supabase primero
  const sbDoc = await sbGetDoc(id);
  if (sbDoc) return normalizarDoc(sbDoc);
  return getDocumentoById(entidad, id);
}

export function saveDocumento(entidad, data) {
  const docs = getDocumentos(entidad);
  const doc = {
    id: data.id || randomUUID(),
    entidad,
    tipo: data.tipo,
    categoria: data.categoria || 'general',
    titulo: data.titulo,
    descripcion: data.descripcion || '',
    datos: data.datos || {},
    refId: data.refId || null,
    refTipo: data.refTipo || null,
    createdBy: data.createdBy || 'sistema',
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    estado: data.estado || 'borrador',
    firmado: data.firmado || false,
    hash: data.hash || ''
  };
  const idx = docs.findIndex(d => d.id === doc.id);
  if (idx >= 0) docs[idx] = doc;
  else docs.push(doc);
  // Persistir a archivo
  putInStore(entidad, docs);
  return doc;
}

export async function saveDocumentoAsync(entidad, data) {
  const doc = saveDocumento(entidad, data);
  const sbResult = await sbSaveDoc(doc);
  if (!sbResult) {
    // No bloquear el flujo: el documento YA existe en la tienda local y debe
    // llegar a PlacetaID para la firma aunque la persistencia en Supabase falle.
    console.error('[Docs] AVISO: sbSaveDoc falló - documento solo en memoria local:', doc.id, doc.titulo);
  }
  return doc;
}

// Obtener documentos por referencia (ej: todos los docs de una cuenta)
export function getDocumentosPorRef(entidad, refTipo, refId) {
  return getDocumentos(entidad).filter(d => d.refTipo === refTipo && d.refId === refId);
}

export async function getDocumentosPorRefAsync(entidad, refTipo, refId) {
  // Intentar Supabase primero
  const sbData = await sbListDocs(entidad);
  if (sbData) {
    const docs = sbData.map(normalizarDoc);
    putInStore(entidad, docs);
    return docs.filter(d => d.refTipo === refTipo && d.refId === refId);
  }
  return getDocumentosPorRef(entidad, refTipo, refId);
}

export function deleteDocumento(entidad, id) {
  const docs = getDocumentos(entidad).filter(d => d.id !== id);
  putInStore(entidad, docs);
  sbDeleteDoc(id).catch(() => {});
  return true;
}

export async function deleteDocumentoAsync(entidad, id) {
  deleteDocumento(entidad, id);
  await sbDeleteDoc(id).catch(() => {});
  return true;
}

// ── GENERADOR DE TEXTO DE DOCUMENTO (estilo CRM) ─────────────────────────
function generarContenidoDocumento(tipo, datos = {}) {
  const hoy = new Date().toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'numeric' });
  const L = []; const cf = (k,v) => L.push({campo:[k,v]}); const sf = (t) => L.push({seccion:t});
  const tx = (t) => L.push({texto:t}); const ln = () => L.push({linea:true});

  switch (tipo) {
    // ── Cambio de tipo de cuenta ────────────────────────────────────────
    case 'cambio-tipo-cuenta': {
      sf('DATOS DEL TITULAR');
      cf('Nombre', datos.titular || datos.cuenta || '—');
      cf('DIP', datos.dip || '—');
      if (datos.eip) cf('EIP', datos.eip);
      ln(); sf('DATOS DE LA CUENTA');
      cf('IBAN', datos.iban || '—');
      cf('Tipo anterior', datos.tipoAnterior || '—');
      cf('Tipo nuevo', datos.tipoNuevo || '—');
      cf('Fecha de la operación', datos.fecha || hoy);
      ln(); sf('EXPONE');
      tx('PRIMERO. — Que el titular de la cuenta bancaria identificada en el presente expediente, cuya identidad ha sido verificada mediante el sistema oficial de autenticación PlacetaID conforme a lo dispuesto en el Artículo 5 del Código Normativo Interno del Grupo de La Placeta, ha solicitado expresamente la reclasificación del tipo de cuenta asociada al IBAN anteriormente indicado, pasando del tipo «' + (datos.tipoAnterior || '—') + '» al tipo «' + (datos.tipoNuevo || '—') + '».');
      tx('SEGUNDO. — Que la solicitud ha sido presentada a través de los canales oficiales del Banco de La Placeta, quedando debidamente registrada en el sistema de gestión bancaria con fecha ' + (datos.fecha ? new Date(datos.fecha).toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'numeric' }) : hoy) + ', y habiéndose acreditado la voluntad inequívoca del titular mediante la correspondiente autenticación multifactor a través de PlacetaID Móvil.');
      tx('TERCERO. — Que el Banco de La Placeta, en uso de las facultades que le confiere el Código Normativo Interno, ha procedido a realizar las comprobaciones técnicas y administrativas previstas en la normativa vigente para este tipo de operaciones, incluyendo la verificación de la titularidad de la cuenta, la comprobación del estado administrativo de la misma, la revisión de posibles bloqueos o incidencias activas, la confirmación del cumplimiento de los requisitos específicos asociados al nuevo tipo de cuenta solicitado, y la validación de los límites legales de capital aplicables conforme al Artículo 4.1 del Código Normativo Interno.');
      tx('CUARTO. — Que, como resultado de las comprobaciones anteriormente descritas, no se ha detectado impedimento legal, reglamentario ni administrativo que obste a la reclasificación solicitada, por lo que procede dictar la presente resolución autorizando el cambio de tipo de cuenta en los términos interesados por el titular.');
      ln(); sf('FUNDAMENTOS JURÍDICOS');
      tx('PRIMERO. — El Artículo 5 del Código Normativo Interno del Grupo de La Placeta establece PlacetaID como sistema oficial de autenticación y firma electrónica, otorgando plena validez jurídica a las actuaciones realizadas a través del mismo, equiparando la firma electrónica mediante PlacetaID a la firma manuscrita a todos los efectos legales.');
      tx('SEGUNDO. — El Artículo 6 del mismo cuerpo normativo regula el Documento de Identidad de La Placeta (DIP) como identificador único e intransferible de las personas físicas en el ecosistema GDLP, mientras que el Artículo 7 regula los tipos de cuentas bancarias, sus características, requisitos de acceso y el procedimiento para su modificación.');
      tx('TERCERO. — La presente resolución se dicta asimismo conforme a las disposiciones del Artículo 4.1 (límites máximos de capital), Artículo 4.2 (régimen de descubiertos), Artículo 4.3 (tasas bancarias), Artículo 4.4 (IVA), Artículo 4.10 (Impuesto de Regulación Monetaria) y Artículo 4.13 (Impuesto de Grandes Fortunas), todos ellos del Código Normativo Interno, resultando aplicables al nuevo tipo de cuenta las disposiciones que correspondan según su clasificación.');
      tx('CUARTO. — Que, de conformidad con el principio de legalidad administrativa que rige la actuación del Banco de La Placeta, la presente resolución se adopta previa instrucción del correspondiente expediente administrativo, con observancia de las garantías procedimentales establecidas y con pleno respeto a los derechos del titular reconocidos en la normativa aplicable.');
      ln(); sf('RESUELVE');
      tx('Primero. — APROBAR el cambio de tipo de cuenta solicitado, reclasificando la cuenta con IBAN ' + (datos.iban || '—') + ' del tipo «' + (datos.tipoAnterior || '—') + '» al tipo «' + (datos.tipoNuevo || '—') + '», con efectos desde la fecha de la presente resolución.');
      tx('Segundo. — ORDENAR la actualización inmediata del Registro Bancario Oficial del Banco de La Placeta, debiendo reflejarse el nuevo tipo de cuenta asignado, la fecha de la modificación y los datos del titular responsable.');
      tx('Tercero. — DISPONER la aplicación automática al nuevo tipo de cuenta del régimen bancario correspondiente, incluyendo los límites operativos, las tasas aplicables, el régimen fiscal y las condiciones particulares que resulten de aplicación según la naturaleza del tipo de cuenta asignado.');
      tx('Cuarto. — MANTENER inalterados el número IBAN de la cuenta, el historial de movimientos, las autorizaciones vigentes y cualesquiera otras condiciones contractuales no afectadas expresamente por la presente resolución.');
      tx('Quinto. — NOTIFICAR la presente resolución al titular de la cuenta a través del sistema PlacetaID, entendiéndose notificada en el momento en que el titular acceda al documento a través de la aplicación PlacetaID Móvil y proceda a su firma electrónica.');
      tx('Sexto. — REGISTRAR la presente actuación en el historial de auditoría del Banco de La Placeta, dejando constancia de la fecha, hora, usuario que tramitó la solicitud y las comprobaciones realizadas.');
      ln(); sf('EFECTOS DE LA RESOLUCIÓN');
      tx('La presente resolución produce efectos desde el momento de su firma electrónica por parte del titular a través de PlacetaID Móvil. El nuevo tipo de cuenta será plenamente operativo una vez que el titular haya prestado su conformidad mediante la firma electrónica del presente documento. En caso de que el titular no proceda a la firma del documento en el plazo de treinta (30) días naturales desde su emisión, la presente resolución quedará sin efecto y la cuenta mantendrá su tipo anterior.');
      ln(); sf('RECURSOS');
      tx('Contra la presente resolución, que pone fin a la vía administrativa del Banco de La Placeta, el titular podrá interponer recurso de reposición ante la Administración del Grupo de La Placeta en el plazo de un (1) mes desde su notificación, conforme a lo dispuesto en el Código Normativo Interno. La interposición del recurso no suspenderá la ejecutividad de la presente resolución, sin perjuicio de que el órgano competente pueda acordar motivadamente la suspensión cautelar cuando concurran circunstancias de especial dificultad técnica o jurídica.');
      ln(); L.push({nota: 'Documento oficial emitido por el Banco de La Placeta, entidad integrada en el ecosistema de ASOCIACIÓN GRUPO DE LA PLACETA.'});
      L.push({nota: 'AVISO LEGAL: Banco de La Placeta es una entidad dentro del ecosistema de ASOCIACIÓN GRUPO DE LA PLACETA que se rige por sus Estatutos y el Código Normativo Interno vigente. Al firmar digitalmente este documento vía PlacetaID Móvil le estoy proporcionando autenticidad y dándole la misma validez que a una firma en papel mía, entendiendo que el contenido del mismo y mi firma quieren representar conformidad.'});
      break;
    }

    // ── Modificación de datos de cuenta ─────────────────────────────────
    case 'modificacion-datos': {
      sf('DATOS DEL TITULAR');
      cf('Nombre', datos.titular || datos.cuenta || '—');
      cf('DIP', datos.dip || '—');
      if (datos.eip) cf('EIP', datos.eip);
      ln(); sf('DATOS DE LA CUENTA');
      cf('IBAN', datos.iban || '—');
      cf('Tipo de cuenta', datos.tipoAnterior || datos.tipo || '—');
      cf('Fecha de la operación', datos.fecha || hoy);
      cf('Motivo', datos.motivo || '—');
      ln(); sf('EXPONE');
      tx('PRIMERO. — Que el titular de la cuenta bancaria identificada en el presente expediente ha solicitado la modificación de los datos asociados a la misma, habiendo quedado su identidad debidamente verificada mediante el sistema oficial de autenticación PlacetaID conforme al Artículo 5 del Código Normativo Interno del Grupo de La Placeta.');
      tx('SEGUNDO. — Que la solicitud de modificación ha sido presentada a través de los canales oficiales del Banco de La Placeta, quedando registrada en el sistema de gestión bancaria. El Banco ha procedido a verificar la titularidad de la cuenta, el estado administrativo de la misma y la inexistencia de impedimentos legales o reglamentarios que pudieran obstar a la modificación solicitada.');
      tx('TERCERO. — Que, como resultado del análisis de la solicitud y de las comprobaciones practicadas, el Banco de La Placeta considera procedente autorizar la modificación en los términos solicitados por el titular, al cumplirse todos los requisitos establecidos en la normativa vigente.');
      ln(); sf('FUNDAMENTOS JURÍDICOS');
      tx('La presente resolución se adopta conforme a las disposiciones del Código Normativo Interno del Grupo de La Placeta relativas a la identificación electrónica mediante PlacetaID (Artículo 5), la gestión y administración de cuentas bancarias (Artículos 7 y siguientes), la actualización de datos de los titulares y las facultades de administración del Banco de La Placeta para la gestión de las cuentas bancarias.');
      tx('Asimismo, se da cumplimiento a lo dispuesto en el Reglamento (UE) 2016/679 (RGPD) en cuanto a la obligación de mantener actualizados los datos personales de los clientes, y a la normativa interna en materia de protección de datos y seguridad de la información.');
      ln(); sf('RESUELVE');
      tx('Primero. — AUTORIZAR la modificación de los datos de la cuenta bancaria descritos en el presente expediente, con efectos desde la fecha de la presente resolución.');
      tx('Segundo. — ORDENAR la actualización inmediata del Registro Bancario Oficial, debiendo reflejarse fielmente las modificaciones aprobadas.');
      tx('Tercero. — MANTENER inalteradas todas aquellas condiciones contractuales y datos de la cuenta que no hayan sido expresamente modificados por la presente resolución.');
      tx('Cuarto. — REGISTRAR la presente actuación en el historial de auditoría del Banco de La Placeta.');
      tx('Quinto. — NOTIFICAR al titular mediante PlacetaID la presente resolución para su conocimiento y, en su caso, firma electrónica.');
      ln(); sf('EFECTOS');
      tx('Las modificaciones aprobadas producirán efectos plenos desde el momento de la firma electrónica del presente documento por parte del titular a través de PlacetaID Móvil. Transcurridos treinta (30) días naturales sin que el titular haya prestado su conformidad mediante firma electrónica, la presente resolución quedará sin efecto y los datos de la cuenta se mantendrán en su estado anterior.');
      ln(); sf('RECURSOS');
      tx('Contra la presente resolución el titular podrá interponer recurso de reposición ante la Administración del Grupo de La Placeta en el plazo de un (1) mes desde su notificación, conforme al Código Normativo Interno.');
      ln(); L.push({nota: 'Documento oficial emitido por el Banco de La Placeta.'});
      L.push({nota: 'AVISO LEGAL: Banco de La Placeta es una entidad dentro del ecosistema de ASOCIACIÓN GRUPO DE LA PLACETA que se rige por sus Estatutos y el Código Normativo Interno vigente. Al firmar digitalmente este documento vía PlacetaID Móvil le estoy proporcionando autenticidad y dándole la misma validez que a una firma en papel mía, entendiendo que el contenido del mismo y mi firma quieren representar conformidad.'});
      break;
    }

    // ── Plantillas oficiales del Banco de La Placeta (BLP-B-001 a B-010) ──
    case 'contrato-apertura':
    case 'contrato-modificacion':
    case 'cambio-titularidad':
    case 'incorporacion-cotitular':
    case 'desvinculacion-cotitular':
    case 'vinculacion-eip':
    case 'modificacion-eip':
    case 'bloqueo-cuenta':
    case 'desbloqueo-cuenta':
    case 'baja-cuenta':
    case 'contrato-cierre': {
      const plantilla = PLANTILLAS_BANCO[tipo];
      if (plantilla) return plantilla(datos, L, cf, sf, tx, ln, hoy);
      break;
    }

    case 'certificado-saldo':
    case 'certificado-titularidad':
    case 'certificado-iban':
      sf('CERTIFICADO'); cf('Titular', datos.titular||datos.nombre); cf('DIP/NIF', datos.dip);
      cf('Cuenta', datos.cuenta||datos.iban); cf('IBAN', datos.iban);
      if (tipo==='certificado-saldo') cf('Saldo actual', datos.saldo!==undefined?datos.saldo.toLocaleString()+' Pz':'—');
      cf('Moneda', 'Placeta (Pz)'); cf('Fecha emisión', datos.fechaEmision||hoy);
      cf('Válido hasta', datos.validoHasta||'30 días');
      L.push({nota:'El Banco de La Placeta CERTIFICA que los datos indicados son ciertos y exactos a fecha de emisión, con validez como certificado oficial del sistema GDLP.'});
      break;

    case 'justificante-transferencia':
      sf('DATOS DE LA TRANSFERENCIA'); cf('Ordenante', datos.ordenante); cf('Destinatario', datos.destinatario);
      cf('Importe', datos.importe!==undefined?datos.importe.toLocaleString()+' Pz':'—'); cf('Concepto', datos.concepto);
      cf('Fecha', datos.fecha||hoy); cf('Referencia', datos.referencia); cf('Estado', '✅ Ejecutada');
      break;

    case 'estado-mensual':
      sf('PERIODO'); cf('Titular', datos.titular); cf('Cuenta', datos.cuenta); cf('Período', datos.periodo);
      ln(); sf('RESUMEN');
      cf('Saldo inicial', datos.saldoInicial!==undefined?datos.saldoInicial.toLocaleString()+' Pz':'—');
      cf('Total ingresos', datos.ingresos!==undefined?datos.ingresos.toLocaleString()+' Pz':'—');
      cf('Total gastos', datos.gastos!==undefined?datos.gastos.toLocaleString()+' Pz':'—');
      cf('Saldo final', datos.saldoFinal!==undefined?datos.saldoFinal.toLocaleString()+' Pz':'—');
      if (datos.movimientos?.length) {
        sf('MOVIMIENTOS'); datos.movimientos.forEach((m,i) => cf(`${i+1}`, `${m.fecha||'—'} | ${m.concepto||'—'} | ${m.importe?m.importe+' Pz':'—'}`));
      }
      break;

    case 'declaracion-definitiva':
    case 'declaracion-borrador':
      sf('DATOS DEL SUJETO PASIVO');
      cf('Contribuyente', datos.contribuyente||datos.nombre||'—');
      cf('DIP/NIF', datos.dip||'—');
      cf('Tipo de sujeto', datos.tipoSujeto||(datos.tipoCuenta==='Business'?'Empresa':'Persona Física'));
      cf('Cuenta BLP', datos.cuentaId||datos.cuenta||'—');
      ln();
      sf('PERIODO IMPOSITIVO');
      cf('Período', datos.periodo||datos.mesPeriodo||'—');
      cf('Fecha de emisión', datos.fechaEmision||hoy);
      cf('Días activos del mes', datos.diasActivos!==undefined?String(datos.diasActivos):'30');
      ln();
      sf('PATRIMONIO Y SALDOS');
      cf('Patrimonio medio del periodo', datos.patrimonioMedio!==undefined?datos.patrimonioMedio.toLocaleString()+' Pz':'—');
      cf('Saldo final del periodo', datos.saldoFinal!==undefined?datos.saldoFinal.toLocaleString()+' Pz':'—');
      cf('Media de ingresos diarios', datos.mediaIngresos!==undefined?datos.mediaIngresos.toLocaleString()+' Pz':'—');
      cf('Media de pagos diarios', datos.mediaPagos!==undefined?datos.mediaPagos.toLocaleString()+' Pz':'—');
      if (datos.indiceAcumulacion!==undefined) cf('Índice de Acumulación (IA)', String(datos.indiceAcumulacion));
      ln();
      sf('IMPUESTO DE REGULACIÓN MONETARIA (IRM) — Art. 4.8 a 4.11 bis');
      cf('Base: Patrimonio medio', datos.patrimonioMedio!==undefined?datos.patrimonioMedio.toLocaleString()+' Pz':'—');
      cf('IA calculado', datos.indiceAcumulacion!==undefined?String(datos.indiceAcumulacion):'0.0000');
      cf('Tipo aplicable según escala Art. 4.10', datos.tipoIRM?((datos.tipoIRM*100).toFixed(2)+'%'):'—');
      cf('Cuota IRM', datos.cuotaIRM!==undefined?datos.cuotaIRM.toLocaleString()+' Pz':'—');
      L.push({nota:'El IRM se calcula mensualmente sobre el patrimonio medio del periodo vencido. El cargo se realiza el día 5 del mes siguiente (Art. 4.11 bis). Tipo aplicable según escala progresiva del Art. 4.10.'});
      ln();
      sf('IMPUESTO DE GRANDES FORTUNAS (IGF) — Art. 4.12 a 4.16');
      cf('Base: Patrimonio medio', datos.patrimonioMedio!==undefined?datos.patrimonioMedio.toLocaleString()+' Pz':'—');
      cf('Exención primeros 5.000 Pz', 'Aplicada');
      cf('Tramos aplicados', datos.tramosIGF||'Escala progresiva Art. 4.13');
      cf('Cuota IGF', datos.cuotaIGF!==undefined?datos.cuotaIGF.toLocaleString()+' Pz':'—');
      if (datos.exencionAplicada) L.push({nota:'Exención por reducida dimensión empresarial (Art. 4.15): Patrimonio inferior a 20.000 Pz.'});
      ln();
      sf('RESUMEN DE LA LIQUIDACIÓN');
      const total = (datos.cuotaIRM||0)+(datos.cuotaIGF||0);
      cf('Cuota IRM', (datos.cuotaIRM||0).toLocaleString()+' Pz');
      cf('Cuota IGF', (datos.cuotaIGF||0).toLocaleString()+' Pz');
      cf('TOTAL A PAGAR', total.toLocaleString()+' Pz');
      cf('Moneda', 'Placeta (Pz)');
      if (datos.estado) cf('Estado de la liquidación', datos.estado);
      if (tipo==='declaracion-definitiva') {
        L.push({nota:'Declaración liquidada y emitida oficialmente. El pago se cargará automáticamente de la cuenta asociada el día 5 del mes siguiente (Art. 4.11 bis). Esta liquidación tiene carácter ejecutivo y produce efectos desde su notificación.'});
      } else {
        L.push({nota:'BORRADOR — Esta declaración no ha sido presentada ni aprobada. Los cálculos son estimaciones preliminares sujetas a revisión. No produce efectos legales hasta su publicación y aprobación.'});
      }
      break;

    // ═══════════════════════════════════════════════════════════════════
    // EXPEDIENTE FISCAL AUTOMÁTICO (DFM + anexos por sujeto y periodo)
    // ═══════════════════════════════════════════════════════════════════

    // ── 1. Documento principal: Declaración Fiscal Mensual (DFM) ──────
    // Uno por cada sujeto fiscal y periodo. Sólo muestra las casillas que
    // corresponden al sujeto (no muestra casillas irrelevantes).
    case 'dfm-mensual': {
      const fmtPz = (n) => (Number(n) || 0).toLocaleString('es-ES') + ' Pz';
      const pct = (n) => n !== undefined && n !== null ? (Number(n) * 100).toFixed(2) + ' %' : '—';
      sf('DECLARACIÓN FISCAL MENSUAL (DFM)');
      cf('Nº de declaración', datos.numeroDfm || 'DFM-YYYY-MM-000000');
      cf('Estado', datos.estado || 'Borrador');
      ln();
      sf('DATOS DEL SUJETO PASIVO');
      cf('Titular', datos.titular || datos.contribuyente || '—');
      cf('Identificador fiscal', datos.identificador || datos.dip || (datos.eip || '—'));
      cf('Tipo de sujeto', datos.tipoSujeto || 'Persona Física');
      if (datos.esJunior) cf('Régimen', 'Placeta Junior (impuestos asumidos por CAPITALIA)');
      ln();
      sf('PERIODO IMPOSITIVO');
      cf('Periodo', datos.periodo || '—');
      cf('Fecha de emisión', datos.fechaEmision || hoy);
      cf('Fecha de cierre', datos.fechaCierre || '—');
      ln();
      sf('RESUMEN ECONÓMICO');
      L.push({ tabla: {
        cabeceras: ['Concepto', 'Importe'],
        filas: [
          ['Patrimonio medio del periodo', fmtPz(datos.patrimonioMedio)],
          ['Ingresos del periodo', fmtPz(datos.ingresosPeriodo)],
          ['Pagos del periodo', fmtPz(datos.pagosPeriodo)],
          ['Índice de acumulación (IA)', datos.indiceAcumulacion !== undefined ? String(datos.indiceAcumulacion) : '—'],
          ['Saldo final del periodo', fmtPz(datos.saldoFinal)],
          ['Días activos del mes', datos.diasActivos !== undefined ? String(datos.diasActivos) : '—'],
        ],
        anchos: [340, 160], alineaciones: ['left', 'right']
      }});
      ln();
      sf('LIQUIDACIÓN DE IMPUESTOS (desglosada)');
      L.push({ tabla: {
        cabeceras: ['Impuesto', 'Base', 'Tipo', 'Cuota'],
        filas: [
          ['IRM — Impuesto de Regulación Monetaria', fmtPz(datos.baseIRM !== undefined ? datos.baseIRM : datos.patrimonioMedio), pct(datos.tipoIRM), fmtPz(datos.cuotaIRM)],
          ['IGF — Impuesto sobre Grandes Fortunas', fmtPz(datos.baseIGF !== undefined ? datos.baseIGF : datos.patrimonioMedio), datos.tipoIGF ? String(datos.tipoIGF) : 'Escala Art. 4.13', fmtPz(datos.cuotaIGF)],
        ],
        anchos: [230, 90, 90, 90], alineaciones: ['left', 'right', 'right', 'right']
      }});
      if (datos.muestraIVA) {
        L.push({ tabla: {
          cabeceras: ['IVA — Impuesto sobre el Valor Añadido', 'Base', 'Tipo', 'Cuota'],
          filas: [
            ['IVA repercutido', fmtPz(datos.baseRepercutida), '12 %', fmtPz(datos.ivaRepercutido)],
            ['IVA soportado / deducciones', fmtPz(datos.baseSoportada), '12 %', '−' + fmtPz(datos.deduccionesIVA !== undefined ? datos.deduccionesIVA : 0)],
            ['Rectificaciones', '—', '—', fmtPz(datos.rectificacionesIVA)],
            ['Resultado IVA', '—', '—', fmtPz(datos.cuotaIVA)],
          ],
          anchos: [230, 90, 90, 90], alineaciones: ['left', 'right', 'right', 'right'], resaltarDesde: 3
        }});
      }
      if (datos.bonificaciones !== undefined && datos.bonificaciones > 0) {
        L.push({ tabla: {
          cabeceras: ['Bonificaciones', 'Base', 'Tipo', 'Cuota'],
          filas: [['Bonificación aplicada (asumida por CAPITALIA)', '—', '100 %', '−' + fmtPz(datos.bonificaciones)]],
          anchos: [230, 90, 90, 90], alineaciones: ['left', 'right', 'right', 'right']
        }});
      }
      ln();
      sf('RESULTADO FISCAL');
      L.push({ tabla: {
        cabeceras: ['Concepto', 'Importe'],
        filas: [
          ['IRM', fmtPz(datos.cuotaIRM)],
          ['IGF', fmtPz(datos.cuotaIGF)],
          ...(datos.muestraIVA ? [['IVA', fmtPz(datos.cuotaIVA)]] : []),
          ...(datos.bonificaciones > 0 ? [['Bonificaciones (CAPITALIA)', '−' + fmtPz(datos.bonificaciones)]] : []),
          ['TOTAL IMPUESTOS', fmtPz(datos.totalImpuestos)],
          ...(datos.esJunior && datos.pagaCapitalia
            ? [['Importe asumido por CAPITALIA', fmtPz(datos.totalImpuestos)], ['Importe a cargo del titular', '0 Pz']]
            : [['Importe a cargo del sujeto', fmtPz(datos.totalImpuestos)]]),
        ],
        anchos: [340, 160], alineaciones: ['left', 'right'], resaltarDesde: (datos.muestraIVA ? 3 : 2) + (datos.bonificaciones > 0 ? 1 : 0)
      }});
      L.push({nota: 'DFM: documento principal del expediente fiscal mensual. Cada impuesto se desglosa en base, tipo y cuota. No muestra casillas que no corresponden al sujeto (IVA o retenciones solo cuando aplican).'});
      L.push({nota:'Firma/sello digital: este documento queda sellado digitalmente por el sistema fiscal de La Placeta al ser emitido.'});
      break;
    }

    // ── 2. Anexo de movimientos fiscales (auditoría) ──────────────────
    // Cada movimiento con ID, Fecha, Concepto, Importe, Impuesto, Tratamiento.
    // Permite rastrear el origen de cada cuota hasta las operaciones que la generaron.
    case 'anexo-movimientos-fiscales': {
      sf('ANEXO DE MOVIMIENTOS FISCALES');
      cf('Declaración', datos.numeroDfm || '—');
      cf('Titular', datos.titular || datos.contribuyente || '—');
      cf('Periodo', datos.periodo || '—');
      ln();
      sf('MOVIMIENTOS DEL PERIODO');
      if (datos.movimientos && datos.movimientos.length > 0) {
        L.push({ tabla: {
          cabeceras: ['ID', 'Fecha', 'Concepto', 'Importe', 'Impuesto', 'Tratamiento'],
          filas: datos.movimientos.map((m) => [
            m.id || '—',
            m.fecha || '—',
            (m.concepto || '—').slice(0, 60),
            fmtPz ? fmtPz(m.importe) : ((m.importe || 0).toLocaleString('es-ES') + ' Pz'),
            m.impuesto || '—',
            m.tratamiento || '—'
          ]),
          anchos: [70, 60, 160, 80, 60, 70], alineaciones: ['left', 'left', 'left', 'right', 'center', 'center']
        }});
        L.push({ tabla: {
          cabeceras: ['Total movimientos', 'Operaciones sujetas', 'Operaciones no sujetas', 'Base sujeta'],
          filas: [[
            String(datos.movimientos.length),
            String((datos.movimientos||[]).filter(x => x.tratamiento === 'Sujeto').length),
            String((datos.movimientos||[]).filter(x => x.tratamiento !== 'Sujeto').length),
            fmtPz ? fmtPz(datos.totalSujeto) : '—'
          ]],
          anchos: [125, 125, 125, 125], alineaciones: ['center', 'center', 'center', 'right']
        }});
      } else {
        cf('No hay movimientos', '—');
      }
      L.push({nota:'Anexo de auditoría: cada cuota de la DFM se puede rastrear hasta las operaciones que la originaron. Tratamiento Sujeto/No sujeto según su clasificación fiscal.'});
      break;
    }

    // ── 3. Declaración específica de IRM ───────────────────────────────
    case 'declaracion-irm': {
      const fmtPz = (n) => (Number(n) || 0).toLocaleString('es-ES') + ' Pz';
      const pct = (n) => n !== undefined && n !== null ? (Number(n) * 100).toFixed(2) + ' %' : '—';
      sf('DECLARACIÓN ESPECÍFICA DE IRM');
      cf('Titular', datos.titular || datos.contribuyente || '—');
      cf('Identificador fiscal', datos.identificador || datos.dip || (datos.eip || '—'));
      cf('Periodo', datos.periodo || '—');
      ln();
      sf('CÁLCULO DESGLOSADO (Art. 4.8 a 4.11)');
      L.push({ tabla: {
        cabeceras: ['Concepto', 'Base / Valor', 'Tipo', 'Importe'],
        filas: [
          ['Rendimientos / ingresos computables', fmtPz(datos.ingresosPeriodo), '—', '—'],
          ['Patrimonio medio del periodo', fmtPz(datos.patrimonioMedio), '—', '—'],
          ['Índice de acumulación (IA)', String(datos.indiceAcumulacion !== undefined ? datos.indiceAcumulacion : '—'), '—', '—'],
          ['Exenciones', fmtPz(datos.exencionesIRM), '—', '−' + fmtPz(datos.exencionesIRM)],
          ['Reducciones', fmtPz(datos.reduccionesIRM), '—', '−' + fmtPz(datos.reduccionesIRM)],
          ['Base imponible', fmtPz(datos.baseIRM), '—', '—'],
          ['Tipo aplicable (escala Art. 4.10)', '—', pct(datos.tipoIRM), '—'],
          ['Cuota íntegra', fmtPz(datos.cuotaIntegraIRM), '—', fmtPz(datos.cuotaIRM)],
          ['Deducciones', fmtPz(datos.deduccionesIRM), '—', '−' + fmtPz(datos.deduccionesIRM)],
          ['Retenciones', fmtPz(datos.retenciones), '—', '−' + fmtPz(datos.retenciones)],
          ['Bonificaciones', fmtPz(datos.bonificacionesIRM), '—', '−' + fmtPz(datos.bonificacionesIRM)],
          ['CUOTA FINAL IRM', fmtPz(datos.cuotaFinalIRM), '—', fmtPz(datos.cuotaFinalIRM)],
        ],
        anchos: [220, 100, 80, 100], alineaciones: ['left', 'right', 'center', 'right'], resaltarDesde: 11
      }});
      if (datos.esJunior && datos.pagaCapitalia) {
        ln();
        sf('RÉGIMEN JUNIOR (Art. 5 Normativa Placeta Junior)');
        L.push({ tabla: {
          cabeceras: ['Concepto', 'Importe'],
          filas: [
            ['Cuota calculada', fmtPz(datos.cuotaIRM)],
            ['Bonificación Junior', '−' + fmtPz(datos.cuotaIRM)],
            ['Cuota a cargo del titular', '0 Pz'],
            ['Asumido por CAPITALIA', fmtPz(datos.cuotaIRM)],
          ],
          anchos: [340, 160], alineaciones: ['left', 'right'], resaltarDesde: 2
        }});
        L.push({nota:'Los menores de 16 años generan IRM igual que el resto, pero CAPITALIA asume el pago (CNI Art. 5).'});
      }
      break;
    }

    // ── 4. Declaración específica de IGF ───────────────────────────────
    case 'declaracion-igf': {
      const fmtPz = (n) => (Number(n) || 0).toLocaleString('es-ES') + ' Pz';
      sf('DECLARACIÓN ESPECÍFICA DE IGF');
      cf('Titular', datos.titular || datos.contribuyente || '—');
      cf('Identificador fiscal', datos.identificador || datos.dip || (datos.eip || '—'));
      cf('Periodo', datos.periodo || '—');
      ln();
      sf('DETERMINACIÓN DEL PATRIMONIO');
      L.push({ tabla: {
        cabeceras: ['Concepto', 'Importe'],
        filas: [
          ['Patrimonio bruto', fmtPz(datos.patrimonioBruto)],
          ['Bienes computables', fmtPz(datos.bienesComputables)],
          ['Deudas computables', '−' + fmtPz(datos.deudasComputables)],
          ['Patrimonio exento', '−' + fmtPz(datos.patrimonioExento)],
          ['PATRIMONIO NETO', fmtPz(datos.patrimonioNeto)],
        ],
        anchos: [340, 160], alineaciones: ['left', 'right'], resaltarDesde: 4
      }});
      ln();
      sf('BASE LIQUIDABLE');
      L.push({ tabla: {
        cabeceras: ['Concepto', 'Importe'],
        filas: [
          ['Patrimonio neto', fmtPz(datos.patrimonioNeto)],
          ['Mínimo exento (5.000 Pz)', '− 5.000 Pz'],
          ['BASE LIQUIDABLE', fmtPz(datos.baseIGF)],
        ],
        anchos: [340, 160], alineaciones: ['left', 'right'], resaltarDesde: 2
      }});
      if (datos.tramosIGF && datos.tramosIGF.length > 0) {
        ln();
        sf('APLICACIÓN DE LA ESCALA (Art. 4.13)');
        L.push({ tabla: {
          cabeceras: ['Tramo', 'Base', 'Tipo', 'Cuota'],
          filas: datos.tramosIGF.map(t => [
            t.label || t.tramo || '—',
            fmtPz(t.base),
            t.tipo !== undefined ? (Number(t.tipo) * 100).toFixed(2) + ' %' : '—',
            fmtPz(t.cuota)
          ]),
          anchos: [220, 90, 90, 100], alineaciones: ['left', 'right', 'right', 'right']
        }});
      }
      ln();
      sf('CUOTA Y RESULTADO');
      L.push({ tabla: {
        cabeceras: ['Concepto', 'Importe'],
        filas: [
          ['Cuota', fmtPz(datos.cuotaIGF)],
          ['Bonificaciones', '−' + fmtPz(datos.bonificacionesIGF)],
          ['RESULTADO', fmtPz(datos.resultadoIGF)],
        ],
        anchos: [340, 160], alineaciones: ['left', 'right'], resaltarDesde: 2
      }});
      if (datos.exencionIGF) L.push({nota:'Exención IGF aplicada (Art. 4.15): empresa de reducida dimensión (< 20.000 Pz) o patrimonio bajo mínimo exento.'});
      if (datos.esJunior && datos.pagaCapitalia) {
        L.push({nota:'Régimen Junior: la bonificación se aplica automáticamente y CAPITALIA asume la cuota (Art. 5).'});
      }
      break;
    }

    // ── 5. Declaración de IVA (solo sujetos con operaciones sujetas) ──
    case 'declaracion-iva': {
      const fmtPz = (n) => (Number(n) || 0).toLocaleString('es-ES') + ' Pz';
      sf('DECLARACIÓN DE IVA');
      cf('Titular', datos.titular || datos.contribuyente || '—');
      cf('Identificador fiscal', datos.identificador || datos.dip || (datos.eip || '—'));
      cf('Periodo', datos.periodo || '—');
      ln();
      sf('IVA REPERCUTIDO (Art. 4.4)');
      L.push({ tabla: {
        cabeceras: ['Concepto', 'Base', 'Tipo', 'Cuota'],
        filas: [
          ['Base imponible repercutida', fmtPz(datos.baseRepercutida), '12 %', '—'],
          ['IVA repercutido', '—', '12 %', fmtPz(datos.ivaRepercutido)],
        ],
        anchos: [220, 90, 90, 100], alineaciones: ['left', 'right', 'center', 'right']
      }});
      ln();
      sf('IVA SOPORTADO');
      L.push({ tabla: {
        cabeceras: ['Concepto', 'Base', 'Tipo', 'Cuota'],
        filas: [
          ['Base imponible soportada', fmtPz(datos.baseSoportada), '12 %', '—'],
          ['IVA soportado', '—', '12 %', fmtPz(datos.ivaSoportado)],
        ],
        anchos: [220, 90, 90, 100], alineaciones: ['left', 'right', 'center', 'right']
      }});
      ln();
      sf('RECTIFICACIONES Y DEDUCCIONES');
      L.push({ tabla: {
        cabeceras: ['Concepto', 'Importe'],
        filas: [
          ['Rectificaciones', fmtPz(datos.rectificacionesIVA)],
          ['Deducciones (IVA soportado deducible)', '−' + fmtPz(datos.deduccionesIVA)],
          ['RESULTADO (cuota IVA)', fmtPz(datos.resultadoIVA)],
        ],
        anchos: [340, 160], alineaciones: ['left', 'right'], resaltarDesde: 2
      }});
      if (datos.campañas && datos.campañas.length > 0) {
        ln();
        sf('OPERACIONES DE CAMPAÑA IDENTIFICADAS');
        L.push({ tabla: {
          cabeceras: ['ID', 'Fecha', 'Concepto', 'Importe'],
          filas: datos.campañas.map(c => [
            c.id || '—', c.fecha || '—', (c.concepto || '—').slice(0, 50), fmtPz(c.importe)
          ]),
          anchos: [70, 60, 280, 90], alineaciones: ['left', 'left', 'left', 'right']
        }});
        L.push({nota:'Operaciones relacionadas con campañas (p.ej. «Placetas que Vuelven») identificadas en el anexo.'});
      }
      break;
    }

    // ── 6. Documento de bonificaciones (CERTIFICADO DE BONIFICACIÓN FISCAL) ──
    case 'certificado-bonificacion-fiscal': {
      const fmtPz = (n) => (Number(n) || 0).toLocaleString('es-ES') + ' Pz';
      sf('CERTIFICADO DE BONIFICACIÓN FISCAL');
      cf('Titular', datos.titular || datos.contribuyente || '—');
      cf('Periodo', datos.periodo || '—');
      ln();
      sf('OBLIGACIONES CALCULADAS');
      L.push({ tabla: {
        cabeceras: ['Impuesto', 'Importe calculado'],
        filas: [
          ['IRM calculado', fmtPz(datos.cuotaIRM)],
          ['IGF calculado', fmtPz(datos.cuotaIGF)],
          ['Otros impuestos', fmtPz(datos.otrosImpuestos)],
        ],
        anchos: [300, 200], alineaciones: ['left', 'right']
      }});
      ln();
      const totalBon = (datos.cuotaIRM||0) + (datos.cuotaIGF||0) + (datos.otrosImpuestos||0);
      sf('BONIFICACIÓN Y ASUNCIÓN');
      L.push({ tabla: {
        cabeceras: ['Concepto', 'Importe'],
        filas: [
          ['Total bonificado', fmtPz(totalBon)],
          ['Importe asumido por CAPITALIA', fmtPz(totalBon)],
          ['Importe a cargo del titular', '0 Pz'],
        ],
        anchos: [300, 200], alineaciones: ['left', 'right'], resaltarDesde: 0
      }});
      L.push({nota:'Este certificado deja constancia de que SÍ existía una obligación calculada, pero fue cubierta por CAPITALIA (Art. 5 Normativa Placeta Junior).'});
      break;
    }

    // ── 7. Certificado de cierre fiscal ────────────────────────────────
    case 'certificado-cierre-fiscal': {
      sf('CERTIFICADO DE CIERRE FISCAL');
      tx('El sistema fiscal de La Placeta certifica que los datos correspondientes al periodo ' + (datos.periodo || '—') + ' han sido procesados y conciliados.');
      ln();
      sf('DATOS DEL CIERRE');
      L.push({ tabla: {
        cabeceras: ['Campo', 'Valor'],
        filas: [
          ['Nº de declaración', datos.numeroDfm || '—'],
          ['Hash del expediente', datos.hashExpediente || '—'],
          ['Fecha de cierre', datos.fechaCierre || hoy],
          ['Responsable', datos.responsable || 'Sistema Fiscal de La Placeta (RSP)'],
          ['Estado', datos.estado || 'Definitivo'],
          ['Firma digital / QR', datos.firmaDigital || 'Sello digital RSP — verificación en rsp.laplaceta.org'],
        ],
        anchos: [180, 320], alineaciones: ['left', 'left']
      }});
      L.push({nota:'Cierre del expediente fiscal mensual. El hash del expediente garantiza la integridad de las declaraciones del periodo.'});
      break;
    }

    case 'informe-inspeccion-trib':
      sf('DATOS DE LA INSPECCIÓN'); cf('Inspector', datos.inspector); cf('Contribuyente', datos.contribuyente);
      cf('Fecha', datos.fechaInspeccion||hoy); cf('Resultado', datos.resultado||'Pendiente');
      cf('Observaciones', datos.observaciones);
      if (datos.medidas?.length) { sf('MEDIDAS'); datos.medidas.forEach((m,i) => cf(`${i+1}`, m)); }
      break;

    case 'acta':
    case 'acta-firmada':
      sf('DATOS GENERALES DEL ACTA');
      cf('Reunión', datos.reunion||'—');
      cf('Fecha de celebración', datos.fecha||hoy);
      cf('Hora de inicio', datos.horaInicio||'—');
      cf('Hora de finalización', datos.horaFin||'—');
      cf('Lugar', datos.lugar||'—');
      cf('Convocante', datos.convocante||'—');
      cf('Tipo de reunión', datos.tipoReunion||'Ordinaria');
      cf('Número de acta', datos.numActa||'—');
      ln();
      sf('ASISTENTES');
      if (datos.asistentes?.length) {
        const presentes = datos.asistentes.filter(a => a.presente !== false);
        presentes.forEach((a,i) => cf(`${i+1}. ${a.nombre||a}`, a.cargo?`${a.cargo}${a.dip?' ('+a.dip+')':''}`:'Presente'));
        cf('Total asistentes', String(presentes.length));
        const ausentes = datos.asistentes.filter(a => a.presente === false);
        if (ausentes.length) { ln(); sf('AUSENTES'); ausentes.forEach((a,i) => cf(`${i+1}`, a.nombre||a)); }
      } else {
        cf('No se registraron asistentes', '—');
      }
      ln();
      sf('ORDEN DEL DÍA');
      if (datos.ordenDelDia?.length) {
        datos.ordenDelDia.forEach((o,i) => cf(`Punto ${i+1}`, typeof o === 'string' ? o : (o.titulo||o)));
      } else cf('No se registró orden del día', '—');
      ln();
      sf('DESARROLLO DE LA SESIÓN');
      if (datos.desarrollo) {
        tx(datos.desarrollo);
      }
      datos.puntosTratados?.forEach((p,i) => {
        ln();
        sf(`PUNTO ${i+1}: ${p.titulo||''}`);
        if (p.descripcion) tx(p.descripcion);
        if (p.intervenciones?.length) {
          p.intervenciones.forEach((iv, j) => cf(`Intervención ${j+1}`, `${iv.quien}: ${iv.texto}`));
        }
      });
      ln();
      sf('VOTACIONES');
      if (datos.votaciones?.length) {
        datos.votaciones.forEach((v, vi) => {
          ln();
          sf(`Votación ${vi+1}: ${v.titulo||'Sin título'}`);
          cf('Tipo', v.tipo||'Ordinaria');
          cf('Grupo convocado', v.grupo||'Todos');
          cf('Quorum requerido', v.quorum?String(v.quorum)+'%':'—');
          cf('Participantes', v.totalVotos!==undefined?String(v.totalVotos):'—');
          cf('A favor', v.aFavor!==undefined?String(v.aFavor):'—');
          cf('En contra', v.enContra!==undefined?String(v.enContra):'—');
          cf('Abstenciones', v.abstenciones!==undefined?String(v.abstenciones):'—');
          cf('Resultado', v.resultado||(v.aFavor > v.enContra?'APROBADA':'NO APROBADA'));
          cf('Finalizada', v.cerrada?'Sí':'No');
        });
      } else {
        cf('No se registraron votaciones', '—');
      }
      ln();
      sf('ACUERDOS ADOPTADOS');
      if (datos.acuerdos?.length) {
        datos.acuerdos.forEach((a,i) => cf(`Acuerdo ${i+1}`, typeof a === 'string' ? a : (a.texto||a)));
      } else cf('No se adoptaron acuerdos', '—');
      if (datos.proximosPasos) { ln(); sf('PRÓXIMOS PASOS'); tx(datos.proximosPasos); }
      if (tipo==='acta-firmada') {
        ln();
        sf('FIRMAS DIGITALES');
        cf('Presidente', datos.firmaPresidente||'—');
        cf('Secretario/a', datos.firmaSecretario||'—');
        cf('Fecha de firma', datos.fechaFirma||hoy);
        cf('Hash de integridad', datos.hashActa||'—');
        L.push({nota:'El presente acta ha sido aprobada por los asistentes y firmada digitalmente mediante PlacetaID. El hash de integridad garantiza la inmutabilidad del documento.'});
      } else {
        L.push({nota:'ACTA PROVISIONAL — Pendiente de aprobación y firma digital. Este documento no tiene validez oficial hasta su firma mediante PlacetaID.'});
      }
      break;

    case 'certificado-situacion-tributaria':
      sf('CERTIFICADO DE SITUACIÓN TRIBUTARIA'); cf('Contribuyente', datos.contribuyente||datos.nombre); cf('DIP', datos.dip);
      cf('Situación fiscal', datos.situacion||'Al corriente'); cf('Última declaración', datos.ultimaDeclaracion);
      cf('Deuda pendiente', datos.deudaPendiente!==undefined?datos.deudaPendiente.toLocaleString()+' Pz':'0 Pz');
      cf('Fecha emisión', datos.fechaEmision||hoy);
      L.push({nota:'Se CERTIFICA que el contribuyente se encuentra al corriente de sus obligaciones tributarias en el sistema GDLP.'});
      break;

    case 'convocatoria':
      sf('CONVOCATORIA'); cf('Convocante', datos.convocante); cf('Reunión', datos.reunion);
      cf('Fecha', datos.fecha); cf('Hora', datos.hora); cf('Lugar', datos.lugar);
      ln(); sf('ORDEN DEL DÍA'); (datos.ordenDelDia||[]).forEach((o,i) => cf(`${i+1}`, o));
      if (datos.destinatarios?.length) { sf('DESTINATARIOS'); datos.destinatarios.forEach((d,i) => cf(`${i+1}`, d)); }
      break;

    case 'factura':
      sf('DATOS DE LA FACTURA');
      cf('Número de factura', datos.numeroFactura||'—');
      cf('Emisor', datos.emisor||'—');
      cf('Receptor', datos.receptor||'—');
      cf('Fecha de emisión', datos.fechaEmision?new Date(datos.fechaEmision).toLocaleDateString('es-ES'):hoy);
      cf('CSV de verificación', datos.csv||'—');
      ln();
      sf('LÍNEAS DE FACTURACIÓN');
      if (datos.lineas?.length) {
        datos.lineas.forEach((l,i) => {
          ln();
          sf(`Línea ${i+1}: ${l.conceptoProducto||l.concepto||'—'}`);
          cf('Cantidad', String(l.cantidad||1));
          cf('Precio unitario', (l.precioUnitario||0).toLocaleString()+' Pz');
          cf('IVA', (l.ivaPorcentaje||12)+'%');
          cf('Subtotal neto', (l.subtotalNeto||0).toLocaleString()+' Pz');
          cf('Subtotal IVA', (l.subtotalIva||0).toLocaleString()+' Pz');
        });
      } else cf('No hay líneas', '—');
      ln();
      sf('RESUMEN DE LA FACTURA');
      cf('Base imponible', (datos.baseImponible||0).toLocaleString()+' Pz');
      cf('IVA (12%)', (datos.totalIVA||0).toLocaleString()+' Pz');
      cf('TOTAL FACTURA', (datos.totalFactura||0).toLocaleString()+' Pz');
      cf('Moneda', 'Placeta (Pz)');
      cf('Estado', datos.estado||'Emitida');
      L.push({nota:`Factura emitida según Art. 4.17 del Código Normativo Interno GDLP. IVA 12% incluido. CSV de verificación: ${datos.csv||'—'}. Verificable en admin-placeta.vercel.app.`});
      break;

    case 'resultado-definitivo':
      sf('RESULTADO DE VOTACIÓN'); cf('Votación', datos.votacion); cf('Fecha', datos.fecha||hoy);
      cf('Participantes', datos.participantes?.toString()); cf('Votos a favor', datos.votosFavor?.toString());
      cf('Votos en contra', datos.votosContra?.toString()); cf('Abstenciones', datos.abstenciones?.toString());
      cf('Resultado', datos.resultado); cf('Verificación', datos.verificacion||'Pendiente');
      break;

    case 'solicitud':
      sf('SOLICITUD'); cf('Solicitante', datos.solicitante); cf('DIP', datos.dip);
      cf('Trámite', datos.tramite); cf('Fecha', datos.fecha||hoy); cf('Descripción', datos.descripcion);
      break;

    // ── Tarjetas ─────────────────────────────────────────────────────────
    case 'alta-tarjeta':
      sf('SOLICITUD DE ALTA DE TARJETA');
      cf('Titular', datos.titular||datos.nombre); cf('DIP', datos.dip);
      cf('Tipo de tarjeta', datos.tipoTarjeta||'Débito'); cf('Cuenta vinculada', datos.iban);
      cf('Límite diario', datos.limiteDiario ? datos.limiteDiario+' Pz' : '—');
      cf('Límite mensual', datos.limiteMensual ? datos.limiteMensual+' Pz' : '—');
      L.push({nota:'La tarjeta será activada una vez firmado el presente documento. El PIN se generará de forma segura y se comunicará al titular por canal seguro.'});
      break;

    case 'bloqueo-tarjeta':
      sf('BLOQUEO DE TARJETA');
      cf('Titular', datos.titular||datos.nombre); cf('DIP', datos.dip);
      cf('Número de tarjeta', datos.numeroTarjeta||'—'); cf('Motivo', datos.motivo||'Robo');
      cf('Fecha de bloqueo', datos.fechaBloqueo||hoy);
      L.push({nota:'La tarjeta queda bloqueada para cualquier uso. Para desbloquear, el titular deberá solicitarlo expresamente.'});
      break;

    case 'baja-tarjeta':
      sf('BAJA DE TARJETA');
      cf('Titular', datos.titular||datos.nombre); cf('DIP', datos.dip);
      cf('Número de tarjeta', datos.numeroTarjeta||'—'); cf('Motivo', datos.motivo||'Solicitud titular');
      cf('Fecha de baja', datos.fechaBaja||hoy);
      break;

    case 'renovacion-tarjeta':
      sf('RENOVACIÓN DE TARJETA');
      cf('Titular', datos.titular||datos.nombre); cf('DIP', datos.dip);
      cf('Tarjeta actual', datos.numeroTarjeta||'—'); cf('Motivo', datos.motivoRenovacion||'Caducidad');
      cf('Nuevo límite', datos.nuevoLimite ? datos.nuevoLimite+' Pz' : 'Igual');
      break;

    // ── Productos ────────────────────────────────────────────────────────
    case 'apertura-deposito':
      sf('APERTURA DE DEPÓSITO');
      cf('Titular', datos.titular||datos.nombre); cf('DIP', datos.dip);
      cf('Importe', datos.importe ? datos.importe.toLocaleString()+' Pz' : '—');
      cf('Plazo', datos.plazoDias ? datos.plazoDias+' días' : '—');
      cf('Interés', datos.interes ? datos.interes+'%' : '—');
      cf('Renovación automática', datos.renovacionAutomatica||'Sí');
      break;

    case 'apertura-ahorro':
      sf('APERTURA DE CUENTA AHORRO');
      cf('Titular', datos.titular||datos.nombre); cf('DIP', datos.dip);
      cf('Importe inicial', datos.importeInicial ? datos.importeInicial.toLocaleString()+' Pz' : '0 Pz');
      cf('Tipo de interés', datos.tipoInteres ? datos.tipoInteres+'%' : '—');
      break;

    // ── Cumplimiento ──────────────────────────────────────────────────────
    case 'informe-aml':
      sf('INFORME AML — PREVENCIÓN DE BLANQUEO');
      cf('Sujeto', datos.sujeto); cf('DIP', datos.dip);
      cf('Nivel de riesgo', datos.nivelRiesgo||'—'); cf('Fecha análisis', datos.fechaAnalisis||hoy);
      cf('Resultado', datos.resultado||'Pendiente');
      if (datos.medidas?.length) { sf('MEDIDAS'); datos.medidas.forEach((m,i) => cf(`${i+1}`, m)); }
      break;

    case 'informe-kyc':
      sf('INFORME KYC — CONOCIMIENTO DEL CLIENTE');
      cf('Cliente', datos.cliente); cf('DIP', datos.dip);
      cf('Nivel verificación', datos.nivelVerificacion||'—');
      cf('Estado', datos.estado||'Pendiente');
      cf('Observaciones', datos.observaciones||'—');
      break;

    // ── Comunicaciones ────────────────────────────────────────────────────
    case 'comunicacion-oficial':
      sf('COMUNICACIÓN OFICIAL');
      cf('Emisor', datos.emisor); cf('Destinatario', datos.destinatario);
      cf('Asunto', datos.asunto); cf('Fecha', datos.fecha||hoy);
      if (datos.cuerpo) tx(datos.cuerpo);
      break;

    case 'oficio':
      sf('OFICIO');
      cf('Emisor', datos.emisor); if (datos.cargo) cf('Cargo', datos.cargo);
      cf('Destinatario', datos.destinatario); cf('Asunto', datos.asunto);
      cf('Fecha', datos.fecha||hoy);
      if (datos.texto) tx(datos.texto);
      break;

    case 'alta-junior': {
      sf('AUTORIZACIÓN LEGAL — PLACETA JUNIOR');
      if (datos.menor) { cf('Menor', `${datos.menor.nombre||''} ${datos.menor.apellidos||''}`); cf('Fecha nacimiento', datos.menor.fecha_nacimiento||'—'); }
      ln(); sf('TUTOR LEGAL');
      if (datos.tutor) { cf('Nombre', `${datos.tutor.nombre||''} ${datos.tutor.apellidos||''}`); cf('DIP', datos.tutor.dip||'—'); cf('Email', datos.tutor.email||'—'); }
      ln(); sf('EXPONE');
      tx(`Que el tutor legal identificado, ${datos.tutor?.nombre||''} ${datos.tutor?.apellidos||''}, con DIP ${datos.tutor?.dip||'—'}, solicita el alta del menor ${datos.menor?.nombre||''} ${datos.menor?.apellidos||''} en el programa Placeta Junior del Grupo de La Placeta.`);
      tx('Que el tutor manifiesta conocer y aceptar las condiciones de uso, la política de privacidad y el Código Normativo Interno que rige el funcionamiento de Placeta Junior.');
      ln(); sf('FUNDAMENTOS JURÍDICOS');
      tx('La presente autorización se fundamenta en el Artículo 5 del Código Normativo Interno (PlacetaID como sistema de identificación), el Artículo 6 (DIP como identificador único) y la normativa de protección de datos aplicable a menores de edad según el RGPD y la LOPDGDD.');
      ln(); sf('RESUELVE');
      tx('Primero. — AUTORIZAR al menor a participar en el programa Placeta Junior.');
      tx('Segundo. — ASIGNAR un DIP Junior y crear la cuenta asociada.');
      tx('Tercero. — VINCULAR la cuenta del menor a la tutela del adulto responsable.');
      ln(); L.push({nota: 'Documento oficial del programa Placeta Junior · Grupo de La Placeta.'});
      L.push({nota: 'AVISO LEGAL: Al firmar electrónicamente este documento vía PlacetaID, el tutor otorga su consentimiento expreso para la participación del menor en Placeta Junior.'});
      break;
    }

    // ── Placeta Junior · Términos y Condiciones (PJ-TYC-001) ───────────
    case 'terminos-junior': {
      sf('TÉRMINOS Y CONDICIONES — PLACETA JUNIOR');
      cf('Documento', 'PJ-TYC-001');
      if (datos.menor) { cf('Menor', `${datos.menor.nombre||''} ${datos.menor.apellidos||''}`); cf('Fecha nacimiento', datos.menor.fecha_nacimiento||'—'); if (datos.menor.dip) cf('DIP Junior', datos.menor.dip); }
      if (datos.tutor) { ln(); sf('TUTOR LEGAL'); cf('Nombre', `${datos.tutor.nombre||''} ${datos.tutor.apellidos||''}`); cf('DIP', datos.tutor.dip||'—'); if (datos.tutor.email) cf('Email', datos.tutor.email); }
      ln(); sf('1. IDENTIFICACIÓN');
      tx('Operador del servicio: Grupo de La Placeta. Aplicación: Placeta Junior. Contacto: junta@laplaceta.org. Sitio web: https://junior.laplaceta.org.');
      ln(); sf('2. OBJETO DEL SERVICIO');
      tx('Placeta Junior es una plataforma educativa de actividades y juegos para niñas y niños de 6 a 16 años, integrada en el ecosistema del Grupo de La Placeta. A través de la aplicación, el menor puede realizar actividades (test, sopa de letras, relacionar, ordenar, completar, cálculo mental, mapamundi y bloques de texto), acumular puntos verdes y rojos, gestionar Placetas (moneda interna del programa) y relacionarse con otros menores a través de la lista de amistades. El acceso y uso de la aplicación implican la aceptación de estos Términos y Condiciones, de la Política de Privacidad y del documento de Consentimiento.');
      ln(); sf('3. EDAD Y AUTORIZACIÓN DEL TUTOR');
      tx('Placeta Junior está dirigida a menores de 6 a 16 años. El alta de un menor solo puede realizarla su tutor o tutora legal (mayor de edad). El tutor deberá leer, aceptar y firmar los documentos legales durante el proceso de registro, confirmando la tutela legal del menor. El menor no puede registrarse ni acceder a funciones sensibles por sí mismo sin la autorización expresa de su tutor. El tutor es responsable de supervisar el uso que el menor hace de la aplicación.');
      ln(); sf('4. CUENTA JUNIOR Y DIP');
      tx('Cada menor dispone de un DIP Junior (Documento de Identidad PlacetaID) que identifica su cuenta dentro del programa. La cuenta se vincula al tutor legal en el momento del alta. El menor puede iniciar sesión de forma persistente en su dispositivo. La suplantación de identidad, el uso de cuentas ajenas o la creación de cuentas sin autorización del tutor constituyen un uso indebido del servicio.');
      ln(); sf('5. ACTIVIDADES Y CONTENIDO');
      tx('Las actividades pueden ser públicas (gratuitas), subvencionadas o de pago con Placetas. El contenido educativo puede incluir textos, imágenes y pictogramas (en su caso, de ARASAAC, bajo su licencia). El progreso, los puntos verdes/rojos y los diplomas obtenidos quedan registrados en la cuenta del menor. El contenido descargado para el modo sin conexión permanece en el dispositivo del usuario.');
      ln(); sf('6. PLACETAS Y ECONOMÍA INTERNA');
      tx('Las Placetas son la moneda interna del programa y no tienen valor fuera del ecosistema de La Placeta. Se obtienen mediante canjes de puntos, la Renta Básica Universal (RBU) diaria del programa y otras recompensas. Pueden canjearse por actividades, recompensas y otras prestaciones del programa. El saldo de Placetas se gestiona a través de la cuenta del menor bajo supervisión del tutor y de los límites de control parental aplicables. Las transferencias de Placetas entre menores se realizan a través del sistema oficial del programa y están sujetas a los límites y autorizaciones establecidos.');
      ln(); sf('7. AMISTADES');
      tx('El menor puede añadir amigos dentro del programa mediante su DIP o mediante código QR. Solo se añaden menores que existen dentro del ecosistema. Las comisiones de las transferencias entre amigos las asume el programa (Capitalia), sin coste para el menor.');
      ln(); sf('8. MODO SIN CONEXIÓN');
      tx('La aplicación permite descargar actividades para jugar sin conexión, hasta el límite configurado por el servicio. Las actividades de pago no se pueden descargar para su uso sin conexión. Los datos descargados permanecen en el dispositivo y no se comparten con terceros.');
      ln(); sf('9. USO RESPONSABLE Y CONDUCTA');
      tx('El usuario (menor, bajo supervisión del tutor) se compromete a usar la aplicación de forma lícita, respetuosa y conforme a estos Términos; no intentar vulnerar la seguridad del servicio ni acceder a datos ajenos; no realizar transferencias, canjes o compras sin la autorización correspondiente; y comunicar al tutor cualquier incidencia o uso indebido detectado.');
      ln(); sf('10. DERECHOS DEL TUTOR, SUSPENSIÓN Y BAJA');
      tx('El tutor puede solicitar en cualquier momento la baja del menor del programa, lo que implicará la eliminación o anonimización de sus datos conforme a la normativa aplicable. El operador puede suspender el acceso a la cuenta en caso de uso indebido o incumplimiento de estos Términos, previa comunicación al tutor. El tutor puede ejercer los derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad respecto de los datos del menor (ver Política de Privacidad).');
      ln(); sf('11. LIMITACIONES DEL SERVICIO');
      tx('El servicio se presta «tal cual», con la diligencia razonable, y puede requerir conexión a internet para determinadas funciones. El operador no garantiza la disponibilidad ininterrumpida del servicio. El ecosistema de La Placeta tiene un carácter lúdico y educativo; las Placetas y demás elementos del programa carecen de valor económico real fuera de dicho ecosistema.');
      ln(); sf('12. PROPIEDAD INTELECTUAL');
      tx('La aplicación, su contenido, la marca Placeta Junior y los elementos del ecosistema son propiedad del Grupo de La Placeta o de sus licenciantes. Las actividades creadas por los usuarios del programa (a través del Studio) se publican en el marco del programa con fines educativos. Los pictogramas de ARASAAC se utilizan bajo su licencia.');
      ln(); sf('13. MODIFICACIONES');
      tx('El Grupo de La Placeta puede actualizar estos Términos para adaptarlos a novedades legales, técnicas o funcionales. Los cambios relevantes se notificarán a través de la aplicación o de los canales habituales del ecosistema. La versión vigente estará siempre disponible en la aplicación y en el sitio web oficial.');
      ln(); sf('14. LEGISLACIÓN APLICABLE');
      tx('Estos Términos se rigen por la legislación española y de la Unión Europea, en particular el Reglamento (UE) 2016/679 (RGPD), la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD) y la normativa interna del Grupo de La Placeta (Código Normativo Interno, CNI).');
      ln(); sf('15. CONTACTO');
      tx('Grupo de La Placeta · Correo electrónico: junta@laplaceta.org');
      ln();
      L.push({nota: 'Documento oficial del programa Placeta Junior · Grupo de La Placeta.'});
      L.push({nota: 'AVISO LEGAL: Al firmar electrónicamente este documento vía PlacetaID Móvil, el tutor legal acepta los Términos y Condiciones de Placeta Junior en representación del menor.'});
      break;
    }

    // ── Placeta Junior · Política de Privacidad (PJ-PRV-001) ───────────
    case 'privacidad-junior': {
      sf('POLÍTICA DE PRIVACIDAD — PLACETA JUNIOR');
      cf('Documento', 'PJ-PRV-001');
      if (datos.menor) { cf('Menor', `${datos.menor.nombre||''} ${datos.menor.apellidos||''}`); if (datos.menor.dip) cf('DIP Junior', datos.menor.dip); }
      if (datos.tutor) { ln(); sf('TUTOR LEGAL'); cf('Nombre', `${datos.tutor.nombre||''} ${datos.tutor.apellidos||''}`); cf('DIP', datos.tutor.dip||'—'); if (datos.tutor.email) cf('Email', datos.tutor.email); }
      ln(); sf('1. IDENTIFICACIÓN DEL RESPONSABLE');
      tx('Responsable del tratamiento: Grupo de La Placeta. Aplicación: Placeta Junior. Contacto: junta@laplaceta.org. Sitio web: https://junior.laplaceta.org.');
      ln(); sf('2. ÁMBITO DE APLICACIÓN Y EDAD');
      tx('Esta política regula el tratamiento de los datos personales recabados a través de la aplicación móvil Placeta Junior, una plataforma educativa de actividades y juegos para niñas y niños de 6 a 16 años dentro del ecosistema del Grupo de La Placeta. El alta de un menor solo puede realizarla su tutor o tutora legal, quien deberá leer, aceptar y firmar los documentos legales durante el proceso de registro.');
      ln(); sf('3. DATOS QUE TRATAMOS');
      tx('Datos del tutor legal: nombre y apellidos, DIP (Documento de Identidad PlacetaID) y relación con el menor, para identificar al responsable del menor, verificar su identidad y confirmar la tutela legal.');
      tx('Datos del menor: nombre, edad/fecha de nacimiento, DIP Junior, progreso y puntos (verdes/rojos), Placetas, actividades realizadas y amigos, para personalizar la interfaz, ajustar la dificultad, gestionar la economía interna y generar diplomas y estadísticas.');
      tx('Datos recabados automáticamente: identificador de sesión, actividades descargadas para sin conexión y ajustes de accesibilidad. La aplicación NO recopila datos de ubicación, contactos, fotos ni micrófono.');
      ln(); sf('4. FINALIDADES DEL TRATAMIENTO');
      tx('Registro y alta del menor; juego y aprendizaje; seguimiento del progreso; economía interna (Placetas, canjes, recompensas y compras); relaciones sociales del programa; accesibilidad (lectura en voz alta y ajustes de visualización); juego sin conexión; y seguridad y control parental.');
      ln(); sf('5. BASE LEGAL DEL TRATAMIENTO');
      tx('Consentimiento del tutor legal (art. 6.1.a y art. 8 RGPD) prestado al firmar los documentos legales; ejecución de un contrato (art. 6.1.b RGPD); interés legítimo (art. 6.1.f RGPD) para seguridad y control parental; y obligación legal (art. 6.1.c RGPD) cuando corresponda.');
      ln(); sf('6. PERMISOS DE LA APLICACIÓN');
      tx('Placeta Junior solicita únicamente los permisos estrictamente necesarios: INTERNET (cargar actividades e imágenes), ACCESS_NETWORK_STATE (comprobar conectividad) y CAMERA (escanear el código QR de un amigo, opcional). No utiliza micrófono: los efectos de sonido se generan internamente y la lectura en voz alta usa el lector de texto (TTS) del sistema; los textos leídos no se envían a terceros.');
      ln(); sf('7. ALMACENAMIENTO LOCAL Y JUEGO SIN CONEXIÓN');
      tx('La aplicación guarda localmente en el dispositivo la sesión de la cuenta, las actividades descargadas (contenido y portadas) para jugar sin conexión, y los ajustes de accesibilidad. Estos datos se almacenan en el almacenamiento interno de la aplicación, no se comparten con terceros y permanecen en el dispositivo mientras no se eliminen o se desinstale la aplicación.');
      ln(); sf('8. COMUNICACIÓN DE DATOS A TERCEROS');
      tx('La aplicación se conecta al servidor oficial de Placeta Junior (Grupo de La Placeta) mediante conexiones seguras. Algunas actividades pueden mostrar pictogramas de ARASAAC, cuyas imágenes se cargan desde sus servidores bajo su licencia. Placeta Junior NO muestra publicidad, NO incorpora analíticas de terceros y NO cede datos personales de los menores a terceros para fines comerciales.');
      ln(); sf('9. SEGURIDAD');
      tx('Placeta Junior aplica medidas técnicas y organizativas razonables: comunicaciones mediante HTTPS, identificación por DIP y verificación de la tutela en el registro, almacenamiento local de la sesión en el contenedor privado de la aplicación, y control parental (el menor no puede registrarse ni acceder a funciones sensibles sin el tutor).');
      ln(); sf('10. DERECHOS DEL USUARIO');
      tx('El tutor legal puede ejercer, en nombre del menor, los derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad, así como la retirada del consentimiento en cualquier momento. Para ejercerlos, escriba a junta@laplaceta.org indicando el DIP del menor y del tutor. También puede presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) en www.aepd.es.');
      ln(); sf('11. CONSERVACIÓN DE DATOS');
      tx('Los datos se conservan mientras el menor permanezca dado de alta en Placeta Junior y sean necesarios para prestar el servicio, mantener el progreso y cumplir obligaciones legales. Al causar baja (solicitada por el tutor), se eliminan o anonimizan los datos conforme a la normativa aplicable. Los datos locales se eliminan al borrar los datos de la aplicación o desinstalarla.');
      ln(); sf('12. TRANSFERENCIAS INTERNACIONALES DE DATOS');
      tx('Los servidores del ecosistema del Grupo de La Placeta pueden estar ubicados en la Unión Europea o en proveedores que ofrecen garantías adecuadas (Cláusulas Contractuales Tipo o marcos equivalentes). Las imágenes de ARASAAC se sirven desde sus infraestructuras bajo su propia política.');
      ln(); sf('13. MENORES Y CONTROL PARENTAL');
      tx('Placeta Junior está dirigida a menores de 6 a 16 años y requiere la autorización expresa del tutor legal en el momento del registro. El Grupo de La Placeta no recopila intencionadamente datos de menores sin el consentimiento de sus tutores. Si se detecta un tratamiento sin autorización, se procederá a su eliminación inmediata.');
      ln(); sf('14. MODIFICACIONES DE LA POLÍTICA');
      tx('El Grupo de La Placeta puede actualizar esta política para adaptarla a novedades legales, técnicas o funcionales. Los cambios relevantes se notificarán a través de la aplicación o de los canales habituales del ecosistema. La versión vigente estará siempre disponible en la aplicación y en el sitio web oficial.');
      ln(); sf('15. LEGISLACIÓN APLICABLE');
      tx('Esta política se rige por la legislación española y de la Unión Europea, en particular el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD).');
      ln(); sf('16. CONTACTO');
      tx('Para cualquier cuestión relacionada con la privacidad y el tratamiento de los datos personales: Grupo de La Placeta · junta@laplaceta.org');
      ln();
      L.push({nota: 'Documento oficial del programa Placeta Junior · Grupo de La Placeta.'});
      L.push({nota: 'AVISO LEGAL: Al firmar electrónicamente este documento vía PlacetaID Móvil, el tutor legal manifiesta conocer y aceptar la Política de Privacidad de Placeta Junior en representación del menor.'});
      break;
    }

    // ── Placeta Junior · Consentimiento del tutor (PJ-CON-001) ─────────
    case 'consentimiento-junior': {
      sf('CONSENTIMIENTO DE TRATAMIENTO DE DATOS DEL MENOR — PLACETA JUNIOR');
      cf('Documento', 'PJ-CON-001');
      if (datos.tutor) { sf('DATOS DEL TUTOR LEGAL'); cf('Nombre y apellidos', `${datos.tutor.nombre||''} ${datos.tutor.apellidos||''}`); cf('DIP', datos.tutor.dip||'—'); if (datos.tutor.email) cf('Email', datos.tutor.email); }
      if (datos.menor) { ln(); sf('DATOS DEL MENOR'); cf('Nombre y apellidos', `${datos.menor.nombre||''} ${datos.menor.apellidos||''}`); cf('Fecha de nacimiento', datos.menor.fecha_nacimiento||'—'); if (datos.menor.dip) cf('DIP Junior', datos.menor.dip); }
      ln(); sf('DECLARACIÓN DE TUTELA');
      tx('El abajo firmante declara ser el tutor o tutora legal del menor identificado en el presente documento y, por tanto, estar legitimado para prestar el consentimiento en su nombre de conformidad con el artículo 8 del Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).');
      ln(); sf('CONSENTIMIENTO PARA EL TRATAMIENTO DE DATOS');
      tx('En calidad de tutor legal del menor, otorgo mi consentimiento para que el Grupo de La Placeta trate los datos personales del menor con las siguientes finalidades: (1) registro y alta con vinculación al tutor; (2) juego y aprendizaje mediante actividades educativas; (3) seguimiento del progreso, puntos verdes/rojos, estadísticas, recompensas y diplomas; (4) economía interna: gestión de Placetas, canjes, recompensas y compras de actividades con el saldo del menor; (5) relaciones sociales del programa: lista de amistades dentro del ecosistema (solo si el amigo existe); (6) accesibilidad: lectura en voz alta con el lector del dispositivo y ajustes de visualización; (7) modo sin conexión: guardado local de actividades descargadas y sus portadas; y (8) seguridad y control parental: verificación de la tutela y protección de la cuenta.');
      tx('Los datos tratados son los detallados en la Política de Privacidad (PJ-PRV-001): nombre, edad/fecha de nacimiento, DIP Junior, progreso y puntos, Placetas, actividades realizadas y amigos.');
      ln(); sf('CARÁCTER VOLUNTARIO Y BASE LEGAL');
      tx('Este consentimiento es voluntario y constituye la base legal del tratamiento de los datos del menor (art. 6.1.a y art. 8 RGPD). La negativa a prestarlo impedirá el alta y el uso de la aplicación por parte del menor.');
      ln(); sf('DERECHOS DEL TUTOR');
      tx('El tutor legal puede ejercer, en nombre del menor, los derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad, así como la retirada del consentimiento en cualquier momento, sin efectos retroactivos. Para ejercer estos derechos, escriba a junta@laplaceta.org indicando el DIP del menor y del tutor. También puede presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) en www.aepd.es.');
      ln(); sf('CONFIRMACIÓN Y FIRMA');
      tx('Confirmo que he leído y comprendido este documento, la Política de Privacidad y los Términos y Condiciones de Placeta Junior, y que otorgo mi consentimiento libre, específico, informado e inequívoco para el tratamiento de los datos del menor conforme a lo anterior.');
      if (datos.tutor) { cf('Firma del tutor legal', `${datos.tutor.nombre||''} ${datos.tutor.apellidos||''} (${datos.tutor.dip||'—'})`); }
      cf('Fecha', datos.fecha || hoy);
      ln();
      L.push({nota: 'Documento oficial del programa Placeta Junior · Grupo de La Placeta.'});
      L.push({nota: 'AVISO LEGAL: Al firmar electrónicamente este documento vía PlacetaID Móvil, el tutor legal otorga su consentimiento expreso para el tratamiento de los datos del menor, conforme al RGPD (UE) 2016/679 y la LOPDGDD 3/2018.'});
      break;
    }

    case 'informe-pdf':
    case 'certificado':
    case 'notificacion':
      sf('DATOS DEL DOCUMENTO');
      for (const [k,v] of Object.entries(datos)) {
        if (typeof v==='object'&&v!==null) { for (const [sk,sv] of Object.entries(v)) cf(sk,sv); }
        else if (!Array.isArray(v)) cf(k,v);
      }
      break;

    // ── Documento desde el editor personalizado ─────────────────────────
    case 'editor-personalizado': {
      if (datos.titular) { sf('DATOS'); cf('Titular', datos.titular); if (datos.dip) cf('DIP', datos.dip); if (datos.iban) cf('IBAN/Ref.', datos.iban); ln(); }
      if (datos.expone) {
        sf('EXPONE');
        datos.expone.split('\n').filter(l=>l.trim()).forEach(p => tx(p.trim()));
        ln();
      }
      if (datos.fundamentos) {
        sf('FUNDAMENTOS JURÍDICOS');
        datos.fundamentos.split('\n').filter(l=>l.trim()).forEach(p => tx(p.trim()));
        ln();
      }
      if (datos.resuelve) {
        sf('RESUELVE');
        datos.resuelve.split('\n').filter(l=>l.trim()).forEach(p => tx(p.trim()));
        ln();
      }
      if (datos.notas) {
        datos.notas.split('\n').filter(l=>l.trim()).forEach(n => L.push({nota: n.trim()}));
      }
      break;
    }

    // ── Subvención: Concesión ──────────────────────────────────────────
    case 'subvencion-concesion': {
      const fmt = (n) => (Number(n)||0).toLocaleString('es-ES') + ' Pz';
      const fec = (f) => f ? new Date(f).toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'numeric' }) : hoy;
      sf('SUBVENCION CONCEDIDA');
      cf('Nº de subvención', datos.id || datos.refId || '—');
      cf('Fecha de concesión', fec(datos.fecha_concesion || datos.createdAt));
      cf('Estado', 'Concedida');
      ln();
      sf('PARTES');
      cf('Empresa subvencionadora (EIP)', `${datos.emisor_nombre || datos.emisor_eip} (${datos.emisor_eip || '—'})`);
      cf('Empresa subvencionada (EIP)', `${datos.receptor_nombre || datos.receptor_eip} (${datos.receptor_eip || '—'})`);
      cf('Concedida por', datos.concedida_por || '—');
      ln();
      sf('DETALLE DE LA SUBVENCION');
      cf('Concepto', datos.concepto || 'Subvención');
      cf('Importe total', fmt(datos.importe));
      cf('Importe restante', fmt(datos.importe_restante !== undefined ? datos.importe_restante : datos.importe));
      if (datos.fecha_limite) cf('Fecha límite de justificación', fec(datos.fecha_limite));
      if (Array.isArray(datos.excluir_tipos) && datos.excluir_tipos.length) {
        cf('Tipos de gasto excluidos', datos.excluir_tipos.join(', '));
      }
      ln(); sf('EXPONE');
      tx('PRIMERO. — Que la empresa subvencionadora identificada en el presente documento, en ejercicio de su autonomía de la voluntad y de conformidad con el régimen de Subvenciones del Registro de Sociedades de La Placeta (RSP), ha resuelto conceder una subvención a favor de la empresa subvencionada identificada, por el importe total indicado, con el objeto y finalidad descritos en el concepto de la subvención.');
      tx('SEGUNDO. — Que el importe total de la subvención se fija en la cuantía señalada, sin que en el momento de la concesión se produzca movimiento alguno de Placetas entre las cuentas bancarias de las empresas intervinientes. Los fondos se harán efectivos exclusivamente mediante la justificación de gastos reales de la empresa subvencionada, conforme al procedimiento establecido.');
      tx('TERCERO. — Que la empresa subvencionada deberá justificar los gastos cubiertos por la subvención seleccionando transacciones de gasto de su cuenta bancaria dentro del importe restante, pudiendo la empresa subvencionadora excluir determinados tipos de gasto (impuestos, comisiones, declaraciones de la renta IRM/IGF, IVA u otros).');
      tx('CUARTO. — Que la subvención podrá cerrarse por la empresa subvencionada, por la empresa subvencionadora o automáticamente en la fecha límite programada, generándose en tal caso el correspondiente documento de cierre.');
      ln(); sf('RESUELVE');
      tx('Primero. — CONCEDER a la empresa subvencionada la subvención por el importe total indicado, que se mantendrá reservado a favor de la misma en el Registro de Sociedades de La Placeta.');
      tx('Segundo. — DETERMINAR que el importe se hará efectivo únicamente mediante la justificación de gastos de la empresa subvencionada, en los términos y con las exclusiones previstas en el presente documento.');
      tx('Tercero. — ESTABLECER que el importe no justificado en el plazo previsto quedará sin efecto a favor de la empresa subvencionada en el momento del cierre de la subvención.');
      tx('Cuarto. — NOTIFICAR la presente concesión a ambas empresas a través del sistema PlacetaID, dejando constancia en el historial de auditoría del RSP.');
      ln();
      L.push({nota: 'Documento oficial de concesión de subvención emitido por el Registro de Sociedades de La Placeta (RSP), entidad integrada en el ecosistema de ASOCIACIÓN GRUPO DE LA PLACETA.'});
      break;
    }

    // ── Subvención: Justificación de gastos ────────────────────────────
    case 'subvencion-justificacion': {
      const fmt = (n) => (Number(n)||0).toLocaleString('es-ES') + ' Pz';
      const fec = (f) => f ? new Date(f).toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'numeric' }) : hoy;
      const jus = datos.justificacion || {};
      sf('JUSTIFICACION DE SUBVENCION');
      cf('Nº de subvención', datos.id || '—');
      cf('Nº de justificación', jus.id || '—');
      cf('Fecha de justificación', fec(jus.fecha || datos.createdAt));
      cf('Justificada por', jus.justificada_por || '—');
      ln();
      sf('PARTES');
      cf('Empresa subvencionadora (EIP)', `${datos.emisor_nombre || datos.emisor_eip} (${datos.emisor_eip || '—'})`);
      cf('Empresa subvencionada (EIP)', `${datos.receptor_nombre || datos.receptor_eip} (${datos.receptor_eip || '—'})`);
      ln();
      sf('DETALLE DE LA JUSTIFICACION');
      cf('Importe justificado', fmt(jus.importe));
      cf('Importe restante tras justificación', fmt(datos.importe_restante));
      cf('Referencia bancaria', jus.transactionId || '—');
      if (Array.isArray(jus.conceptos) && jus.conceptos.length) {
        sf('GASTOS JUSTIFICADOS');
        jus.conceptos.forEach((c, i) => tx(`• ${c || 'Gasto sin concepto'}`));
      }
      ln(); sf('EXPONE');
      tx('PRIMERO. — Que la empresa subvencionada, en cumplimiento de las condiciones de la subvención ' + (datos.id || '') + ', ha procedido a la justificación de gastos seleccionando transacciones de gasto reales efectuadas desde su cuenta bancaria, por el importe total indicado en el presente documento.');
      tx('SEGUNDO. — Que, verificada la selección de gastos y descartados aquellos tipos de gasto expresamente excluidos en la concesión, procede la transferencia de los Placetas correspondientes desde la cuenta de la empresa subvencionadora a la cuenta de la empresa subvencionada, restándose dicho importe del restante de la subvención.');
      tx('TERCERO. — Que la presente justificación se registra en el sistema bancario con la referencia indicada, quedando constancia del movimiento en el historial de transacciones del Banco de La Placeta.');
      ln(); sf('RESUELVE');
      tx('Primero. — DAR POR JUSTIFICADO el importe indicado, transfiriéndose los Placetas de la empresa subvencionadora a la empresa subvencionada.');
      tx('Segundo. — ACTUALIZAR el importe restante de la subvención, que queda fijado en la cuantía indicada en el presente documento.');
      tx('Tercero. — REGISTRAR la presente justificación en el expediente de la subvención y en el historial de auditoría del RSP.');
      ln();
      L.push({nota: 'Documento oficial de justificación de subvención emitido por el Registro de Sociedades de La Placeta (RSP).'});
      break;
    }

    // ── Subvención: Cierre ─────────────────────────────────────────────
    case 'subvencion-cierre': {
      const fmt = (n) => (Number(n)||0).toLocaleString('es-ES') + ' Pz';
      const fec = (f) => f ? new Date(f).toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'numeric' }) : hoy;
      const justificado = (datos.importe || 0) - (datos.importe_restante || 0);
      sf('CIERRE DE SUBVENCION');
      cf('Nº de subvención', datos.id || '—');
      cf('Fecha de cierre', fec(datos.fecha_cierre || datos.createdAt));
      cf('Estado', 'Cerrada');
      ln();
      sf('PARTES');
      cf('Empresa subvencionadora (EIP)', `${datos.emisor_nombre || datos.emisor_eip} (${datos.emisor_eip || '—'})`);
      cf('Empresa subvencionada (EIP)', `${datos.receptor_nombre || datos.receptor_eip} (${datos.receptor_eip || '—'})`);
      ln();
      sf('LIQUIDACION DE LA SUBVENCION');
      cf('Importe total concedido', fmt(datos.importe));
      cf('Importe justificado', fmt(justificado));
      cf('Importe no utilizado (liberado)', fmt(datos.importe_restante));
      if (Array.isArray(datos.justificaciones) && datos.justificaciones.length) {
        cf('Número de justificaciones', String(datos.justificaciones.length));
      }
      ln(); sf('EXPONE');
      tx('PRIMERO. — Que la subvención ' + (datos.id || '') + ' se cierra en la fecha indicada, por agotamiento del importe, por decisión de las partes o por transcurso del plazo programado.');
      tx('SEGUNDO. — Que el importe total justificado asciende a la cuantía indicada, habiéndose transferido los Placetas correspondientes de la empresa subvencionadora a la empresa subvencionada conforme a las justificaciones registradas.');
      tx('TERCERO. — Que el importe no utilizado queda liberado y sin efecto a favor de la empresa subvencionada, quedando la subvención definitivamente cerrada en el Registro de Sociedades de La Placeta.');
      ln(); sf('RESUELVE');
      tx('Primero. — DECLARAR el cierre definitivo de la subvención, con la liquidación de importes indicada en el presente documento.');
      tx('Segundo. — LIBERAR el importe no utilizado, que deja de estar reservado a favor de la empresa subvencionada.');
      tx('Tercero. — REGISTRAR el cierre en el expediente de la subvención y en el historial de auditoría del RSP, quedando el expediente archivado.');
      ln();
      L.push({nota: 'Documento oficial de cierre de subvención emitido por el Registro de Sociedades de La Placeta (RSP).'});
      break;
    }

    default: {
      // Generador EXTENSO y bien redactado para cualquier tipo de documento del
      // Banco de La Placeta no cubierto por una plantilla específica: estructura
      // oficial con preámbulo, datos, expone, fundamentos, resuelve y aviso legal.
      const etiqueta = ETIQUETAS_DOC[tipo] || tipo.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
      const titular = datos.titular || datos.nombre || datos.ordenante || '—';
      const dip = datos.dip || datos.dipSolicitante || '—';
      const iban = datos.iban || datos.cuenta || datos.cuentaId || '—';
      sf('DATOS DEL INTERESADO');
      cf('Nombre / Razón social', titular);
      cf('DIP / Identificador', dip);
      if (iban && iban !== '—') cf('Cuenta / Referencia', iban);
      if (datos.tipoCuenta) cf('Tipo de cuenta', datos.tipoCuenta);
      if (datos.periodo) cf('Período', datos.periodo);
      if (datos.importe !== undefined) cf('Importe', typeof datos.importe === 'number' ? datos.importe.toLocaleString() + ' Pz' : datos.importe);
      if (datos.motivo) cf('Motivo', datos.motivo);
      if (datos.referencia) cf('Referencia', datos.referencia);
      if (datos.fecha) cf('Fecha', new Date(datos.fecha).toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'numeric' }));
      ln();
      sf('EXPONE');
      tx('PRIMERO. — Que el interesado identificado en el presente documento, cuya identidad ha sido verificada mediante el sistema oficial de autenticación PlacetaID conforme al Artículo 5 del Código Normativo Interno del Grupo de La Placeta, ha presentado la solicitud que motiva este expediente («' + etiqueta + '»), quedando registrada en el sistema de gestión del Banco de La Placeta en la fecha indicada.');
      tx('SEGUNDO. — Que el Banco de La Placeta, entidad integrada en el ecosistema de la ASOCIACIÓN GRUPO DE LA PLACETA, ha procedido al estudio de la solicitud, la comprobación de los datos identificativos del interesado, la revisión del estado administrativo de las cuentas o servicios afectados y la verificación del cumplimiento de los requisitos previstos en la normativa interna aplicable.');
      tx('TERCERO. — Que, a la vista de la documentación y de las comprobaciones realizadas, procede emitir el presente documento con plena validez dentro del ecosistema GDLP, dejando constancia de las circunstancias, datos y efectos que en él se detallan.');
      ln();
      sf('FUNDAMENTOS JURÍDICOS');
      tx('PRIMERO. — El Artículo 5 del Código Normativo Interno del Grupo de La Placeta otorga a PlacetaID la condición de sistema oficial de identificación y firma electrónica, equiparando la firma electrónica a la manuscrita a todos los efectos legales.');
      tx('SEGUNDO. — El Artículo 6 regula el Documento de Identidad de La Placeta (DIP) como identificador único e intransferible de las personas en el ecosistema, y el Artículo 7 regula las cuentas y servicios bancarios del Banco de La Placeta, sus características y el régimen aplicable.');
      tx('TERCERO. — El presente documento se emite conforme a las disposiciones del Código Normativo Interno, de los Estatutos de la ASOCIACIÓN GRUPO DE LA PLACETA y de la normativa que resulte de aplicación, en el ámbito de las competencias del Banco de La Placeta.');
      ln();
      sf('RESUELVE');
      tx('Primero. — TENER por presentada y registrada la solicitud del interesado, con todos los efectos que le son propios dentro del ecosistema del Grupo de La Placeta.');
      tx('Segundo. — EMITIR el presente documento oficial en los términos y con los datos que se detallan, quedando a disposición del interesado a través del sistema PlacetaID.');
      tx('Tercero. — NOTIFICAR este documento al interesado mediante el sistema PlacetaID, entendiéndose notificado en el momento en que acceda a su contenido a través de PlacetaID Móvil y, en su caso, proceda a su firma electrónica.');
      tx('Cuarto. — REGISTRAR la presente actuación en el historial de auditoría del Banco de La Placeta, dejando constancia de la fecha, hora y responsable de la gestión.');
      ln();
      sf('EFECTOS Y RECURSOS');
      tx('Este documento produce los efectos que le son propios desde el momento de su emisión (o de su firma electrónica, si la naturaleza del acto así lo exige). Contra el mismo, el interesado podrá presentar las alegaciones o recursos que estime oportunos ante la Administración del Grupo de La Placeta en la forma y plazo previstos en el Código Normativo Interno.');
      ln();
      L.push({nota: 'Documento oficial emitido por el Banco de La Placeta, entidad integrada en el ecosistema de ASOCIACIÓN GRUPO DE LA PLACETA.'});
      L.push({nota: 'AVISO LEGAL: Banco de La Placeta es una entidad dentro del ecosistema de ASOCIACIÓN GRUPO DE LA PLACETA que se rige por sus Estatutos y el Código Normativo Interno vigente. Al firmar digitalmente este documento vía PlacetaID Móvil se le otorga autenticidad y la misma validez que a una firma en papel, entendiendo que el contenido del mismo y la firma quieren representar conformidad.'});
      break;
    }
  }
  return L;
}

// ── GENERACIÓN DE PDF (estilo GDLP) ──────────────────────────────────────
// Paleta: morado RSP #3702b3 como acento principal
const A = '#3702b3', B = '#3702b3', C = '#6a2be0';
const PDF_DIR = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(PDF_DIR, '..', 'fonts');

export async function generarPDF(entidad, documento) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4', margins: { top: 50, bottom: 45, left: 50, right: 50 },
        bufferPages: true,
        info: { Title: documento.titulo||'Documento', Author: 'Admin Placeta - GDLP', Subject: `${entidad} - ${documento.tipo}` }
      });
      const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Intentar cargar fuente con búsqueda en múltiples ubicaciones
      let fontReg = 'Helvetica', fontBold = 'Helvetica-Bold';
      const buscarFuente = (nombre) => {
        const candidatos = [
          path.join(FONT_DIR, nombre),
          path.join(PDF_DIR, '..', '..', 'public', 'fonts', nombre),
          path.join(PDF_DIR, 'fonts', nombre)
        ];
        for (const c of candidatos) {
          try { if (fs.existsSync(c)) return c; } catch {}
        }
        return null;
      };
      const regPath = buscarFuente('PJSans-Regular.ttf') || buscarFuente('outfit_regular.ttf') || buscarFuente('PlusJakartaSans-Regular.ttf');
      const boldPath = buscarFuente('PJSans-Bold.ttf') || buscarFuente('outfit_bold.ttf') || buscarFuente('PlusJakartaSans-Bold.ttf');
      if (regPath && boldPath) {
        try {
          doc.registerFont('DocFont', regPath);
          doc.registerFont('DocFont-Bold', boldPath);
          fontReg = 'DocFont'; fontBold = 'DocFont-Bold';
        } catch {}
      }

      const etiqueta = ETIQUETAS_DOC[documento.tipo] || documento.tipo;
      const nomE = { banco:'Banco de La Placeta', tributos:'Tributos de La Placeta', junta:'Junta de La Placeta', administracion:'Administración de La Placeta', rsp:'Red de Servicios de La Placeta' };
      const logos = LOGOS;
      const entL = nomE[entidad] || entidad;
      const fecha = documento.createdAt ? new Date(documento.createdAt).toLocaleDateString('es-ES',{year:'numeric',month:'long',day:'numeric'}) : '—';
      const datos = documento.datos || {};
      const esAuto = documento.id?.startsWith('auto-');
      const lineas = generarContenidoDocumento(documento.tipo, datos);

      // ── Función para dibujar cabecera en cualquier página ──
      function dibujarCabecera(esPrimera = false) {
        doc.save();
        const alto = esPrimera ? 85 : 42;
        const topY = esPrimera ? 14 : 8;
        // Barra principal morada #3702b3
        doc.rect(0, topY, doc.page.width, alto).fill('#3702b3');
        // Barra superior fina más clara
        doc.rect(0, 0, doc.page.width, 4).fill('#6a2be0');
        // Logo (sobre fondo blanco para visibilidad en cabecera morada)
        const logoPath = path.join(PDF_DIR, '..', 'img', logos[entidad] || 'logo-web.png');
        const logoW = esPrimera ? 68 : 40;
        const logoH = esPrimera ? 40 : 24;
        const logoX = 42;
        const logoY = esPrimera ? 32 : 14;
        try {
          const p1 = logoPath;
          const p2 = path.join(PDF_DIR, '..', '..', 'public', 'img', logos[entidad] || 'logo-web.png');
          const fp = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
          if (fp) {
            // Recuadro blanco detrás del logo para que no se mezcle con fondo morado
            doc.save();
            doc.rect(logoX - 4, logoY - 2, logoW + 8, logoH + 4).fill('#ffffff');
            // Logo centrado HORIZONTAL y VERTICALMENTE dentro del recuadro,
            // manteniendo la proporción (sin deformar ni desbordar).
            const imgLogo = doc.openImage(fp);
            const esc = Math.min(logoW / imgLogo.width, logoH / imgLogo.height);
            const lw = imgLogo.width * esc, lh = imgLogo.height * esc;
            const lx = logoX + (logoW - lw) / 2;
            const ly = logoY + (logoH - lh) / 2;
            doc.image(fp, lx, ly, { width: lw, height: lh });
            doc.restore();
          }
        } catch {}
        if (esPrimera) {
          const tx = logoX + logoW + 18;
          doc.font(fontBold).fontSize(17).fillColor('#ffffff').text(documento.titulo||'Documento', tx, 28);
          doc.font(fontReg).fontSize(8.5).fillColor('#d0c0f0').text(entL, tx, 54);
          doc.font(fontReg).fontSize(7).fillColor('#b0a0d8').text(fecha, tx, 72);
          doc.rect(50, 105, 500, 1.5).fill('#6a2be0');
          doc.y = 115;
        } else {
          const tx = logoX + logoW + 14;
          doc.font(fontBold).fontSize(11).fillColor('#ffffff').text(entL, tx, 16);
          doc.font(fontReg).fontSize(7).fillColor('#d0c0f0').text(documento.titulo||'Documento', tx, 34);
          doc.rect(50, 54, 500, 1).fill('#6a2be0');
          doc.y = 62;
        }
        doc.restore();
      }

      // ── Footer ──
      function dibujarFooter() {
        doc.save();
        doc.rect(50, doc.y, 500, 0.5).fill(C);
        doc.font(fontReg).fontSize(6.5).fillColor('#5c5566');
        doc.text('Grupo de La Placeta · Documento oficial', 50, doc.y + 4, { width: 400 });
        const pg = doc.bufferedPageRange().count;
        doc.text(`Pág. ${pg}`, doc.page.width - 90, doc.y + 4, { width: 50, align:'right' });
        doc.restore();
        doc.y += 15;
      }

      // ── Helper: nueva página con cabecera ──
      function nuevaPagina() {
        doc.addPage();
        dibujarCabecera(false);
      }

      // ── Helper: dibujar tabla desglosada ─────────────────────────────
      // item.tabla = { cabeceras:[], filas:[[...]], anchos:[] (px, opcional),
      //                alineaciones:[] ('left'|'right'|'center', opcional),
      //                resaltarDesde: (índice fila desde el que resaltar, opcional),
      //                resaltarFilas: [índices], columnaImporte: índice (opcional) }
      function dibujarTabla(t) {
        const cab = t.cabeceras || [];
        const filas = t.filas || [];
        if (!cab.length || !filas.length) return;
        const margen = 50, anchoTotal = 500;
        const anchos = t.anchos && t.anchos.length === cab.length
          ? t.anchos
          : cab.map(() => Math.floor(anchoTotal / cab.length));
        const alin = t.alineaciones || cab.map(() => 'left');
        const filaH = 16;
        const padX = 4;

        // ── Cabecera (fondo morado, texto blanco) ──
        function dibujarCabeceraTabla() {
          let x = margen;
          const y = doc.y;
          doc.save();
          doc.rect(margen, y, anchoTotal, filaH).fill('#3702b3');
          doc.font(fontBold).fontSize(7.5).fillColor('#ffffff');
          cab.forEach((c, i) => {
            const ancho = anchos[i];
            const opts = { width: ancho - padX * 2, align: alin[i] === 'right' ? 'right' : alin[i] === 'center' ? 'center' : 'left', lineBreak: false };
            doc.text(String(c), x + padX, y + 4.5, opts);
            x += ancho;
          });
          doc.restore();
          doc.y = y + filaH;
        }

        // ── ¿Cabe una fila? Si no, nueva página con cabecera de tabla ──
        function asegurarEspacio() {
          if (doc.y > doc.page.height - 70) {
            nuevaPagina();
            dibujarCabeceraTabla();
          }
        }

        dibujarCabeceraTabla();
        const resaltar = new Set(t.resaltarFilas || []);
        filas.forEach((fila, fi) => {
          // Altura real: puede crecer si el texto se envuelve
          let altoFila = filaH;
          fila.forEach((celda, ci) => {
            if (celda === null || celda === undefined) return;
            const ancho = anchos[ci] - padX * 2;
            const n = doc.font(fontReg).fontSize(7.5).widthOfString(String(celda), { width: ancho, lineBreak: true });
            const lineasNecesarias = Math.max(1, Math.ceil((n + 2) / Math.max(1, ancho)));
            altoFila = Math.max(altoFila, lineasNecesarias * 10 + 4);
          });
          asegurarEspacio();
          const yFila = doc.y;
          const esResaltada = resaltar.has(fi) || (t.resaltarDesde !== undefined && fi >= t.resaltarDesde);
          if (esResaltada) {
            doc.save();
            doc.rect(margen, yFila, anchoTotal, altoFila).fill('#f3eefe');
            doc.restore();
          }
          let x = margen;
          doc.save();
          fila.forEach((celda, ci) => {
            if (celda === null || celda === undefined) return;
            const ancho = anchos[ci];
            const bold = esResaltada;
            doc.font(bold ? fontBold : fontReg).fontSize(7.5)
              .fillColor(esResaltada ? '#3702b3' : '#1c1226');
            const opts = { width: ancho - padX * 2, align: alin[ci] === 'right' ? 'right' : alin[ci] === 'center' ? 'center' : 'left', lineBreak: true };
            doc.text(String(celda), x + padX, yFila + 3, opts);
            x += ancho;
          });
          doc.restore();
          doc.y = yFila + altoFila;
          // Línea separadora suave
          doc.save();
          doc.moveTo(margen, doc.y).lineTo(margen + anchoTotal, doc.y).lineWidth(0.3).strokeColor('#e0daf0').stroke();
          doc.restore();
        });
        doc.moveDown(0.3);
      }

      // ── CABECERA (página 1) ──
      dibujarCabecera(true);

      // ── CUERPO ──
      for (const item of lineas) {

        if (item.seccion) {
          if (doc.y > doc.page.height - 80) nuevaPagina();
          doc.moveDown(0.2);
          doc.font(fontBold).fontSize(11).fillColor('#3702b3').text(item.seccion.toUpperCase(), 50, doc.y, {width:500});
          doc.moveDown(0.2);
        } else if (item.tabla) {
          dibujarTabla(item.tabla);
        } else if (item.linea) {
          doc.moveTo(50, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor('#e0daf0').stroke();
          doc.moveDown(0.3);
        } else if (item.texto) {
          if (doc.y > doc.page.height - 65) nuevaPagina();
          doc.font(fontReg).fontSize(9).fillColor('#1c1226').text(item.texto, 50, doc.y, {width:500, align:'justify', lineGap: 1});
          doc.moveDown(0.15);
        } else if (item.nota) {
          if (doc.y > doc.page.height - 55) nuevaPagina();
          const ny = doc.y;
          doc.save(); doc.rect(50, ny, 3, 3).fill(C);
          doc.font(fontReg).fontSize(7.5).fillColor('#5c5566').text(item.nota, 58, ny, {width:482, lineGap: 0});
          doc.y = Math.max(doc.y, ny+6)+2;
          doc.restore();
        } else if (item.campo) {
          const [k,v] = item.campo;
          doc.font(fontBold).fontSize(9).fillColor('#1c1226').text(`${k}: `, 50, doc.y, {continued:true});
          doc.font(fontReg).fillColor('#5c5566').text(v||'—');
          doc.y += 1;
        }
      }

      // ── FIRMA ──
      // Forzar nueva página si quedan menos de 200px
      if (doc.y > doc.page.height - 200) nuevaPagina();

      doc.moveDown(0.4);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).lineWidth(1).strokeColor('#6a2be0').stroke();
      doc.moveDown(0.8);
      doc.font(fontBold).fontSize(11).fillColor('#3702b3').text('CÚMPLEASE Y NOTIFÍQUESE.', {width:500, align:'center'});
      doc.moveDown(0.6);
      doc.font(fontReg).fontSize(8).fillColor('#5c5566').text('Fdo.: La Administración del Grupo de La Placeta', {width:500, align:'center'});
      doc.moveDown(0.1);
      doc.font(fontReg).fontSize(7).fillColor('#5c5566').text(entL, {width:500, align:'center'});

      // ── FIRMA DEL TITULAR ──
      // Los documentos de TRIBUTOS no requieren firma del titular: se emiten
      // y sellan automáticamente por el sistema (sello digital + CSV).
      if (entidad !== 'tributos') {
        doc.moveDown(0.5);
        doc.moveTo(100, doc.y).lineTo(500, doc.y).lineWidth(0.5).strokeColor('#c0b8d8').stroke();
        doc.moveDown(0.2);
        doc.font(fontBold).fontSize(9).fillColor('#3702b3').text('FIRMA DEL TITULAR', {width:500, align:'center'});

        if (documento.firmado) {
          const firmaImg = documento.datos?.firma_base64 || documento.datos?.firmaImagen;
          if (firmaImg) {
            try {
              const imgData = firmaImg.includes('base64,') ? firmaImg : `data:image/png;base64,${firmaImg}`;
              // Firma SIN deformar ni cortar: escala manteniendo la proporción
              // (se usa openImage para conocer el tamaño real y nunca se supera 320x90).
              const img = doc.openImage(imgData);
              const maxW = 320, maxH = 90;
              const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
              const w = img.width * ratio, h = img.height * ratio;
              const x = Math.max(50, (doc.page.width - w) / 2);
              doc.image(imgData, x, doc.y, { width: w, height: h });
              doc.y += h + 4;
            } catch {}
          }
          doc.moveDown(0.2);
          // Salto de página si hace falta
          if (doc.y > doc.page.height - 50) nuevaPagina();
          doc.font(fontReg).fontSize(8).fillColor('#5c5566');
          doc.text(`Firmado digitalmente por: ${documento.datos?.firmadoPor || '—'}`, {width:500, align:'center'});
          if (documento.datos?.fechaFirma) {
            const fFecha = new Date(documento.datos.fechaFirma).toLocaleString('es-ES');
            doc.text(`Fecha: ${fFecha}`, {width:500, align:'center'});
          }
          doc.text('Firma electrónica PlacetaID', {width:500, align:'center'});
        } else {
          doc.moveDown(0.5);
          // Líneas guía para firma manuscrita
          doc.moveTo(120, doc.y).lineTo(480, doc.y).lineWidth(0.5).strokeColor('#d0c8e0').stroke();
          doc.moveDown(1.2);
          doc.moveTo(120, doc.y).lineTo(480, doc.y).lineWidth(0.5).strokeColor('#d0c8e0').stroke();
          doc.moveDown(0.3);
          doc.font(fontReg).fontSize(7).fillColor('#b8a8e0').text('Firma pendiente — PlacetaID Móvil', {width:500, align:'center'});
          doc.font(fontReg).fontSize(6.5).fillColor('#d0c8e0');
          doc.text('Firme desde la app PlacetaID Móvil', {width:500, align:'center'});
        }
      } else {
        // Documentos de tributos: sello automático, sin firma del titular.
        doc.moveDown(0.6);
        doc.font(fontReg).fontSize(7.5).fillColor('#8a6fd8').text('Documento emitido automáticamente por el Sistema Fiscal de La Placeta.', {width:500, align:'center'});
        doc.font(fontReg).fontSize(7).fillColor('#b8a8e0').text('No requiere firma del titular. Validez mediante sello digital y CSV de verificación.', {width:500, align:'center'});
      }

      // ── CSV ──
      doc.moveDown(0.5);
      const hash = documento.hash || createHash('sha256').update(documento.id+Date.now()).digest('hex');
      doc.font(fontReg).fontSize(6.5).fillColor('#9a8aaa');
      doc.text(`CSV: ${hash.substring(0,20).toUpperCase()}`, {width:500, align:'center'});

      // ── PIE + FOOTER ── (relativo a doc.y, SIN posiciones absolutas)
      const espacioRestante = doc.page.height - 45 - doc.y;
      if (espacioRestante < 40) nuevaPagina();
      doc.font(fontReg).fontSize(6.5).fillColor('#5c5566');
      const leyenda = esAuto ? 'Informe automático del sistema · Código Normativo Interno' : `${entL} · Documento oficial · Código Normativo Interno GDLP`;
      doc.text(leyenda, 50, doc.y, {width:500, align:'center'});
      doc.moveDown(0.1);
      doc.text(`Generado el ${new Date().toLocaleString('es-ES')}`, {width:500, align:'center'});
      doc.moveDown(0.3);
      dibujarFooter();

      doc.end();
    } catch(err) { reject(err); }
  });
}

// ── PLANTILLAS DE DATOS POR TIPO ──────────────────────────────────────────
export function getPlantilla(tipo, entidad) {
  // Plantilla base con datos por defecto
  const base = {
    entidad,
    tipo,
    titulo: ETIQUETAS_DOC[tipo] || tipo,
    descripcion: '',
    datos: {}
  };

  // Datos según tipo
  const plantillas = {
    // Banco - Cliente
    'contrato-apertura': {
      titulo: 'Contrato de Apertura de Cuenta',
      descripcion: 'Contrato de apertura de cuenta bancaria en Banco de La Placeta',
      datos: { titular: '', dip: '', tipoCuenta: 'Personal', iban: '', fechaApertura: '', condiciones: { saldoMinimo: 0, comisiones: 'Sin comisiones', regimen: 'General' } }
    },
    'certificado-titularidad': {
      titulo: 'Certificado de Titularidad',
      descripcion: 'Certificado que acredita la titularidad de una cuenta',
      datos: { titular: '', dip: '', cuenta: '', iban: '', fechaEmision: '', tipo: 'Personal' }
    },
    'certificado-saldo': {
      titulo: 'Certificado de Saldo',
      descripcion: 'Certificado del saldo actual de la cuenta',
      datos: { titular: '', cuenta: '', iban: '', saldo: 0, fecha: '', moneda: 'Pz' }
    },
    'certificado-iban': {
      titulo: 'Certificado IBAN',
      descripcion: 'Certificado del IBAN de la cuenta',
      datos: { titular: '', dip: '', iban: '', fechaEmision: '' }
    },
    'estado-mensual': {
      titulo: 'Estado Mensual de Cuenta',
      descripcion: 'Extracto mensual de movimientos bancarios',
      datos: { titular: '', cuenta: '', periodo: '', saldoInicial: 0, ingresos: 0, gastos: 0, saldoFinal: 0, movimientos: [] }
    },
    'justificante-transferencia': {
      titulo: 'Justificante de Transferencia',
      descripcion: 'Justificante de transferencia realizada',
      datos: { ordenante: '', destinatario: '', importe: 0, concepto: '', fecha: '', referencia: '' }
    },
    // Tributos
    'declaracion-definitiva': {
      titulo: 'Declaración Definitiva',
      descripcion: 'Declaración tributaria definitiva',
      datos: { contribuyente: '', dip: '', periodo: '', baseImponible: 0, tipoImpositivo: 0, cuota: 0, estado: 'Definitiva' }
    },
    // ── Expediente fiscal automático ───────────────────────────────────
    'dfm-mensual': {
      titulo: 'Declaración Fiscal Mensual (DFM)',
      descripcion: 'Documento principal del expediente fiscal mensual por sujeto y periodo',
      datos: { numeroDfm: '', titular: '', identificador: '', dip: '', eip: '', tipoSujeto: 'Persona Física', periodo: '', patrimonioMedio: 0, ingresosPeriodo: 0, pagosPeriodo: 0, indiceAcumulacion: 0, cuotaIRM: 0, cuotaIGF: 0, cuotaIVA: 0, retenciones: 0, bonificaciones: 0, totalImpuestos: 0, esJunior: false, pagaCapitalia: false, estado: 'Borrador' }
    },
    'anexo-movimientos-fiscales': {
      titulo: 'Anexo de Movimientos Fiscales',
      descripcion: 'Detalle de movimientos del periodo para auditoría',
      datos: { numeroDfm: '', titular: '', periodo: '', movimientos: [] }
    },
    'declaracion-irm': {
      titulo: 'Declaración específica de IRM',
      descripcion: 'Detalle del Impuesto de Regulación Monetaria del periodo',
      datos: { titular: '', identificador: '', periodo: '', ingresosPeriodo: 0, exencionesIRM: 0, reduccionesIRM: 0, baseIRM: 0, tipoIRM: 0, cuotaIntegraIRM: 0, deduccionesIRM: 0, retenciones: 0, bonificacionesIRM: 0, cuotaFinalIRM: 0, cuotaIRM: 0, esJunior: false, pagaCapitalia: false }
    },
    'declaracion-igf': {
      titulo: 'Declaración específica de IGF',
      descripcion: 'Detalle del Impuesto sobre Grandes Fortunas del periodo',
      datos: { titular: '', identificador: '', periodo: '', patrimonioBruto: 0, bienesComputables: 0, deudasComputables: 0, patrimonioExento: 0, patrimonioNeto: 0, baseIGF: 0, cuotaIGF: 0, bonificacionesIGF: 0, resultadoIGF: 0, exencionIGF: false, esJunior: false, pagaCapitalia: false }
    },
    'declaracion-iva': {
      titulo: 'Declaración de IVA',
      descripcion: 'Liquidación de IVA repercutido, soportado y resultado',
      datos: { titular: '', identificador: '', periodo: '', baseRepercutida: 0, ivaRepercutido: 0, baseSoportada: 0, ivaSoportado: 0, rectificacionesIVA: 0, deduccionesIVA: 0, resultadoIVA: 0, campañas: [] }
    },
    'certificado-bonificacion-fiscal': {
      titulo: 'Certificado de Bonificación Fiscal',
      descripcion: 'Constancia de bonificación asumida por CAPITALIA para Juniors',
      datos: { titular: '', periodo: '', cuotaIRM: 0, cuotaIGF: 0, otrosImpuestos: 0 }
    },
    'certificado-cierre-fiscal': {
      titulo: 'Certificado de Cierre Fiscal',
      descripcion: 'Certificación de cierre y conciliación del periodo',
      datos: { numeroDfm: '', periodo: '', hashExpediente: '', fechaCierre: '', responsable: '', estado: 'Definitivo', firmaDigital: '' }
    },
    'certificado-situacion-tributaria': {
      titulo: 'Certificado de Situación Tributaria',
      descripcion: 'Certificado de situación fiscal del contribuyente',
      datos: { contribuyente: '', dip: '', situacion: 'Al corriente', fechaEmision: '', ultimaDeclaracion: '', deudaPendiente: 0 }
    },
    'informe-inspeccion-trib': {
      titulo: 'Informe de Inspección Tributaria',
      descripcion: 'Informe detallado de inspección',
      datos: { inspector: '', contribuyente: '', fechaInspeccion: '', resultado: '', observaciones: '', medidas: [] }
    },
    // Junta
    'acta': {
      titulo: 'Acta de Reunión',
      descripcion: 'Acta oficial de reunión de la Junta',
      datos: { reunion: '', fecha: '', lugar: '', asistentes: [], ordenDelDia: [], acuerdos: [], firmaPresidente: '', firmaSecretario: '' }
    },
    'convocatoria': {
      titulo: 'Convocatoria de Reunión',
      descripcion: 'Convocatoria oficial a reunión',
      datos: { convocante: '', reunion: '', fecha: '', hora: '', lugar: '', ordenDelDia: [], destinatarios: [] }
    },
    'resultado-definitivo': {
      titulo: 'Resultado Definitivo de Votación',
      descripcion: 'Resultado oficial de votación',
      datos: { votacion: '', fecha: '', participantes: 0, votosFavor: 0, votosContra: 0, abstenciones: 0, resultado: '', verificacion: '' }
    },
    // Administración
    'solicitud': {
      titulo: 'Solicitud de Trámite',
      descripcion: 'Solicitud de trámite administrativo',
      datos: { solicitante: '', dip: '', tramite: '', fecha: '', descripcion: '', documentosAdjuntos: [] }
    },
    'resolucion-tramite': {
      titulo: 'Resolución de Trámite',
      descripcion: 'Resolución oficial de trámite administrativo',
      datos: { expediente: '', solicitante: '', tramite: '', fechaResolucion: '', resolucion: '', fundamentos: '', recursos: '' }
    },
    // Comunes
    'informe-pdf': {
      titulo: 'Informe PDF',
      descripcion: 'Informe genérico en PDF',
      datos: { tituloInforme: '', entidad: '', fecha: '', contenido: '', autor: '', destinatario: '' }
    },
    'certificado': {
      titulo: 'Certificado',
      descripcion: 'Certificado oficial',
      datos: { titular: '', dip: '', asunto: '', fechaEmision: '', validoHasta: '', emitidoPor: '' }
    },
    // ── Tarjetas ────────────────────────────────────────────────────────
    'alta-tarjeta': {
      titulo: 'Alta de Tarjeta',
      descripcion: 'Solicitud de alta de tarjeta bancaria',
      datos: { titular: '', dip: '', tipoTarjeta: 'Débito', iban: '', limiteDiario: 1000, limiteMensual: 5000, moneda: 'Pz', pinGenerado: 'No' }
    },
    'renovacion-tarjeta': {
      titulo: 'Renovación de Tarjeta',
      descripcion: 'Renovación de tarjeta bancaria',
      datos: { titular: '', dip: '', iban: '', numeroTarjeta: '', motivoRenovacion: 'Caducidad', nuevoLimite: 1000 }
    },
    'bloqueo-tarjeta': {
      titulo: 'Bloqueo de Tarjeta',
      descripcion: 'Bloqueo de tarjeta por pérdida, robo o sospecha',
      datos: { titular: '', dip: '', iban: '', numeroTarjeta: '', motivo: 'Robo', fechaBloqueo: '' }
    },
    'baja-tarjeta': {
      titulo: 'Baja de Tarjeta',
      descripcion: 'Cancelación de tarjeta bancaria',
      datos: { titular: '', dip: '', iban: '', numeroTarjeta: '', motivo: 'Solicitud titular', fechaBaja: '' }
    },
    // ── Productos ───────────────────────────────────────────────────────
    'apertura-deposito': {
      titulo: 'Apertura de Depósito',
      descripcion: 'Apertura de depósito bancario',
      datos: { titular: '', dip: '', importe: 0, plazoDias: 365, interes: 2.5, moneda: 'Pz', fechaApertura: '', renovacionAutomatica: 'Sí' }
    },
    'apertura-ahorro': {
      titulo: 'Apertura de Cuenta Ahorro',
      descripcion: 'Apertura de cuenta de ahorro',
      datos: { titular: '', dip: '', iban: '', importeInicial: 0, tipoInteres: 1.0, moneda: 'Pz' }
    },
    // ── Contrato cierre ─────────────────────────────────────────────────
    'contrato-cierre': {
      titulo: 'Contrato de Cierre de Cuenta',
      descripcion: 'Cierre definitivo de cuenta bancaria (BLP-B-011)',
      datos: { titular: '', dip: '', iban: '', motivo: 'Solicitud del titular', saldo: 0, destinoSaldo: 'Transferencia', cuentaDestino: '', productosCancelar: [] }
    },
    // ── Cumplimiento ────────────────────────────────────────────────────
    'informe-aml': {
      titulo: 'Informe AML',
      descripcion: 'Informe de prevención de blanqueo de capitales',
      datos: { sujeto: '', dip: '', nivelRiesgo: 'Bajo', fechaAnalisis: '', resultado: '', medidas: [] }
    },
    'informe-kyc': {
      titulo: 'Informe KYC',
      descripcion: 'Informe de conocimiento del cliente',
      datos: { cliente: '', dip: '', nivelVerificacion: 'Completa', fechaVerificacion: '', estado: 'Verificado', observaciones: '' }
    },
    // ── Notificaciones ─────────────────────────────────────────────────
    'notificacion': {
      titulo: 'Notificación',
      descripcion: 'Notificación oficial',
      datos: { destinatario: '', dip: '', asunto: '', cuerpo: '', fecha: '', emitidoPor: '' }
    },
    'comunicacion-oficial': {
      titulo: 'Comunicación Oficial',
      descripcion: 'Comunicación oficial entre entidades',
      datos: { emisor: '', destinatario: '', asunto: '', cuerpo: '', fecha: '', referencia: '' }
    },
    'oficio': {
      titulo: 'Oficio',
      descripcion: 'Oficio administrativo',
      datos: { emisor: '', cargo: '', destinatario: '', asunto: '', texto: '', fecha: '' }
    }
  };

  return plantillas[tipo] || base;
}

export function getDocumentosByEntidad(entidad) {
  const docs = getDocumentos(entidad);
  // Añadir documentos automáticos simulados
  const autoDocs = DOCUMENTOS_AUTOMATICOS.map((tipo, i) => ({
    id: `auto-${entidad}-${i}`,
    entidad,
    tipo,
    categoria: 'automatico',
    titulo: ETIQUETAS_DOC[tipo] || tipo,
    descripcion: 'Generado automáticamente por el sistema',
    datos: { generadoEl: new Date().toISOString(), periodo: 'Últimos 30 días' },
    createdBy: 'sistema',
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    estado: 'final',
    firmado: true,
    hash: createHash('sha256').update(tipo + entidad).digest('hex').slice(0, 16)
  }));
  return [...autoDocs, ...docs];
}

export async function getDocumentosByEntidadAsync(entidad) {
  // Cargar desde Supabase primero, después combinamos con auto-docs
  const sbData = await sbListDocs(entidad);
  if (sbData) {
    const docs = sbData.map(normalizarDoc);
    memStore[entidad] = docs;
    const autoDocs = DOCUMENTOS_AUTOMATICOS.map((tipo, i) => ({
      id: `auto-${entidad}-${i}`,
      entidad, tipo, categoria: 'automatico',
      titulo: ETIQUETAS_DOC[tipo] || tipo,
      descripcion: 'Generado automáticamente por el sistema',
      datos: { generadoEl: new Date().toISOString(), periodo: 'Últimos 30 días' },
      createdBy: 'sistema',
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      estado: 'final', firmado: true,
      hash: createHash('sha256').update(tipo + entidad).digest('hex').slice(0, 16)
    }));
    return [...autoDocs, ...docs];
  }
  return getDocumentosByEntidad(entidad);
}

export default {
  TIPOS_DOCUMENTO,
  DOCUMENTOS_COMUNES,
  DOCUMENTOS_AUTOMATICOS,
  ETIQUETAS_DOC,
  getDocumentos,
  getDocumentoById,
  saveDocumento,
  deleteDocumento,
  generarPDF,
  getPlantilla,
  getDocumentosByEntidad
};
