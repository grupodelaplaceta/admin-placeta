/**
 * SISTEMA DE NÓMINAS — FASE 6
 *
 * Flujo: Nómina → Cálculo → Retenciones → Documento → Orden bancaria →
 * Banco → Fiscalidad → Declaración.
 *
 * Datos: trabajador, contrato, periodo, salario, complementos, deducciones,
 * retenciones, neto, cuenta bancaria.
 *
 * Una transferencia manual con concepto "Nómina" NO sustituye este proceso
 * (el Operation Engine lo retiene si no hay NOM-XXXX-XX).
 *
 * Persistencia Supabase (rsp_nominas + rsp_nomina_lineas en JSONB) + memoria.
 */

import { supabase } from './supabase.js';
import { generarIdentificador } from './identificadores.js';
import { calcularCotizaciones, SMI, SALARIO_MAXIMO } from './normativa.js';

const TABLA = 'rsp_nominas';
const memNominas = new Map();

// IRPF/IRM por tramos sobre el neto bruto (retención a cuenta)
const TRAMOS_RETENCION = [
  { max: 200, tipo: 0 },
  { max: 500, tipo: 0.05 },
  { max: 1000, tipo: 0.10 },
  { max: Infinity, tipo: 0.15 },
];

function calcularRetencion(bruto) {
  let total = 0;
  let resto = bruto;
  let anterior = 0;
  for (const tramo of TRAMOS_RETENCION) {
    const baseTramo = Math.min(Math.max(bruto - anterior, 0), tramo.max - anterior);
    total += baseTramo * tramo.tipo;
    anterior = tramo.max;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Calcula una nómina completa.
 * @param {object} datos { trabajador_dip, trabajador_nombre, entidad_eip,
 *   entidad_nombre, periodo (YYYY-MM), salario_base, complementos [], deducciones [],
 *   cuenta_bancaria }
 * @returns {object} desglose completo
 */
export function calcularNomina(datos) {
  const salarioBase = Number(datos.salario_base) || 0;
  if (salarioBase < SMI) throw new Error(`El salario (${salarioBase} Pz) es inferior al SMI (${SMI} Pz/mes)`);
  if (salarioBase > SALARIO_MAXIMO) throw new Error(`El salario (${salarioBase} Pz) supera el máximo (${SALARIO_MAXIMO} Pz/mes)`);

  const complementos = (datos.complementos || []).map(c => ({ concepto: c.concepto, importe: Number(c.importe) || 0 }));
  const deducciones = (datos.deducciones || []).map(d => ({ concepto: d.concepto, importe: Number(d.importe) || 0 }));

  const bruto = salarioBase + complementos.reduce((s, c) => s + c.importe, 0);
  const cotizaciones = calcularCotizaciones(bruto);
  const retencionIRM = calcularRetencion(bruto);
  const deduccionesTotales = deducciones.reduce((s, d) => s + d.importe, 0);
  const totalRetenciones = cotizaciones.totalRetencion + retencionIRM + deduccionesTotales;
  const neto = Math.round((bruto - totalRetenciones) * 100) / 100;

  return {
    trabajador_dip: datos.trabajador_dip,
    trabajador_nombre: datos.trabajador_nombre || '',
    entidad_eip: datos.entidad_eip || null,
    entidad_nombre: datos.entidad_nombre || '',
    periodo: datos.periodo || new Date().toISOString().slice(0, 7),
    salario_base: salarioBase,
    complementos,
    bruto: Math.round(bruto * 100) / 100,
    cotizacion_empresa: cotizaciones.cotizacionEmpresa,
    cotizacion_trabajador: cotizaciones.cotizacionTrabajador,
    retencion_irm: retencionIRM,
    deducciones,
    total_retenciones: Math.round(totalRetenciones * 100) / 100,
    neto,
    cuenta_bancaria: datos.cuenta_bancaria || null,
    estado: 'calculada',
  };
}

// ── Persistencia ──────────────────────────────────────────────────────────
async function listarDB(filtros = {}) {
  if (!supabase) return null;
  try {
    let q = supabase.from(TABLA).select('*').order('created_at', { ascending: false }).limit(300);
    if (filtros.periodo) q = q.eq('periodo', filtros.periodo);
    if (filtros.entidad_eip) q = q.eq('entidad_eip', filtros.entidad_eip);
    if (filtros.trabajador_dip) q = q.eq('trabajador_dip', filtros.trabajador_dip);
    const { data } = await q;
    return data || [];
  } catch { return null; }
}

async function upsertDB(n) {
  if (!supabase) return false;
  try { await supabase.from(TABLA).upsert(n, { onConflict: 'id' }); return true; }
  catch { return false; }
}

export async function listarNominas(filtros = {}) {
  const db = await listarDB(filtros);
  if (db && db.length > 0) {
    db.forEach(n => memNominas.set(n.id, n));
    return db;
  }
  let lista = [...memNominas.values()].reverse();
  if (filtros.periodo) lista = lista.filter(n => n.periodo === filtros.periodo);
  if (filtros.entidad_eip) lista = lista.filter(n => n.entidad_eip === filtros.entidad_eip);
  return lista;
}

export async function getNomina(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle();
      if (data) { memNominas.set(id, data); return data; }
    } catch { /* memoria */ }
  }
  return memNominas.get(id) || null;
}

/**
 * Crea una nómina: calcula, asigna NOM-YYYY-MM-XXXX y guarda.
 */
export async function crearNomina(datos, autor = {}) {
  const calculada = calcularNomina(datos);
  // Identificador NOM-2026-08-0001 (secuencia por mes)
  const periodo = calculada.periodo;
  const [anio, mes] = periodo.split('-');
  const existentesMes = await listarNominas({ periodo });
  const seq = existentesMes.length + 1;
  const id = `NOM-${anio}-${mes}-${String(seq).padStart(4, '0')}`;
  const nomina = {
    ...calculada,
    id,
    creado_por: autor.nombre || autor.dip || null,
    orden_bancaria: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memNominas.set(id, nomina);
  await upsertDB(nomina);
  return nomina;
}

/**
 * Genera la ORDEN BANCARIA de una nómina (Nómina → Orden → Banco).
 * Devuelve la orden sin ejecutar (la ejecución la hace el banco).
 */
export async function generarOrdenBancaria(id, autor = {}) {
  const n = await getNomina(id);
  if (!n) throw new Error('Nómina no encontrada');
  if (n.estado !== 'calculada' && n.estado !== 'documentada') throw new Error('La nómina debe estar calculada para ordenar el pago');
  const orden = {
    orden_id: `ORD-NOM-${Date.now().toString(36).toUpperCase()}`,
    nomina_id: n.id,
    trabajador_dip: n.trabajador_dip,
    cuenta_origen: n.entidad_eip ? `cuenta-${n.entidad_eip}` : 'TGLP', // empresa paga desde su cuenta
    cuenta_destino: n.cuenta_bancaria,
    importe: n.neto,
    concepto: `${n.id} — Nómina ${n.periodo} — ${n.trabajador_nombre || n.trabajador_dip}`,
    cotizacion_empresa: n.cotizacion_empresa,
    retencion_irm: n.retencion_irm,
    fecha: new Date().toISOString(),
    generada_por: autor.nombre || autor.dip || '',
    estado: 'pendiente',
  };
  n.orden_bancaria = orden;
  n.estado = 'ordenada';
  n.updated_at = new Date().toISOString();
  memNominas.set(id, n);
  await upsertDB(n);
  return n;
}

/** Marca la nómina como pagada (tras confirmación del banco) */
export async function confirmarPagoNomina(id, autor = {}) {
  const n = await getNomina(id);
  if (!n) throw new Error('Nómina no encontrada');
  n.estado = 'pagada';
  if (n.orden_bancaria) n.orden_bancaria.estado = 'pagada';
  n.updated_at = new Date().toISOString();
  memNominas.set(id, n);
  await upsertDB(n);
  return n;
}

/** Estado del módulo */
export async function estadoNominas() {
  const todas = await listarNominas();
  return {
    total: todas.length,
    calculadas: todas.filter(n => n.estado === 'calculada').length,
    ordenadas: todas.filter(n => n.estado === 'ordenada').length,
    pagadas: todas.filter(n => n.estado === 'pagada').length,
    totalNeto: Math.round(todas.reduce((s, n) => s + (n.neto || 0), 0) * 100) / 100,
    totalRetenciones: Math.round(todas.reduce((s, n) => s + (n.total_retenciones || 0), 0) * 100) / 100,
    totalCotizacionEmpresa: Math.round(todas.reduce((s, n) => s + (n.cotizacion_empresa || 0), 0) * 100) / 100,
  };
}

export default {
  calcularNomina, calcularRetencion, listarNominas, getNomina,
  crearNomina, generarOrdenBancaria, confirmarPagoNomina, estadoNominas, TRAMOS_RETENCION,
};
