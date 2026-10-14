/* ═══════════════════════════════════════════════════════════════════════
   rsp-web-api — Arranque standalone (VPS / desarrollo local).
   Sirve el SPA compilado (dist/) y monta la API del BFF.
   En Vercel se usa `api/index.js` en su lugar.
   ═══════════════════════════════════════════════════════════════════════ */
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// ── Servir el SPA compilado (público) ANTES de montar la API ───────────
// Si se montara después, / y los assets quedarían detrás de requiereSesion
// y la raíz devolvería 401 (pantalla en blanco).
const dist = path.resolve(__dirname, '..', 'dist');
app.use(express.static(dist));
// Fallback SPA (React Router): rutas del cliente. Se dejan pasar las rutas
// de la API (api/rsp/publico), el callback del SSO y logout para el BFF.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (/^\/(api|rsp|publico)\//.test(req.path)) return next();
  if (req.path === '/login/callback' || req.path === '/logout') return next();
  res.sendFile(path.join(dist, 'index.html'));
});

// ── API del BFF (auth + rutas de dominio) ─────────────────────────────
app.use(createApp());

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`rsp-web-api escuchando en http://localhost:${PORT}`);
  console.log(`  BOP:   ${process.env.BOP_URL || 'https://bop.laplaceta.org'}`);
  console.log(`  Banco: ${process.env.BANCO_API_URL || process.env.BANK_URL || 'https://api.banco.laplaceta.org'}`);
});
