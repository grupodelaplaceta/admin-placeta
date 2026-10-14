/* ═══════════════════════════════════════════════════════════════════════
   RSP · Nóminas (proxy al motor del Banco)

   El motor vive en backend-banco (`/api/nominas`) y es la única fuente de
   verdad: aquí solo se reenvía con la X-CRM-Key del servidor, nunca desde
   el navegador. El router se monta detrás de `requiereSesion`, así que solo
   lo alcanza personal autenticado del RSP.

   Modelo: salario base + complementos de cargo (los anuales se reparten en
   12) + complementos de actividad que SOLO se pagan si la empresa los
   confirma antes del plazo global. Al vencer el plazo, el banco cierra y
   paga automáticamente desde la cuenta de la empresa.
   ═══════════════════════════════════════════════════════════════════════ */

import express from 'express';

const BANK_URL = (process.env.BANCO_API_URL || process.env.BANK_URL || 'https://api.banco.laplaceta.org').replace(/\/+$/, '');
const BANK_KEY = process.env.CRM_READ_KEY || process.env.BANK_CRM_KEY;

function sinClave(res) {
  return res.status(500).json({ error: 'Falta CRM_READ_KEY (o BANK_CRM_KEY) en las variables de entorno del BFF' });
}

/** Llamada al motor de nóminas del banco. */
async function banco(query = {}, body = null) {
  const url = new URL(`${BANK_URL}/api/nominas`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const opciones = { headers: { 'X-CRM-Key': BANK_KEY } };
  if (body) {
    opciones.method = 'POST';
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(body);
  }
  const r = await fetch(url, opciones);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(datos.error || `El banco responde ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return datos;
}

function envolver(fn) {
  return async (req, res) => {
    if (!BANK_KEY) return sinClave(res);
    try {
      res.json(await fn(req));
    } catch (e) {
      res.status(e.status && e.status >= 400 && e.status < 600 ? e.status : 502).json({ error: e.message });
    }
  };
}

export function nominasBancoRouter() {
  const r = express.Router();

  // Estado completo del periodo: config + contratos + resúmenes + periodos.
  r.get('/estado', envolver((req) => banco({ action: 'estado', periodo: req.query.periodo, companyAccountId: req.query.companyAccountId, employeeDip: req.query.employeeDip })));

  // Configuración global (plazo, retención, pago automático).
  r.get('/config', envolver(() => banco({ action: 'config' })));
  r.post('/config', envolver((req) => banco({}, { action: 'config', guardar: true, ...(req.body || {}) })));

  // Contratos (salario base + complementos).
  r.get('/contratos', envolver((req) => banco({ action: 'contratos', companyAccountId: req.query.companyAccountId, employeeDip: req.query.employeeDip })));
  r.post('/contratos', envolver((req) => banco({}, { action: 'contrato-guardar', contrato: req.body || {} })));
  r.delete('/contratos/:id', envolver((req) => banco({}, { action: 'contrato-borrar', id: req.params.id })));

  // Confirmación de actividades por la empresa.
  r.post('/confirmar', envolver((req) => banco({}, { action: 'confirmar', ...(req.body || {}) })));
  r.post('/confirmar-lote', envolver((req) => banco({}, { action: 'confirmar-lote', ...(req.body || {}) })));

  // Cierre y pago.
  r.post('/cerrar', envolver((req) => banco({}, { action: 'cerrar', ...(req.body || {}) })));
  r.post('/pagar', envolver((req) => banco({}, { action: 'pagar', ...(req.body || {}) })));

  // Comprobación manual de vencimientos (normalmente lo hace el cron/lazy).
  r.post('/procesar', envolver(() => banco({}, { action: 'procesar' })));

  return r;
}
