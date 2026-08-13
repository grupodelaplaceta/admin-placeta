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

const app = createApp();

// ── Servir el SPA compilado ────────────────────────────────────────────
const dist = path.resolve(__dirname, '..', 'dist');
app.use(express.static(dist));
// Fallback SPA (Express 5 ya no admite '*'; usar middleware).
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(dist, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`rsp-web-api escuchando en http://localhost:${PORT}`);
  console.log(`  BOP:   ${process.env.BOP_URL || 'https://rsp.laplaceta.org'}`);
  console.log(`  Banco: ${process.env.BANCO_API_URL || process.env.BANK_URL || 'https://api.banco.laplaceta.org'}`);
});
