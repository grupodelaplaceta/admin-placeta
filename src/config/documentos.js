/**
 * SISTEMA DE DOCUMENTACIÓN GLOBAL
 * 
 * Almacena datos como JSON en memoria (compatible con serverless Vercel).
 * Genera PDFs bajo demanda con pdfkit.
 * Accesible por entidad con permisos. Exportable vía API pública.
 */
import { createHash, randomUUID } from 'crypto';
import PDFDocument from 'pdfkit';
import { PLANTILLAS_BANCO } from './plantillas-banco.js';

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

// ── GENERADOR DE TEXTO DE DOCUMENTO (estilo CRM) ─────────────────────────
function generarContenidoDocumento(tipo, datos = {}) {
  const hoy = new Date().toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'numeric' });
  const L = []; const cf = (k,v) => L.push({campo:[k,v]}); const sf = (t) => L.push({seccion:t});
  const tx = (t) => L.push({texto:t}); const ln = () => L.push({linea:true});

  switch (tipo) {
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
    case 'baja-cuenta': {
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

export async function generarPDF(entidad, documento) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4', margins: { top: 50, bottom: 45, left: 45, right: 45 },
        bufferPages: true,
        info: { Title: documento.titulo||'Documento', Author: 'Admin Placeta - GDLP', Subject: `${entidad} - ${documento.tipo}` }
      });
      const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));

      const etiqueta = ETIQUETAS_DOC[documento.tipo] || documento.tipo;
      const nomE = { banco:'Banco de La Placeta', tributos:'Tributos de La Placeta', junta:'Junta de La Placeta', administracion:'Administración' };
      const entL = nomE[entidad] || entidad;
      const fecha = documento.createdAt ? new Date(documento.createdAt).toLocaleDateString('es-ES',{year:'numeric',month:'long',day:'numeric'}) : '—';
      const datos = documento.datos || {};
      const esAuto = documento.id?.startsWith('auto-');
      const lineas = generarContenidoDocumento(documento.tipo, datos);

      // ── Footer automático en cada página ──
      doc.on('pageAdded', () => {
        doc.save();
        doc.rect(40, doc.page.height - 40, doc.page.width - 80, 0.5).fill(C);
        doc.font('Helvetica').fontSize(6).fillColor('#5c5566');
        doc.text('Grupo de La Placeta · Documento oficial', 40, doc.page.height - 35, { width: 400 });
        const pg = doc.bufferedPageRange().count;
        doc.text(`Pág. ${pg}`, doc.page.width - 90, doc.page.height - 35, { width: 50, align:'right' });
        doc.restore();
      });

      // ── PORTADA (solo automáticos) ──
      if (esAuto) {
        doc.rect(0,0,doc.page.width,doc.page.height).fill(A);
        doc.roundedRect(45,90,150,22,18).fill('rgba(255,255,255,0.12)');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff').text('INFORME DEL SISTEMA', 55, 96);
        doc.font('Helvetica-Bold').fontSize(28).fillColor('#fff').text(documento.titulo||'Documento', 45, 140);
        doc.font('Helvetica').fontSize(11).fillColor('#d9cdfa').text(`${entL} · ${etiqueta}`, 45, 182);
        doc.moveTo(45, 225).lineTo(doc.page.width-45, 225).lineWidth(1).strokeColor('rgba(255,255,255,0.3)').stroke();
        let my = 255;
        [['ID',documento.id],['Fecha',fecha],['Estado',documento.estado],['Entidad',entL],['Tipo',etiqueta]].forEach(([k,v])=>{
          doc.font('Helvetica-Bold').fillColor('#fff').fontSize(8).text(`${k}: `,45,my,{continued:true});
          doc.font('Helvetica').fillColor('#e8e0fb').text(v||'—'); my+=16;
        });
        doc.font('Helvetica').fontSize(7).fillColor('rgba(255,255,255,0.4)').text('Grupo de La Placeta · Documentación Oficial',45,doc.page.height-70,{align:'center'});
        doc.addPage();
      }

      // ── CABECERA ──
      doc.save();
      doc.rect(30, 18, 540, 2).fill(C);
      doc.font('Helvetica-Bold').fontSize(15).fillColor(A).text('GRUPO DE LA PLACETA', 40, 28);
      doc.font('Helvetica').fontSize(7).fillColor('#5c5566').text(entL + ' · ' + etiqueta, 40, 48);
      doc.font('Helvetica-Bold').fontSize(17).fillColor(A).text(documento.titulo||'Documento', 40, 68);
      doc.rect(40, 88, 520, 1.5).fill(C);
      doc.y = 100;
      doc.restore();

      // ── METADATOS ──
      doc.save();
      doc.rect(40, doc.y, 3, 26).fill(C);
      doc.font('Helvetica').fontSize(7).fillColor('#1c1226');
      doc.text(`ID: ${documento.id}  |  ${fecha}  |  Estado: ${documento.estado}`, 52, doc.y+3, { width: 490 });
      doc.text(`Entidad: ${entL}  |  Ref: ${documento.refId?documento.refTipo+':'+documento.refId.slice(0,12):'—'}`, 52, doc.y+14, { width: 490 });
      doc.y += 34;
      doc.restore();

      // ── CUERPO ──
      for (const item of lineas) {
        if (item.seccion) {
          doc.font('Helvetica-Bold').fontSize(10.5).fillColor(B).text(item.seccion);
          doc.y += 4;
        } else if (item.linea) {
          doc.moveTo(40, doc.y).lineTo(560, doc.y).lineWidth(0.5).strokeColor('#e0daf0').stroke();
          doc.y += 5;
        } else if (item.texto) {
          doc.font('Helvetica').fontSize(8.5).fillColor('#1c1226').text(item.texto, 40, doc.y, {width:520, align:'justify'});
          doc.y += 2;
        } else if (item.nota) {
          const ny = doc.y;
          doc.save(); doc.rect(40, ny, 3, 22).fill(C);
          doc.font('Helvetica').fontSize(8).fillColor('#1c1226').text(item.nota, 52, ny+3, {width:500});
          doc.y = Math.max(doc.y, ny+14)+4;
          doc.restore();
        } else if (item.campo) {
          const [k,v] = item.campo;
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#1c1226').text(`${k}: `, 42, doc.y, {continued:true});
          doc.font('Helvetica').fillColor('#5c5566').text(v||'—');
          doc.y += 2;
        }
      }

      // ── FIRMA ──
      doc.moveDown(1);
      doc.moveTo(40, doc.y).lineTo(560, doc.y).lineWidth(1).strokeColor(C).stroke();
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(A).text('CÚMPLEASE Y NOTIFÍQUESE.', 40, doc.y, {width:520, align:'center'});
      doc.moveDown(1.5);
      doc.rect(200, doc.y, 200, 1).fill(A);
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(8).fillColor('#5c5566').text('Fdo.: La Administración del Grupo de La Placeta', 40, doc.y, {width:520, align:'center'});
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(7).fillColor('#5c5566').text('DEPARTAMENTO OFICIAL · GRUPO DE LA PLACETA', {width:520, align:'center'});
      const hash = documento.hash || createHash('sha256').update(documento.id+Date.now()).digest('hex');
      doc.font('Helvetica').fontSize(6).fillColor('#9a8aaa').text(`CSV: ${hash.substring(0,20).toUpperCase()} · Verificable en admin-placeta.vercel.app`, {width:520, align:'center'});

      // ── PIE ──
      doc.font('Helvetica').fontSize(6.5).fillColor('#5c5566');
      const leyenda = esAuto ? 'Informe automático del sistema · Código Normativo Interno' : `${entL} · Documento oficial · Código Normativo Interno GDLP`;
      doc.text(leyenda, 40, doc.page.height-80, {width:520, align:'center'});
      doc.text(`Generado el ${new Date().toLocaleString('es-ES')}`, {width:520, align:'center'});

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
