import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import helmet from 'helmet';
import cors from 'cors';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

// ── Config Sesión ─────────────────────────────────────────────────────────
const sessionConfig = {
  name: 'admin-placeta-session',
  secret: process.env.SESSION_SECRET || 'admin-placeta-secret-2026',
  maxAge: 8 * 60 * 60 * 1000, // 8 horas
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  overwrite: true
};

// ── Middleware Global ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieSession(sessionConfig));
app.use(express.static(path.join(__dirname, 'public')));

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
