/* ═══════════════════════════════════════════════════════════════════════
   Comprobaciones funcionales del motor de facturación + tributos.
   Ejecutar:  cd server && node --test
   (o:  node --test server/facturacion.test.mjs  desde la raíz de rsp-web)
   ────────────────────────────────────────────────────────────────────────
   Usan un estado TIPO PRODUCCIÓN (server/fixtures/produccion.js) — el mismo
   formato que devuelve el Banco (api/crm-state). No tocan la base real ni
   mueven dinero: sirven para validar los cálculos ANTES de pulsar
   «Emitir mes» / «Ejecutar cobro» en producción.
   ═══════════════════════════════════════════════════════════════════════ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  finalMes, inicioMesSiguiente, tipoIvaDesdeCnic, desglosarBruto,
  cuentasPorEmpresa, pagosTributosDeEmpresa, ventasDelMes,
  calcularCicloFacturacion, planCierreMes, seleccionarPagoIva, CUENTA_TRIBUTOS,
} from './facturacion.js';
import { calcularContribuyentes } from './tributos.js';
import {
  estadoProduccion, cnicProduccion, contribuyentesSinteticos,
  MES, VENCIMIENTO, HOY_POST_CIERRE,
} from './fixtures/produccion.js';

const r2 = (n) => Math.round(n * 100) / 100;

// ── Fechas y desglose de IVA (CNIC-IVA 12 %, “por dentro” 12/112) ──────
test('finalMes / inicioMesSiguiente', () => {
  assert.equal(finalMes('2026-08'), '2026-08-31');
  assert.equal(finalMes('2026-02'), '2026-02-28');
  assert.equal(finalMes('2024-02'), '2024-02-29'); // bisiesto
  assert.equal(inicioMesSiguiente('2026-08'), '2026-09-01');
});

test('tipoIvaDesdeCnic usa el CNIC-IVA del BOP', () => {
  assert.equal(tipoIvaDesdeCnic([{ codigo: 'CNIC-IVA', valor: 12 }]), 0.12);
  assert.equal(tipoIvaDesdeCnic([{ cnic: 'CNIC-IVA', valor_vigente: 21 }]), 0.21);
  assert.equal(tipoIvaDesdeCnic([]), 0);            // sin CNIC → IVA 0 (no inventa)
  assert.equal(tipoIvaDesdeCnic(null), 0);
});

test('desglosarBruto: IVA por dentro (12/112)', () => {
  assert.deepEqual(desglosarBruto(1120, 0.12), { base: 1000, iva: 120 });
  assert.deepEqual(desglosarBruto(2000, 0.12), { base: 1785.71, iva: 214.29 });
  assert.deepEqual(desglosarBruto(112, 0.12), { base: 100, iva: 12 });
  assert.deepEqual(desglosarBruto(224, 0.12), { base: 200, iva: 24 });
  assert.deepEqual(desglosarBruto(100, 0), { base: 100, iva: 0 }); // sin IVA
});

// ── Cuentas por empresa ────────────────────────────────────────────────
test('cuentasPorEmpresa excluye sistema y agrupa por EIP', () => {
  const por = cuentasPorEmpresa(estadoProduccion());
  assert.deepEqual([...por.keys()].sort(), ['EIP-PTTELECOM', 'EIP-X4NGQU', 'EIP-XJETNL'].sort());
  for (const id of ['TGLP', 'CAPITALIA_BANK', 'FUND-BLP']) assert.ok(!por.has(id), `${id} no debe ser empresa`);
  const red = por.get('EIP-X4NGQU');
  assert.equal(red.principal.id, 'acc-co-1765320068081');
  assert.equal(red.principal.saldo, 18421.83);
});

// ── Ventas del mes (facturas automáticas) ──────────────────────────────
test('ventasDelMes: ventas y servicios internos, ignora sistema/pending/propias', () => {
  const state = estadoProduccion();
  const iva = 0.12;
  // Red recibe una venta real (1.120 de una persona). El PENDING no cuenta.
  const ventasRed = ventasDelMes(state, ['acc-co-1765320068081'], MES, iva);
  assert.equal(ventasRed.length, 1);
  assert.equal(ventasRed[0].tipo, 'venta');
  assert.equal(ventasRed[0].bruto, 1120);
  assert.equal(ventasRed[0].base, 1000);
  assert.equal(ventasRed[0].iva, 120);
  assert.equal(ventasRed[0].estado, 'abonada');

  // Telecom recibe servicio interno (Red → Telecom, 2.000) y una venta (112).
  const ventasTel = ventasDelMes(state, ['acc-1765307093731-583'], MES, iva);
  assert.equal(ventasTel.length, 2);
  const servicio = ventasTel.find((v) => v.transaccionId === 'TX-TEL-001');
  assert.equal(servicio.tipo, 'servicio');
  assert.deepEqual([servicio.base, servicio.iva], [1785.71, 214.29]);

  // Unhiro recibe una venta (224).
  const ventasUnh = ventasDelMes(state, ['acc-co-1765312323183'], MES, iva);
  assert.equal(ventasUnh.length, 1);
  assert.deepEqual([ventasUnh[0].base, ventasUnh[0].iva], [200, 24]);
});

// ── Pagos de tributos detectados ───────────────────────────────────────
test('pagosTributosDeEmpresa: detecta Tax hacia TGLP y respeta el corte de mes', () => {
  const state = estadoProduccion();
  const pagos = pagosTributosDeEmpresa(state, ['acc-co-1765320068081'], MES);
  assert.equal(pagos.length, 1);
  assert.equal(pagos[0].importe, 400);
  assert.equal(pagos[0].to, undefined); // no exponemos `to`, solo datos de pago
  // Corte antes del pago (día 20): no se detecta.
  const temprano = pagosTributosDeEmpresa(state, ['acc-co-1765320068081'], MES, '2026-08-19');
  assert.equal(temprano.length, 0);
});

// ── Ciclo mensual determinista (cuotas controladas) ────────────────────
function cicloSintetico() {
  return calcularCicloFacturacion({
    state: estadoProduccion(),
    contribuyentes: contribuyentesSinteticos(),
    mes: MES,
    cnic: cnicProduccion(),
    hoy: HOY_POST_CIERRE,
  });
}

test('ciclo: resumen y recibos correctos (IRM+IGF, IVA ventas, estados)', () => {
  const { resumen, empresas } = cicloSintetico();
  assert.equal(resumen.mes, MES);
  assert.equal(resumen.vencimiento, VENCIMIENTO);
  assert.equal(resumen.tipoIvaPct, 12);
  assert.equal(resumen.empresas, 3);

  const red = empresas.find((e) => e.eip === 'EIP-X4NGQU');
  assert.equal(red.recibo.irm, 300);
  assert.equal(red.recibo.igf, 150);
  assert.equal(red.recibo.importe, 450);
  assert.equal(red.recibo.iva, 120);            // IVA de su venta del mes
  assert.equal(red.recibo.totalPagado, 400);    // pago Tax parcial detectado
  assert.equal(red.recibo.estado, 'parcial');   // tras el vencimiento, abonó menos

  const tel = empresas.find((e) => e.eip === 'EIP-PTTELECOM');
  assert.equal(tel.recibo.importe, 150);
  assert.equal(r2(tel.recibo.iva), r2(226.29)); // 214.29 + 12 de sus ventas/servicios
  assert.equal(tel.recibo.estado, 'vencida');
  assert.equal(tel.recibo.cuentaDebito.id, 'acc-1765307093731-583');

  const unh = empresas.find((e) => e.eip === 'EIP-XJETNL');
  assert.equal(unh.recibo.importe, 0);
  assert.equal(unh.recibo.estado, 'sin_cuota');

  assert.equal(resumen.recibosPendientes, 2);
  assert.equal(resumen.recibosPagados, 0);
  assert.equal(resumen.totalTributos, 600);
  assert.equal(resumen.totalPagado, 400);
  assert.equal(resumen.totalVentas, 3456);      // 1120 + 2000 + 112 + 224
  assert.equal(resumen.facturas, 4);
});

test('ciclo: facturas automáticas por empresa', () => {
  const { empresas } = cicloSintetico();
  const red = empresas.find((e) => e.eip === 'EIP-X4NGQU');
  const tel = empresas.find((e) => e.eip === 'EIP-PTTELECOM');
  assert.equal(red.facturas.length, 1);
  assert.equal(tel.facturas.length, 2);
  assert.ok(tel.facturas.every((f) => f.estado === 'abonada'));
});

// IVA POR FACTURA: el IVA no se descuenta automáticamente; se ingresa a TGLP
// cuando la empresa paga sus facturas (selectivo o de golpe).
test('ciclo: facturas con IVA a ingresar (pago por factura, nunca automático)', () => {
  const { empresas, resumen } = cicloSintetico();
  const tel = empresas.find((e) => e.eip === 'EIP-PTTELECOM');
  const red = empresas.find((e) => e.eip === 'EIP-X4NGQU');
  assert.ok(tel.facturas.every((f) => f.ivaPagado === false), 'facturas nacen con IVA pendiente');
  assert.equal(tel.ivaAIngresar, r2(226.29));   // 214.29 (servicio) + 12 (venta)
  assert.equal(tel.totalIvaPagado, 0);
  assert.equal(red.ivaAIngresar, 120);
  assert.equal(resumen.totalIvaVentas, r2(226.29 + 120 + 24));
  assert.equal(resumen.totalIvaAIngresar, r2(226.29 + 120 + 24));
  assert.equal(resumen.totalIvaPagado, 0);
});

test('seleccionarPagoIva: agrupado, selectivo y nunca repite pagadas', () => {
  const { empresas } = cicloSintetico();
  const tel = empresas.find((e) => e.eip === 'EIP-PTTELECOM');
  // Todas de golpe (sin facturaIds)
  const todas = seleccionarPagoIva(tel, undefined);
  assert.equal(todas.pendientes.length, 2);
  assert.equal(todas.totalIva, r2(226.29));
  // Selectivo: solo una factura
  const una = seleccionarPagoIva(tel, [tel.facturas[0].id]);
  assert.equal(una.pendientes.length, 1);
  assert.equal(una.totalIva, r2(tel.facturas[0].iva));
  // Una factura cuyo IVA ya se ingresó no se vuelve a incluir
  const conPagada = { ...tel, facturas: tel.facturas.map((f, i) => (i === 0 ? { ...f, ivaPagado: true } : f)) };
  const restante = seleccionarPagoIva(conPagada, undefined);
  assert.equal(restante.pendientes.length, 1);
  assert.equal(restante.totalIva, r2(tel.facturas[1].iva));
});

// ── Plan de cierre a fin de mes ────────────────────────────────────────
test('planCierreMes: domicilia lo pendiente (parcial + vencida) y no lo pagado', () => {
  const ciclo = cicloSintetico();
  const plan = planCierreMes(ciclo, { hoy: HOY_POST_CIERRE });
  // Pendientes: Red (parcial, restan 50) y Telecom (vencida, 150). Unhiro es 0.
  const esperados = ciclo.empresas
    .filter((e) => ['EIP-X4NGQU', 'EIP-PTTELECOM'].includes(e.eip))
    .map((e) => e.recibo.id)
    .sort();
  assert.deepEqual(plan.cobros.map((c) => c.reciboId).sort(), esperados);
  assert.equal(plan.totalCobrar, 200); // 50 (Red) + 150 (Telecom)
  assert.ok(plan.cobros.every((c) => c.to === CUENTA_TRIBUTOS));
  assert.equal(plan.impagados.length, 0);
});

test('planCierreMes: impagado si no hay saldo y no duplica cobrada', () => {
  // Mini-ciclo: empresa sin saldo → impagado
  const mini = {
    resumen: { mes: MES, vencimiento: VENCIMIENTO },
    empresas: [
      {
        eip: 'EIP-SIN-SALDO', nombre: 'Sin Saldo S.P.', saldoTotal: 10, cuentas: ['c-x'],
        recibo: { id: 'RCB-2026-08-099', tipo: 'tributos', eip: 'EIP-SIN-SALDO', nombre: 'Sin Saldo S.P.', mes: MES, importe: 100, irm: 50, igf: 50, iva: 0, vencimiento: VENCIMIENTO, estado: 'vencida', cuentaDebito: { id: 'c-x', saldo: 10 } },
        facturas: [],
      },
      {
        eip: 'EIP-YA-COBRADA', nombre: 'Ya Cobrada S.P.', saldoTotal: 0, cuentas: ['c-y'],
        recibo: { id: 'RCB-2026-08-100', tipo: 'tributos', eip: 'EIP-YA-COBRADA', nombre: 'Ya Cobrada S.P.', mes: MES, importe: 999, irm: 500, igf: 499, iva: 0, vencimiento: VENCIMIENTO, estado: 'cobrada', cobro: { fecha: '2026-08-30', transaccionId: 'TX-YA', importe: 999 }, cuentaDebito: { id: 'c-y', saldo: 5000 } },
        facturas: [],
      },
    ],
  };
  const plan = planCierreMes(mini, { hoy: HOY_POST_CIERRE });
  assert.equal(plan.cobros.length, 0);           // la cobrada jamás se re-cobra
  assert.equal(plan.impagados.length, 1);
  assert.equal(plan.impagados[0].importe, 100);
  assert.equal(plan.impagados[0].motivo, 'saldo_insuficiente');
});

// ── Integración con el motor fiscal (mismo camino que producción) ──────
test('integración tributos → ciclo: recibo = cuotas reales del motor fiscal', () => {
  const state = estadoProduccion();
  const cnic = cnicProduccion();
  const contribuyentes = calcularContribuyentes(state, MES, cnic);
  const ciclo = calcularCicloFacturacion({ state, contribuyentes, mes: MES, cnic, hoy: HOY_POST_CIERRE });

  // Toda empresa del ciclo tiene su contribuyente y el recibo usa sus cuotas.
  for (const e of ciclo.empresas) {
    const c = contribuyentes.find((x) => x.id === e.eip);
    assert.ok(c, `falta contribuyente ${e.eip}`);
    assert.equal(e.recibo.irm, r2(c.cuotaIrm || 0));
    assert.equal(e.recibo.igf, r2(c.cuotaIgf || 0));
    assert.equal(e.recibo.ivaExento, c.ivaExento === true);
    // IVA del recibo = IVA repercutido por movimientos de la empresa en el mes.
    assert.equal(e.recibo.iva, r2(c.ivaRepercutido || 0));
  }

  // Red vendió 1.120 en el mes → IVA repercutido 120 visible en el recibo.
  const red = ciclo.empresas.find((x) => x.eip === 'EIP-X4NGQU');
  assert.ok(red, 'Red del Grupo debe estar en el ciclo');
  assert.ok(red.recibo.iva > 0, 'Red debe tener IVA de ventas en el mes');
});
