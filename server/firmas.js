/* ── Firma electrónica vía PlacetaID Móvil ───────────────────────────────
   "Todo se firma por PlacetaID Móvil": el panel RSP es solo de admins;
   los ciudadanos firman desde la app. Este módulo es la única vía de firma.

   Flujo:
     1) Admin crea la firma → POST /api/firmas/crear
        → crea el documento (Supabase) y lo envía a PlacetaID Móvil
          (POST /admin/documentos con X-API-Key).
     2) El ciudadano firma en PlacetaID Móvil.
     3) PlacetaID Móvil sincroniza la firma de vuelta:
        POST /publico/rsp/documentos/:id/firmar  (callback público con api_key).
   ──────────────────────────────────────────────────────────────────────── */
import { createHash, randomUUID } from 'crypto';
import { coleccion } from './db.js';

const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
// Para enviar documentos de firma se usa la clave de ADMINISTRACIÓN de
// PlacetaID (X-API-Key), distinta del client_id del SSO.
const PLACETAID_ADMIN_KEY = process.env.PLACETAID_ADMIN_KEY || '';

const documentos = coleccion('rsp_documentos');

/** Crea un documento de firma y lo envía a PlacetaID Móvil. */
export async function crearYEnviarFirma({ titulo, tipo = 'resolucion', dip, tramiteId, accion, entidad = 'rsp', contenido }) {
  const docId = `doc-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const hash = createHash('sha256').update(`${docId}${Date.now()}`).digest('hex');
  const csv = hash.slice(0, 20).toUpperCase();

  const doc = {
    id: docId,
    titulo,
    tipo,
    entidad,
    csv,
    hash,
    tramiteId: tramiteId || null,
    accion: accion || null,
    dip: dip || null,
    estado: 'pendiente',
    firmado: false,
    creadoEn: new Date().toISOString(),
  };
  await documentos.insertar(doc);

  let enviado = false;
  if (PLACETAID_ADMIN_KEY) {
    try {
      const r = await fetch(`${PLACETAID_API}/admin/documentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': PLACETAID_ADMIN_KEY },
        body: JSON.stringify({
          id: docId,
          titulo,
          tipo,
          entidad,
          csv,
          destinatariosDIP: dip ? [dip] : [],
          contenido: `${contenido || `Documento oficial de ${entidad}: ${titulo}. Firme desde PlacetaID Móvil para dar validez al trámite.`}\n\nCSV: ${csv}\nHash: ${hash.slice(0, 16)}`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      enviado = r.ok;
    } catch (err) {
      console.warn('[FirmaPlacetaID] Error enviando a PlacetaID:', err.message);
    }
  } else {
    console.warn('[FirmaPlacetaID] PLACETAID_ADMIN_KEY no configurada: el documento no se envía a la app móvil.');
  }
  if (enviado) await documentos.actualizar(docId, { estado: 'enviada' });
  return { id: docId, csv, hash, enviado, titulo, tipo, contenido: contenido || '' };
}

/** Consulta el estado de firma de un documento. */
export async function estadoFirma(docId) {
  const d = await documentos.obtener(docId);
  if (!d) return { encontrado: false };
  return {
    encontrado: true,
    id: d.id,
    estado: d.estado,
    firmado: !!d.firmado,
    firmadoPor: d.firmadoPor || null,
    fechaFirma: d.fechaFirma || null,
    csv: d.csv || null,
  };
}

/** Registra la firma recibida desde PlacetaID Móvil. Devuelve el doc actualizado. */
export async function registrarFirma(docId, { dip, firmaBase64 }) {
  const d = await documentos.obtener(docId);
  if (!d) return null;
  const patch = {
    estado: 'firmado',
    firmado: true,
    firmadoPor: dip || d.dip || null,
    fechaFirma: new Date().toISOString(),
  };
  if (firmaBase64) patch.firmaBase64 = firmaBase64;
  await documentos.actualizar(docId, patch);
  return { ...d, ...patch };
}

export { documentos };

/* ── Participación democrática vía PlacetaID Móvil ──────────────────── */
// Envía una votación/encuesta al sistema de PlacetaID (POST /admin/votaciones),
// que notifica a los destinatarios del grupo y la muestra en la app móvil.
export async function enviarVotacionPlacetaID(votacion) {
  if (!PLACETAID_ADMIN_KEY) {
    console.warn('[PlacetaID] PLACETAID_ADMIN_KEY no configurada: no se envía a la app móvil.');
    return { enviado: false };
  }
  try {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + 7);
    const r = await fetch(`${PLACETAID_API}/admin/votaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PLACETAID_ADMIN_KEY },
      body: JSON.stringify({
        id: votacion.id,
        titulo: votacion.titulo,
        grupo: votacion.categoria || 'Publico_General',
        descripcion: votacion.descripcion || votacion.pregunta || '',
        categoria: votacion.categoria || 'General',
        quorum: 50,
        requiereQuorum: true,
        fechaLimite: fechaLimite.toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      console.warn('[PlacetaID] Error enviando votación:', r.status);
      return { enviado: false };
    }
    return { enviado: true };
  } catch (err) {
    console.warn('[PlacetaID] Error enviando votación:', err.message);
    return { enviado: false };
  }
}

/** Cierra la votación en PlacetaID y notifica el resultado a los destinatarios. */
export async function cerrarVotacionPlacetaID(id) {
  if (!PLACETAID_ADMIN_KEY) return { enviado: false };
  try {
    const r = await fetch(`${PLACETAID_API}/admin/votaciones/${encodeURIComponent(id)}/cerrar`, {
      method: 'PUT',
      headers: { 'X-API-Key': PLACETAID_ADMIN_KEY },
      signal: AbortSignal.timeout(8000),
    });
    return { enviado: r.ok };
  } catch (err) {
    console.warn('[PlacetaID] Error cerrando votación:', err.message);
    return { enviado: false };
  }
}
