/* ═══════════════════════════════════════════════════════════════════════
   ENSAYO EN SECO (dry-run) del ciclo de facturación ANTES de tocar
   producción — NO mueve dinero ni escribe en la base.
   ────────────────────────────────────────────────────────────────────────
   Reproduce exactamente los mismos cálculos que hará el panel RSP con
   datos reales del Banco:
     1. Motor fiscal  → cuotas IRM/IGF + IVA por movimientos por empresa
     2. Ciclo mensual → recibos de Tributos + facturas de venta/servicio
     3. Cobro fin de mes (simulación) → plan de domiciliación / impagados
   Con esto puedes revisar los números antes de pulsar «Emitir mes» o
   «Ejecutar cobro» en producción.

   Uso:  node scripts/dry-run-emision.mjs [MES] [HOY]
     MES → 'YYYY-MM' (por defecto 2026-08, mes del fixture)
     HOY → 'YYYY-MM-DD' (por defecto fin de ese mes)
   ═══════════════════════════════════════════════════════════════════════ */
import { calcularContribuyentes } from '../tributos.js';
import { calcularCicloFacturacion, planCierreMes } from '../facturacion.js';
import { estadoProduccion, cnicProduccion, MES, VENCIMIENTO } from '../fixtures/produccion.js';

const fmtPz = (n) => `${Math.round(Number(n || 0) * 100) / 100 >= 100000 ? (Number(n || 0)).toLocaleString('es-ES') : Number(n || 0)} Pz`;
const pad = (s, n = 10) => String(s).padEnd(n);

const mes = process.argv[2] || MES;
const hoy = process.argv[3] || VENCIMIENTO;
const state = estadoProduccion();
const cnic = cnicProduccion();

console.log('════════════════════════════════════════════════════════════════');
console.log('  DRY-RUN · Facturación central RSP + Banco (sin mover dinero)');
console.log(`  Mes: ${mes}   ·   Corte (hoy): ${hoy}   ·   Vencimiento: ${mes}-fin`);
console.log('════════════════════════════════════════════════════════════════\n');

// 1) Motor fiscal (igual que hace la API /rsp/tributos)
const contribuyentes = calcularContribuyentes(state, mes, cnic);

// 2) Ciclo (igual que hace la API /rsp/facturacion/api/ciclo)
const ciclo = calcularCicloFacturacion({ state, contribuyentes, mes, cnic, hoy });

const r = ciclo.resumen;
console.log('── RESUMEN DEL CICLO ──────────────────────────────────────────');
console.log(`  Empresas del ciclo        : ${r.empresas}`);
console.log(`  Recibos pendientes        : ${r.recibosPendientes}`);
console.log(`  Recibos abonados          : ${r.recibosPagados}`);
console.log(`  Tributos del mes (IRM+IGF): ${r.totalTributos.toLocaleString('es-ES')} Pz`);
console.log(`  Abonado hasta el corte    : ${r.totalPagado.toLocaleString('es-ES')} Pz`);
console.log(`  Ventas del mes            : ${r.totalVentas.toLocaleString('es-ES')} Pz`);
console.log(`  Facturas automáticas      : ${r.facturas}`);
console.log(`  Tipo IVA aplicado (CNIC)  : ${r.tipoIvaPct} %\n`);

console.log('── RECIBOS DE TRIBUTOS POR EMPRESA ────────────────────────────');
for (const e of ciclo.empresas) {
  const b = e.recibo;
  const estadoPago = b.totalPagado ? ` · abonado ${b.totalPagado} Pz` : '';
  console.log(
    `  ${pad(e.nombre, 34)} ${pad(b.id, 14)} IRM ${pad(b.irm, 8)} IGF ${pad(b.igf, 8)} ` +
    `IVAventas ${pad(b.iva, 8)} = ${pad(b.importe, 8)} → ${pad(b.estado, 12)}${estadoPago}`,
  );
  if (b.cuentaDebito) console.log(`    cuenta débito: ${b.cuentaDebito.id} (saldo ${b.cuentaDebito.saldo.toLocaleString('es-ES')} Pz)`);
}

const todasFacturas = ciclo.empresas.flatMap((e) => e.facturas);
if (todasFacturas.length) {
  console.log('\n── FACTURAS AUTOMÁTICAS (venta/servicio, ya abonadas) ──────────');
  for (const f of todasFacturas) {
    console.log(`  ${pad(f.id, 22)} ${pad(f.tipo, 9)} ${pad(f.concepto, 24)} ${pad(f.cliente, 20)} base ${f.base} + IVA ${f.iva} = ${f.bruto} Pz · ${f.fecha}`);
  }
}

// 3) Plan de cobro a fin de mes (simulación)
const plan = planCierreMes(ciclo, { hoy });
console.log('\n── COBRO FIN DE MES (SIMULACIÓN — no se ha movido dinero) ───────');
console.log(`  A domiciliar: ${plan.cobros.length} · Total ${plan.totalCobrar.toLocaleString('es-ES')} Pz`);
for (const c of plan.cobros) {
  console.log(`   → ${pad(c.nombre, 30)} ${pad(c.reciboId, 14)} ${c.cantidad.toLocaleString('es-ES')} Pz · ${c.from} → ${c.to}`);
}
console.log(`  Impagados (sin saldo): ${plan.impagados.length} · Total ${plan.totalImpagado.toLocaleString('es-ES')} Pz`);
for (const i of plan.impagados) {
  console.log(`   ✗ ${pad(i.nombre, 30)} ${i.reciboId} ${i.importe.toLocaleString('es-ES')} Pz · saldo ${i.saldo.toLocaleString('es-ES')} Pz · ${i.motivo}`);
}

console.log('\n────────────────────────────────────────────────────────────────');
console.log('  Nota: estos números salen de los MISMOS módulos que usan los');
console.log('  endpoints /rsp/facturacion/* con el estado real del Banco.');
console.log('  «Emitir mes» persistirá los recibos/facturas; «Ejecutar cobro»');
console.log('  moverá dinero SOLO si se confirma (ejecutar=true + llave CRM).');
console.log('────────────────────────────────────────────────────────────────\n');
