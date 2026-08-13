/* ═══════════════════════════════════════════════════════════════════════
   rsp-web-api — Aplicación Express del BFF (rutas de API).
   Se separa de `index.js` para poder montarla también como función
   serverless de Vercel (`api/index.js`). Las rutas usan el prefijo /api.
   ═══════════════════════════════════════════════════════════════════════ */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './auth.js';
import { createApiRouter } from './api.js';
import { calcularContribuyentes, calcularReconciliacion } from './tributos.js';

const BOP_URL = process.env.BOP_URL || 'https://rsp.laplaceta.org';
// Nombres compatibles con admin-placeta (BANCO_API_URL / CRM_READ_KEY).
const BANK_URL = process.env.BANCO_API_URL || process.env.BANK_URL || 'https://api.banco.laplaceta.org';
// La clave NO se incrusta en el código: repo público. Debe venir de la
// variable de entorno CRM_READ_KEY (o BANK_CRM_KEY). En Vercel se define
// como Environment Variable del proyecto.
const BANK_KEY = process.env.CRM_READ_KEY || process.env.BANK_CRM_KEY;

const cache = new Map();
function conCache(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.data);
  return fn().then((data) => {
    cache.set(key, { at: Date.now(), data });
    return data;
  });
}

async function obtenerEstadoBanco() {
  if (!BANK_KEY) throw new Error('Falta CRM_READ_KEY (o BANK_CRM_KEY): configúrala en las variables de entorno (server/.env o Vercel)');
  return conCache('bank-state', 30_000, async () => {
    const r = await fetch(`${BANK_URL}/api/crm-state`, {
      headers: { 'X-CRM-Key': BANK_KEY },
    });
    if (!r.ok) throw new Error(`Banco responde ${r.status}`);
    return r.json();
  });
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(authRouter());
  app.use(createApiRouter({ getBankState: obtenerEstadoBanco }));

  // ── Boletín Oficial: CNIC vigentes + tarifas + subvenciones ────────
  app.get('/api/transparencia', async (_req, res) => {
    try {
      const data = await conCache('transparencia', 60_000, async () => {
        const r = await fetch(`${BOP_URL}/api/transparencia`);
        if (!r.ok) throw new Error(`BOP responde ${r.status}`);
        return r.json();
      });
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // ── Estado real del banco (cuentas, transacciones, tarjetas, contratos) ──
  app.get('/api/bank/state', async (_req, res) => {
    try {
      const data = await obtenerEstadoBanco();
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // ── Motor fiscal en vivo: contribuyentes y declaraciones desde el banco ──
  app.get('/api/tributos/contribuyentes', async (_req, res) => {
    try {
      const state = await obtenerEstadoBanco();
      const lista = calcularContribuyentes(state);
      res.json({ success: true, total: lista.length, data: lista });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/tributos/declaraciones', async (req, res) => {
    try {
      const state = await obtenerEstadoBanco();
      const lista = calcularContribuyentes(state);
      const mes = req.query.mes || new Date().toISOString().slice(0, 7);
      res.json({
        success: true,
        mes_periodo: mes,
        data: lista.map((c) => ({
          id: `DEC-${mes}-${c.id}`,
          mesPeriodo: mes,
          contribuyenteId: c.id,
          contribuyenteNombre: c.nombre,
          patrimonioMedio: c.patrimonio,
          incrementoActivos: c.incrementoActivos,
          cuotaIrm: c.cuotaIrm,
          cuotaIgf: c.cuotaIgf,
          ivaExento: c.ivaExento,
          estado: 'borrador',
        })),
      });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // ── Reconciliación de tributos (saldos + IA + cuotas agregadas) ──
  app.get('/api/tributos/reconciliacion', async (_req, res) => {
    try {
      const state = await obtenerEstadoBanco();
      res.json({ success: true, data: calcularReconciliacion(state) });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'rsp-web-api', time: new Date().toISOString() });
  });

  return app;
}
