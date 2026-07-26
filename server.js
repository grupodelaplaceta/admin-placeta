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
import juniorApiRoutes from './src/routes/junior-api.js';
import accionesDocumentoRoutes from './src/routes/acciones-documento.js';
import rspRoutes from './src/routes/rsp.js';
import { apiGatewayRoutes } from './src/routes/api-gateway.js';
import firmasRoutes from './src/routes/firmas.js';

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
  res.json({ status: 'ok', version: '1.0.0', app: 'Admin Placeta', timestamp: new Date().toISOString() });
});

// ── Rutas Web ──────────────────────────────────────────────────────────────
app.use('/', authRoutes);

// Dashboard principal
app.get('/dashboard', verificarSesion, (req, res) => {
  res.render('dashboard', { titulo: 'Panel Principal - Admin Placeta' });
});

// Módulos protegidos por entidad
app.use('/banco', verificarSesion, verificarAccesoEntidad('banco'), bancoRoutes);
app.use('/tributos', verificarSesion, verificarAccesoEntidad('tributos'), tributosRoutes);
app.use('/junta', verificarSesion, verificarAccesoEntidad('junta'), juntaRoutes);
app.use('/administracion', verificarSesion, verificarAccesoEntidad('administracion'), administracionRoutes);

// API REST
app.use('/api', apiRoutes);
app.use('/api', juniorApiRoutes); // Proxy junior → CRM
app.use(documentosRoutes); // /api/:entidad/documentos...
app.use(accionesDocumentoRoutes); // /api/acciones/*
app.use('/junta', empresasRoutes);
app.use('/administracion', empresasRoutes);
// También accesible desde banco
app.use('/banco', empresasRoutes);

// Red de Servicios de La Placeta (RSP)
app.use('/rsp', verificarSesion, verificarAccesoEntidad('rsp'), rspRoutes);

// ═══ API GATEWAY v1 — APIs externas por entidad ═══════════════════════
// Las rutas /api/v1/:entidad/* son públicas (con API Key) para apps externas
app.use('/api', apiGatewayRoutes);

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

// ═══ SISTEMA UNIFICADO DE DOCUMENTOS Y FIRMAS ════════════════════════
// Rutas web: /{entidad}/documentos para cada workspace
app.use('/banco/documentos', verificarSesion, verificarAccesoEntidad('banco'), (req, res, next) => { req.entidad = 'banco'; next(); }, firmasRoutes);
app.use('/tributos/documentos', verificarSesion, verificarAccesoEntidad('tributos'), (req, res, next) => { req.entidad = 'tributos'; next(); }, firmasRoutes);
app.use('/junta/documentos', verificarSesion, verificarAccesoEntidad('junta'), (req, res, next) => { req.entidad = 'junta'; next(); }, firmasRoutes);
app.use('/administracion/documentos', verificarSesion, verificarAccesoEntidad('administracion'), (req, res, next) => { req.entidad = 'administracion'; next(); }, firmasRoutes);
app.use('/rsp/documentos', verificarSesion, verificarAccesoEntidad('rsp'), (req, res, next) => { req.entidad = 'rsp'; next(); }, firmasRoutes);

// API de firmas (webhook PlacetaID + consultas)
app.use('/api/firmas', firmasRoutes);

// ═══ GASTOS RSP POR ENTIDAD ═══════════════════════════════════════════
// Cada entidad puede ver sus propios gastos de conexión RSP
app.get('/banco/gastos-rsp', verificarSesion, verificarAccesoEntidad('banco'), (req, res) => res.redirect('/rsp/gastos/banco'));
app.get('/tributos/gastos-rsp', verificarSesion, verificarAccesoEntidad('tributos'), (req, res) => res.redirect('/rsp/gastos/tributos'));
app.get('/junta/gastos-rsp', verificarSesion, verificarAccesoEntidad('junta'), (req, res) => res.redirect('/rsp/gastos/junta'));
app.get('/administracion/gastos-rsp', verificarSesion, verificarAccesoEntidad('administracion'), (req, res) => res.redirect('/rsp/gastos/administracion'));
app.get('/rsp/gastos', verificarSesion, verificarAccesoEntidad('rsp'), (req, res) => res.redirect('/rsp/gastos/rsp'));

// ── Landing / Login ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session?.usuario) return res.redirect('/dashboard');
  res.render('auth/login', { titulo: 'Admin Placeta - Iniciar Sesión', layout: false });
});

// ── 404 ────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint no encontrado' });
  res.status(404).render('parciales/error', { titulo: '404', error: 'Página no encontrada' });
});

// ── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Error interno', detalle: err.message });
  res.status(500).render('parciales/error', { titulo: '500', error: 'Error interno del servidor' });
});

// ── Iniciar ────────────────────────────────────────────────────────────────
async function startServer() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║    Admin Placeta - Plataforma Centralizada de APIs y Entidades ║
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
