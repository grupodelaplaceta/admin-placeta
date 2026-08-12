import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import ejsLayouts from 'express-ejs-layouts';
import jwt from 'jsonwebtoken';

import { testConnection } from './src/config/supabase.js';
import { sbFindSolicitanteByDip } from './src/config/db.js';
import { verificarSesion, cargarPermisosUsuario, verificarAccesoEntidad, verificarPermiso } from './src/middleware/auth.js';
import { detectarWorkspace, getWorkspace, getWorkspacesDisponibles } from './src/config/workspaces.js';

// Importar rutas
import authRoutes from './src/routes/auth.js';
import bancoRoutes from './src/routes/banco.js';
import tributosRoutes from './src/routes/tributos.js';
import juntaRoutes from './src/routes/junta.js';
import administracionRoutes from './src/routes/administracion.js';
import apiRoutes from './src/routes/api.js';
import documentosRoutes from './src/routes/documentos.js';
import empresasRoutes from './src/routes/empresas.js';
import subvencionesRoutes from './src/routes/subvenciones.js';
import juniorApiRoutes from './src/routes/junior-api.js';
import juniorOficialApiRoutes from './src/routes/junior-oficial-api.js';
import juniorAcademiaApiRoutes from './src/routes/junior-academia-api.js';
import accionesDocumentoRoutes from './src/routes/acciones-documento.js';
import supervisionBancoRoutes from './src/routes/supervision-banco.js';
import rspRoutes from './src/routes/rsp.js';
import { apiGatewayRoutes } from './src/routes/api-gateway.js';
import firmasRoutes from './src/routes/firmas.js';
import juniorRoutes from './src/routes/junior.js';
import mantenimientoRoutes from './src/routes/mantenimiento.js';
import votacionesApiRoutes from './src/routes/votaciones-api.js';
import { mobilGetPendientes, mobilGetHistorial, mobilEmitirVoto } from './src/routes/votaciones-api.js';
import { registrarConexionPublica } from './src/routes/rsp.js';
import { getConexiones, getConexionesFromSupabase } from './src/config/rsp.js';
import bopEditorRoutes from './src/routes/bop-editor.js';
// ═══ RSP Core (plan maestro) ═══════════════════════════════════════════
import normativoRoutes from './src/routes/normativo.js';
import expedientesRoutes from './src/routes/expedientes.js';
import incidenciasRoutes from './src/routes/incidencias.js';
import auditoriaRoutes from './src/routes/auditoria.js';
import notificacionesRoutes from './src/routes/notificaciones.js';
import contabilidadRoutes from './src/routes/contabilidad.js';
import fundacionRoutes from './src/routes/fundacion.js';
import patrimonioRoutes from './src/routes/patrimonio.js';
import operacionesRoutes from './src/routes/operaciones.js';
import comprobacionRoutes from './src/routes/comprobacion.js';
import fiscalidadRoutes from './src/routes/fiscalidad.js';
import nominasRoutes from './src/routes/nominas.js';
import facturacionRoutes from './src/routes/facturacion.js';
import economicoRoutes from './src/routes/economico.js';
import herenciasRoutes from './src/routes/herencias.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'admin-placeta-jwt-secret-2026';
const SESSION_EXPIRY = '8h';

// ── Middleware Sesión vía JWT en Cookie ────────────────────────────────────
app.use(cookieParser());
app.use((req, res, next) => {
  req.session = req.session || {};
  const token = req.cookies?.['admin_token'];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.session = decoded;
    } catch {
      res.clearCookie('admin_token');
    }
  }
  // Helper para guardar sesión en cookie
  res.saveSession = (data) => {
    const token = jwt.sign(data, JWT_SECRET, { expiresIn: SESSION_EXPIRY });
    res.cookie('admin_token', token, {
      httpOnly: true, sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/'
    });
  };
  res.clearSession = () => {
    req.session = {};
    res.clearCookie('admin_token', { path: '/' });
  };
  next();
});

// ── Middleware Global ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Favicon inline (evita 404 del browser)
app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏛️</text></svg>');
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  validate: { xForwardedForHeader: false }
});
app.use('/api/', limiter);

// ── Motor de Plantillas ────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(ejsLayouts);
app.set('layout', 'layouts/admin');

// Cargar permisos en sesión
app.use(cargarPermisosUsuario);

// Variables globales + contexto de workspace
app.use((req, res, next) => {
  res.locals.usuario = req.session?.usuario || null;
  res.locals.entidad_actual = '';
  res.locals.pathActual = req.path;
  res.locals.anoActual = 2026;

  // Detectar workspace activo desde la ruta
  const wsId = detectarWorkspace(req.path);
  const workspace = wsId ? getWorkspace(wsId) : null;
  res.locals.workspaceActivo = workspace;
  res.locals.workspacesDisponibles = getWorkspacesDisponibles(req.session?.entidades_permitidas || []);

  // Guardar entidad_actual para compatibilidad
  if (workspace) {
    res.locals.entidad_actual = workspace.id;
  }

  next();
});

// ── Health Check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', app: 'RSP', timestamp: new Date().toISOString() });
});

// ── Middleware RSP: registra conexiones en rutas de entidad ──────────────
import { registrarConexion, TIPO_CONEXION } from './src/config/rsp.js';
function rspBillingMiddleware(entidad) {
  return (req, res, next) => {
    // Solo rutas API (no páginas web) — las vistas web no se tarifican
    if (req.path.startsWith('/api/') && req.path !== '/api/health') {
      try {
        registrarConexion({
          entidad,
          tipo: req.method === 'GET' ? TIPO_CONEXION.CONSULTA : TIPO_CONEXION.MODIFICACION,
          endpoint: `${req.method} /${entidad}${req.path}`,
          usuario: req.session?.usuario?.nombre || 'web',
          dip: req.session?.usuario?.dip || '',
          detalle: req.headers['user-agent']?.slice(0, 80) || ''
        });
      } catch (e) { /* silencioso */ }
    }
    next();
  };
}

// ── Rutas Web ──────────────────────────────────────────────────────────────
app.use('/', authRoutes);

// Dashboard principal
app.get('/dashboard', verificarSesion, async (req, res) => {
  // Métricas del RSP Core para el panel principal
  const stats = {
    expedientes: 0, incidencias: 0, incidenciasAbiertas: 0,
    notificaciones: 0, cnicVigentes: 0, nominas: 0, facturas: 0,
    bloqueos500k: 0, retribucionesPendientes: 0, operacionesRetenidas: 0,
    comprobaciones: 0, comprobacionesInconsistencia: 0,
  };
  try {
    const [exp, inc, notif, cnic, nom, fac, fisc, op, comp] = await Promise.all([
      import('./src/config/expedientes.js').then(m => m.estadoExpedientes()),
      import('./src/config/incidencias.js').then(m => m.estadoIncidencias()),
      import('./src/config/notificaciones.js').then(m => m.estadoNotificaciones()),
      import('./src/config/motor-normativo.js').then(m => m.estadoCNIC()),
      import('./src/config/nominas.js').then(m => m.estadoNominas()),
      import('./src/config/facturacion.js').then(m => m.estadoFacturacion()),
      import('./src/config/fiscalidad-ampliada.js').then(m => m.estadoFiscalidadAmpliada()),
      import('./src/config/operation-engine.js').then(m => m.estadoOperationEngine()),
      import('./src/config/comprobacion.js').then(m => m.estadoComprobacion()),
    ]);
    stats.expedientes = exp?.total || 0;
    stats.incidencias = inc?.total || 0;
    stats.incidenciasAbiertas = inc?.abiertas || 0;
    stats.notificaciones = notif?.noLeidas || 0;
    stats.cnicVigentes = cnic?.vigentes?.length || 0;
    stats.nominas = nom?.total || 0;
    stats.facturas = fac?.total || 0;
    stats.bloqueos500k = fisc?.limite500k?.bloqueadas || 0;
    stats.retribucionesPendientes = fisc?.retribuciones?.pendientes || 0;
    stats.operacionesRetenidas = op?.retenidas || 0;
    stats.comprobaciones = comp?.total || 0;
    stats.comprobacionesInconsistencia = comp?.inconsistencia || 0;
  } catch (e) { /* métricas opcionales */ }
  res.render('dashboard', { titulo: 'Panel Principal - RSP', stats });
});

// Módulos protegidos por entidad (con RSP billing)
app.use('/banco', verificarSesion, verificarAccesoEntidad('banco'), rspBillingMiddleware('banco'), bancoRoutes);
app.use('/tributos', verificarSesion, verificarAccesoEntidad('tributos'), rspBillingMiddleware('tributos'), tributosRoutes);
app.use('/junta', verificarSesion, verificarAccesoEntidad('junta'), rspBillingMiddleware('junta'), juntaRoutes);
app.use('/administracion', verificarSesion, verificarAccesoEntidad('administracion'), rspBillingMiddleware('administracion'), administracionRoutes);

// API REST
app.use('/api', apiRoutes);
// ═══ BOP Editor API — escritura de normativa (bop.laplaceta.org) ════════
app.use('/api/bop', bopEditorRoutes);
// ═══ API GATEWAY v1 — APIs externas por entidad ═══════════════════════
// Montado ANTES del router oficial junior para que pueda delegar por
// reescritura de URL (evita fetch HTTP interno / timeouts en serverless).
app.use('/api', apiGatewayRoutes);
app.use('/api', juniorAcademiaApiRoutes); // Sistema completo Academia (actividades, colaboradores, diplomas, retos)
app.use('/api', juniorOficialApiRoutes); // API oficial Academia Placeta Junior (RSP billing + IVA + Capitalia)
app.use('/api', juniorApiRoutes); // Proxy junior → CRM
app.use('/api', votacionesApiRoutes); // Sistema de votaciones

// ═══ API MÓVIL — Votaciones desde Supabase ══════════════════════════
app.get('/api/mobil/votaciones/pendientes/:dip', async (req, res) => {
  const data = await mobilGetPendientes(req.params.dip);
  res.json(data);
});
app.get('/api/mobil/votaciones/historial/:dip', async (req, res) => {
  const data = await mobilGetHistorial(req.params.dip);
  res.json(data);
});
app.post('/api/mobil/votaciones/:id/ejercer', async (req, res) => {
  const { dip, nombre, voto } = req.body;
  const result = await mobilEmitirVoto(req.params.id, dip, nombre, voto);
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/mobil/multi/votaciones', async (req, res) => {
  const { dips } = req.body;
  if (!dips || !Array.isArray(dips)) return res.json([]);
  try {
    const results = [];
    for (const dip of dips) {
      const pendientes = await mobilGetPendientes(dip);
      pendientes.forEach(v => {
        results.push({ ...v, identidad: dip, identidadNombre: dip });
      });
    }
    res.json(results);
  } catch (e) { res.json([]); }
});

app.use(documentosRoutes); // /api/:entidad/documentos...
app.use(accionesDocumentoRoutes); // /api/acciones/*
app.use('/junta', empresasRoutes);
app.use('/junta', subvencionesRoutes);
app.use('/administracion', empresasRoutes);
app.use('/administracion', subvencionesRoutes);
// También accesible desde banco
app.use('/banco', empresasRoutes);

// ═══ RSP: Endpoints públicos (sin sesión) ════════════════════════════
app.post('/rsp/api/conexiones/registrar', registrarConexionPublica);
app.get('/rsp/api/debug/conexiones', async (req, res) => {
  const desdeMemoria = getConexiones();
  const desdeDB = await getConexionesFromSupabase();
  res.json({
    memoria: { total: desdeMemoria.length, conexiones: desdeMemoria },
    supabase: { total: desdeDB?.length || 0, conexiones: desdeDB || [] },
    supabaseActivo: !!desdeDB
  });
});

// Red de Servicios de La Placeta (RSP) — protegido con sesión
app.use('/rsp', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), rspRoutes);
app.use('/rsp', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), supervisionBancoRoutes);

// ═══ RSP Core (plan maestro) — montado bajo /rsp ═════════════════════
app.use('/rsp/normativo', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), normativoRoutes);
app.use('/rsp/expedientes', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), expedientesRoutes);
app.use('/rsp/incidencias', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), incidenciasRoutes);
app.use('/rsp/auditoria', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), auditoriaRoutes);
app.use('/rsp/notificaciones', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), notificacionesRoutes);
app.use('/rsp/contabilidad', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), contabilidadRoutes);
app.use('/rsp/fundacion', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), fundacionRoutes);
app.use('/rsp/patrimonio', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), patrimonioRoutes);
app.use('/rsp/operaciones', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), operacionesRoutes);
app.use('/rsp/comprobacion', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), comprobacionRoutes);
app.use('/rsp/fiscalidad', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), fiscalidadRoutes);
app.use('/rsp/nominas', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), nominasRoutes);
// Facturas de negocio (NO confundir con /rsp/facturacion = billing de conexiones RSP)
app.use('/rsp/facturas', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), facturacionRoutes);
// Dashboard Económico del Grupo (FASE 22)
app.use('/rsp/economico', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), economicoRoutes);
// Bajas / Altas / Herencias / Testamento digital (puntos 17-21)
app.use('/rsp/herencias', verificarSesion, verificarAccesoEntidad('rsp'), rspBillingMiddleware('rsp'), herenciasRoutes);

// ═══ CAMPANA DE NOTIFICACIONES (cualquier usuario autenticado) ═══════
app.get('/api/notificaciones/mis', verificarSesion, async (req, res) => {
  try {
    const { listarNotificaciones, estadoNotificaciones } = await import('./src/config/notificaciones.js');
    const dip = req.session?.usuario?.dip || '';
    const globales = await listarNotificaciones({});
    const mias = dip ? globales.filter(n => !n.destinatario_dip || n.destinatario_dip === dip) : globales;
    const estado = await estadoNotificaciones(dip);
    res.json({ success: true, notificaciones: mias.slice(0, 12), estado });
  } catch (e) {
    res.json({ success: false, error: e.message, notificaciones: [], estado: null });
  }
});
app.post('/api/notificaciones/:id/leida', verificarSesion, async (req, res) => {
  try {
    const { marcarLeida } = await import('./src/config/notificaciones.js');
    await marcarLeida(req.params.id, req.body.leida !== false);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Placeta Junior
app.use('/junior', verificarSesion, verificarAccesoEntidad('junior'), rspBillingMiddleware('junior'), juniorRoutes);

// Mantenimiento (montado en admin)
app.use('/administracion', mantenimientoRoutes);
app.use('/api', mantenimientoRoutes);

// Panel de gestión de APIs para cada workspace
// Middleware helper: pasa req.entidad al handler del gateway
function workspaceAPIMiddleware(entidad) {
  return (req, res, next) => {
    req.entidad = entidad;
    next();
  };
}

// Montar el panel de APIs en cada entidad
app.use('/banco/apis', verificarSesion, verificarAccesoEntidad('banco'), workspaceAPIMiddleware('banco'), apiGatewayRoutes);
app.use('/tributos/apis', verificarSesion, verificarAccesoEntidad('tributos'), workspaceAPIMiddleware('tributos'), apiGatewayRoutes);
app.use('/junta/apis', verificarSesion, verificarAccesoEntidad('junta'), workspaceAPIMiddleware('junta'), apiGatewayRoutes);
app.use('/administracion/apis', verificarSesion, verificarAccesoEntidad('administracion'), workspaceAPIMiddleware('administracion'), apiGatewayRoutes);
app.use('/rsp/apis', verificarSesion, verificarAccesoEntidad('rsp'), workspaceAPIMiddleware('rsp'), apiGatewayRoutes);
app.use('/junior/apis', verificarSesion, verificarAccesoEntidad('junior'), workspaceAPIMiddleware('junior'), apiGatewayRoutes);

// ═══ SISTEMA UNIFICADO DE DOCUMENTOS Y FIRMAS ════════════════════════
// Rutas web: /{entidad}/documentos para cada workspace
app.use('/banco/documentos', verificarSesion, verificarAccesoEntidad('banco'), (req, res, next) => { req.entidad = 'banco'; next(); }, firmasRoutes);
app.use('/tributos/documentos', verificarSesion, verificarAccesoEntidad('tributos'), (req, res, next) => { req.entidad = 'tributos'; next(); }, firmasRoutes);
app.use('/junta/documentos', verificarSesion, verificarAccesoEntidad('junta'), (req, res, next) => { req.entidad = 'junta'; next(); }, firmasRoutes);
app.use('/administracion/documentos', verificarSesion, verificarAccesoEntidad('administracion'), (req, res, next) => { req.entidad = 'administracion'; next(); }, firmasRoutes);
app.use('/rsp/documentos', verificarSesion, verificarAccesoEntidad('rsp'), (req, res, next) => { req.entidad = 'rsp'; next(); }, firmasRoutes);
app.use('/junior/documentos', verificarSesion, verificarAccesoEntidad('junior'), (req, res, next) => { req.entidad = 'junior'; next(); }, firmasRoutes);

// API de firmas (webhook PlacetaID + consultas)
app.use('/api/firmas', firmasRoutes);

// ═══ GASTOS RSP POR ENTIDAD ═══════════════════════════════════════════
// Cada entidad puede ver sus propios gastos de conexión RSP
// El parámetro ?origen mantiene el workspace correcto en la navegación
app.get('/banco/gastos-rsp', verificarSesion, verificarAccesoEntidad('banco'), (req, res) => res.redirect('/rsp/gastos/banco?origen=banco'));
app.get('/tributos/gastos-rsp', verificarSesion, verificarAccesoEntidad('tributos'), (req, res) => res.redirect('/rsp/gastos/tributos?origen=tributos'));
app.get('/junta/gastos-rsp', verificarSesion, verificarAccesoEntidad('junta'), (req, res) => res.redirect('/rsp/gastos/junta?origen=junta'));
app.get('/administracion/gastos-rsp', verificarSesion, verificarAccesoEntidad('administracion'), (req, res) => res.redirect('/rsp/gastos/administracion?origen=administracion'));
app.get('/rsp/gastos', verificarSesion, verificarAccesoEntidad('rsp'), (req, res) => res.redirect('/rsp/gastos/rsp?origen=rsp'));
app.get('/junior/gastos-rsp', verificarSesion, verificarAccesoEntidad('junior'), (req, res) => res.redirect('/rsp/gastos/junior?origen=junior'));

// ── Landing / Login ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session?.usuario) return res.redirect('/dashboard');
  res.render('auth/login', { titulo: 'RSP - Iniciar Sesión', layout: false });
});

// ── 404 ────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint no encontrado', path: req.path, method: req.method });
  }
  res.status(404).render('parciales/error', {
    titulo: '404 - Página no encontrada',
    error: `La página "${req.path}" no existe.`,
    enlace: '/dashboard'
  });
});

// ── Global Error Handler (verbose) ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message, '\n   Path:', req.path, '\n   Stack:', err.stack?.split('\n').slice(0,3).join(' | '));
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Error interno', detalle: err.message, path: req.path });
  }
  res.status(500).render('parciales/error', {
    titulo: '500 - Error interno',
    error: `Error interno del servidor: ${err.message}`,
    detalle: process.env.NODE_ENV !== 'production' ? err.stack?.split('\n').slice(0,5).join('<br>') : ''
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA DE DOCUMENTOS AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════════════════════

// Generar documentos automáticos cada hora
const AUTO_DOCS_INTERVAL = 60 * 60 * 1000; // 1 hora
let autoDocsTimer = null;

async function generarDocumentosAutomaticos() {
  try {
    const { getDocumentos, saveDocumentoAsync, DOCUMENTOS_AUTOMATICOS, ETIQUETAS_DOC } = await import('./src/config/documentos.js');
    const { supabase } = await import('./src/config/supabase.js');
    const ahora = new Date();

    // Tipos de documentos a generar según el momento del día
    const tiposAHoy = ['informe-diario-sistema'];
    if (ahora.getDay() === 1) tiposAHoy.push('informe-semanal'); // Lunes
    if (ahora.getDate() === 1) {
      tiposAHoy.push('informe-mensual-sistema'); // 1º de cada mes
      tiposAHoy.push('informe-estadistico');
    }

    for (const tipo of tiposAHoy) {
      const entidades = ['banco', 'tributos', 'junta', 'administracion', 'rsp'];
      for (const entidad of entidades) {
        const id = `auto-${entidad}-${tipo}-${ahora.toISOString().slice(0,10)}`;
        try {
          await saveDocumentoAsync(entidad, {
            id,
            tipo,
            titulo: `${ETIQUETAS_DOC[tipo] || tipo} — ${entidad} (${ahora.toISOString().slice(0,10)})`,
            descripcion: `Documento generado automáticamente por el sistema`,
            datos: {
              entidad,
              fecha: ahora.toISOString(),
              periodo: ahora.toISOString().slice(0,7),
              generadoPor: 'sistema',
              notas: 'Documento automático del sistema — Grupo de La Placeta'
            },
            createdBy: 'sistema',
            estado: 'Oficial',
            csv: `AUTO-${Date.now().toString(36).toUpperCase()}`
          });
        } catch (e) {
          console.warn(`[AutoDocs] Error generando ${id}:`, e.message);
        }
      }
    }
    console.log(`[AutoDocs] ✅ ${tiposAHoy.length * 5} documentos generados (${ahora.toISOString().slice(0,16)})`);
  } catch (e) {
    console.warn('[AutoDocs] Error en generación automática:', e.message);
  }
}

// ── Iniciar ────────────────────────────────────────────────────────────────
async function startServer() {
  await testConnection();

  // Auto-migración del sistema de Bundles (Placeta Junior)
  import('./src/config/init-bundles.js')
    .then(m => m.initBundleTables())
    .catch(e => console.warn('[Bundles] init:', e.message));

  // Iniciar generación automática de documentos
  autoDocsTimer = setInterval(generarDocumentosAutomaticos, AUTO_DOCS_INTERVAL);
  // Primera generación a los 30 segundos de iniciar
  setTimeout(generarDocumentosAutomaticos, 30000);

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║    RSP - Plataforma Centralizada de APIs y Entidades              ║
║    http://localhost:${PORT}                                      ║
║                                                                ║
║  Workspaces: Banco | Tributos | Junta | Admin | RSP            ║
║  API Gateway: /api/v1/{entidad}  (tarifas RSP)                 ║
║  API Docs:    /api/v1/docs  |  /api/v1/{entidad}/docs          ║
║  IBANs:      Cada entidad con su propia cuenta bancaria        ║
╚══════════════════════════════════════════════════════════════════╝
    `);
  });
}

startServer();

export default app;
