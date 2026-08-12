/**
 * FACTURACIÓN — FASE 5
 *
 * Facturas emitidas y recibidas, rectificativas, abonos, IVA, estados,
 * vencimientos, pagos, vinculación con operaciones.
 *
 * Flujo: Servicio → Factura → Pago → Contabilidad → Fiscalidad → Declaración.
 *
 * Persistencia Supabase (rsp_facturas) + memoria.
 */

import { supabase } from './supabase.js';
import { generarIdentificador } from './identificadores.js';
import { calcularFactura } from './normativa.js';

const TABLA = 'rsp_facturas';
const memFacturas = new Map();

export const ESTADOS_FACTURA = ['borrador', 'emitida', 'vencida', 'pagada', 'rectificada', 'anulada'];
export const TIPOS_FACTURA = ['emitida', 'recibida', 'rectificativa', 'abono'];

async function listarDB(filtros = {}) {
  if (!supabase) return null;
  try {
    let q = supabase.from(TABLA).select('*').order('created_at', { ascending: false }).limit(300);
    if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    if (filtros.entidad_eip) q = q.eq('entidad_eip', filtros.entidad_eip);
    const { data } = await q;
    return data || [];
  } catch { return null; }
}

async function upsertDB(f) {
  if (!supabase) return false;
  try { await supabase.from(TABLA).upsert(f, { onConflict: 'id' }); return true; }
  catch { return false; }
}

export async function listarFacturas(filtros = {}) {
  const db = await listarDB(filtros);
  if (db && db.length > 0) {
    db.forEach(f => memFacturas.set(f.id, f));
    return db;
  }
  let lista = [...memFacturas.values()].reverse();
  if (filtros.tipo) lista = lista.filter(f => f.tipo === filtros.tipo);
  if (filtros.estado) lista = lista.filter(f => f.estado === filtros.estado);
  return lista;
}

export async function getFactura(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle();
      if (data) { memFacturas.set(id, data); return data; }
    } catch { /* memoria */ }
  }
  return memFacturas.get(id) || null;
}

/**
 * Crea una factura (emitida o recibida).
 * @param {object} datos { tipo, emisor_eip, emisor_nombre, receptor_eip, receptor_nombre,
 *   concepto, lineas [{descripcion, cantidad, precioUnitario, ivaPorcentaje}],
 *   fecha, vencimiento, operacion_id }
 */
export async function crearFactura(datos, autor = {}) {
  if (!datos.concepto) throw new Error('El concepto es obligatorio');
  if (!datos.lineas || datos.lineas.length === 0) throw new Error('La factura necesita al menos una línea');

  const calculada = calcularFactura(datos.lineas.map(l => ({
    cantidad: l.cantidad || 1,
    precioUnitario: l.precioUnitario || 0,
    ivaPorcentaje: l.ivaPorcentaje || 12,
  })));

  const id = await generarIdentificador('FAC');
  const factura = {
    id,
    tipo: datos.tipo || 'emitida',
    emisor_eip: datos.emisor_eip || null,
    emisor_nombre: datos.emisor_nombre || '',
    receptor_eip: datos.receptor_eip || null,
    receptor_nombre: datos.receptor_nombre || '',
    concepto: datos.concepto,
    lineas: calculada.lineas,
    base_imponible: calculada.baseImponible,
    total_iva: calculada.totalIVA,
    total_factura: calculada.totalFactura,
    estado: 'emitida',
    fecha: (datos.fecha || new Date().toISOString()).slice(0, 10),
    vencimiento: datos.vencimiento ? datos.vencimiento.slice(0, 10) : null,
    pagos: [],
    operacion_id: datos.operacion_id || null,
    rectifica: datos.rectifica || null,
    emitida_por: autor.nombre || autor.dip || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memFacturas.set(id, factura);
  await upsertDB(factura);
  return factura;
}

/** Crea una rectificativa / abono de una factura emitida */
export async function rectificarFactura(id, motivo, autor = {}) {
  const f = await getFactura(id);
  if (!f) throw new Error('Factura no encontrada');
  if (f.tipo !== 'emitida') throw new Error('Solo se rectifican facturas emitidas');
  // Anula la original y crea la rectificativa (importes negativos)
  f.estado = 'rectificada';
  f.updated_at = new Date().toISOString();
  memFacturas.set(id, f);
  await upsertDB(f);

  const rect = await crearFactura({
    tipo: 'rectificativa',
    emisor_eip: f.emisor_eip, emisor_nombre: f.emisor_nombre,
    receptor_eip: f.receptor_eip, receptor_nombre: f.receptor_nombre,
    concepto: `Rectificativa de ${f.id}: ${motivo || ''}`,
    lineas: f.lineas.map(l => ({ ...l, cantidad: -l.cantidad })),
    fecha: new Date().toISOString(),
    vencimiento: f.vencimiento,
    operacion_id: f.operacion_id,
    rectifica: f.id,
  }, autor);
  return { facturaRectificada: f, rectificativa: rect };
}

/** Registra un pago de una factura */
export async function registrarPagoFactura(id, { importe, concepto = 'Pago de factura' }, autor = {}) {
  const f = await getFactura(id);
  if (!f) throw new Error('Factura no encontrada');
  const pago = { importe: Number(importe) || f.total_factura, fecha: new Date().toISOString(), concepto, pagado_por: autor.nombre || autor.dip || '' };
  f.pagos = [...(f.pagos || []), pago];
  const totalPagado = f.pagos.reduce((s, p) => s + (p.importe || 0), 0);
  if (totalPagado >= f.total_factura) f.estado = 'pagada';
  f.updated_at = new Date().toISOString();
  memFacturas.set(id, f);
  await upsertDB(f);
  return f;
}

/** Detecta facturas vencidas sin pagar */
export async function facturasVencidas() {
  const todas = await listarFacturas();
  const hoy = new Date().toISOString().slice(0, 10);
  return todas.filter(f => f.estado === 'emitida' && f.vencimiento && f.vencimiento < hoy);
}

/** Estado del módulo */
export async function estadoFacturacion() {
  const todas = await listarFacturas();
  return {
    total: todas.length,
    emitidas: todas.filter(f => f.estado === 'emitida').length,
    pagadas: todas.filter(f => f.estado === 'pagada').length,
    vencidas: (await facturasVencidas()).length,
    rectificativas: todas.filter(f => f.tipo === 'rectificativa').length,
    totalFacturado: Math.round(todas.filter(f => f.tipo !== 'recibida').reduce((s, f) => s + (f.total_factura || 0), 0) * 100) / 100,
    totalIVA: Math.round(todas.reduce((s, f) => s + (f.total_iva || 0), 0) * 100) / 100,
  };
}

export default {
  ESTADOS_FACTURA, TIPOS_FACTURA,
  listarFacturas, getFactura, crearFactura, rectificarFactura,
  registrarPagoFactura, facturasVencidas, estadoFacturacion,
};
