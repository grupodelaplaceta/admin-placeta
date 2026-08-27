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
import { CATALOGO_BASE } from './tramites-catalogo.js';
import { CATALOGO_EDU_BASE } from './edu-cursos.js';
const BOP_URL = (process.env.BOP_URL || 'https://bop.laplaceta.org').replace(/\/+$/, '');
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

// CNIC vigentes del BOP (tabla bop_cnic) para el motor fiscal.
async function cargarCnicVigentes() {
  try {
    const response = await fetch(`${BOP_URL}/api/cnic`, { headers: { Accept: 'application/json' } });
    if (response.ok) {
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : payload.cnic;
      if (Array.isArray(rows)) return rows.filter((row) => row.vigente ?? row.estado === 'vigente');
    }
  } catch { /* usa Supabase compartido durante una caída temporal del BOP */ }
  if (!supabase) return null;
  try {
    return await conCache('bop-cnic', 60_000, async () => {
      const { data, error } = await supabase.from('bop_cnic').select('*');
      if (error) return null;
      return (data || []).filter((r) => r.vigente);
    });
  } catch {
    return null;
  }
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

  const allowedOrigins = (process.env.CORS_ORIGINS || 'https://rsp.laplaceta.org,https://junior.laplaceta.org')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({ credentials: true, origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') return callback(null, true);
    return callback(new Error('Origen no permitido por CORS'));
  } }));
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
  const demoActivo = process.env.NODE_ENV !== 'production';
  const esDipDemo = (dip) => String(dip || '').trim().toUpperCase() === DEMO_DIP;
  const esActividadPublica = (a) => !!a && a.estado === 'aprobada' && a.publica === true;
  // Promueve los campos económicos que viven como respaldo en `contenido`
  // a nivel superior (subvencionada, destacada, precios, recompensa).
  function normalizarActividad(a) {
    if (!a || typeof a !== 'object') return a;
    const c = (typeof a.contenido === 'object' && a.contenido) ? a.contenido : {};
    if (a.subvencionada === undefined && c.subvencionada !== undefined) a.subvencionada = !!c.subvencionada;
    if (a.destacada === undefined && c.destacada !== undefined) a.destacada = !!c.destacada;
    if (a.edad_recomendada === undefined && c.edad_recomendada !== undefined) a.edad_recomendada = c.edad_recomendada;
    if (a.dificultad === undefined && c.dificultad !== undefined) a.dificultad = c.dificultad;
    if (a.tiempo_estimado === undefined && c.tiempo_estimado !== undefined) a.tiempo_estimado = Number(c.tiempo_estimado) || 0;
    if (a.num_preguntas === undefined && c.num_preguntas !== undefined) a.num_preguntas = Number(c.num_preguntas) || 0;
    if (a.num_fases === undefined && c.num_fases !== undefined) a.num_fases = Number(c.num_fases) || 0;
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
      const esDemo = demoActivo && esDipDemo(dip);
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
      const esDemo = demoActivo && esDipDemo(req.query.dip);
      if (!esActividadPublica(actividad) && !esDemo) {
        return res.status(404).json({ error: 'Actividad no encontrada' });
      }
      res.json({ success: true, actividad });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /publico/diplomas/verificar/:id — verificación pública de diplomas
  app.get('/publico/diplomas/verificar/:id', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const { data, error } = await supabase
        .from('junior_diplomas')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.json({ valido: false, encontrado: false });
      res.json({
        valido: true,
        encontrado: true,
        id: data.id,
        dip: data.juniorDip || data.dip || '',
        nombre: data.juniorNombre || data.nombre || '',
        actividad: data.actividadTitulo || data.actividad || '',
        fecha: data.fecha || '',
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/junior/codigos/canjear — canje de códigos.
  // Recarga: solo desde la app (origen=app). Actividades: vinculado a una
  // cuenta (o anónimo desde web si no está vinculado).
  app.post('/api/junior/codigos/canjear', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const { codigo, dip, origen } = req.body || {};
      const code = String(codigo || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: 'Código requerido' });
      const { data, error } = await supabase.from('junior_codigos').select('*').eq('codigo', code).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Código no encontrado' });
      if (data.estado !== 'disponible') return res.status(400).json({ error: 'Código no disponible' });
      const dipN = String(dip || '').trim().toUpperCase();
      if (data.tipo === 'recarga') {
        if (origen !== 'app') return res.status(400).json({ error: 'Los códigos de recarga solo se canjean desde la app' });
        if (!dipN) return res.status(400).json({ error: 'DIP requerido' });
      } else if (data.dip_vinculado && String(data.dip_vinculado).toUpperCase() !== dipN) {
        return res.status(403).json({ error: 'Este código ya está vinculado a otra cuenta' });
      }
      const dipVinculado = data.dip_vinculado || dipN || null;
      const { data: canjeado, error: errorCanje } = await supabase.from('junior_codigos')
        .update({ estado: 'canjeado', dip_vinculado: dipVinculado, canjeado_en: new Date().toISOString() })
        .eq('id', data.id).eq('estado', 'disponible').select('id').maybeSingle();
      if (errorCanje) throw errorCanje;
      if (!canjeado) return res.status(409).json({ error: 'El código ya no está disponible' });
      res.json({ success: true, tipo: data.tipo, valor: data.valor || 0, actividadIds: data.actividad_ids || data.actividadIds || [], dipVinculado, offlinePermitido: ['actividades', 'un_uso'].includes(data.tipo) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Desvincula un código de actividades. Las apps deben borrar las copias
  // offline al recibir offlineInvalidated=true.
  app.post('/api/junior/codigos/desvincular', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const { codigo, dip } = req.body || {};
      const code = String(codigo || '').trim().toUpperCase();
      const dipN = String(dip || '').trim().toUpperCase();
      if (!code || !dipN) return res.status(400).json({ error: 'Código y DIP requeridos' });
      const { data, error } = await supabase.from('junior_codigos').select('*').eq('codigo', code).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Código no encontrado' });
      if (data.tipo !== 'actividades') return res.status(400).json({ error: 'Solo se pueden desvincular códigos de actividades' });
      if (String(data.dip_vinculado || '').toUpperCase() !== dipN) return res.status(403).json({ error: 'El código no está vinculado a esa cuenta' });
      const { data: actualizado, error: errorUpdate } = await supabase.from('junior_codigos')
        .update({ estado: 'disponible', dip_vinculado: null, canjeado_en: null, desvinculado_en: new Date().toISOString() })
        .eq('id', data.id).eq('dip_vinculado', dipN).select('id').maybeSingle();
      if (errorUpdate) throw errorUpdate;
      if (!actualizado) return res.status(409).json({ error: 'El código cambió mientras se desvinculaba' });
      res.json({ success: true, codigo: code, offlineInvalidated: true, actividadIds: data.actividad_ids || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Compra real de una actividad: primero valida catálogo y cuenta Junior y
  // después liquida el cargo contra Capitalia. No se concede acceso si el
  // banco no confirma la operación.
  app.post('/api/junior/actividades/:id/pagar', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const dip = String(req.body?.dip || '').trim().toUpperCase();
      const modo = req.body?.modo === 'intento' ? 'intento' : 'licencia';
      if (!dip) return res.status(400).json({ error: 'DIP requerido' });
      const [{ data: actividad }, { data: junior }] = await Promise.all([
        supabase.from('junior_actividades').select('*').eq('id', req.params.id).maybeSingle(),
        supabase.from('junior_menores').select('*').eq('dip', dip).maybeSingle(),
      ]);
      if (!actividad || !esActividadPublica(normalizarActividad(actividad))) return res.status(404).json({ error: 'Actividad no disponible' });
      if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
      const contenido = actividad.contenido && typeof actividad.contenido === 'object' ? actividad.contenido : {};
      const precio = Number(modo === 'intento' ? (actividad.precio_intento ?? contenido.precio_intento) : (actividad.precio_licencia ?? contenido.precio_licencia)) || 0;
      if (precio <= 0) return res.json({ success: true, gratuito: true, modo });
      const accountId = junior.cuenta_banco || `u-${dip.toLowerCase().replace(/-/g, '')}`;
      const iva = Math.round((precio * 12 / 112) * 100) / 100;
      const banco = await postBanco('transferir', {
        from: accountId, to: 'CAPITALIA_BANK', cantidad: precio,
        iva, concepto: `Placeta Junior · ${actividad.titulo || req.params.id} · ${modo}`,
        juniorDip: dip, tutorDip: junior.tutor_dip || '',
      });
      if (!banco?.success) return res.status(502).json({ success: false, error: banco?.error || 'El banco no confirmó el cargo' });
      res.json({ success: true, modo, precio, iva, transactionId: banco.transactionId, fromBalance: banco.fromBalance });
    } catch (e) {
      res.status(502).json({ success: false, error: e.message });
    }
  });

  // ── Placeta Junior PÚBLICO (junior.laplaceta.org / app Android) ────
  // API bancaria del monedero: cuentas Child reales del banco.
  app.use('/api/junior', juniorRouter({ getBankState: obtenerEstadoBanco, postBanco }));

  // ── Catálogo público de trámites (consumido por GDLP Web) ──────────
  app.get('/publico/tramites/catalogo', async (_req, res) => {
    try {
      const catalogo = [];
      if (supabase) {
        const { data, error } = await supabase.from('rsp_tramites_catalogo').select('*');
        if (!error && Array.isArray(data)) catalogo.push(...data);
      }
      if (catalogo.length === 0) catalogo.push(...CATALOGO_BASE);
      res.json(catalogo.filter((t) => t.activo !== false).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Catálogo público de cursos de Placeta EDU (consumido por EDU) ──
  app.get('/publico/edu/cursos', async (_req, res) => {
    try {
      const cursos = [];
      if (supabase) {
        const { data, error } = await supabase.from('rsp_edu_cursos').select('*');
        if (!error && Array.isArray(data)) cursos.push(...data);
      }
      if (cursos.length === 0) cursos.push(...CATALOGO_EDU_BASE);
      res.json(cursos.filter((c) => c.activo !== false).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

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
      const cnic = await cargarCnicVigentes();
      const lista = calcularContribuyentes(state, undefined, cnic);
      res.json({ success: true, total: lista.length, data: lista });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  app.get('/api/tributos/declaraciones', async (req, res) => {
    try {
      const state = await obtenerEstadoBanco();
      const cnic = await cargarCnicVigentes();
      const lista = calcularContribuyentes(state, undefined, cnic);
      const mes = req.query.mes || new Date().toISOString().slice(0, 7);
      res.json({
        success: true,
        mes_periodo: mes,
        data: lista.map((c) => ({
          id: `DEC-${mes}-${c.id}`,
          mesPeriodo: mes,
          contribuyenteId: c.id,
          contribuyenteNombre: c.nombre,
          patrimonioMedio: c.patrimonioMedio ?? c.patrimonio,
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
      const cnic = await cargarCnicVigentes();
      res.json({ success: true, data: calcularReconciliacion(state, cnic) });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  return app;
}
