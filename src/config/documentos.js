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
      'alta-junior', 'baja-junior', 'cambio-tutor', 'historial-junior'
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
  if (sbReady || !supabase) return false;
  try {
    const { error } = await supabase.from(DOCS_TABLE).select('id').limit(1);
    if (!error) { sbReady = true; return true; }
    // La tabla no existe, intentar crearla
    console.log('[Docs] Tabla documentos no existe en Supabase, intentando crear...');
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    if (SERVICE_KEY && SUPABASE_URL) {
      const sql = `CREATE TABLE IF NOT EXISTS public.documentos (
        id TEXT PRIMARY KEY, entidad TEXT NOT NULL, tipo TEXT NOT NULL,
        categoria TEXT DEFAULT 'general', titulo TEXT, descripcion TEXT DEFAULT '',
        datos JSONB DEFAULT '{}', ref_id TEXT, ref_tipo TEXT,
        created_by TEXT DEFAULT 'sistema',
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
        estado TEXT DEFAULT 'borrador', firmado BOOLEAN DEFAULT FALSE, hash TEXT DEFAULT ''
      );`.replace(/\s+/g, ' ').trim();
      // Usar endpoint pg_graphql de Supabase
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify({ query: sql })
      });
      if (resp.ok) {
        console.log('[Docs] Tabla documentos creada en Supabase');
      } else {
        // Fallback: intentar con el endpoint /rest/v1/rpc/exec_sql si existe
        const resp2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`
          },
          body: JSON.stringify({ query: sql })
        });
        if (resp2.ok) console.log('[Docs] Tabla creada via exec_sql');
      }
    }
    // Verificar de nuevo
    const { error: err2 } = await supabase.from(DOCS_TABLE).select('id').limit(1);
    if (!err2) { sbReady = true; return true; }
  } catch (e) {
    console.warn('[Docs] No se pudo inicializar Supabase:', e.message);
  }
  if (intento < 2) {
    await new Promise(r => setTimeout(r, 1000));
    return initDocsTable(intento + 1);
  }
  return false;
}

async function sbListDocs(entidad) {
  if (!supabase) return null;
  await initDocsTable();
  if (!sbReady) return null;
  try {
    const { data, error } = await supabase.from(DOCS_TABLE).select('*').eq('entidad', entidad).order('created_at', { ascending: false });
    if (error) { console.warn('[Docs] sbListDocs error:', error.message); return null; }
    return data || [];
  } catch (e) { console.warn('[Docs] sbListDocs exception:', e.message); return null; }
}

async function sbSaveDoc(doc, intento = 0) {
  if (!supabase) return null;
  await initDocsTable();
  if (!sbReady) {
    if (intento < 2) {
      // Reintentar después de un breve delay (para cold starts lentos)
      await new Promise(r => setTimeout(r, 500));
      return sbSaveDoc(doc, intento + 1);
    }
    console.warn('[Docs] sbSaveDoc: sbReady=false tras reintentar');
    return null;
  }
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
    if (error) {
      console.warn('[Docs] sbSaveDoc error:', error.message);
      if (intento < 2) {
        await new Promise(r => setTimeout(r, 500));
        return sbSaveDoc(doc, intento + 1);
      }
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[Docs] sbSaveDoc exception:', e.message);
    if (intento < 2) {
      await new Promise(r => setTimeout(r, 500));
      return sbSaveDoc(doc, intento + 1);
    }
    return null;
  }
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
    console.error('[Docs] CRÍTICO: sbSaveDoc falló - documento no persistido en Supabase:', doc.id, doc.titulo);
    // Lanzar error para que el POST handler devuelva 500 y el usuario no vea falso éxito
    throw new Error('No se pudo guardar el documento en la base de datos. Inténtalo de nuevo.');
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
      cf('Fecha', datos.fecha || hoy);
      ln(); sf('MOTIVO');
      tx(datos.motivo || 'Reclasificación bancaria');
      ln(); sf('EXPONE');
      tx('Comparece el titular de la cuenta bancaria identificada en el presente documento, con domicilio a efectos de notificaciones en el registrado en el sistema PlacetaID, solicitando la reclasificación del tipo de cuenta bancaria conforme a las necesidades y requisitos establecidos en el Código Normativo Interno del Grupo de La Placeta.');
      tx('El Banco de La Placeta, una vez verificada la identidad del solicitante mediante el sistema oficial de autenticación PlacetaID, ha procedido a examinar la solicitud presentada, realizando las comprobaciones automáticas y manuales previstas en la normativa vigente, incluyendo la verificación de la titularidad de la cuenta, el estado de cumplimiento de obligaciones tributarias y bancarias, y la inexistencia de impedimentos legales o administrativos que pudieran obstaculizar el cambio solicitado.');
      tx('Realizadas las comprobaciones oportunas, se acredita que concurren los requisitos necesarios para acceder a la reclasificación solicitada, no existiendo impedimento alguno para acordar el cambio de tipo de cuenta en los términos interesados por el titular.');
      ln(); sf('FUNDAMENTOS JURÍDICOS');
      tx('La presente resolución se adopta de conformidad con las disposiciones del Código Normativo Interno del Grupo de La Placeta, y en particular:');
      tx('• Las normas reguladoras del sistema PlacetaID como método oficial de identificación y autenticación electrónica.');
      tx('• Las disposiciones sobre el Documento de Identidad de La Placeta (DIP) y el Identificador de Empresa de La Placeta (EIP) como identificadores oficiales.');
      tx('• Las normas reguladoras de los tipos de cuentas bancarias, sus requisitos de apertura, mantenimiento y modificación.');
      tx('• Las facultades de administración, supervisión y control atribuidas al Banco de La Placeta como entidad gestora del sistema bancario.');
      tx('• Los procedimientos establecidos para la modificación de las condiciones contractuales de las cuentas bancarias.');
      ln(); sf('RESUELVE');
      tx('Primero. Aprobar el cambio de tipo de cuenta bancaria solicitado, pasando la cuenta identificada a la nueva categoría indicada en el presente documento, con efectos desde la fecha de la presente resolución.');
      tx('Segundo. Actualizar el Registro Bancario Oficial del Banco de La Placeta, dejando constancia del cambio de tipo de cuenta y de todas las circunstancias concurrentes.');
      tx('Tercero. Notificar electrónicamente la presente resolución al titular de la cuenta mediante el sistema PlacetaID, con acuse de recibo y constancia de la fecha y hora de notificación.');
      tx('Cuarto. La presente resolución agota la vía administrativa bancaria, pudiendo interponerse contra ella reclamación ante la Administración del Grupo de La Placeta en el plazo de quince días hábiles siguientes a su notificación.');
      L.push({nota: 'Documento oficial emitido por el Banco de La Placeta. Pendiente de firma electrónica por el titular.'});
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

    case 'informe-pdf':
    case 'certificado':
    case 'notificacion':
      sf('DATOS DEL DOCUMENTO');
      for (const [k,v] of Object.entries(datos)) {
        if (typeof v==='object'&&v!==null) { for (const [sk,sv] of Object.entries(v)) cf(sk,sv); }
        else if (!Array.isArray(v)) cf(k,v);
      }
      break;

    default:
      sf('DATOS');
      for (const [k,v] of Object.entries(datos)) {
        if (typeof v==='object'&&v!==null) { for (const [sk,sv] of Object.entries(v)) cf(sk,sv); }
        else if (!Array.isArray(v)) cf(k,v);
      }
      break;
  }
  return L;
}

// ── GENERACIÓN DE PDF (estilo CRM GDLP) ──────────────────────────────────
const A = '#1c005f', B = '#341087', C = '#5a2fc2'; // purple palette

// Registrar fuente Outfit
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_REG = path.join(__dirname, '..', 'fonts', 'outfit_regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'outfit_bold.ttf');

export async function generarPDF(entidad, documento) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4', margins: { top: 50, bottom: 45, left: 50, right: 50 },
        bufferPages: true,
        info: { Title: documento.titulo||'Documento', Author: 'Admin Placeta - GDLP', Subject: `${entidad} - ${documento.tipo}` }
      });
      const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Registrar Outfit si existe
      let fontReg = 'Helvetica', fontBold = 'Helvetica-Bold';
      try {
        if (fs.existsSync(FONT_REG)) {
          doc.registerFont('Outfit', FONT_REG);
          doc.registerFont('Outfit-Bold', FONT_BOLD);
          fontReg = 'Outfit'; fontBold = 'Outfit-Bold';
        }
      } catch {}

      const etiqueta = ETIQUETAS_DOC[documento.tipo] || documento.tipo;
      const nomE = { banco:'Banco de La Placeta', tributos:'Tributos de La Placeta', junta:'Junta de La Placeta', administracion:'Administración de La Placeta' };
      const logos = { banco:'logo-banco.png', tributos:'logo-tributos.png', junta:'logo-gdlp.svg', administracion:'logo-web.png' };
      const entL = nomE[entidad] || entidad;
      const fecha = documento.createdAt ? new Date(documento.createdAt).toLocaleDateString('es-ES',{year:'numeric',month:'long',day:'numeric'}) : '—';
      const datos = documento.datos || {};
      const esAuto = documento.id?.startsWith('auto-');
      const lineas = generarContenidoDocumento(documento.tipo, datos);

      // ── Footer automático en cada página ──
      let _addingPage = false;
      doc.on('pageAdded', () => {
        if (_addingPage) return;
        _addingPage = true;
        try {
          doc.save();
          doc.rect(40, doc.page.height - 42, doc.page.width - 80, 0.5).fill(C);
          doc.font(fontReg).fontSize(6.5).fillColor('#5c5566');
          doc.text('Grupo de La Placeta · Documento oficial', 50, doc.page.height - 36, { width: 400 });
          const pg = doc.bufferedPageRange().count;
          doc.text(`Pág. ${pg}`, doc.page.width - 90, doc.page.height - 36, { width: 50, align:'right' });
          doc.restore();
        } finally { _addingPage = false; }
      });

      // ── CABECERA CON LOGO ──
      doc.save();
      // Fondo de cabecera color acento
      doc.rect(0, 16, doc.page.width, 85).fill('#341087');
      // Barra superior
      doc.rect(0, 0, doc.page.width, 3.5).fill('#5a2fc2');
      // Logo grande (el nombre de entidad está en el logo)
      const logoPath = path.join(__dirname, '..', 'img', logos[entidad] || 'logo-web.png');
      if (!fs.existsSync(logoPath)) {
        const logoPath2 = path.join(__dirname, '..', '..', 'public', 'img', logos[entidad] || 'logo-web.png');
        try { if (fs.existsSync(logoPath2)) doc.image(logoPath2, 50, 22, { width: 56 }); } catch {}
      } else {
        try { doc.image(logoPath, 50, 22, { width: 56 }); } catch {}
      }
      doc.font(fontBold).fontSize(20).fillColor('#ffffff').text(documento.titulo||'Documento', 120, 28);
      doc.font(fontReg).fontSize(8).fillColor('#d9cdfa').text(entL, 120, 54);
      doc.font(fontReg).fontSize(7).fillColor('#b8a8e0').text(`ID: ${(documento.id||'').slice(0,20)}  |  ${fecha}`, 120, 70);
      doc.rect(50, 104, 500, 1.5).fill('#5a2fc2');
      doc.y = 116;
      doc.restore();

      // ── CUERPO ──
      for (const item of lineas) {
        // Salto de página si queda poco espacio
        if (doc.y > doc.page.height - 100) doc.addPage();

        if (item.seccion) {
          doc.moveDown(0.3);
          doc.font(fontBold).fontSize(11).fillColor(B).text(item.seccion.toUpperCase());
          doc.moveDown(0.2);
        } else if (item.linea) {
          doc.moveTo(50, doc.y).lineTo(550, doc.y).lineWidth(0.5).strokeColor('#e0daf0').stroke();
          doc.moveDown(0.3);
        } else if (item.texto) {
          doc.font(fontReg).fontSize(8.5).fillColor('#1c1226').text(item.texto, 50, doc.y, {width:500, align:'justify', lineGap: 2});
          doc.moveDown(0.2);
        } else if (item.nota) {
          const ny = doc.y;
          doc.save(); doc.rect(50, ny, 3, 24).fill(C);
          doc.font(fontReg).fontSize(7.5).fillColor('#1c1226').text(item.nota, 60, ny+3, {width:480, lineGap: 1});
          doc.y = Math.max(doc.y, ny+16)+4;
          doc.restore();
        } else if (item.campo) {
          const [k,v] = item.campo;
          doc.font(fontBold).fontSize(8.5).fillColor('#1c1226').text(`${k}: `, 50, doc.y, {continued:true});
          doc.font(fontReg).fillColor('#5c5566').text(v||'—');
          doc.y += 1;
        }
      }

      // ── FIRMA ──
      // Dejar espacio suficiente
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).lineWidth(1).strokeColor(C).stroke();
      doc.moveDown(0.5);
      doc.font(fontBold).fontSize(10).fillColor(A).text('CÚMPLEASE Y NOTIFÍQUESE.', 50, doc.y, {width:500, align:'center'});
      doc.moveDown(1.5);
      doc.rect(200, doc.y, 200, 0.8).fill(A);
      doc.moveDown(0.3);
      doc.font(fontReg).fontSize(8).fillColor('#5c5566').text('Fdo.: La Administración del Grupo de La Placeta', 50, doc.y, {width:500, align:'center'});
      doc.moveDown(0.3);
      doc.font(fontReg).fontSize(7).fillColor('#5c5566').text(entL, {width:500, align:'center'});

      // ── DATOS DE FIRMA (si está firmado) ──
      if (documento.firmado && documento.datos?.firmadoPor) {
        doc.moveDown(0.8);
        doc.moveTo(150, doc.y).lineTo(450, doc.y).lineWidth(0.3).strokeColor('#e0daf0').stroke();
        doc.moveDown(0.3);
        // Firma manuscrita (base64) si existe
        const firmaImg = documento.datos?.firma_base64 || documento.datos?.firmaImagen;
        if (firmaImg) {
          try {
            const imgData = firmaImg.includes('base64,') ? firmaImg : `data:image/png;base64,${firmaImg}`;
            doc.image(imgData, 180, doc.y, { width: 200, height: 50 });
            doc.y += 56;
          } catch {}
        }
        doc.font(fontReg).fontSize(7).fillColor('#5c5566');
        doc.text(`Firmado digitalmente por: ${documento.datos.firmadoPor}`, {width:500, align:'center'});
        if (documento.datos.fechaFirma) {
          const fFecha = new Date(documento.datos.fechaFirma).toLocaleString('es-ES');
          doc.text(`Fecha de firma: ${fFecha}`, {width:500, align:'center'});
        }
        doc.text('Firma electrónica PlacetaID', {width:500, align:'center'});
      }

      // ── CSV ──
      doc.moveDown(0.5);
      const hash = documento.hash || createHash('sha256').update(documento.id+Date.now()).digest('hex');
      doc.font(fontReg).fontSize(6).fillColor('#9a8aaa');
      doc.text(`CSV: ${hash.substring(0,20).toUpperCase()}`, {width:500, align:'center'});

      // ── PIE ──
      doc.font(fontReg).fontSize(6.5).fillColor('#5c5566');
      const leyenda = esAuto ? 'Informe automático del sistema · Código Normativo Interno' : `${entL} · Documento oficial · Código Normativo Interno GDLP`;
      doc.text(leyenda, 50, doc.page.height-80, {width:500, align:'center'});
      doc.text(`Generado el ${new Date().toLocaleString('es-ES')}`, {width:500, align:'center'});

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
