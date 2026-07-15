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
  banco: 'img/logo-banco.jpg',
  tributos: 'img/logo-tributos.png',
  junta: 'img/logo-gdlp.svg',
  administracion: 'img/logo-web.png',
  placetaid: 'img/logo-placetaid.jpg',
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

// ── GENERADOR DE TEXTO DE DOCUMENTO POR TIPO ────────────────────────────
function generarContratoDocumento(tipo, datos = {}, refId, refTipo) {
  const tipoLabel = ETIQUETAS_DOC[tipo] || tipo;
  const hoy = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];

  const addLine = (k, v) => lines.push({ label: k, valor: v ?? '—' });
  const addSep = () => lines.push({ sep: true });
  const addSec = (t) => lines.push({ seccion: t });

  switch (tipo) {
    case 'contrato-apertura':
      addSec('DATOS DEL TITULAR');
      addLine('Nombre del titular', datos.titular || datos.nombre || '—');
      addLine('DIP', datos.dip || '—');
      addSep();
      addSec('DATOS DE LA CUENTA');
      addLine('Tipo de cuenta', datos.tipoCuenta || 'Personal');
      addLine('IBAN', datos.iban || '—');
      addLine('Fecha de apertura', datos.fechaApertura || hoy);
      addLine('Saldo inicial', datos.saldoInicial ? datos.saldoInicial + ' Pz' : '0 Pz');
      addSep();
      addSec('CONDICIONES');
      addLine('Saldo mínimo requerido', datos.condiciones?.saldoMinimo ? datos.condiciones.saldoMinimo + ' Pz' : '0 Pz');
      addLine('Comisiones', datos.condiciones?.comisiones || 'Sin comisiones');
      addLine('Régimen', datos.condiciones?.regimen || 'General');
      break;

    case 'certificado-saldo':
    case 'certificado-titularidad':
    case 'certificado-iban':
      addSec('CERTIFICADO');
      addLine('Titular', datos.titular || datos.nombre || '—');
      addLine('DIP/NIF', datos.dip || '—');
      addLine('Cuenta', datos.cuenta || datos.iban || '—');
      addLine('IBAN', datos.iban || '—');
      if (tipo === 'certificado-saldo') addLine('Saldo actual', datos.saldo !== undefined ? datos.saldo.toLocaleString() + ' Pz' : '—');
      addLine('Moneda', 'Placeta (Pz)');
      addLine('Fecha de emisión', datos.fechaEmision || hoy);
      addLine('Válido hasta', datos.validoHasta || '30 días desde emisión');
      addSec('DOCUMENTO ACREDITATIVO');
      lines.push({ texto: 'El Banco de La Placeta CERTIFICA que los datos arriba indicados son ciertos y exactos a fecha de emisión del presente documento, teniendo validez como certificado oficial a todos los efectos del sistema GDLP.' });
      break;

    case 'estado-mensual':
      addSec('PERIODO');
      addLine('Titular', datos.titular || '—');
      addLine('Cuenta', datos.cuenta || '—');
      addLine('Período', datos.periodo || '—');
      addSep();
      addSec('RESUMEN');
      addLine('Saldo inicial', datos.saldoInicial !== undefined ? datos.saldoInicial.toLocaleString() + ' Pz' : '—');
      addLine('Total ingresos', datos.ingresos !== undefined ? datos.ingresos.toLocaleString() + ' Pz' : '—');
      addLine('Total gastos', datos.gastos !== undefined ? datos.gastos.toLocaleString() + ' Pz' : '—');
      addLine('Saldo final', datos.saldoFinal !== undefined ? datos.saldoFinal.toLocaleString() + ' Pz' : '—');
      if (datos.movimientos?.length > 0) {
        addSep();
        addSec('MOVIMIENTOS');
        datos.movimientos.forEach((m, i) => {
          addLine(`Movimiento ${i + 1}`, `${m.fecha || '—'} | ${m.concepto || '—'} | ${m.importe ? m.importe + ' Pz' : '—'}`);
        });
      }
      break;

    case 'justificante-transferencia':
      addSec('DATOS DE LA TRANSFERENCIA');
      addLine('Ordenante', datos.ordenante || '—');
      addLine('Destinatario', datos.destinatario || '—');
      addLine('Importe', datos.importe !== undefined ? datos.importe.toLocaleString() + ' Pz' : '—');
      addLine('Concepto', datos.concepto || '—');
      addLine('Fecha de operación', datos.fecha || hoy);
      addLine('Referencia', datos.referencia || '—');
      addLine('Estado', '✅ Ejecutada');
      break;

    case 'declaracion-definitiva':
    case 'declaracion-borrador':
      addSec('DATOS DEL CONTRIBUYENTE');
      addLine('Contribuyente', datos.contribuyente || datos.nombre || '—');
      addLine('DIP', datos.dip || '—');
      addSep();
      addSec('DECLARACIÓN');
      addLine('Período', datos.periodo || '—');
      addLine('Base imponible', datos.baseImponible !== undefined ? datos.baseImponible.toLocaleString() + ' Pz' : '—');
      addLine('Tipo impositivo', datos.tipoImpositivo ? (datos.tipoImpositivo * 100).toFixed(1) + '%' : '—');
      addLine('Cuota resultante', datos.cuota !== undefined ? datos.cuota.toLocaleString() + ' Pz' : '—');
      addLine('Estado', datos.estado || tipoLabel);
      break;

    case 'informe-inspeccion-trib':
      addSec('DATOS DE LA INSPECCIÓN');
      addLine('Inspector', datos.inspector || '—');
      addLine('Contribuyente inspeccionado', datos.contribuyente || '—');
      addLine('Fecha de inspección', datos.fechaInspeccion || hoy);
      addLine('Resultado', datos.resultado || 'Pendiente');
      addLine('Observaciones', datos.observaciones || '—');
      if (datos.medidas?.length > 0) {
        addSep();
        addSec('MEDIDAS ADOPTADAS');
        datos.medidas.forEach((m, i) => addLine(`Medida ${i + 1}`, m));
      }
      break;

    case 'acta':
    case 'acta-firmada':
      addSec('DATOS DEL ACTA');
      addLine('Reunión', datos.reunion || '—');
      addLine('Fecha', datos.fecha || hoy);
      addLine('Lugar', datos.lugar || '—');
      addSep();
      addSec('ASISTENTES');
      (datos.asistentes || []).forEach((a, i) => addLine(`${i + 1}.`, a));
      addSep();
      addSec('ORDEN DEL DÍA');
      (datos.ordenDelDia || []).forEach((o, i) => addLine(`${i + 1}.`, o));
      addSep();
      addSec('ACUERDOS');
      (datos.acuerdos || []).forEach((a, i) => addLine(`Acuerdo ${i + 1}`, a));
      if (tipo === 'acta-firmada') {
        addSep();
        addSec('FIRMAS');
        addLine('Presidente', datos.firmaPresidente || '—');
        addLine('Secretario', datos.firmaSecretario || '—');
      }
      break;

    case 'certificado-situacion-tributaria':
      addSec('CERTIFICADO DE SITUACIÓN TRIBUTARIA');
      addLine('Contribuyente', datos.contribuyente || datos.nombre || '—');
      addLine('DIP', datos.dip || '—');
      addLine('Situación fiscal', datos.situacion || 'Al corriente');
      addLine('Última declaración', datos.ultimaDeclaracion || '—');
      addLine('Deuda pendiente', datos.deudaPendiente !== undefined ? datos.deudaPendiente.toLocaleString() + ' Pz' : '0 Pz');
      addLine('Fecha de emisión', datos.fechaEmision || hoy);
      addSep();
      lines.push({ texto: 'Se CERTIFICA que el contribuyente se encuentra al corriente de sus obligaciones tributarias en el sistema GDLP, sin perjuicio de futuras liquidaciones.' });
      break;

    case 'convocatoria':
      addSec('CONVOCATORIA');
      addLine('Convocante', datos.convocante || '—');
      addLine('Reunión', datos.reunion || '—');
      addLine('Fecha', datos.fecha || '—');
      addLine('Hora', datos.hora || '—');
      addLine('Lugar', datos.lugar || '—');
      addSep();
      addSec('ORDEN DEL DÍA');
      (datos.ordenDelDia || []).forEach((o, i) => addLine(`${i + 1}.`, o));
      (datos.destinatarios || []).length > 0 && addSep() && addSec('DESTINATARIOS');
      (datos.destinatarios || []).forEach((d, i) => addLine(`${i + 1}.`, d));
      break;

    case 'resultado-definitivo':
      addSec('RESULTADO DE VOTACIÓN');
      addLine('Votación', datos.votacion || '—');
      addLine('Fecha', datos.fecha || hoy);
      addLine('Participantes', datos.participantes !== undefined ? datos.participantes.toString() : '—');
      addLine('Votos a favor', datos.votosFavor !== undefined ? datos.votosFavor.toString() : '—');
      addLine('Votos en contra', datos.votosContra !== undefined ? datos.votosContra.toString() : '—');
      addLine('Abstenciones', datos.abstenciones !== undefined ? datos.abstenciones.toString() : '—');
      addLine('Resultado', datos.resultado || '—');
      addLine('Verificación', datos.verificacion || 'Pendiente');
      break;

    case 'solicitud':
      addSec('SOLICITUD');
      addLine('Solicitante', datos.solicitante || '—');
      addLine('DIP', datos.dip || '—');
      addLine('Trámite solicitado', datos.tramite || '—');
      addLine('Fecha', datos.fecha || hoy);
      addLine('Descripción', datos.descripcion || '—');
      break;

    default:
      // Para tipos no específicos, mostrar datos genéricos con formato
      addSec('DATOS DEL DOCUMENTO');
      for (const [k, v] of Object.entries(datos)) {
        if (typeof v === 'object' && v !== null) {
          for (const [sk, sv] of Object.entries(v)) {
            addLine(sk, sv);
          }
        } else if (!Array.isArray(v)) {
          addLine(k, v);
        }
      }
      break;
  }

  return lines;
}

// ── GENERACIÓN DE PDF ─────────────────────────────────────────────────────
const PURPURA = { '900': '#1c005f', '700': '#341087', '500': '#5a2fc2', '300': '#9c7ee6', '100': '#efe9fb', '050': '#f7f4fd' };

export async function generarPDF(entidad, documento) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 56, bottom: 56, left: 68, right: 68 },
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

      const etiqueta = ETIQUETAS_DOC[documento.tipo] || documento.tipo;
      const nomEntidad = { banco: 'Banco de La Placeta', tributos: 'Tributos de La Placeta', junta: 'Junta de La Placeta', administracion: 'Administración de La Placeta' };
      const entidadLabel = nomEntidad[entidad] || entidad;
      const fecha = documento.createdAt ? new Date(documento.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
      const datos = documento.datos || {};
      const esAuto = documento.id?.startsWith('auto-');
      const lineas = generarContratoDocumento(documento.tipo, datos, documento.refId, documento.refTipo);

      // ══════════════════════════════════════════════════════════════
      // PORTADA solo para documentos del sistema
      // ══════════════════════════════════════════════════════════════
      if (esAuto || documento.categoria === 'automatico') {
        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#1c005f');
        doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).lineWidth(1).strokeColor('rgba(255,255,255,0.15)').stroke();
        doc.roundedRect(68, 100, 160, 24, 20).fill('rgba(255,255,255,0.12)');
        doc.roundedRect(68, 100, 160, 24, 20).lineWidth(1).strokeColor('rgba(255,255,255,0.35)').stroke();
        doc.fontSize(9).fillColor('#fff').font('Helvetica-Bold').text('INFORME DEL SISTEMA', 78, 106);
        doc.fontSize(32).fillColor('#fff').font('Helvetica-Bold').text(documento.titulo || 'Documento', 68, 155);
        doc.fontSize(13).fillColor('#d9cdfa').font('Helvetica').text(`${entidadLabel} · ${etiqueta}`, 68, 200);
        doc.moveTo(68, 250).lineTo(doc.page.width - 68, 250).lineWidth(1).strokeColor('rgba(255,255,255,0.3)').stroke();
        let my = 280;
        [['ID', documento.id], ['Fecha', fecha], ['Estado', documento.estado], ['Entidad', entidadLabel], ['Tipo', etiqueta]].forEach(([k, v]) => {
          doc.font('Helvetica-Bold').fillColor('#fff').fontSize(9).text(`${k}: `, 68, my, { continued: true });
          doc.font('Helvetica').fillColor('#e8e0fb').text(`${v || '—'}`);
          my += 18;
        });
        doc.fontSize(8).fillColor('rgba(255,255,255,0.4)').font('Helvetica').text('Grupo de La Placeta · Sistema de Documentación Oficial', 68, doc.page.height - 80, { align: 'center' });
        doc.addPage();
      }

      // ══════════════════════════════════════════════════════════════
      // CABECERA
      // ══════════════════════════════════════════════════════════════
      doc.fontSize(7.5).fillColor(PURPURA[500]).font('Helvetica-Bold').text(`${entidadLabel} · ${etiqueta}`, 68, 36, { align: 'left' });
      doc.fontSize(7.5).fillColor('#5c5566').font('Helvetica').text('GRUPO DE LA PLACETA', { align: 'right' });
      doc.moveTo(68, 46).lineTo(doc.page.width - 68, 46).lineWidth(0.5).strokeColor(PURPURA[100]).stroke();

      // ══════════════════════════════════════════════════════════════
      // TÍTULO
      // ══════════════════════════════════════════════════════════════
      doc.fontSize(17).fillColor(PURPURA[900]).font('Helvetica-Bold').text(documento.titulo || 'Documento', 68, 62);
      doc.fontSize(10).fillColor(PURPURA[700]).font('Helvetica-Bold').text(`${entidadLabel} · ${etiqueta}`);
      doc.moveTo(68, doc.y + 4).lineTo(doc.page.width - 68, doc.y + 4).lineWidth(2.5).strokeColor(PURPURA[900]).stroke();
      doc.moveDown(0.8);

      // ══════════════════════════════════════════════════════════════
      // NOTA DE METADATOS
      // ══════════════════════════════════════════════════════════════
      const noteY = doc.y;
      doc.rect(68, noteY, doc.page.width - 136, 34).fill(PURPURA['050']);
      doc.rect(68, noteY, 3, 34).fill(PURPURA[500]);
      doc.fontSize(7.5).fillColor('#1c1226').font('Helvetica');
      doc.text(`ID: ${documento.id}  |  ${fecha}  |  Estado: ${documento.estado}`, 80, noteY + 5);
      doc.text(`Entidad: ${entidadLabel}  |  Tipo: ${etiqueta}  |  Ref: ${documento.refId ? documento.refTipo + ':' + documento.refId.slice(0, 12) : '—'}`, 80, noteY + 18);
      doc.moveDown(2.2);

      // ══════════════════════════════════════════════════════════════
      // CUERPO DEL DOCUMENTO
      // ══════════════════════════════════════════════════════════════
      for (const item of lineas) {
        if (item.seccion) {
          doc.fontSize(11).fillColor(PURPURA[700]).font('Helvetica-Bold').text(item.seccion);
          doc.moveDown(0.3);
        } else if (item.sep) {
          doc.moveDown(0.2);
          doc.moveTo(68, doc.y).lineTo(doc.page.width - 68, doc.y).lineWidth(0.3).strokeColor(PURPURA[100]).stroke();
          doc.moveDown(0.3);
        } else if (item.texto) {
          doc.fontSize(9.5).fillColor('#1c1226').font('Helvetica-Oblique').text(item.texto, { align: 'justify' });
          doc.moveDown(0.4);
        } else {
          doc.fontSize(9.5).fillColor('#1c1226');
          doc.font('Helvetica-Bold').text(`${item.label}: `, 68, doc.y, { continued: true });
          doc.font('Helvetica').text(`${item.valor}`);
        }
      }

      // ══════════════════════════════════════════════════════════════
      // PIE
      // ══════════════════════════════════════════════════════════════
      const pieY = doc.page.height - 50;
      doc.moveTo(68, pieY).lineWidth(0.5).strokeColor(PURPURA[100]).stroke();
      doc.fontSize(7).fillColor('#5c5566').font('Helvetica');
      doc.text('Grupo de La Placeta · Documento Oficial · Sistema de Documentación GDLP', 68, pieY + 6, { align: 'center' });

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
