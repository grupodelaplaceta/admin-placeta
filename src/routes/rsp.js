/**
 * Rutas de la Red de Servicios de La Placeta (RSP)
 * 
 * - Dashboard principal
 * - Panel de conexiones
 * - Gestión de facturación
 * - Estado de fondos
 * - API REST para el sistema
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  getConexiones, getFacturas, getEstadoFondos, getTarifas, getEstadisticas,
  generarFactura, pagarFactura, pagarSancionIVA, registrarConexion, TIPO_CONEXION
} from '../config/rsp.js';

const router = Router();

// ── DASHBOARD ──────────────────────────────────────────────────────────────
router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), (req, res) => {
  const stats = getEstadisticas();
  const tarifas = getTarifas();
  const conexionesRecientes = getConexiones({ limit: 10 }).reverse();
  const facturasPendientes = getFacturas({ estado: 'pendiente' });

  res.render('rsp/dashboard', {
    titulo: 'Red de Servicios de La Placeta (RSP)',
    entidad_actual: 'rsp',
    stats,
    tarifas,
    conexionesRecientes,
    facturasPendientes,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin')
  });
});

// ── CONEXIONES ─────────────────────────────────────────────────────────────
router.get('/conexiones', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_conexiones'), (req, res) => {
  const filtros = {};
  if (req.query.entidad) filtros.entidad = req.query.entidad;
  if (req.query.tipo) filtros.tipo = req.query.tipo;

  const todas = getConexiones(filtros);
  const conexiones = [...todas].reverse(); // Más recientes primero

  // Estadísticas para la vista
  const consultas = conexiones.filter(c => c.tipo === TIPO_CONEXION.CONSULTA);
  const modificaciones = conexiones.filter(c => c.tipo === TIPO_CONEXION.MODIFICACION);

  res.render('rsp/conexiones', {
    titulo: 'Conexiones - Red de Servicios de La Placeta',
    entidad_actual: 'rsp',
    conexiones,
    total: conexiones.length,
    totalConsultas: consultas.length,
    totalModificaciones: modificaciones.length,
    ingresosConsultas: consultas.reduce((s, c) => s + c.total, 0),
    ingresosModificaciones: modificaciones.reduce((s, c) => s + c.total, 0),
    filtroEntidad: req.query.entidad || '',
    filtroTipo: req.query.tipo || ''
  });
});

// ── FACTURACIÓN ────────────────────────────────────────────────────────────
router.get('/facturacion', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_facturas'), (req, res) => {
  const filtros = {};
  if (req.query.entidad) filtros.entidad = req.query.entidad;
  if (req.query.estado) filtros.estado = req.query.estado;

  const facturas = getFacturas(filtros);
  const stats = getEstadisticas();
  const tarifas = getTarifas();

  res.render('rsp/facturacion', {
    titulo: 'Facturación - Red de Servicios de La Placeta',
    entidad_actual: 'rsp',
    facturas: [...facturas].reverse(),
    total: facturas.length,
    pendientes: facturas.filter(f => f.estado === 'pendiente').length,
    pagadas: facturas.filter(f => f.estado === 'pagada').length,
    totalFacturado: facturas.reduce((s, f) => s + f.detalle.total, 0),
    tarifas,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
    filtroEntidad: req.query.entidad || '',
    filtroEstado: req.query.estado || ''
  });
});

// ── FONDOS ─────────────────────────────────────────────────────────────────
router.get('/fondos', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_fondos'), (req, res) => {
  const fondos = getEstadoFondos();
  const tarifas = getTarifas();
  const stats = getEstadisticas();

  res.render('rsp/fondos', {
    titulo: 'Fondos - Red de Servicios de La Placeta',
    entidad_actual: 'rsp',
    fondos,
    tarifas,
    stats,
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin')
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// API REST
// ═══════════════════════════════════════════════════════════════════════════

// ── API: Estadísticas ─────────────────────────────────────────────────────
router.get('/api/estadisticas', verificarSesion, (req, res) => {
  res.json(getEstadisticas());
});

// ── API: Tarifas ──────────────────────────────────────────────────────────
router.get('/api/tarifas', verificarSesion, (req, res) => {
  res.json(getTarifas());
});

// ── API: Conexiones ───────────────────────────────────────────────────────
router.get('/api/conexiones', verificarSesion, verificarPermiso('rsp', 'ver_conexiones'), (req, res) => {
  const filtros = {};
  if (req.query.entidad) filtros.entidad = req.query.entidad;
  if (req.query.tipo) filtros.tipo = req.query.tipo;
  if (req.query.limit) filtros.limit = parseInt(req.query.limit);

  const conexiones = getConexiones(filtros);
  res.json({ conexiones: [...conexiones].reverse(), total: conexiones.length });
});

// ── API: Facturas ─────────────────────────────────────────────────────────
router.get('/api/facturas', verificarSesion, verificarPermiso('rsp', 'ver_facturas'), (req, res) => {
  const filtros = {};
  if (req.query.entidad) filtros.entidad = req.query.entidad;
  if (req.query.estado) filtros.estado = req.query.estado;
  res.json({ facturas: getFacturas(filtros) });
});

// ── API: Generar factura ──────────────────────────────────────────────────
router.post('/api/facturas/generar', verificarSesion, verificarPermiso('rsp', 'gestionar_facturas'), (req, res) => {
  const { entidad, periodoInicio, periodoFin } = req.body;
  if (!entidad) return res.status(400).json({ error: 'Entidad requerida' });

  const factura = generarFactura({ entidad, periodoInicio, periodoFin });
  if (!factura) return res.status(400).json({ error: 'No hay conexiones para facturar en esta entidad' });

  res.json({ success: true, factura });
});

// ── API: Pagar factura ────────────────────────────────────────────────────
router.post('/api/facturas/:id/pagar', verificarSesion, verificarPermiso('rsp', 'gestionar_facturas'), (req, res) => {
  const result = pagarFactura(req.params.id);
  res.json(result);
});

// ── API: Estado de fondos ─────────────────────────────────────────────────
router.get('/api/fondos', verificarSesion, verificarPermiso('rsp', 'ver_fondos'), (req, res) => {
  res.json(getEstadoFondos());
});

// ── API: Pagar sanción IVA ────────────────────────────────────────────────
router.post('/api/fondos/pagar-sancion', verificarSesion, verificarPermiso('rsp', 'pagar_sancion'), (req, res) => {
  const result = pagarSancionIVA();
  res.json(result);
});

// ── API: Registrar conexión externa ───────────────────────────────────────
router.post('/api/conexiones/registrar', verificarSesion, (req, res) => {
  const { entidad, tipo, endpoint, dip, detalle } = req.body;
  if (!entidad || !tipo) return res.status(400).json({ error: 'entidad y tipo son requeridos' });
  if (![TIPO_CONEXION.CONSULTA, TIPO_CONEXION.MODIFICACION].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser "consulta" o "modificacion"' });
  }

  const conexion = registrarConexion({
    entidad,
    tipo,
    endpoint: endpoint || 'api-externa',
    usuario: req.session.usuario?.nombre || 'api',
    dip: dip || req.session.usuario?.dip || '',
    detalle: detalle || ''
  });

  res.json({ success: true, conexion });
});

export default router;
