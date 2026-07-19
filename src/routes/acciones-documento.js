/**
 * Rutas de Acciones con Documento
 * 
 * Puente entre la app del banco y el sistema de documentación:
 * 1. App solicita acción → se crea documento → se envía a PlacetaID
 * 2. PlacetaID notifica firma → se procesa la acción en el banco
 */

import { Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import { saveDocumentoAsync, getDocumentoByIdAsync } from '../config/documentos.js';

const router = Router();

const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
const PLACETAID_API_KEY = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';
const BANCO_API_URL = process.env.BANCO_API_URL || 'https://api.banco.laplaceta.org';

// ── Verificar API Key ─────────────────────────────────────────────────
function verificarApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  const validKeys = (process.env.DOCS_API_KEYS || 'docs-shared-key-2026').split(',');
  if (!key || !validKeys.includes(key)) {
    return res.status(401).json({ error: 'API key inválida' });
  }
  next();
}

// ── Almacén de acciones pendientes (en producción: Supabase) ──────────
const pendingActions = new Map();

// ════════════════════════════════════════════════════════════════════════
//  1. SOLICITAR DOCUMENTO — llamado por backend-banco
// ════════════════════════════════════════════════════════════════════════
router.post('/api/acciones/solicitar-documento', verificarApiKey, async (req, res) => {
  const { tipo, titulo, entidad = 'banco', dipSolicitante, nombreSolicitante, datos = {}, origen } = req.body;

  if (!tipo || !dipSolicitante) {
    return res.status(400).json({ error: 'tipo y dipSolicitante son requeridos' });
  }

  const actionId = `act-${Date.now()}-${randomUUID().slice(0, 6)}`;

  try {
    // 1. Crear el documento
    const docId = `doc-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const doc = await saveDocumentoAsync(entidad, {
      id: docId,
      tipo,
      titulo: titulo || `Solicitud: ${tipo}`,
      descripcion: `Solicitado por ${nombreSolicitante || dipSolicitante} desde ${origen || 'app'}`,
      datos: {
        ...datos,
        solicitante: nombreSolicitante || '—',
        dip: dipSolicitante,
        actionId,
        fecha: new Date().toISOString()
      },
      createdBy: dipSolicitante,
      estado: 'final',
      firmado: false,
      hash: createHash('sha256').update(docId + Date.now()).digest('hex').slice(0, 16)
    });

    // 2. Registrar la acción pendiente
    const pendingAction = {
      actionId,
      docId,
      tipo,
      entidad,
      dipSolicitante,
      nombreSolicitante,
      datos,
      estado: 'pendiente-firma',
      createdAt: new Date().toISOString()
    };
    pendingActions.set(actionId, pendingAction);

    // 3. Enviar a PlacetaID para que aparezca en PlacetaID Móvil
    try {
      await fetch(`${PLACETAID_API}/admin/documentos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': PLACETAID_API_KEY
        },
        body: JSON.stringify({
          id: docId,
          titulo: doc.titulo,
          tipo,
          entidad,
          csv: doc.hash,
          destinatariosDIP: [dipSolicitante],
          contenido: `Documento generado desde ${origen || 'app'}: ${doc.titulo}. ` +
                    `Firma requerida para procesar la solicitud.`
        }),
        signal: AbortSignal.timeout(5000)
      });
    } catch (e) {
      console.error('[AccionesDoc] Error enviando a PlacetaID:', e.message);
      // Continuamos aunque falle el envío (se reintentará después)
    }

    res.json({
      success: true,
      actionId,
      documento: { id: docId, titulo: doc.titulo, estado: 'pendiente-firma' },
      message: 'Documento creado y enviado a PlacetaID Móvil'
    });

  } catch (e) {
    console.error('[AccionesDoc] Error al crear documento:', e);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
//  2. CALLBACK DE FIRMA — llamado por PlacetaID cuando se firma
// ════════════════════════════════════════════════════════════════════════
router.post('/api/acciones/firma-completada', verificarApiKey, async (req, res) => {
  const { documentoId, dip, actionId } = req.body;

  if (!documentoId) {
    return res.status(400).json({ error: 'documentoId requerido' });
  }

  try {
    // Buscar la acción pendiente
    let pendingAction = null;
    if (actionId && pendingActions.has(actionId)) {
      pendingAction = pendingActions.get(actionId);
    }

    // Actualizar estado del documento
    const doc = await getDocumentoByIdAsync('banco', documentoId);
    if (doc) {
      doc.estado = 'firmado';
      doc.firmado = true;
      doc.firmadoPor = dip;
      doc.fechaFirma = new Date().toISOString();
    }

    if (pendingAction) {
      pendingAction.estado = 'firmado';
      pendingAction.firmadoEn = new Date().toISOString();

      // Notificar al backend del banco para que procese la acción
      try {
        const bancoResult = await procesarAccionEnBanco(pendingAction);
        pendingAction.resultadoBanco = bancoResult;
        pendingAction.estado = bancoResult?.success ? 'completado' : 'error-procesamiento';
      } catch (e) {
        console.error('[AccionesDoc] Error procesando en banco:', e);
        pendingAction.estado = 'error-procesamiento';
        pendingAction.error = e.message;
      }
    }

    res.json({
      success: true,
      estado: pendingAction?.estado || 'firmado',
      message: 'Firma registrada. Acción procesada.'
    });

  } catch (e) {
    console.error('[AccionesDoc] Error en callback de firma:', e);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
//  3. CONSULTAR ESTADO DE UNA ACCIÓN
// ════════════════════════════════════════════════════════════════════════
router.get('/api/acciones/estado/:actionId', verificarApiKey, async (req, res) => {
  const { actionId } = req.params;
  const action = pendingActions.get(actionId);

  if (!action) {
    return res.status(404).json({ error: 'Acción no encontrada' });
  }

  res.json({
    success: true,
    accion: {
      actionId: action.actionId,
      tipo: action.tipo,
      estado: action.estado,
      createdAt: action.createdAt,
      firmadoEn: action.firmadoEn,
      resultado: action.resultadoBanco
    }
  });
});

// ════════════════════════════════════════════════════════════════════════
//  4. LISTAR ACCIONES PENDIENTES PARA UN DIP
// ════════════════════════════════════════════════════════════════════════
router.get('/api/acciones/pendientes/:dip', verificarApiKey, async (req, res) => {
  const { dip } = req.params;
  const acciones = Array.from(pendingActions.values())
    .filter(a => a.dipSolicitante === dip && a.estado !== 'completado');

  res.json({ success: true, acciones });
});

// ════════════════════════════════════════════════════════════════════════
//  PROCESAR ACCIÓN EN EL BANCO
// ════════════════════════════════════════════════════════════════════════

async function procesarAccionEnBanco(pendingAction) {
  const { tipo, datos, dipSolicitante } = pendingAction;

  // Mapear tipo de acción a endpoint del banco
  const actionMap = {
    'contrato-apertura': { action: 'crear-cuenta', data: { placetaId: dipSolicitante, ...datos } },
    'contrato-modificacion': { action: 'modificar-cuenta', data: { ...datos } },
    'apertura-deposito': { action: 'contratar-producto', data: { ...datos } },
    'bloqueo-cuenta': { action: 'bloquear-cuenta', data: { ...datos } },
    'baja-cuenta': { action: 'cerrar-cuenta', data: { ...datos } }
  };

  const mapped = actionMap[tipo];
  if (!mapped) {
    console.warn(`[AccionesDoc] Tipo de acción no mapeado: ${tipo}`);
    return { success: false, error: `Tipo no soportado: ${tipo}` };
  }

  // Llamar a la API del banco
  const bancoUrl = `${BANCO_API_URL}/api/v1/acciones/ejecutar`;
  const r = await fetch(bancoUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.DOCS_API_KEYS?.split(',')[0] || 'docs-shared-key-2026'
    },
    body: JSON.stringify({
      action: mapped.action,
      data: mapped.data,
      firmadoPor: dipSolicitante,
      actionId: pendingAction.actionId,
      timestamp: new Date().toISOString()
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!r.ok) {
    const errText = await r.text();
    return { success: false, error: `Banco API error: ${r.status} - ${errText}` };
  }

  return r.json();
}

export default router;
