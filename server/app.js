/* ═══════════════════════════════════════════════════════════════════════
   rsp-web-api — Aplicación Express del BFF (rutas de API).
   Se separa de `index.js` para poder montarla también como función
   serverless de Vercel (`api/index.js`). Las rutas usan el prefijo /api.
   ═══════════════════════════════════════════════════════════════════════ */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter, requiereSesion } from './auth.js';
import { createApiRouter } from './api.js';
import { juniorRouter } from './junior.js';
import { calcularContribuyentes, calcularReconciliacion } from './tributos.js';
import { registrarFirma } from './firmas.js';
import { supabase, probarSupabase } from './supabase.js';
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

// Mutación del banco vía crm-state (usada por la API bancaria junior).
async function postBanco(action, data = {}) {
  if (!BANK_KEY) throw new Error('Falta CRM_READ_KEY (o BANK_CRM_KEY)');
  const r = await fetch(`${BANK_URL}/api/crm-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CRM-Key': BANK_KEY },
    body: JSON.stringify({ action, ...data }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Banco responde ${r.status}`);
  return body;
}

export function createApp() {
  const app = express();

  // Detrás de Vercel/proxies, req.protocol debe respetar X-Forwarded-Proto
  // para que el callback de PlacetaID use https correctamente.
  app.set('trust proxy', 1);

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // Público: health check (lo usa Vercel / uptime).
  app.get('/api/health', async (_req, res) => {
    const supabase = await probarSupabase();
    res.json({
      ok: true,
      app: 'rsp-web-api',
      time: new Date().toISOString(),
      supabase: supabase.ok ? 'conectado' : 'sin_configuracion',
      supabaseError: supabase.ok ? null : supabase.error,
    });
  });

  // Público (lectura): estado real del banco — lo usa el SPA para listar
  // TODAS las cuentas y tarjetas (las mutaciones siguen protegidas).
  app.get('/api/bank/state', async (_req, res) => {
    try {
      const data = await obtenerEstadoBanco();
      res.json(data);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // Público: callback de firma de PlacetaID Móvil (con api_key de documentos).
  app.post('/publico/rsp/documentos/:id/firmar', async (req, res) => {
    const key = String(req.query.api_key || '');
    const claves = (process.env.DOCS_API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (claves.length && !claves.includes(key)) return res.status(401).json({ error: 'api_key inválida' });
    try {
      const doc = await registrarFirma(req.params.id, {
        dip: req.body?.dip || req.body?.firmadoPor || req.body?.firmante,
        firmaBase64: req.body?.firma_base64 || req.body?.firmaImagen,
      });
      if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
      res.json({ ok: true, estado: doc.estado });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Placeta Junior PÚBLICO (junior.laplaceta.org) ──────────────────
  // La web pública necesita leer el catálogo de actividades SIN sesión.
  // La API antigua (/api/junior/...) se eliminó en el rewrite del BFF;
  // se restaura aquí como lectura pública desde Supabase (filas crudas,
  // el mismo contrato que consumía la web: { success, actividades }).
  const DEMO_DIP = '16381756J';
  const esDipDemo = (dip) => String(dip || '').trim().toUpperCase() === DEMO_DIP;
  const esActividadPublica = (a) => !!a && a.estado === 'aprobada' && a.publica === true;
  // Promueve los campos económicos que viven como respaldo en `contenido`
  // a nivel superior (subvencionada, destacada, precios, recompensa).
  function normalizarActividad(a) {
    if (!a || typeof a !== 'object') return a;
    const c = (typeof a.contenido === 'object' && a.contenido) ? a.contenido : {};
    if (a.subvencionada === undefined && c.subvencionada !== undefined) a.subvencionada = !!c.subvencionada;
    if (a.destacada === undefined && c.destacada !== undefined) a.destacada = !!c.destacada;
    if (a.precio_licencia === undefined && c.precio_licencia !== undefined) a.precio_licencia = Number(c.precio_licencia) || 0;
    if (a.precio_intento === undefined && c.precio_intento !== undefined) a.precio_intento = Number(c.precio_intento) || 0;
    if (a.recompensa === undefined && c.recompensa !== undefined) a.recompensa = Number(c.recompensa) || 0;
    return a;
  }

  // GET /api/junior/actividades — catálogo (aprobadas/públicas; el DIP demo
  // 16381756J además ve las que están "en revisión").
  app.get('/api/junior/actividades', async (req, res) => {
    try {
      const { solo_publicas = '1', categoria, dip } = req.query;
      const esDemo = esDipDemo(dip);
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      let q = supabase.from('junior_actividades').select('*');
      if (esDemo) q = q.in('estado', ['aprobada', 'en_revision']);
      else if (solo_publicas === '1') q = q.eq('publica', true).eq('estado', 'aprobada');
      else q = q.eq('estado', 'aprobada');
      if (categoria) q = q.eq('categoria', categoria);
      q = q.order('creado_en', { ascending: false }).limit(200);
      const { data, error } = await q;
      if (error) throw error;
      const actividades = (data || []).map(normalizarActividad);
      res.json({ success: true, total: actividades.length, actividades });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/junior/actividades/:id — detalle (solo públicas; el DIP demo
  // además puede ver las que están "en revisión").
  app.get('/api/junior/actividades/:id', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const { data, error } = await supabase
        .from('junior_actividades')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();
      if (error) throw error;
      const actividad = normalizarActividad(data);
      if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada' });
      const esDemo = esDipDemo(req.query.dip);
      if (!esActividadPublica(actividad) && !esDemo) {
        return res.status(404).json({ error: 'Actividad no encontrada' });
      }
      res.json({ success: true, actividad });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Placeta Junior PÚBLICO (junior.laplaceta.org / app Android) ────
  // API bancaria del monedero: cuentas Child reales del banco.
  app.use('/api/junior', juniorRouter({ getBankState: obtenerEstadoBanco, postBanco }));

  // Autenticación: POST /login, POST /logout, GET /api/sesion.
  app.use(authRouter());

  // A partir de aquí, todo exige sesión válida (cookie httpOnly).
  app.use(requiereSesion);
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

  return app;
}
