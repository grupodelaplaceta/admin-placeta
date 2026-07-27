/**
 * DOCUMENTOS LEGALES — Sistema de documentos pre-acción
 * 
 * Cada acción administrativa requiere su documento legal correspondiente
 * que debe ser firmado vía PlacetaID Móvil antes de ejecutar la acción.
 * 
 * Flujo:
 *   1. Usuario solicita acción → se genera documento legal
 *   2. Documento se envía a PlacetaID Móvil para firma
 *   3. Usuario firma → webhook confirma → se ejecuta la acción
 *   4. Documento firmado queda registrado como evidencia
 */

import { saveDocumentoAsync, generarPDF, ETIQUETAS_DOC } from './documentos.js';
import { createHash, randomUUID } from 'crypto';
import { enviarAPlacetaID } from '../routes/firmas.js';

// ── MAPA: cada acción → su documento legal requerido ─────────────────────
const MAPA_ACCIONES = {
  // Banco
  'crear-cuenta': {
    tipo: 'contrato-apertura',
    titulo: 'Contrato de Apertura de Cuenta Bancaria (BLP-B-001)',
    descripcion: 'Documento legal requerido para apertura de cuenta. Debe ser firmado antes de crear la cuenta.',
    datos: ['titular', 'dip', 'tipoCuenta', 'iban']
  },
  'modificar-cuenta': {
    tipo: 'contrato-modificacion',
    titulo: 'Contrato de Modificación de Cuenta (BLP-B-002)',
    descripcion: 'Documento legal requerido para modificar datos de cuenta.',
    datos: ['titular', 'dip', 'iban', 'tipoAnterior', 'tipoNuevo']
  },
  'bloquear-cuenta': {
    tipo: 'bloqueo-cuenta',
    titulo: 'Resolución de Bloqueo de Cuenta (BLP-B-008)',
    descripcion: 'Documento legal para bloqueo de cuenta. Requiere firma del titular o administración.',
    datos: ['titular', 'dip', 'iban', 'motivo']
  },
  'desbloquear-cuenta': {
    tipo: 'desbloqueo-cuenta',
    titulo: 'Resolución de Desbloqueo de Cuenta (BLP-B-009)',
    descripcion: 'Documento legal para desbloqueo de cuenta.',
    datos: ['titular', 'dip', 'iban']
  },
  'cerrar-cuenta': {
    tipo: 'baja-cuenta',
    titulo: 'Resolución de Baja Definitiva de Cuenta (BLP-B-010)',
    descripcion: 'Documento legal para cierre definitivo de cuenta bancaria.',
    datos: ['titular', 'dip', 'iban', 'motivo']
  },
  'cambio-titularidad': {
    tipo: 'cambio-titularidad',
    titulo: 'Cambio de Titularidad de Cuenta (BLP-B-003)',
    descripcion: 'Documento legal para cambio de titularidad.',
    datos: ['titularAnterior', 'dipAnterior', 'titularNuevo', 'dipNuevo', 'iban']
  },
  'emitir-placetas': {
    tipo: 'resolucion',
    titulo: 'Resolución de Emisión de Placetas',
    descripcion: 'Documento legal que autoriza la emisión de Placetas.',
    datos: ['dipDestino', 'monto', 'concepto', 'autorizadoPor']
  },
  'quemar-placetas': {
    tipo: 'resolucion',
    titulo: 'Resolución de Quema de Placetas',
    descripcion: 'Documento legal para destrucción de Placetas.',
    datos: ['dipOrigen', 'monto', 'concepto']
  },
  'alta-tributos': {
    tipo: 'declaracion-borrador',
    titulo: 'Alta Censal en Tributos de La Placeta',
    descripcion: 'Documento de alta en el censo tributario.',
    datos: ['contribuyente', 'dip', 'tipoSujeto', 'fechaAlta']
  },
  'pago-sancion': {
    tipo: 'notificacion',
    titulo: 'Pago de Sanción Administrativa',
    descripcion: 'Documento de pago de sanción. IVA y sanciones se liquidan a Tributos.',
    datos: ['entidad', 'monto', 'concepto', 'fecha']
  },
  // RSP
  'generar-factura-rsp': {
    tipo: 'factura',
    titulo: 'Factura de Servicios RSP',
    descripcion: 'Factura por uso de la Red de Servicios de La Placeta.',
    datos: ['entidad', 'periodo', 'base', 'iva', 'total']
  },
  'pagar-factura-rsp': {
    tipo: 'factura',
    titulo: 'Pago de Factura RSP',
    descripcion: 'Orden de pago de factura. Base→RSP, IVA→Tributos TGLP.',
    datos: ['facturaId', 'entidad', 'total', 'ibanDestino']
  },
  // Junta
  'convocar-reunion': {
    tipo: 'convocatoria',
    titulo: 'Convocatoria de Reunión',
    descripcion: 'Convocatoria oficial de reunión de la Junta.',
    datos: ['convocante', 'reunion', 'fecha', 'ordenDelDia']
  },
  'crear-votacion': {
    tipo: 'convocatoria-votacion',
    titulo: 'Convocatoria de Votación',
    descripcion: 'Convocatoria oficial de votación.',
    datos: ['titulo', 'descripcion', 'grupo', 'fechaInicio', 'fechaFin']
  },
  'nombrar-cargo': {
    tipo: 'nombramiento',
    titulo: 'Nombramiento de Cargo',
    descripcion: 'Documento oficial de nombramiento de cargo en la Junta.',
    datos: ['dip', 'cargo', 'departamento', 'nombradoPor']
  },
  // Junior
  'alta-junior': {
    tipo: 'alta-junior',
    titulo: 'Autorización Legal Placeta Junior',
    descripcion: 'Autorización tutorial para alta de menor en Placeta Junior.',
    datos: ['menor', 'tutor', 'fechaNacimiento', 'dipTutor']
  },
  // Administración
  'resolucion-admin': {
    tipo: 'resolucion',
    titulo: 'Resolución Administrativa',
    descripcion: 'Resolución oficial de la Administración de La Placeta.',
    datos: ['emisor', 'asunto', 'texto']
  }
};

/**
 * Genera el documento legal necesario para una acción
 * @param {string} entidad - Entidad que ejecuta la acción
 * @param {string} accion - Identificador de la acción
 * @param {object} datos - Datos para el documento
 * @param {string} dipFirma - DIP que debe firmar (opcional)
 * @returns {object} Documento creado
 */
export async function generarDocumentoLegal(entidad, accion, datos = {}, dipFirma = '') {
  const config = MAPA_ACCIONES[accion];
  if (!config) {
    return { success: false, error: `Acción "${accion}" no tiene documento legal configurado` };
  }

  const docId = `legal-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const hash = createHash('sha256').update(docId + Date.now()).digest('hex');
  const csv = hash.slice(0, 20).toUpperCase();

  // Construir datos del documento extrayendo solo los campos relevantes
  const datosDoc = {};
  if (config.datos) {
    config.datos.forEach(campo => {
      if (datos[campo] !== undefined) datosDoc[campo] = datos[campo];
    });
  }
  // Añadir metadatos legales
  datosDoc.fecha = new Date().toISOString();
  datosDoc.csv = csv;
  datosDoc.hash = hash;
  datosDoc.accion = accion;
  datosDoc.entidad = entidad;

  try {
    const doc = await saveDocumentoAsync(entidad, {
      id: docId,
      tipo: config.tipo,
      titulo: config.titulo,
      descripcion: config.descripcion,
      datos: datosDoc,
      createdBy: dipFirma || datos.dip || datos.dipFirma || 'sistema',
      estado: 'pendiente-firma',
      firmado: false,
      hash,
      csv
    });

    // Enviar a PlacetaID Móvil para firma
    const envioPlacetaID = await enviarAPlacetaID(
      docId, doc.titulo, config.tipo, entidad, csv,
      dipFirma || datos.dip || '', hash
    );

    return {
      success: true,
      documento: doc,
      pendienteFirma: true,
      firmado: false,
      placetaid: envioPlacetaID,
      mensaje: envioPlacetaID
        ? `✅ Documento "${doc.titulo}" creado y enviado a PlacetaID Móvil para firma`
        : `⚠️ Documento creado pero no se pudo enviar a PlacetaID (modo offline)`,
      csv
    };
  } catch (err) {
    return { success: false, error: `Error generando documento legal: ${err.message}` };
  }
}

/**
 * Verifica si una acción requiere documento legal antes de ejecutarse
 */
export function requiereDocumentoLegal(accion) {
  return MAPA_ACCIONES[accion] !== undefined;
}

/**
 * Obtiene la configuración de documento legal para una acción
 */
export function getConfigLegal(accion) {
  return MAPA_ACCIONES[accion] || null;
}

/**
 * Lista todas las acciones disponibles con sus documentos legales
 */
export function listarAccionesLegales() {
  return Object.entries(MAPA_ACCIONES).map(([accion, config]) => ({
    accion,
    tipo: config.tipo,
    titulo: config.titulo,
    descripcion: config.descripcion
  }));
}

export default {
  generarDocumentoLegal,
  requiereDocumentoLegal,
  getConfigLegal,
  listarAccionesLegales,
  MAPA_ACCIONES
};
