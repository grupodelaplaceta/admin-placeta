/**
 * CONTABILIDAD DE ENTIDADES — FASE 7 + punto 13
 *
 * Plan contable, asientos (libro diario), libro mayor, conciliación.
 * Toda entidad (empresa, asociación, fundación, entidad pública) tiene la
 * obligación de llevar contabilidad vía RSP.
 *
 * Persistencia Supabase (rsp_plan_contable, rsp_asientos) + memoria.
 */

import { supabase } from './supabase.js';
import { generarIdentificador } from './identificadores.js';

const TABLA_PLAN = 'rsp_plan_contable';
const TABLA_ASI = 'rsp_asientos';
const memPlan = [];
const memAsientos = new Map();
let contadorAsiento = 0;

// ── PLAN CONTABLE BASE (cuentas esenciales) ──────────────────────────────
const PLAN_BASE = [
  { codigo: '100', nombre: 'Capital', tipo: 'patrimonio', grupo: 'Patrimonio neto' },
  { codigo: '110', nombre: 'Reservas', tipo: 'patrimonio', grupo: 'Patrimonio neto' },
  { codigo: '120', nombre: 'Remanente', tipo: 'patrimonio', grupo: 'Patrimonio neto' },
  { codigo: '200', nombre: 'Inmovilizado material', tipo: 'activo', grupo: 'Activo no corriente' },
  { codigo: '210', nombre: 'Propiedad, planta y equipo', tipo: 'activo', grupo: 'Activo no corriente' },
  { codigo: '300', nombre: 'Existencias / Material', tipo: 'activo', grupo: 'Activo corriente' },
  { codigo: '400', nombre: 'Acreedores por operaciones comerciales', tipo: 'pasivo', grupo: 'Pasivo corriente' },
  { codigo: '410', nombre: 'Acreedores por prestaciones de servicios', tipo: 'pasivo', grupo: 'Pasivo corriente' },
  { codigo: '430', nombre: 'Clientes', tipo: 'activo', grupo: 'Activo corriente' },
  { codigo: '440', nombre: 'Deudores', tipo: 'activo', grupo: 'Activo corriente' },
  { codigo: '470', nombre: 'Hacienda/Impuestos a pagar', tipo: 'pasivo', grupo: 'Pasivo corriente' },
  { codigo: '475', nombre: 'IVA repercutido', tipo: 'pasivo', grupo: 'Pasivo corriente' },
  { codigo: '472', nombre: 'IVA soportado', tipo: 'activo', grupo: 'Activo corriente' },
  { codigo: '570', nombre: 'Caja', tipo: 'activo', grupo: 'Activo corriente' },
  { codigo: '572', nombre: 'Banco de La Placeta', tipo: 'activo', grupo: 'Activo corriente' },
  { codigo: '640', nombre: 'Sueldos y salarios', tipo: 'gasto', grupo: 'Gastos de personal' },
  { codigo: '642', nombre: 'Seguridad social a cargo empresa', tipo: 'gasto', grupo: 'Gastos de personal' },
  { codigo: '700', nombre: 'Ventas de mercaderías', tipo: 'ingreso', grupo: 'Ingresos' },
  { codigo: '705', nombre: 'Prestación de servicios', tipo: 'ingreso', grupo: 'Ingresos' },
  { codigo: '740', nombre: 'Subvenciones y ayudas', tipo: 'ingreso', grupo: 'Ingresos' },
  { codigo: '741', nombre: 'Donaciones', tipo: 'ingreso', grupo: 'Ingresos' },
  { codigo: '600', nombre: 'Compras de mercaderías', tipo: 'gasto', grupo: 'Aprovisionamientos' },
  { codigo: '621', nombre: 'Arrendamientos y cánones', tipo: 'gasto', grupo: 'Gastos de explotación' },
  { codigo: '622', nombre: 'Servicios de profesionales independientes', tipo: 'gasto', grupo: 'Gastos de explotación' },
  { codigo: '626', nombre: 'Servicios bancarios', tipo: 'gasto', grupo: 'Gastos de explotación' },
  { codigo: '627', nombre: 'Publicidad y propaganda', tipo: 'gasto', grupo: 'Gastos de explotación' },
  { codigo: '629', nombre: 'Otros servicios', tipo: 'gasto', grupo: 'Gastos de explotación' },
  { codigo: '6400', nombre: 'Retribución 250 Pz (participación)', tipo: 'gasto', grupo: 'Gastos de personal' },
  { codigo: '681', nombre: 'Amortización inmovilizado', tipo: 'gasto', grupo: 'Amortizaciones' },
  { codigo: '770', nombre: 'Ingresos financieros', tipo: 'ingreso', grupo: 'Ingresos' },
  { codigo: '113', nombre: 'Fondo de Apoyo a la Participación', tipo: 'patrimonio', grupo: 'Patrimonio neto' },
];

/** Inicializa el plan contable base (una vez) */
export async function initPlanContable() {
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA_PLAN).select('codigo').limit(1);
      if (data && data.length > 0) return;
    } catch { /* crear */ }
  }
  for (const cta of PLAN_BASE) {
    await upsertCuenta(cta);
  }
}

async function upsertCuenta(cta) {
  const row = { ...cta, id: `PC-${cta.codigo}`, obligatoria_entidades: true, created_at: new Date().toISOString() };
  memPlan.push(row);
  if (supabase) {
    try { await supabase.from(TABLA_PLAN).upsert(row, { onConflict: 'codigo' }); }
    catch { /* memoria */ }
  }
}

/** Lista el plan contable */
export async function listarPlanContable() {
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA_PLAN).select('*').order('codigo', { ascending: true });
      if (data && data.length > 0) return data;
    } catch { /* memoria */ }
  }
  return memPlan;
}

/** Crea una cuenta del plan */
export async function crearCuenta({ codigo, nombre, tipo, grupo = '' }) {
  if (!codigo || !nombre) throw new Error('Código y nombre de la cuenta son obligatorios');
  await upsertCuenta({ codigo, nombre, tipo, grupo });
  return { codigo, nombre, tipo, grupo };
}

// ── ASIENTOS (libro diario) ──────────────────────────────────────────────

async function listarAsientosDB(filtros = {}) {
  if (!supabase) return null;
  try {
    let q = supabase.from(TABLA_ASI).select('*').order('fecha', { ascending: false }).limit(300);
    if (filtros.entidad_eip) q = q.eq('entidad_eip', filtros.entidad_eip);
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    const { data } = await q;
    return data || [];
  } catch { return null; }
}

/** Lista asientos */
export async function listarAsientos(filtros = {}) {
  const db = await listarAsientosDB(filtros);
  if (db && db.length > 0) {
    db.forEach(a => memAsientos.set(a.id, a));
    return db;
  }
  let lista = [...memAsientos.values()].reverse();
  if (filtros.entidad_eip) lista = lista.filter(a => a.entidad_eip === filtros.entidad_eip);
  if (filtros.estado) lista = lista.filter(a => a.estado === filtros.estado);
  return lista;
}

/** Obtiene un asiento */
export async function getAsiento(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA_ASI).select('*').eq('id', id).maybeSingle();
      if (data) { memAsientos.set(id, data); return data; }
    } catch { /* memoria */ }
  }
  return memAsientos.get(id) || null;
}

/** Crea un asiento contable (valida que debe = haber) */
export async function crearAsiento({ entidad_eip, entidad_nombre, fecha, concepto, origen = 'manual', referencia_tipo = null, referencia_id = null, lineas = [] }, autor = {}) {
  if (!entidad_eip) throw new Error('La entidad (EIP) es obligatoria');
  if (!fecha) throw new Error('La fecha es obligatoria');
  if (!lineas || lineas.length < 2) throw new Error('Un asiento necesita al menos 2 líneas');
  const totalDebe = lineas.filter(l => l.debe > 0).reduce((s, l) => s + l.debe, 0);
  const totalHaber = lineas.filter(l => l.haber > 0).reduce((s, l) => s + l.haber, 0);
  if (Math.round(totalDebe * 100) / 100 !== Math.round(totalHaber * 100) / 100) {
    throw new Error(`El asiento no cuadra: Debe ${totalDebe} ≠ Haber ${totalHaber}`);
  }
  const id = await generarIdentificador('ASI');
  const numero = (await listarAsientos({ entidad_eip })).length + 1;
  const asiento = {
    id,
    numero,
    entidad_eip,
    entidad_nombre: entidad_nombre || '',
    fecha: fecha.slice(0, 10),
    concepto: concepto || '',
    origen,
    referencia_tipo,
    referencia_id,
    lineas: lineas.map(l => ({ cuenta: l.cuenta, nombre: l.nombre || '', debe: l.debe || 0, haber: l.haber || 0, concepto: l.concepto || '' })),
    total_debe: totalDebe,
    total_haber: totalHaber,
    estado: 'contabilizado',
    contabilizado_por: autor.nombre || autor.dip || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memAsientos.set(id, asiento);
  if (supabase) {
    try { await supabase.from(TABLA_ASI).insert(asiento); }
    catch { /* memoria */ }
  }
  return asiento;
}

/** Libro mayor: agrupa por cuenta */
export async function libroMayor(entidad_eip) {
  const asientos = await listarAsientos({ entidad_eip });
  const cuentas = {};
  for (const a of asientos) {
    for (const l of a.lineas) {
      const key = l.cuenta;
      if (!cuentas[key]) cuentas[key] = { cuenta: key, nombre: l.nombre || key, debe: 0, haber: 0, movimientos: 0 };
      cuentas[key].debe += l.debe || 0;
      cuentas[key].haber += l.haber || 0;
      cuentas[key].movimientos++;
      cuentas[key].saldo = Math.round((cuentas[key].debe - cuentas[key].haber) * 100) / 100;
    }
  }
  return Object.values(cuentas).sort((a, b) => a.cuenta.localeCompare(b.cuenta));
}

/** Estado financiero básico de una entidad */
export async function estadoFinanciero(entidad_eip) {
  const mayor = await libroMayor(entidad_eip);
  const totalDebe = mayor.reduce((s, c) => s + c.debe, 0);
  const totalHaber = mayor.reduce((s, c) => s + c.haber, 0);
  const activo = mayor.filter(c => ['100', '200', '210', '300', '430', '440', '472', '570', '572'].includes(c.cuenta)).reduce((s, c) => s + c.saldo, 0);
  const pasivo = mayor.filter(c => ['400', '410', '470', '475'].includes(c.cuenta)).reduce((s, c) => s + c.saldo, 0);
  const ingresos = mayor.filter(c => /^[47][0-9]/.test(c.cuenta) && c.haber > 0 && !['400', '410', '470', '475'].includes(c.cuenta)).reduce((s, c) => s + c.haber, 0);
  const gastos = mayor.filter(c => /^[0-6]/.test(c.cuenta) && c.debe > 0 && !['100', '110', '120', '113'].includes(c.cuenta)).reduce((s, c) => s + c.debe, 0);
  return { entidad_eip, totalDebe, totalHaber, activo, pasivo, ingresos, gastos, resultado: Math.round((ingresos - gastos) * 100) / 100, numAsientos: (await listarAsientos({ entidad_eip })).length };
}

/** Estado consolidado de TODA la contabilidad (todas las entidades) */
export async function estadoContabilidad() {
  const asientos = await listarAsientos();
  let total_debe = 0, total_haber = 0, ingresos = 0, gastos = 0, activo = 0, pasivo = 0;
  for (const a of asientos) {
    total_debe += a.total_debe || 0;
    total_haber += a.total_haber || 0;
  }
  // Consolidar libro mayor de cada entidad única
  const eips = [...new Set(asientos.map(a => a.entidad_eip).filter(Boolean))];
  for (const eip of eips) {
    const fin = await estadoFinanciero(eip);
    ingresos += fin.ingresos;
    gastos += fin.gastos;
    activo += fin.activo;
    pasivo += fin.pasivo;
  }
  return {
    total_asientos: asientos.length,
    total_debe: Math.round(total_debe * 100) / 100,
    total_haber: Math.round(total_haber * 100) / 100,
    ingresos: Math.round(ingresos * 100) / 100,
    gastos: Math.round(gastos * 100) / 100,
    activo: Math.round(activo * 100) / 100,
    pasivo: Math.round(pasivo * 100) / 100,
    resultado: Math.round((ingresos - gastos) * 100) / 100,
    entidades: eips.length,
  };
}

export default {
  initPlanContable, listarPlanContable, crearCuenta,
  listarAsientos, getAsiento, crearAsiento, libroMayor, estadoFinanciero, estadoContabilidad, PLAN_BASE,
};
