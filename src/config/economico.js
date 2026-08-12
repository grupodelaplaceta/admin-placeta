/**
 * DASHBOARD ECONÓMICO DEL GRUPO — FASE 22
 *
 * Visión consolidada del ecosistema:
 *   Liquidez · Ingresos · Gastos · Impuestos · Nóminas · Patrimonio ·
 *   Ayudas · Educación · Junior · Fundación · Resultado
 *
 * Filtros: Grupo | Entidad | Departamento | Proyecto | Periodo
 *
 * Consolida datos de: Banco, Contabilidad, Facturas, Nóminas, Tributos,
 * Fundación, Fiscalidad ampliada, Comprobación y Patrimonio.
 */

import { apiBancoGetState } from './db.js';
import { estadoContabilidad } from './contabilidad.js';
import { estadoFacturacion } from './facturacion.js';
import { estadoNominas } from './nominas.js';
import { estadoFundacion } from './fundacion.js';
import { estadoFiscalidadAmpliada } from './fiscalidad-ampliada.js';
import { estadoComprobacion } from './comprobacion.js';

/**
 * Reúne el panorama económico completo del grupo.
 * @returns {object} bloque con todos los indicadores consolidados
 */
export async function obtenerPanoramaEconomico() {
  const [bancoState, contab, fact, nom, fund, fisc, comp] = await Promise.all([
    apiBancoGetState(),
    estadoContabilidad(),
    estadoFacturacion(),
    estadoNominas(),
    estadoFundacion(),
    estadoFiscalidadAmpliada(),
    estadoComprobacion(),
  ]);

  // ── Banco ──────────────────────────────────────────────────────────
  const cuentas = bancoState?.accounts || [];
  const transacciones = bancoState?.transactions || [];
  const cuentasEmpresa = cuentas.filter(c => ['Business', 'State'].includes(c.type));
  const cuentasPersonales = cuentas.filter(c => !['Business', 'State'].includes(c.type));
  const saldoLiquidez = cuentas.reduce((s, c) => s + (c.balancePz || 0), 0);
  const saldoEmpresas = cuentasEmpresa.reduce((s, c) => s + (c.balancePz || 0), 0);
  const saldoPersonas = cuentasPersonales.reduce((s, c) => s + (c.balancePz || 0), 0);
  const ingresosBanco = transacciones.filter(t => (t.amountPz || 0) > 0 && t.status !== 'Reversed').reduce((s, t) => s + (t.amountPz || 0), 0);
  const gastosBanco = Math.abs(transacciones.filter(t => (t.amountPz || 0) < 0 && t.status !== 'Reversed').reduce((s, t) => s + (t.amountPz || 0), 0));

  // ── Impuestos estimados (retenciones + cotizaciones + desgravaciones) ──
  const impuestos = {
    retencionesNominas: nom?.totalRetenciones || 0,
    cotizacionesEmpresa: nom?.totalCotizacionEmpresa || 0,
    iva: fact?.totalIVA || 0,
    desgravaciones: fisc?.desgravaciones?.totalCuantia || 0,
    retribuciones: fisc?.retribuciones?.totalMensual || 0,
  };
  impuestos.neto = Math.round((impuestos.retencionesNominas + impuestos.iva - impuestos.desgravaciones) * 100) / 100;

  // ── Resultado del grupo ────────────────────────────────────────────
  const resultado = {
    ingresos: Math.round(((ingresosBanco || 0) + (fact?.totalFacturado || 0) + (fund?.totalConcedido || 0)) * 100) / 100,
    gastos: Math.round(((gastosBanco || 0) + (contab?.total_gastos || 0) + (nom?.totalNeto || 0)) * 100) / 100,
  };
  resultado.balance = Math.round((resultado.ingresos - resultado.gastos) * 100) / 100;

  return {
    fecha: new Date().toISOString(),
    liquidez: {
      total: Math.round(saldoLiquidez * 100) / 100,
      empresas: Math.round(saldoEmpresas * 100) / 100,
      personas: Math.round(saldoPersonas * 100) / 100,
      cuentas: cuentas.length,
      operaciones: transacciones.length,
    },
    ingresos: { banco: Math.round(ingresosBanco * 100) / 100, facturado: fact?.totalFacturado || 0, concedido: fund?.totalConcedido || 0 },
    gastos: { banco: Math.round(gastosBanco * 100) / 100, contabilidad: contab?.total_gastos || 0, nominas: nom?.totalNeto || 0 },
    impuestos,
    nominas: { total: nom?.total || 0, pagadas: nom?.pagadas || 0, neto: nom?.totalNeto || 0, retenciones: nom?.totalRetenciones || 0, cotizacionEmpresa: nom?.totalCotizacionEmpresa || 0 },
    patrimonio: { activosContables: contab?.total_activo || 0, bloqueos500k: fisc?.limite500k?.bloqueadas || 0 },
    ayudas: { solicitudes: fund?.solicitudes || 0, concedidas: fund?.concedidas || 0, pagadas: fund?.pagadas || 0, totalConcedido: fund?.totalConcedido || 0, programas: fund?.programas || 0 },
    junior: {
      campanas: fund?.campanas || 0,
      campanasActivas: fund?.campanasActivas || 0,
      desviadoCampanas: fund?.desviadoCampanas || 0,
    },
    fundacion: {
      presupuesto: fund?.presupuestoProgramas || 0,
      desviado: fund?.desviadoCampanas || 0,
    },
    contabilidad: {
      asientos: contab?.total_asientos || 0,
      totalDebe: contab?.total_debe || 0,
      totalHaber: contab?.total_haber || 0,
      ingresos: contab?.total_ingresos || 0,
      gastos: contab?.total_gastos || 0,
      resultado: contab?.resultado || 0,
    },
    comprobacion: {
      total: comp?.total || 0,
      ok: comp?.ok || 0,
      diferencia: comp?.diferencia || 0,
      inconsistencia: comp?.inconsistencia || 0,
    },
    resultado,
  };
}

/** Resultado por entidad (para el filtro de entidad en el dashboard) */
export async function resultadoPorEntidad() {
  const pan = await obtenerPanoramaEconomico();
  const estadoBanco = await apiBancoGetState();
  const porEntidad = {};

  const entidades = {
    banco: { icono: '🏦', nombre: 'Banco de La Placeta' },
    tributos: { icono: '📊', nombre: 'Tributos' },
    junta: { icono: '⚖️', nombre: 'Junta' },
    administracion: { icono: '📋', nombre: 'Administración' },
    rsp: { icono: '🌐', nombre: 'RSP' },
    junior: { icono: '🧒', nombre: 'Placeta Junior' },
    fundacion: { icono: '🏛️', nombre: 'Fundación' },
  };

  const cuentas = estadoBanco?.accounts || [];
  // IBAN por entidad (aprox) — se puede afinar con el registro de cuentas
  for (const [id, meta] of Object.entries(entidades)) {
    porEntidad[id] = {
      ...meta,
      saldo: 0,
      cuentas: 0,
    };
  }
  // Agrupar cuentas por EIP/placetaId si coincide con entidad conocida; el resto a "otras"
  porEntidad['otras'] = { icono: '🏗️', nombre: 'Otras / sin clasificar', saldo: 0, cuentas: 0 };
  for (const c of cuentas) {
    const txt = `${c.type || ''} ${c.displayName || ''} ${c.iban || ''} ${c.placetaId || ''}`.toLowerCase();
    let asignada = 'otras';
    if (/junior|child|capitalia/i.test(txt)) asignada = 'junior';
    else if (/fundaci|rbu|social/i.test(txt)) asignada = 'fundacion';
    else if (/tributos|trb/i.test(txt)) asignada = 'tributos';
    else if (/junta/i.test(txt)) asignada = 'junta';
    else if (/administraci|agldp/i.test(txt)) asignada = 'administracion';
    else if (/rsp|red de servicios/i.test(txt)) asignada = 'rsp';
    else if (/banco|gdlp-ap9/i.test(txt) || c.type === 'Business' || c.type === 'State') asignada = 'banco';
    porEntidad[asignada].saldo += c.balancePz || 0;
    porEntidad[asignada].cuentas += 1;
  }

  return {
    total: pan.liquidez.total,
    porEntidad: Object.values(porEntidad).map(e => ({ ...e, saldo: Math.round(e.saldo * 100) / 100 })),
  };
}

export default {
  obtenerPanoramaEconomico,
  resultadoPorEntidad,
};
