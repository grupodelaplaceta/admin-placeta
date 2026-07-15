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

// Importar rutas
import authRoutes from './src/routes/auth.js';
import bancoRoutes from './src/routes/banco.js';
import tributosRoutes from './src/routes/tributos.js';
import juntaRoutes from './src/routes/junta.js';
import administracionRoutes from './src/routes/administracion.js';
import apiRoutes from './src/routes/api.js';
import documentosRoutes from './src/routes/documentos.js';

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

// Variables globales
app.use((req, res, next) => {
  res.locals.usuario = req.session?.usuario || null;
  res.locals.entidad_actual = '';
  res.locals.pathActual = req.path;
  res.locals.anoActual = 2026;
  next();
});

// Cargar permisos en sesión
app.use(cargarPermisosUsuario);

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
app.use(documentosRoutes); // /api/:entidad/documentos...

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
╔══════════════════════════════════════════════════════╗
║    Admin Placeta - Plataforma Unificada             ║
║    http://localhost:${PORT}                           ║
║                                                      ║
║  Entidades: Banco | Tributos | Junta | Admin        ║
╚══════════════════════════════════════════════════════╝
    `);
  });
}

startServer();

export default app;
