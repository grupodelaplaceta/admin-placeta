/**
 * SISTEMA DE DOCUMENTACIÓN GLOBAL
 * 
 * Almacena datos como JSON en memoria (compatible con serverless Vercel).
 * Genera PDFs bajo demanda con pdfkit.
 * Accesible por entidad con permisos. Exportable vía API pública.
 */
import { createHash, randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';

// Almacenamiento en memoria (fallback cuando fs no está disponible en serverless)
const memStore = {};

const LOGOS = {
  banco: 'https://i.postimg.cc/RZYKzdmX/Diseno-sin-titulo-76.png',
  tributos: 'https://i.postimg.cc/RZYKzdmX/Diseno-sin-titulo-76.png',
  junta: 'https://i.postimg.cc/RZYKzdmX/Diseno-sin-titulo-76.png',
  administracion: 'https://i.postimg.cc/RZYKzdmX/Diseno-sin-titulo-76.png',
  placetaid: 'https://i.postimg.cc/RZYKzdmX/Diseno-sin-titulo-76.png',
};

// ── TIPOS DE DOCUMENTOS POR ENTIDAD ──────────────────────────────────────
export const TIPOS_DOCUMENTO = {
  banco: {
    cliente: [
      'contrato-apertura', 'contrato-modificacion', 'contrato-cierre',
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
export const ETIQUETAS_DOC = {};
function addLabels(obj, prefix = '') {
  for (const [cat, docs] of Object.entries(obj)) {
    if (Array.isArray(docs)) {
      docs.forEach(d => {
        ETIQUETAS_DOC[d] = d.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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

// ── ALMACENAMIENTO (Memoria + fs opcional) ────────────────────────────────
export function getDocumentos(entidad) {
  if (!memStore[entidad]) memStore[entidad] = [];
  return memStore[entidad];
}

export function getDocumentoById(entidad, id) {
  return getDocumentos(entidad).find(d => d.id === id) || null;
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
    refId: data.refId || null,       // ID del objeto al que pertenece (cuenta, tarjeta, etc.)
    refTipo: data.refTipo || null,   // tipo de referencia: 'cuenta', 'tarjeta', 'operacion', 'contribuyente', etc.
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
  return doc;
}

// Obtener documentos por referencia (ej: todos los docs de una cuenta)
export function getDocumentosPorRef(entidad, refTipo, refId) {
  return getDocumentos(entidad).filter(d => d.refTipo === refTipo && d.refId === refId);
}

export function deleteDocumento(entidad, id) {
  const docs = getDocumentos(entidad).filter(d => d.id !== id);
  memStore[entidad] = docs;
  return true;
}

// ── GENERACIÓN DE PDF ─────────────────────────────────────────────────────
export async function generarPDF(entidad, documento) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 60,
        info: {
          Title: documento.titulo || 'Documento',
          Author: 'Admin Placeta - GDLP',
          Subject: `${entidad} - ${documento.tipo}`,
          Creator: 'Sistema de Documentación GDLP'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // ── Cabecera ──────────────────────────────────────────────
      doc.fontSize(8).fillColor('#999').text('Grupo de La Placeta · Documento Oficial', 60, 40, { align: 'center' });

      // Logo (intentamos cargarlo)
      const logoUrl = LOGOS[entidad] || LOGOS.banco;

      // Línea separadora
      doc.moveTo(60, 55).lineTo(535, 55).strokeColor('#e0daf0').stroke();

      // ── Título ─────────────────────────────────────────────────
      doc.fontSize(22).fillColor('#3f00d8').font('Helvetica-Bold')
        .text(documento.titulo || 'Documento', 60, 75, { align: 'center' });

      // Subtítulo
      const etiqueta = ETIQUETAS_DOC[documento.tipo] || documento.tipo;
      doc.fontSize(11).fillColor('#666').font('Helvetica')
        .text(`${entidad.charAt(0).toUpperCase() + entidad.slice(1)} · ${etiqueta}`, { align: 'center' });

      // ── Metadatos ──────────────────────────────────────────────
      doc.moveDown(1.5);
      doc.fontSize(9).fillColor('#888').font('Helvetica');
      const fecha = documento.createdAt ? new Date(documento.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
      doc.text(`Fecha: ${fecha}`, { align: 'right' });
      doc.text(`ID: ${documento.id}`, { align: 'right' });
      doc.text(`Estado: ${documento.estado}`, { align: 'right' });
      if (documento.firmado) doc.text('✅ Firmado digitalmente', { align: 'right' });

      doc.moveDown(0.5);
      doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor('#e0daf0').stroke();
      doc.moveDown(1);

      // ── Cuerpo ─────────────────────────────────────────────────
      doc.fontSize(10).fillColor('#333').font('Helvetica');

      // Recorrer datos y mostrarlos
      const datos = documento.datos || {};
      for (const [key, value] of Object.entries(datos)) {
        const label = key.split(/(?=[A-Z])/).join(' ').replace(/_/g, ' ');
        const labelFormatted = label.charAt(0).toUpperCase() + label.slice(1);

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#3f00d8').text(labelFormatted, { continued: false });
          doc.moveDown(0.3);
          for (const [sk, sv] of Object.entries(value)) {
            const sl = sk.split(/(?=[A-Z])/).join(' ').replace(/_/g, ' ');
            doc.font('Helvetica').fontSize(10).fillColor('#333');
            doc.text(`  ${sl.charAt(0).toUpperCase() + sl.slice(1)}: ${sv ?? '—'}`, { indent: 10 });
          }
          doc.moveDown(0.5);
        } else if (Array.isArray(value)) {
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#3f00d8').text(labelFormatted, { continued: false });
          doc.moveDown(0.3);
          value.forEach((item, i) => {
            if (typeof item === 'object') {
              doc.font('Helvetica').fontSize(10).fillColor('#333').text(`  ${i + 1}. ${Object.values(item).join(' — ')}`);
            } else {
              doc.font('Helvetica').fontSize(10).fillColor('#333').text(`  ${i + 1}. ${item}`);
            }
          });
          doc.moveDown(0.5);
        } else {
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#444').text(`${labelFormatted}: `, { continued: true });
          doc.font('Helvetica').fillColor('#333').text(`${value ?? '—'}`);
        }
      }

      // ── Pie de página ──────────────────────────────────────────
      const bottomY = doc.page.height - 60;
      doc.fontSize(7).fillColor('#bbb');
      doc.text(`Documento generado por Admin Placeta · ${new Date().toISOString().split('T')[0]}`, 60, bottomY, { align: 'center' });
      doc.text(`ID: ${documento.id} · Hash: ${documento.hash || '—'}`, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
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
