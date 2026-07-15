/**
 * NORMATIVA FISCAL GDLP — Cálculos oficiales
 * Basado en el Capítulo IV: Banca, Capital e Impuestos
 */
import { apiBancoGetState } from './db.js';

// ── Art. 4.1 — Límites de Capital ────────────────────────────────────────
export const LIMITES_CAPITAL = {
  Personal: { max: 500000, multa: 225000, label: 'Cuenta personal/particular' },
  Business: { max: 10000000, multa: null, label: 'Cuenta empresarial/estatal' },
  Savings: { max: 500000, multa: 225000, label: 'Cuenta ahorro' },
  Current: { max: 500000, multa: 225000, label: 'Cuenta corriente' },
  Child: { max: 5000, multa: null, label: 'Cuenta infantil' },
};

export function verificarLimiteCapital(cuenta) {
  const limite = LIMITES_CAPITAL[cuenta.type] || LIMITES_CAPITAL.Personal;
  if (!limite) return null;
  const saldo = cuenta.balancePz || 0;
  if (saldo > limite.max) {
    return {
      tipo: 'EXCESO_CAPITAL',
      gravedad: 'alta',
      cuenta: cuenta.id,
      saldo,
      limite: limite.max,
      exceso: saldo - limite.max,
      sancion: limite.multa,
      mensaje: `Saldo ${saldo.toLocaleString()} Pz supera límite de ${limite.max.toLocaleString()} Pz`
    };
  }
  return null;
}

// ── Art. 4.2 — Saldos Negativos (Descubiertos) ───────────────────────────
export function calcularSancionDescubierto(cuenta) {
  const saldo = cuenta.balancePz || 0;
  if (saldo >= 0) return null;
  
  const diasNegativo = cuenta.diasEnNegativo || 
    Math.ceil((Date.now() - new Date(cuenta.negativeSince || cuenta.createdAt).getTime()) / 86400000);
  
  const sanciones = [];
  if (diasNegativo >= 6) sanciones.push({ concepto: 'Sanción día 6+', importe: 25000, dias: diasNegativo });
  if (diasNegativo >= 30) sanciones.push({ concepto: 'Sanción día 30+ (acumulada)', importe: 125000, dias: diasNegativo });
  
  return {
    tipo: 'SALDO_NEGATIVO',
    saldo,
    diasNegativo,
    sanciones,
    totalSancion: sanciones.reduce((s, x) => s + x.importe, 0),
    riesgoDisciplinario: diasNegativo > 60,
    mensaje: `Saldo negativo de ${Math.abs(saldo).toLocaleString()} Pz durante ${diasNegativo} días`
  };
}

// ── Art. 4.3 — Tasa de Transferencia (máx 12%) ───────────────────────────
const TASA_TRANSFERENCIA = 0.12; // 12% máximo

export function calcularTasaTransferencia(importe, tasaPersonalizada) {
  const tasa = tasaPersonalizada || TASA_TRANSFERENCIA;
  return Math.min(importe * tasa, importe * 0.12); // Nunca más del 12%
}

// ── Art. 4.4 — IVA 12% ───────────────────────────────────────────────────
const IVA = 0.12;
export function calcularIVA(base) { return base * IVA; }

// ── Art. 4.5 — Cotizaciones Laborales ────────────────────────────────────
export function calcularCotizaciones(sueldoBruto) {
  let tipoEmpresa, tipoTrabajador;
  if (sueldoBruto <= 1700) {
    tipoEmpresa = 0.075; tipoTrabajador = 0.075;
  } else if (sueldoBruto <= 3000) {
    tipoEmpresa = 0.105; tipoTrabajador = 0.105;
  } else {
    tipoEmpresa = 0.175; tipoTrabajador = 0.175;
  }
  return {
    sueldoBruto,
    cotizacionEmpresa: sueldoBruto * tipoEmpresa,
    cotizacionTrabajador: sueldoBruto * tipoTrabajador,
    totalRetencion: sueldoBruto * (tipoEmpresa + tipoTrabajador),
    tipoEmpresa: (tipoEmpresa * 100) + '%',
    tipoTrabajador: (tipoTrabajador * 100) + '%',
    totalPorcentaje: ((tipoEmpresa + tipoTrabajador) * 100) + '%',
    sueldoNeto: sueldoBruto * (1 - tipoTrabajador)
  };
}

// ── Art. 4.7 — SMI (150 Pz) y Salario Máximo (1.750 Pz) ─────────────────
export const SMI = 150;
export const SALARIO_MAXIMO = 1750;

export function validarSalario(sueldo) {
  const issues = [];
  if (sueldo < SMI) issues.push({ tipo: 'BAJO_SMI', mensaje: `Salario ${sueldo} Pz inferior al SMI (${SMI} Pz)` });
  if (sueldo > SALARIO_MAXIMO) issues.push({ tipo: 'EXCESO_SALARIO', mensaje: `Salario ${sueldo} Pz superior al máximo (${SALARIO_MAXIMO} Pz)` });
  return issues;
}

// ── Art. 4.8 a 4.11 — IRM (Impuesto de Regulación Monetaria) ────────────
export function calcularPatrimonioMedio(saldosDiarios) {
  if (!saldosDiarios || saldosDiarios.length === 0) return 0;
  return saldosDiarios.reduce((s, v) => s + v, 0) / saldosDiarios.length;
}

export function calcularIA(mediaIngresos, mediaPagos, patrimonioMedio) {
  if (patrimonioMedio <= 0) return 0;
  return (mediaIngresos - mediaPagos) / patrimonioMedio;
}

const ESCALA_IRM = {
  personal: [
    { max: 0, tipo: 0 },
    { max: 0.05, tipo: 0.005 },
    { max: 0.15, tipo: 0.015 },
    { max: 0.30, tipo: 0.03 },
    { max: Infinity, tipo: 0.05 },
  ],
  compartida: [
    { max: 0, tipo: 0 },
    { max: 0.05, tipo: 0.0075 },
    { max: 0.15, tipo: 0.02 },
    { max: 0.30, tipo: 0.04 },
    { max: Infinity, tipo: 0.06 },
  ],
  empresa: [
    { max: 0, tipo: 0 },
    { max: 0.05, tipo: 0.01 },
    { max: 0.15, tipo: 0.03 },
    { max: 0.30, tipo: 0.06 },
    { max: Infinity, tipo: 0.09 },
  ],
};

export function getEscalaIRM(tipoCuenta) {
  if (tipoCuenta === 'Business') return ESCALA_IRM.empresa;
  if (tipoCuenta === 'Shared' || tipoCuenta === 'Joint') return ESCALA_IRM.compartida;
  return ESCALA_IRM.personal;
}

export function calcularIRM(ia, tipoCuenta) {
  const escala = getEscalaIRM(tipoCuenta);
  for (const tramo of escala) {
    if (ia <= tramo.max) {
      return tramo.tipo;
    }
  }
  return escala[escala.length - 1].tipo;
}

// ── Art. 4.12 a 4.16 — IGF (Impuesto de Grandes Fortunas) ───────────────
const ESCALA_IGF_PERSONAL = [
  { max: 5000, tipo: 0, label: 'Primeros 5.000 Pz' },
  { max: 20000, tipo: 0.10, label: 'De 5.001 a 20.000 Pz', base: 5000 },
  { max: 500000, tipo: 0.30, label: 'De 20.001 a 500.000 Pz', base: 20000 },
];

const ESCALA_IGF_EMPRESA = [
  { max: 5000, tipo: 0, label: 'Primeros 5.000 Pz' },
  { max: 20000, tipo: 0.05, label: 'De 5.001 a 20.000 Pz', base: 5000 },
  { max: 500000, tipo: 0.35, label: 'De 20.001 a 500.000 Pz', base: 20000 },
  { max: Infinity, tipo: 0.85, label: 'Más de 500.000 Pz', base: 500000 },
];

export function calcularIGF(patrimonioMedio, tipoCuenta, esEmpresaPequeña = false) {
  // Art. 4.15: Empresas pequeñas (< 20.000 Pz) exentas
  if (tipoCuenta === 'Business' && esEmpresaPequeña) {
    return { total: 0, exento: true, motivo: 'Empresa reducida dimensión (< 20.000 Pz)' };
  }

  const escala = tipoCuenta === 'Business' ? ESCALA_IGF_EMPRESA : ESCALA_IGF_PERSONAL;
  let total = 0;
  const tramos = [];

  for (const tramo of escala) {
    if (patrimonioMedio <= tramo.max) {
      const baseImponible = tramo.base !== undefined 
        ? Math.max(0, patrimonioMedio - tramo.base)
        : Math.min(patrimonioMedio, tramo.max);
      const cuota = baseImponible * tramo.tipo;
      if (cuota > 0) {
        tramos.push({ label: tramo.label, base: baseImponible, tipo: tramo.tipo, cuota });
      }
      total += cuota;
      break;
    } else if (tramo.base !== undefined) {
      const baseImponible = tramo.max - tramo.base;
      const cuota = baseImponible * tramo.tipo;
      tramos.push({ label: tramo.label, base: baseImponible, tipo: tramo.tipo, cuota });
      total += cuota;
    }
  }

  return { total: Math.round(total * 100) / 100, tramos, exento: false };
}

// ── Calcular todos los impuestos de una cuenta ───────────────────────────
export async function calcularImpuestosCuenta(cuenta, historialSaldos) {
  const saldo = cuenta.balancePz || 0;
  const tipo = cuenta.type || 'Personal';
  const patrimonioMedio = calcularPatrimonioMedio(historialSaldos || [saldo]);
  const esEmpresaPequeña = tipo === 'Business' && patrimonioMedio < 20000;

  const resultados = {
    cuenta: cuenta.id,
    tipo,
    saldoActual: saldo,
    patrimonioMedio: Math.round(patrimonioMedio * 100) / 100,
    limiteCapital: verificarLimiteCapital(cuenta),
    descubierto: calcularSancionDescubierto(cuenta),
    cotizaciones: null,
    irm: null,
    igf: null,
  };

  // IRM
  if (patrimonioMedio > 0) {
    const ia = calcularIA(
      (cuenta.mediaIngresos || saldo * 0.3),
      (cuenta.mediaPagos || saldo * 0.2),
      patrimonioMedio
    );
    const tipoIRM = calcularIRM(ia, tipo);
    const cuotaIRM = patrimonioMedio * tipoIRM;
    resultados.irm = {
      ia: Math.round(ia * 10000) / 10000,
      tipo: (tipoIRM * 100).toFixed(2) + '%',
      cuota: Math.round(cuotaIRM * 100) / 100,
    };
  }

  // IGF
  resultados.igf = calcularIGF(patrimonioMedio, tipo, esEmpresaPequeña);

  return resultados;
}

export default {
  LIMITES_CAPITAL,
  verificarLimiteCapital,
  calcularSancionDescubierto,
  calcularTasaTransferencia,
  calcularIVA,
  calcularCotizaciones,
  validarSalario,
  calcularPatrimonioMedio,
  calcularIA,
  calcularIRM,
  calcularIGF,
  calcularImpuestosCuenta,
  SMI,
  SALARIO_MAXIMO,
};
