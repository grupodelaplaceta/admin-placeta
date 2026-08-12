/**
 * FIRMA PLACETAID — Helper compartido
 * ─────────────────────────────────────────────
 * Envía documentos oficiales a PlacetaID Móvil para su firma.
 * "Todo se firma por PlacetaID Móvil" — el panel RSP es solo de admins;
 * los ciudadanos firman desde la app. Este módulo es la única vía de firma.
 *
 * Endpoints PlacetaID:
 *   POST /api/admin/documentos  → crear + enviar a la app móvil
 *   POST /api/webhook/firma      → PlacetaID notifica que se firmó
 */

import { createHash, randomUUID } from 'crypto';
import { saveDocumentoAsync, getDocumentoByIdAsync } from './documentos.js';

const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
const PLACETAID_KEY = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';

/** Envía un documento existente a PlacetaID Móvil para firma */
export async function enviarAPlacetaID(docId, titulo, tipo, entidad, csv, dip, hash) {
  try {
    const resp = await fetch(`${PLACETAID_API}/admin/documentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PLACETAID_KEY },
      body: JSON.stringify({
        id: docId,
        titulo,
        tipo,
        entidad,
        csv,
        destinatariosDIP: dip ? [dip] : [],
        contenido: `Documento oficial de ${entidad}: ${titulo}. ` +
                   `Firme desde PlacetaID Móvil para dar validez al trámite.\n\n` +
                   `CSV: ${csv}\nHash: ${hash?.slice(0, 16)}`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return resp.ok;
  } catch (err) {
    console.warn('[FirmaPlacetaID] Error enviando a PlacetaID:', err.message);
    return false;
  }
}

/**
 * Crea un documento oficial de firma vinculado a un trámite y lo envía
 * a PlacetaID Móvil. Devuelve { docId, csv, hash, enviado }.
 */
export async function crearYEnviarFirma({ entidad = 'rsp', titulo, tipo = 'resolucion', dip, tramiteId, datos = {} }) {
  const docId = `doc-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const hash = createHash('sha256').update(docId + Date.now()).digest('hex');
  const csv = hash.slice(0, 20).toUpperCase();

  const doc = await saveDocumentoAsync(entidad, {
    id: docId,
    tipo,
    titulo,
    descripcion: `Firma de trámite ${tramiteId || ''}`,
    datos: { ...datos, tramiteId, csv, creadoPor: 'rsp', fechaCreacion: new Date().toISOString() },
    createdBy: dip || 'rsp',
    estado: 'pendiente-firma',
    firmado: false,
    hash,
    csv,
  });

  const enviado = await enviarAPlacetaID(docId, titulo, tipo, entidad, csv, dip, hash);
  return { doc: { id: docId, titulo, estado: 'pendiente-firma' }, docId, csv, hash, enviado };
}

/** Consulta el estado de firma de un documento en la entidad */
export async function estadoFirma(docId, entidad = 'rsp') {
  const d = await getDocumentoByIdAsync(entidad, docId);
  if (!d) return { encontrado: false };
  return {
    encontrado: true,
    id: d.id,
    estado: d.estado,
    firmado: !!d.firmado,
    fechaFirma: d.datos?.fechaFirma || null,
    firmadoPor: d.datos?.firmadoPor || null,
    csv: d.datos?.csv || null,
  };
}
