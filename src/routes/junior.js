/**
 * RUTAS DE PLACETA JUNIOR
 * Dashboard, menores, retos semanales, juegos
 */

import { Router } from 'express';
import { getRetoActivo, getRetos } from '../config/junior-retos.js';

const router = Router();

// ── Dashboard ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const reto = getRetoActivo();

  res.render('junior/dashboard', {
    titulo: 'Placeta Junior',
    entidad_actual: 'junior',
    reto,
    layout: 'layouts/admin'
  });
});

// ── Retos semanales ───────────────────────────────────────────────────
router.get('/retos', (req, res) => {
  const reto = getRetoActivo();
  const todos = getRetos();

  res.render('junior/retos', {
    titulo: 'Retos Semanales - Placeta Junior',
    entidad_actual: 'junior',
    reto,
    todos,
    layout: 'layouts/admin'
  });
});

// ── Menores (placeholder) ─────────────────────────────────────────────
router.get('/menores', (req, res) => {
  res.render('junior/stubs', {
    titulo: 'Menores - Placeta Junior',
    entidad_actual: 'junior',
    seccion: 'menores',
    layout: 'layouts/admin'
  });
});

// ── Tutores (placeholder) ─────────────────────────────────────────────
router.get('/tutores', (req, res) => {
  res.render('junior/stubs', {
    titulo: 'Tutores - Placeta Junior',
    entidad_actual: 'junior',
    seccion: 'tutores',
    layout: 'layouts/admin'
  });
});

// ── Autorizaciones (placeholder) ──────────────────────────────────────
router.get('/autorizaciones', (req, res) => {
  res.render('junior/stubs', {
    titulo: 'Autorizaciones - Placeta Junior',
    entidad_actual: 'junior',
    seccion: 'autorizaciones',
    layout: 'layouts/admin'
  });
});

// ── Cuentas (placeholder) ─────────────────────────────────────────────
router.get('/cuentas', (req, res) => {
  res.render('junior/stubs', {
    titulo: 'Cuentas Infantiles - Placeta Junior',
    entidad_actual: 'junior',
    seccion: 'cuentas',
    layout: 'layouts/admin'
  });
});

export default router;
