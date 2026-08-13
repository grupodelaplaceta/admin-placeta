/* Motor fiscal (BFF): IRM/IGF reales según CNIC, calculados en vivo desde el
   estado del banco. Sustituye al seed del SPA cuando se usa el API. */

// Escalas REALES del BOP (CNIC).
const IGF_PF = [
  { hasta: 5000, tipo: 0 },
  { hasta: 20000, tipo: 0.10 },
  { hasta: 500000, tipo: 0.30 },
  { hasta: Infinity, tipo: 0.30 },
];
const IGF_EMPRESA = [
  { hasta: 5000, tipo: 0 },
  { hasta: 20000, tipo: 0.05 },
  { hasta: 500000, tipo: 0.35 },
  { hasta: Infinity, tipo: 0.85 },
];
// IRM por IA (incremento de activos): CNIC-IRM-PARTICULAR/EMPRESA tramos 0..4.
const IRM_PF = [
  { hasta: 0, tipo: 0 },
  { hasta: 5000, tipo: 0.005 },
  { hasta: 20000, tipo: 0.015 },
  { hasta: 50000, tipo: 0.04 },
  { hasta: Infinity, tipo: 0.06 },
];
const IRM_EMPRESA = [
  { hasta: 0, tipo: 0 },
  { hasta: 5000, tipo: 0.0075 },
  { hasta: 20000, tipo: 0.02 },
  { hasta: 50000, tipo: 0.05 },
  { hasta: Infinity, tipo: 0.09 },
];

// Movimientos que computan IA (incremento de activos gravable por IRM).
const KIND_INGRESO = new Set([
  'Retribucion', 'PayrollLoan', 'Dividend', 'SavingsInterest', 'Subsidy',
  'WelcomeBonus', 'Rbu', 'LotteryPrize', 'Allowance', 'Gift', 'InvestmentSell',
  'Placezum', 'Donation', 'MonetaryEmission',
]);

function round2(n) { return Math.round(n * 100) / 100; }

function cuotaEscalonada(importe, escala) {
  let restante = Math.max(0, importe);
  let cuota = 0;
  let prev = 0;
  for (const t of escala) {
    const tramo = Math.max(0, Math.min(restante, t.hasta - prev));
    cuota += tramo * t.tipo;
    restante -= tramo;
    prev = t.hasta;
    if (restante <= 0) break;
  }
  return round2(cuota);
}

const ES_SISTEMA = /^(TGLP|AGLDP|CAPITALIA_BANK|VAULT_EMISION|DIP-|sys-|biz-market-)/;
const DIP_VALIDO = /^[XYZ0-9][0-9]{7,8}[A-Z]$/;

// Mapa empresa → EIP (del censo; completar con el censo real de Supabase).
const EIP_POR_NOMBRE = {
  'Unhiro S.PV.': 'EIP-XJETNL',
  'Red del Grupo de La Placeta S.P.': 'EIP-X4NGQU',
  'Placeta Telecom S.P.': 'EIP-X4NGQU', // pendiente de confirmar en censo
};

function esEmpresa(acc) {
  return (acc.type || '').toLowerCase() === 'business' || (acc.type || '').toLowerCase() === 'state';
}

function agruparPatrimonio(state) {
  const personas = new Map(); // dip -> { nombre, patrimonio }
  const empresas = new Map(); // eip -> { nombre, patrimonio }
  for (const acc of state.accounts || []) {
    const id = acc.id || '';
    if (ES_SISTEMA.test(id)) continue;
    const saldo = Number(acc.balancePz || 0);
    const nombre = (acc.displayName || acc.name || '').replace(/\s*\(.*\)\s*$/, '').trim();
    if (esEmpresa(acc)) {
      const eip = EIP_POR_NOMBRE[nombre];
      if (!eip) continue;
      const e = empresas.get(eip) || { nombre, patrimonio: 0 };
      e.patrimonio += saldo;
      empresas.set(eip, e);
    } else {
      const dip = (acc.placetaId || acc.ownerPlacetaId || '').toUpperCase();
      if (!DIP_VALIDO.test(dip)) continue;
      const p = personas.get(dip) || { nombre, patrimonio: 0 };
      p.patrimonio += saldo;
      personas.set(dip, p);
    }
  }
  return { personas, empresas };
}

function agregarIA(state) {
  const ia = new Map(); // clave (dip | eip) -> incremento de activos
  for (const t of state.transactions || []) {
    if (t.status && String(t.status).toLowerCase() !== 'settled') continue;
    const toId = t.toAccountId || t.toIban || '';
    const acc = (state.accounts || []).find((a) => (a.id || a.iban || '') === toId);
    if (!acc) continue;
    const tipo = t.kind || t.concept || '';
    if (!KIND_INGRESO.has(tipo)) continue;
    const importe = Number(t.amountPz || t.netAmount || 0);
    if (importe <= 0) continue;
    if (esEmpresa(acc)) {
      const nombre = (acc.displayName || acc.name || '').replace(/\s*\(.*\)\s*$/, '').trim();
      const eip = EIP_POR_NOMBRE[nombre];
      if (!eip) continue;
      ia.set(eip, (ia.get(eip) || 0) + importe);
    } else {
      const dip = (acc.placetaId || acc.ownerPlacetaId || '').toUpperCase();
      if (!DIP_VALIDO.test(dip)) continue;
      ia.set(dip, (ia.get(dip) || 0) + importe);
    }
  }
  return ia;
}

export function calcularContribuyentes(state) {
  const { personas, empresas } = agruparPatrimonio(state);
  const ia = agregarIA(state);
  const out = [];
  for (const [dip, p] of personas) {
    const incremento = ia.get(dip) || 0;
    out.push({
      id: dip, nombre: p.nombre, tipo: 'persona',
      patrimonio: round2(p.patrimonio),
      incrementoActivos: round2(incremento),
      cuotaIrm: cuotaEscalonada(incremento, IRM_PF),
      cuotaIgf: cuotaEscalonada(p.patrimonio, IGF_PF),
      ivaExento: false,
    });
  }
  for (const [eip, e] of empresas) {
    const incremento = ia.get(eip) || 0;
    out.push({
      id: eip, nombre: e.nombre, tipo: 'empresa',
      patrimonio: round2(e.patrimonio),
      incrementoActivos: round2(incremento),
      cuotaIrm: cuotaEscalonada(incremento, IRM_EMPRESA),
      cuotaIgf: cuotaEscalonada(e.patrimonio, IGF_EMPRESA),
      ivaExento: true, // B2B: las empresas no soportan IVA entre sí (CNIC).
    });
  }
  return out.sort((a, b) => b.patrimonio - a.patrimonio);
}

export function calcularReconciliacion(state) {
  const lista = calcularContribuyentes(state);
  return {
    contribuyentes: lista,
    cuentas: (state.accounts || []).length,
    movimientos: (state.transactions || []).length,
    totalCuotaIrm: round2(lista.reduce((s, c) => s + c.cuotaIrm, 0)),
    totalCuotaIgf: round2(lista.reduce((s, c) => s + c.cuotaIgf, 0)),
    totalPatrimonio: round2(lista.reduce((s, c) => s + c.patrimonio, 0)),
  };
}
