/* ═══════════════════════════════════════════════════════════════════════
   rsp-web-api — Motor de FACTURACIÓN CENTRALIZADA (RSP + Banco)
   ────────────────────────────────────────────────────────────────────────
   RSP es la capa central de facturación del Grupo. Cada mes genera de
   forma AUTOMÁTICA los documentos de las empresas del Banco:

     • Recibo de Tributos   → cuota del mes (IRM + IGF) según el motor
                              fiscal (server/tributos.js) y los CNIC del BOP.
     • Facturas de venta    → ventas reales cobradas en el Banco (la
                              empresa ya recibió el dinero: factura
                              "abonada" automáticamente).
     • Facturas de servicio → servicios internos entre empresas del Grupo.

   Y gestiona el COBRO a fin de mes (recibo + aviso + cargo/domiciliación
   en la cuenta BLP) cuando un recibo no se ha abonado antes del vencimiento.

   REGLAS TRANSVERSALES (master.md):
     • No se hardcodea normativa: el tipo de IVA sale del CNIC `CNIC-IVA`
       del BOP (si el CNIC no existe, IVA = 0 y queda documentado).
     • No se inventan flujos: las cuotas proceden del motor fiscal real y
       los movimientos del estado real del banco.
     • Este módulo es PURO (no toca red). Quien ejecute un cargo lo hace a
       través de `mutarBanco` (mismo mecanismo que el resto del BFF).
   ═══════════════════════════════════════════════════════════════════════ */

// Cuentas del sistema que nunca son "clientes" ni "proveedores" reales.
const CUENTAS_SISTEMA = /^(TGLP|AGLDP|CAPITALIA_BANK|VAULT_EMISION|DIP-|sys-|biz-market-|FUND-BLP)/;
// Cuenta de tesorería/Tributos a la que las empresas pagan sus cuotas.
export const CUENTA_TRIBUTOS = 'TGLP';
// Tipos de transacción que en el banco representan un ingreso fiscal.
export const KINDS_PAGO_TRIBUTOS = new Set(['TAX', 'IRMCHARGE', 'IVAADJUSTMENT', 'LATETAXINTEREST']);

const round2 = (n) => Math.round(n * 100) / 100;

export function finalMes(mes) {
  const [y, m] = String(mes).split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m, 0));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(fecha.getUTCDate()).padStart(2, '0')}`;
}

/** Devuelve la fecha (ISO) del primer día del MES SIGUIENTE. */
export function inicioMesSiguiente(mes) {
  const [y, m] = String(mes).split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Tipo de IVA vigente (fracción) desde los CNIC del BOP. Sin CNIC → 0. */
export function tipoIvaDesdeCnic(cnic) {
  const regla = (cnic || []).find((r) => String(r.codigo || r.cnic || '').toUpperCase() === 'CNIC-IVA');
  const valor = regla != null ? Number(regla.valor ?? regla.valor_vigente ?? NaN) : NaN;
  return Number.isFinite(valor) ? valor / 100 : 0;
}

// IVA "por dentro": el importe del banco es BRUTO (IVA incluido), igual que
// en el resto de flujos (12/112). Devuelve { base, iva }.
export function desglosarBruto(bruto, tipoIva) {
  const importe = Math.max(0, Number(bruto) || 0);
  if (!(tipoIva > 0)) return { base: round2(importe), iva: 0 };
  const iva = round2(importe * tipoIva / (1 + tipoIva));
  return { base: round2(importe - iva), iva };
}

function esSettled(t) {
  return !t.status || String(t.status).toLowerCase() === 'settled';
}

function diaDe(t) {
  return (t.createdAt || t.timestamp || '').slice(0, 10);
}

function esEmpresaCuenta(acc) {
  const tipo = String(acc.type || acc.tipo || '').toLowerCase();
  return tipo === 'business' || tipo === 'state';
}

/**
 * Cuenta BLP "principal" de cada empresa (la de mayor saldo) y sus ids.
 * Acepta cuentas ya mapeadas (con `eip`) o el estado bruto (sin mapear,
 * usando el campo `eip` directo).
 */
export function cuentasPorEmpresa(stateOrCuentas) {
  const cuentas = Array.isArray(stateOrCuentas) ? stateOrCuentas : (stateOrCuentas?.accounts || []);
  const porEip = new Map(); // eip -> { cuentas: [], principal: null }
  for (const acc of cuentas) {
    if (!esEmpresaCuenta(acc)) continue;
    const id = acc.id || acc.accountId || '';
    if (!id || CUENTAS_SISTEMA.test(id)) continue;
    const eip = String(acc.eip || acc.EIP || '').toUpperCase();
    if (!eip) continue;
    const saldo = Number(acc.balancePz ?? acc.saldo ?? 0);
    let grupo = porEip.get(eip);
    if (!grupo) {
      grupo = { cuentas: [], principal: null, saldoTotal: 0, nombre: acc.displayName || acc.name || eip };
      porEip.set(eip, grupo);
    }
    grupo.saldoTotal = round2(grupo.saldoTotal + saldo);
    grupo.cuentas.push({ id, saldo });
    if (!grupo.principal || saldo > grupo.principal.saldo) {
      grupo.principal = { id, saldo };
    }
  }
  return porEip;
}

function esPagoTributos(t) {
  if (!esSettled(t)) return false;
  const kind = String(t.kind || t.tipo || '').toUpperCase();
  return KINDS_PAGO_TRIBUTOS.has(kind);
}

/**
 * Detección de pagos ya abonados de una empresa hacia Tributos (TGLP)
 * durante el mes (hasta la fecha). Devuelve la lista de movimientos.
 */
export function pagosTributosDeEmpresa(state, cuentaIds, mes, hastaDia) {
  const ids = new Set(cuentaIds || []);
  const pagos = [];
  const hasta = hastaDia || finalMes(mes);
  for (const t of state.transactions || []) {
    if (!esPagoTributos(t)) continue;
    const from = t.fromAccountId || t.fromIban || '';
    const to = t.toAccountId || t.toIban || '';
    if (!ids.has(from)) continue;
    if (!CUENTAS_SISTEMA.test(to) && to !== CUENTA_TRIBUTOS) continue; // solo hacia tesorería
    const dia = diaDe(t);
    if (!dia || !dia.startsWith(mes) || dia > hasta) continue;
    const importe = Number(t.amountPz || t.netAmount || 0);
    if (!(importe > 0)) continue;
    pagos.push({
      transaccionId: t.id,
      fecha: dia,
      importe: round2(importe),
      concepto: String(t.concept || t.kind || 'Tributos'),
    });
  }
  pagos.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  return pagos;
}

// Formato de id de factura: FAC-<YYYY>-<MM>-<seq>-<nn>.
const RE_FACTURA = /\bFAC-\d{4}-\d{2}-\d{3}-\d{2}\b/g;

/**
 * Pagos de IVA POR FACTURAS llegados por el BANCO (canal ciudadano, web/APP
 * o manual), no por el panel RSP. Son transferencias REALES (Settled) de la
 * empresa a TGLP cuyo concepto referencia las facturas:
 *   `Pago IVA facturas <mes> · … · refs:FAC-…,FAC-…`
 * Devuelve un Map facturaId → { transaccionId, fecha }. Las facturas que ya
 * tienen su IVA pagado o las transferencias sin referencia a una factura de
 * la empresa no se tienen en cuenta. (Puro: quien decide marcar «pagada»
 * cada factura es la capa de persistencia, usando este resultado.)
 */
export function pagosIvaExternosDeEmpresa(state, emp) {
  const refs = new Map();
  if (!emp || !emp.cuentas) return refs;
  const idsCuenta = new Set(emp.cuentas || []);
  const facturasPorId = new Set((emp.facturas || []).map((f) => f.id));
  for (const t of state.transactions || []) {
    if (!esSettled(t)) continue;
    const to = t.toAccountId || t.toIban || '';
    if (to !== CUENTA_TRIBUTOS) continue; // solo el ingreso va a Tesorería/TGLP
    const from = t.fromAccountId || t.fromIban || '';
    if (!idsCuenta.has(from)) continue; // sale de una cuenta de la empresa
    const concepto = String(t.concept || '');
    if (!/Pago IVA/i.test(concepto)) continue; // es un ingreso de IVA
    const tokens = concepto.match(RE_FACTURA) || [];
    for (const id of tokens) {
      if (!facturasPorId.has(id)) continue;
      if (refs.has(id)) continue; // primera transferencia que paga la factura
      refs.set(id, { transaccionId: t.id, fecha: diaDe(t) });
    }
  }
  return refs;
}

// ── Facturas de venta / servicio interno desde los movimientos ─────────
// Una empresa "vende" cuando RECIBE dinero de un tercero. Si el emisor es
// otra empresa del Grupo es un servicio interno; si no, una venta.
export function ventasDelMes(state, cuentasEmpresa, mes, tipoIva) {
  const ids = new Set(cuentasEmpresa || []);
  const ventas = [];
  const empresasGrupo = new Set();
  for (const acc of state.accounts || []) {
    if (!esEmpresaCuenta(acc)) continue;
    const eip = String(acc.eip || '').toUpperCase();
    if (eip) empresasGrupo.add(acc.id || acc.accountId || '');
  }
  for (const t of state.transactions || []) {
    if (!esSettled(t)) continue;
    const to = t.toAccountId || t.toIban || '';
    if (!ids.has(to)) continue; // la empresa es la cobradora
    const from = t.fromAccountId || t.fromIban || '';
    if (!from || CUENTAS_SISTEMA.test(from)) continue; // no es un cliente real
    if (ids.has(from)) continue; // entre cuentas propias
    const dia = diaDe(t);
    if (!dia || !dia.startsWith(mes)) continue;
    const bruto = Number(t.amountPz || t.netAmount || 0);
    if (!(bruto > 0)) continue;
    const { base, iva } = desglosarBruto(bruto, tipoIva);
    const esServicio = empresasGrupo.has(from);
    ventas.push({
      transaccionId: t.id,
      concepto: String(t.concept || t.kind || (esServicio ? 'Servicio interno' : 'Venta')),
      cliente: from,
      fecha: dia,
      bruto: round2(bruto),
      base: round2(base),
      iva: round2(iva),
      tipo: esServicio ? 'servicio' : 'venta',
      estado: 'abonada', // el pago ya llegó: factura automáticamente cobrada
    });
  }
  ventas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  return ventas;
}

/** Estado del recibo según los pagos detectados y el día de corte. */
function estadoRecibo(recibo, pagos, hastaDia, hoy) {
  if (recibo.importe <= 0) return 'sin_cuota';
  const totalPagado = pagos.reduce((s, p) => s + p.importe, 0);
  const antesDelCorte = pagos.filter((p) => p.fecha <= hastaDia);
  const pagado = antesDelCorte.reduce((s, p) => s + p.importe, 0);
  if (pagado >= recibo.importe - 0.01) return 'pagada';
  if (hoy > hastaDia) return pagos.length ? 'parcial' : 'vencida';
  return 'emitida';
}

/**
 * Ciclo de facturación del mes para las EMPRESAS del Banco.
 *
 * @param {object} opts
 *  - state           estado real del banco (cuentas + transacciones)
 *  - contribuyentes  salida de `calcularContribuyentes(state, mes, cnic)`
 *                    (motor fiscal autoritativo; de él salen IRM/IGF)
 *  - mes             'YYYY-MM' (por defecto mes actual)
 *  - cnic            reglas CNIC vigentes del BOP (para el tipo de IVA)
 *  - hoy             'YYYY-MM-DD' opcional (para pruebas)
 */
export function calcularCicloFacturacion({ state, contribuyentes, mes, cnic, hoy } = {}) {
  const periodo = String(mes || new Date().toISOString().slice(0, 7));
  const fechaHoy = hoy || new Date().toISOString().slice(0, 10);
  const vencimiento = finalMes(periodo);
  const tipoIva = tipoIvaDesdeCnic(cnic);
  const porEip = cuentasPorEmpresa(state);
  const empresas = (contribuyentes || []).filter((c) => c.tipo === 'empresa');
  const contribuyentePorId = new Map(empresas.map((c) => [c.id, c]));

  const lista = [];
  let seq = 0;
  for (const [eip, grupo] of porEip) {
    const c = contribuyentePorId.get(eip);
    if (!c) continue; // solo empresas con censo/declaración fiscal del mes
    const cuentaIds = grupo.cuentas.map((k) => k.id);
    const irm = round2(Number(c.cuotaIrm) || 0);
    const igf = round2(Number(c.cuotaIgf) || 0);
    const ventas = ventasDelMes(state, cuentaIds, periodo, tipoIva);
    const cuotaIva = round2(ventas.reduce((s, v) => s + v.iva, 0));
    const tributosTotal = round2(irm + igf);
    seq += 1;

    const recibo = {
      id: `RCB-${periodo}-${String(seq).padStart(3, '0')}`,
      tipo: 'tributos',
      eip,
      nombre: c.nombre || grupo.nombre || eip,
      mes: periodo,
      importe: tributosTotal,
      irm,
      igf,
      iva: cuotaIva,
      ivaExento: Boolean(c.ivaExento),
      igfExentoReducida: Boolean(c.igfExentoReducida),
      estadoFiscal: c.estadoFiscal || 'al_dia',
      patrimonioMedio: round2(Number(c.patrimonioMedio) || 0),
      vencimiento,
      estado: tributosTotal > 0 ? 'emitida' : 'sin_cuota',
      cuentaDebito: grupo.principal ? { id: grupo.principal.id, saldo: grupo.principal.saldo } : null,
    };

    const pagos = pagosTributosDeEmpresa(state, cuentaIds, periodo, vencimiento);
    if (tributosTotal > 0) recibo.estado = estadoRecibo(recibo, pagos, vencimiento, fechaHoy);
    if (pagos.length) {
      recibo.pagos = pagos;
      recibo.totalPagado = round2(pagos.reduce((s, p) => s + p.importe, 0));
    }

    const facturas = ventas.map((v, i) => ({
      id: `FAC-${periodo}-${String(seq).padStart(3, '0')}-${String(i + 1).padStart(2, '0')}`,
      eip,
      nombre: c.nombre || grupo.nombre || eip,
      mes: periodo,
      // El IVA repercutido de esta factura se PAGA aparte (a Tributos/TGLP)
      // cuando la empresa lo decide; nunca se descuenta solo al liquidar.
      ivaPagado: false,
      fechaPagoIva: null,
      transaccionPagoIva: null,
      ...v,
    }));
    const totalIvaVentas = round2(ventas.reduce((s, v) => s + v.iva, 0));

    lista.push({
      eip,
      nombre: recibo.nombre,
      saldoTotal: grupo.saldoTotal,
      cuentas: grupo.cuentas.map((k) => k.id),
      recibo,
      facturas,
      totalVentas: round2(ventas.reduce((s, v) => s + v.bruto, 0)),
      totalIvaVentas,
      // IVA pendiente de ingresar a Tributos (todas las facturas al crearse;
      // la capa de persistencia ajusta con las ya pagadas).
      ivaAIngresar: round2(facturas.reduce((s, f) => s + (f.ivaPagado ? 0 : f.iva), 0)),
      totalIvaPagado: round2(facturas.reduce((s, f) => s + (f.ivaPagado ? f.iva : 0), 0)),
    });
  }

  // Orden estable: empresas con recibo pendiente primero, luego por nombre.
  lista.sort((a, b) => {
    const pa = a.recibo.estado === 'emitida' || a.recibo.estado === 'vencida' || a.recibo.estado === 'parcial' ? 0 : 1;
    const pb = b.recibo.estado === 'emitida' || b.recibo.estado === 'vencida' || b.recibo.estado === 'parcial' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.nombre.localeCompare(b.nombre);
  });

  const resumen = {
    mes: periodo,
    fechaGeneracion: new Date().toISOString(),
    vencimiento,
    tipoIvaPct: round2(tipoIva * 100),
    empresas: lista.length,
    recibosPendientes: lista.filter((e) => ['emitida', 'vencida', 'parcial'].includes(e.recibo.estado)).length,
    recibosPagados: lista.filter((e) => e.recibo.estado === 'pagada').length,
    facturas: lista.reduce((s, e) => s + e.facturas.length, 0),
    totalTributos: round2(lista.reduce((s, e) => s + e.recibo.importe, 0)),
    totalPagado: round2(lista.reduce((s, e) => s + (e.recibo.totalPagado || 0), 0)),
    totalVentas: round2(lista.reduce((s, e) => s + e.totalVentas, 0)),
    totalIvaVentas: round2(lista.reduce((s, e) => s + e.totalIvaVentas, 0)),
    totalIvaAIngresar: round2(lista.reduce((s, e) => s + e.ivaAIngresar, 0)),
    totalIvaPagado: round2(lista.reduce((s, e) => s + e.totalIvaPagado, 0)),
  };

  return { resumen, empresas: lista };
}

/**
 * IVA repercutido PENDIENTE de ingresar a Tributos de una empresa, con su
 * facturación de venta. Permite pagar el IVA por FACTURAS: si se pasa
 * `facturaIds` solo se incluyen esas facturas (pago selectivo); si no, todas
 * las no pagadas (pago agrupado de golpe). Nunca incluye una factura cuyo
 * IVA ya se ingresó (evita pagos dobles). No mueve dinero: solo selecciona.
 */
export function seleccionarPagoIva(empresa, facturaIds) {
  const set = Array.isArray(facturaIds) ? new Set(facturaIds.map((x) => String(x))) : null;
  const pendientes = (empresa?.facturas || []).filter((f) => !f.ivaPagado && (!set || set.has(f.id)));
  return {
    pendientes,
    totalIva: round2(pendientes.reduce((s, f) => s + (Number(f.iva) || 0), 0)),
  };
}

/**
 * Plan de COBRO a fin de mes: para cada recibo que a la fecha de corte
 * sigue sin estar pagado, prepara la domiciliación (cargo en la cuenta BLP
 * hacia Tributos/TGLP) o lo marca como impagado si no hay saldo.
 *
 * Este plan NO mueve dinero. El llamador decide ejecutar cada operación con
 * `mutarBanco({ action: 'transferir', ... })` (idempotente en el banco).
 */
export function planCierreMes(ciclo, { hoy } = {}) {
  const fechaHoy = hoy || new Date().toISOString().slice(0, 10);
  const cobros = [];
  const impagados = [];
  for (const e of ciclo.empresas || []) {
    const r = e.recibo || {};
    if (r.estado === 'pagada' || r.estado === 'sin_cuota') continue;
    if (r.estado !== 'vencida' && r.estado !== 'parcial' && r.estado !== 'emitida') continue;
    if (fechaHoy <= (r.vencimiento || ciclo.resumen.vencimiento)) continue; // aún no toca
    const cuenta = r.cuentaDebito || { id: e.eip, saldo: e.saldoTotal || 0 };
    const saldo = Number(cuenta.saldo) || 0;
    const restante = round2(Math.max(0, (r.importe || 0) - (r.totalPagado || 0)));
    if (saldo >= restante - 0.01) {
      cobros.push({
        reciboId: r.id,
        eip: e.eip,
        nombre: e.nombre,
        concepto: `Domiciliación Tributos ${r.mes} · ${r.id}`,
        from: cuenta.id,
        to: CUENTA_TRIBUTOS,
        cantidad: restante,
        fecha: fechaHoy,
      });
    } else {
      impagados.push({
        reciboId: r.id,
        eip: e.eip,
        nombre: e.nombre,
        importe: restante,
        saldo,
        cuenta: cuenta.id,
        motivo: 'saldo_insuficiente',
      });
    }
  }
  return {
    fecha: fechaHoy,
    cobros,
    impagados,
    totalCobrar: round2(cobros.reduce((s, c) => s + c.cantidad, 0)),
    totalImpagado: round2(impagados.reduce((s, c) => s + c.importe, 0)),
  };
}
