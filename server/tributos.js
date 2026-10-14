/* Motor fiscal (BFF): IRM/IGF reales según CNIC, calculados en vivo desde el
   estado del banco. Sustituye al seed del SPA cuando se usa el API. */
import { ventasDelMes, tipoIvaDesdeCnic } from './facturacion.js';

// ── Escalas según el BOP (CNIC, CNI-IV § 7) ────────────────────────────
// IRM (Art. 4.8-4.11): base imponible = patrimonio medio; el tipo lo fija el
// Índice de Acumulación IA = (ingresos − pagos) / patrimonio medio (Art. 4.9).
const IA_TRAMOS = [0.05, 0.15, 0.30]; // ratios de IA: 5 %, 15 %, 30 %
// Tipos IRM por tramo IA (0..4). CNIC vigentes del BOP.
const IRM_PARTICULAR = [0, 0.005, 0.015, 0.04, 0.06]; // 0 / 0,5 / 1,5 / 4 / 6 %
const IRM_COMPARTIDA = [0, 0, 0.01, 0.03, 0.06];      // 0 / 0 / 1 / 3 / 6 %
const IRM_EMPRESA = [0, 0.0075, 0.02, 0.05, 0.09];    // 0 / 0,75 / 2 / 5 / 9 %

// IGF (Art. 4.13-4.14): primeros 5.000 Pz exentos; progresivo por tramos.
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
const IGF_EXENTO = 5000; // tramo exento común (Art. 4.13/4.14/4.16)
const IGF_EMPRESA_UMBRAL_REDUCIDA = 20000; // Art. 4.15: exención IGF ≤ 20.000 Pz

// Lee un valor CNIC del BOP; si no existe o no es numérico, usa el fallback.
function cnicValor(cnic, codigo, fallback) {
  const r = (cnic || []).find((x) => x.codigo === codigo);
  const v = r != null && r.valor !== undefined && r.valor !== null ? Number(r.valor) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

// Construye las escalas con los CNIC vigentes del BOP (tabla bop_cnic).
function escalasDesdeCnic(cnic) {
  const tiposIrm = (prefijo, fb) => {
    const out = [];
    for (let i = 0; i <= 4; i++) out.push(cnicValor(cnic, `${prefijo}-${i}`, fb[i]) / 100);
    return out;
  };
  const escalaIgf = (prefijo, fbTramos, fbTipos, codigoTop, fbTop) => {
    const tr = [1, 2, 3].map((i) => cnicValor(cnic, `${prefijo}-TRAMO-${i}`, fbTramos[i - 1]));
    const tp = [1, 2, 3].map((i) => cnicValor(cnic, `${prefijo}-TIPO-${i}`, fbTipos[i - 1]) / 100);
    return [
      { hasta: tr[0], tipo: tp[0] },
      { hasta: tr[1], tipo: tp[1] },
      { hasta: tr[2], tipo: tp[2] },
      { hasta: Infinity, tipo: cnicValor(cnic, codigoTop, fbTop) / 100 },
    ];
  };
  return {
    irmParticular: tiposIrm('CNIC-IRM-PARTICULAR', IRM_PARTICULAR),
    irmCompartida: tiposIrm('CNIC-IRM-COMPARTIDA', IRM_COMPARTIDA),
    irmEmpresa: tiposIrm('CNIC-IRM-EMPRESA', IRM_EMPRESA),
    iaTramos: [
      cnicValor(cnic, 'CNIC-IA-TRAMO-2', 5),
      cnicValor(cnic, 'CNIC-IA-TRAMO-3', 15),
      cnicValor(cnic, 'CNIC-IA-TRAMO-4', 30),
    ].map((v) => v / 100),
    igfPf: escalaIgf('CNIC-IGF-PF', [5000, 20000, 500000], [0, 10, 30], 'CNIC-IGF-PF-TIPO-3', 30),
    igfEmpresa: escalaIgf('CNIC-IGF-EMPRESA', [5000, 20000, 500000], [0, 5, 35], 'CNIC-IGF-EMPRESA-TIPO-4', 85),
    igfUmbralReducida: cnicValor(cnic, 'CNIC-IGF-EMPRESA-REDUCIDA-UMBRAL', IGF_EMPRESA_UMBRAL_REDUCIDA),
    // Topes de capital que fijan la inhibición fiscal (CNI Art. 4.1).
    topePersona: cnicValor(cnic, 'CNIC-LIMITE-CAPITAL-PERSONAL', TOPE_PERSONA),
    topeEmpresa: cnicValor(cnic, 'CNIC-LIMITE-CAPITAL-INSTITUCIONAL', TOPE_EMPRESA),
  };
}

// Índice del tramo IA (0..4) según el ratio de acumulación.
function indiceTramoIA(ia, tramos) {
  if (!(ia > 0)) return 0;
  for (let i = 0; i < tramos.length; i++) if (ia <= tramos[i]) return i + 1;
  return tramos.length + 1;
}

function round2(n) { return Math.round(n * 100) / 100; }

function cuotaEscalonadaDetalle(importe, escala) {
  let restante = Math.max(0, importe);
  let cuota = 0;
  let prev = 0;
  const tramos = [];
  for (const t of escala) {
    const base = Math.max(0, Math.min(restante, t.hasta - prev));
    const cuotaTramo = round2(base * t.tipo);
    tramos.push({
      desde: round2(prev),
      hasta: t.hasta === Infinity ? null : round2(t.hasta),
      tipoPct: round2(t.tipo * 100),
      base: round2(base),
      cuota: cuotaTramo,
    });
    cuota += cuotaTramo;
    restante -= base;
    prev = t.hasta;
    if (restante <= 0) break;
  }
  return { cuota: round2(cuota), tramos };
}

function cuotaEscalonada(importe, escala) {
  return cuotaEscalonadaDetalle(importe, escala).cuota;
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

// EIP real de la cuenta (campo `eip` del banco) con fallback al mapa por nombre.
function eipDeAcc(acc, nombre) {
  return ((acc.eip || '').toUpperCase()) || EIP_POR_NOMBRE[nombre] || '';
}

function agruparPatrimonio(state) {
  const personas = new Map(); // dip -> { nombre, patrimonio, cuentas }
  const empresas = new Map(); // eip -> { nombre, patrimonio, cuentas }
  for (const acc of state.accounts || []) {
    const id = acc.id || '';
    if (ES_SISTEMA.test(id)) continue;
    const saldo = Number(acc.balancePz || 0);
    const nombre = (acc.displayName || acc.name || '').replace(/\s*\(.*\)\s*$/, '').trim();
    const cuenta = { id, nombre, saldo: round2(saldo) };
    if (esEmpresa(acc)) {
      const eip = eipDeAcc(acc, nombre);
      if (!eip) continue;
      const e = empresas.get(eip) || { nombre, patrimonio: 0, cuentas: [] };
      e.patrimonio += saldo;
      e.cuentas.push(cuenta);
      empresas.set(eip, e);
    } else {
      const dip = (acc.placetaId || acc.ownerPlacetaId || '').toUpperCase();
      if (!DIP_VALIDO.test(dip)) continue;
      const p = personas.get(dip) || { nombre, patrimonio: 0, cuentas: [] };
      p.patrimonio += saldo;
      p.cuentas.push(cuenta);
      personas.set(dip, p);
    }
  }
  return { personas, empresas };
}

// Flujos externos del mes de las cuentas de un contribuyente.
// ingresos = entradas desde cuentas ajenas; pagos = salidas hacia cuentas
// ajenas. Las transferencias entre cuentas propias se ignoran (no suman IA).
function flujosDelMes(state, ids, mes) {
  const idsSet = new Set(ids);
  let ingresos = 0;
  let pagos = 0;
  const movimientos = [];
  for (const t of state.transactions || []) {
    if (t.status && String(t.status).toLowerCase() !== 'settled') continue;
    const dia = (t.createdAt || t.timestamp || '').slice(0, 10);
    if (dia && !dia.startsWith(mes)) continue;
    const from = t.fromAccountId || t.fromIban || '';
    const to = t.toAccountId || t.toIban || '';
    const importe = Number(t.amountPz || t.netAmount || 0);
    if (!(importe > 0)) continue;
    const dePropia = idsSet.has(from);
    const aPropia = idsSet.has(to);
    if (aPropia && !dePropia) {
      ingresos += importe;
      movimientos.push({ id: t.id, kind: t.kind || t.concept || 'Transferencia', concepto: t.concept || t.kind || '', importe: round2(importe) });
    } else if (dePropia && !aPropia) {
      pagos += importe;
    }
  }
  movimientos.sort((a, b) => b.importe - a.importe);
  return { ingresos: round2(ingresos), pagos: round2(pagos), movimientos };
}

const TOPE_PERSONA = 500000;
const TOPE_EMPRESA = 10000000;

// ── Reconstrucción de saldos diarios (base del IRM/IGF de declaraciones) ─
// Si no hay saldos históricos guardados, el patrimonio medio se reconstruye
// día a día a partir del saldo actual y de las transacciones de la persona.
function movimientosNetosPorDia(state, ids) {
  const porDia = new Map(); // 'YYYY-MM-DD' -> neto
  for (const t of state.transactions || []) {
    if (t.status && String(t.status).toLowerCase() !== 'settled') continue;
    const from = t.fromAccountId || t.fromIban || '';
    const to = t.toAccountId || t.toIban || '';
    const fromPropia = ids.has(from);
    const toPropia = ids.has(to);
    if (!fromPropia && !toPropia) continue;
    const importe = Number(t.amountPz || t.netAmount || 0);
    const dia = (t.createdAt || t.timestamp || '').slice(0, 10);
    let net = porDia.get(dia) || 0;
    if (toPropia) net += importe;
    if (fromPropia) net -= importe;
    porDia.set(dia, net);
  }
  return porDia;
}

function reconstruirPatrimonioMedio(state, cuentas, mes) {
  const ids = new Set((cuentas || []).map((c) => c.id));
  const saldoActual = round2((cuentas || []).reduce((s, c) => s + (c.saldo || 0), 0));
  const porDia = movimientosNetosPorDia(state, ids);
  let delta = 0;
  for (const [dia, net] of porDia) {
    if (dia >= `${mes}-01`) delta += net;
  }
  const saldoInicio = round2(saldoActual - delta);
  const y = parseInt(mes.slice(0, 4), 10);
  const m = parseInt(mes.slice(5, 7), 10);
  const diasEnMes = new Date(y, m, 0).getDate();
  const hoy = new Date().toISOString().slice(0, 10);
  let saldo = saldoInicio;
  let suma = 0;
  let activos = 0;
  const serie = [];
  for (let d = 1; d <= diasEnMes; d++) {
    const diaStr = `${mes}-${String(d).padStart(2, '0')}`;
    saldo = round2(saldo + (porDia.get(diaStr) || 0));
    if (diaStr <= hoy) {
      suma += saldo;
      activos += 1;
      serie.push({ dia: diaStr, saldo });
    }
  }
  const medio = activos ? round2(suma / activos) : saldoActual;
  return { saldoInicio, saldoActual, diasActivos: activos, patrimonioMedio: medio, serie };
}

export function calcularContribuyentes(state, mes = new Date().toISOString().slice(0, 7), cnic = null) {
  const { personas, empresas } = agruparPatrimonio(state);
  const escalas = escalasDesdeCnic(cnic);
  const tipoIva = tipoIvaDesdeCnic(cnic); // CNIC-IVA vigente del BOP
  const out = [];

  function entrada(clave, datos, tipo, tiposIrm, escalaIgf, igfUmbralReducida) {
    const ids = datos.cuentas.map((c) => c.id);
    const recon = reconstruirPatrimonioMedio(state, datos.cuentas, mes);
    const fl = flujosDelMes(state, ids, mes);
    // IVA por movimientos (solo empresas): IVA repercutido en las ventas y
    // servicios cobrados en el mes (CNIC-IVA). Mismo cálculo compartido con
    // el motor de facturación central (no se duplica lógica).
    const ventas = tipo === 'empresa' ? ventasDelMes(state, ids, mes, tipoIva) : [];
    const ventasMes = round2(ventas.reduce((s, v) => s + v.base, 0));
    const ivaRepercutido = round2(ventas.reduce((s, v) => s + v.iva, 0));
    // Índice de Acumulación (Art. 4.9) y tipo IRM (Art. 4.10).
    const acumulacionNeta = round2(fl.ingresos - fl.pagos);
    const ia = recon.patrimonioMedio > 0 ? acumulacionNeta / recon.patrimonioMedio : 0;
    const tramoIA = indiceTramoIA(ia, escalas.iaTramos);
    const tipoIrm = tiposIrm[tramoIA] || 0;
    const cuotaIrm = round2(recon.patrimonioMedio * tipoIrm);
    // IGF sobre el patrimonio medio (Art. 4.8 + 4.13/4.14); exención total
    // para empresas/entidades ≤ 20.000 Pz de patrimonio medio (Art. 4.15).
    const empresaReducida = tipo === 'empresa' && recon.patrimonioMedio <= igfUmbralReducida;
    const igf = empresaReducida
      ? { cuota: 0, tramos: [] }
      : cuotaEscalonadaDetalle(recon.patrimonioMedio, escalaIgf);
    const tope = tipo === 'empresa' ? escalas.topeEmpresa : escalas.topePersona;
    const estadoFiscal = recon.saldoActual > tope ? 'inhibido' : 'al_dia';
    const iaPct = round2(ia * 100);
    return {
      id: clave,
      nombre: datos.nombre,
      tipo,
      cuentas: datos.cuentas.length,
      saldoTotalPz: round2(datos.patrimonio),
      patrimonio: round2(datos.patrimonio),
      patrimonioMedio: recon.patrimonioMedio,
      diasActivos: recon.diasActivos,
      saldoInicioMes: recon.saldoInicio,
      incrementoActivos: acumulacionNeta,
      indiceAcumulacion: iaPct,
      ingresosMes: fl.ingresos,
      pagosMes: fl.pagos,
      cuotaIrm,
      cuotaIgf: igf.cuota,
      ivaExento: tipo === 'empresa',
      igfExentoReducida: empresaReducida,
      ventasMes,
      ivaRepercutido,
      ivaSoportado: 0,
      estadoFiscal,
      ultimaDeclaracion: undefined,
      desglose: {
        irm: {
          base: recon.patrimonioMedio,
          tasa: tipoIrm,
          ia: iaPct,
          tramoIA,
          ingresos: fl.ingresos,
          pagos: fl.pagos,
          acumulacionNeta,
          escala: tipo === 'empresa' ? 'IRM empresas (CNI Art. 4.10)' : 'IRM personas (CNI Art. 4.10)',
          tramos: [
            { desde: 0, hasta: null, tipoPct: round2(tipoIrm * 100), base: round2(recon.patrimonioMedio), cuota: cuotaIrm, tramoIA, ia: iaPct },
          ],
          cuota: cuotaIrm,
        },
        igf: {
          base: recon.patrimonioMedio,
          escala: tipo === 'empresa' ? 'IGF empresas (CNI Art. 4.12-4.16)' : 'IGF personas (CNI Art. 4.12-4.16)',
          tramos: igf.tramos,
          cuota: igf.cuota,
          exentoReducida: empresaReducida,
        },
        cuentas: datos.cuentas,
        movimientos: fl.movimientos,
        saldosDiarios: { saldoInicio: recon.saldoInicio, saldoActual: recon.saldoActual, diasActivos: recon.diasActivos, patrimonioMedio: recon.patrimonioMedio, serie: recon.serie },
      },
    };
  }

  for (const [dip, p] of personas) out.push(entrada(dip, p, 'persona', escalas.irmParticular, escalas.igfPf, escalas.igfUmbralReducida));
  for (const [eip, e] of empresas) out.push(entrada(eip, e, 'empresa', escalas.irmEmpresa, escalas.igfEmpresa, escalas.igfUmbralReducida));
  return out.sort((a, b) => b.saldoTotalPz - a.saldoTotalPz);
}

export function calcularReconciliacion(state, cnic = null) {
  const lista = calcularContribuyentes(state, undefined, cnic);
  return {
    contribuyentes: lista,
    cuentas: (state.accounts || []).length,
    movimientos: (state.transactions || []).length,
    totalCuotaIrm: round2(lista.reduce((s, c) => s + c.cuotaIrm, 0)),
    totalCuotaIgf: round2(lista.reduce((s, c) => s + c.cuotaIgf, 0)),
    totalCuotaIva: round2(lista.reduce((s, c) => s + (c.ivaExento ? 0 : c.ivaRepercutido), 0)),
    totalIvaRepercutido: round2(lista.reduce((s, c) => s + c.ivaRepercutido, 0)),
    totalVentasMes: round2(lista.reduce((s, c) => s + c.ventasMes, 0)),
    totalPatrimonio: round2(lista.reduce((s, c) => s + c.saldoTotalPz, 0)),
  };
}
