/**
 * FACTURACIÓN — Rutas (FASE 5)
 * Montado en /rsp/facturacion
 */

import { Router } from 'express';
import { verificarSesion, verificarAccesoEntidad, verificarPermiso } from '../middleware/auth.js';
import {
  listarFacturas, getFactura, crearFactura, rectificarFactura,
  registrarPagoFactura, facturasVencidas, estadoFacturacion, ESTADOS_FACTURA, TIPOS_FACTURA,
} from '../config/facturacion.js';
import { registrarAuditoria } from '../config/auditoria.js';

const router = Router();
const actor = (req) => ({ dip: req.session?.usuario?.dip || '', nombre: req.session?.usuario?.nombre || 'web' });

router.get('/', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_contabilidad'), async (req, res) => {
  const [facturas, estado, vencidas] = await Promise.all([listarFacturas(req.query), estadoFacturacion(), facturasVencidas()]);
  res.render('rsp/facturacion/panel', {
    titulo: 'Sistema de Facturación',
    entidad_actual: 'rsp',
    facturas, estado, vencidas, ESTADOS_FACTURA, TIPOS_FACTURA,
    filtroEstado: req.query.estado || '',
    esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin'),
  });
});

router.get('/:id', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'ver_contabilidad'), async (req, res) => {
  const factura = await getFactura(req.params.id);
  if (!factura) return res.status(404).render('parciales/error', { titulo: '404', error: 'Factura no encontrada', enlace: '/rsp/facturacion' });
  res.render('rsp/facturacion/detalle', { titulo: `${factura.id} — Factura`, entidad_actual: 'rsp', factura, esAdmin: req.session.roles?.includes('superadmin') || req.session.roles?.includes('rsp_admin') });
});

// ═══ API ════════════════════════════════════════════════════════════════

router.post('/api/facturas', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_contabilidad'), async (req, res) => {
  try {
    const factura = await crearFactura(req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'facturacion', accion: 'crear', objeto_tipo: 'FACTURA', objeto_id: factura.id, valor_nuevo: { concepto: factura.concepto, total: factura.total_factura, iva: factura.total_iva }, motivo: 'Emisión de factura' });
    res.json({ success: true, factura });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/facturas/:id/rectificar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_contabilidad'), async (req, res) => {
  try {
    const { facturaRectificada, rectificativa } = await rectificarFactura(req.params.id, req.body.motivo, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'facturacion', accion: 'editar', objeto_tipo: 'FACTURA', objeto_id: facturaRectificada.id, valor_nuevo: { estado: 'rectificada' }, motivo: req.body.motivo || 'Rectificación' });
    res.json({ success: true, facturaRectificada, rectificativa });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.post('/api/facturas/:id/pagar', verificarSesion, verificarAccesoEntidad('rsp'), verificarPermiso('rsp', 'gestionar_contabilidad'), async (req, res) => {
  try {
    const factura = await registrarPagoFactura(req.params.id, req.body, actor(req));
    await registrarAuditoria({ usuario: actor(req), servicio: 'facturacion', accion: 'pagar', objeto_tipo: 'FACTURA', objeto_id: factura.id, valor_nuevo: { estado: factura.estado, pagos: factura.pagos }, motivo: 'Pago de factura' });
    res.json({ success: true, factura });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.get('/api/estado', verificarSesion, verificarAccesoEntidad('rsp'), async (req, res) => {
  res.json(await estadoFacturacion());
});

export default router;
