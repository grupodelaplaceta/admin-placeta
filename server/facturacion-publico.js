/* ═══════════════════════════════════════════════════════════════════════
   rsp-web-api — Facturación CIUDADANA (Banco web / APP).
   ────────────────────────────────────────────────────────────────────────
   RSP es el origen de verdad de las facturas (motor `server/facturacion.js`
   + persistencia en `rsp_facturacion`). Esta ruta expone a la capa
   ciudadana del Banco SOLO LECTURA de las facturas de una empresa por EIP,
   validada con `X-API-Key` (= `TRIBUTOS_API_KEY`, la misma que usa el
   gateway de tributos de backend-banco).

   El pago del IVA NO se ejecuta aquí: el ciudadano ordena una transferencia
   desde Banco web/APP (Pending → la firma PlacetaID Móvil) hacia TGLP cuyo
   concepto referencia las facturas (`refs:FAC-…`); esta ruta —y el ciclo del
   panel— detectan esas transferencias liquidadas y marcan las facturas como
   pagadas (nunca se vuelven a ofrecer ni a cobrar).

   Quien llame con una EIP ajena solo puede LEER sus facturas; no hay ninguna
   operación de dinero en esta ruta.
   ═══════════════════════════════════════════════════════════════════════ */
import { Router } from 'express';
import { calcularCicloFacturacion, pagosIvaExternosDeEmpresa } from './facturacion.js';
import { calcularContribuyentes } from './tributos.js';
import { coleccion } from './db.js';

const round2 = (n) => Math.round(n * 100) / 100;
const mesActual = () => new Date().toISOString().slice(0, 7);

export function facturacionPublicoRouter({ getBankState, cargarCnic }) {
  const router = Router();
  const storeFacturacion = coleccion('rsp_facturacion');

  // Autenticación por clave compartida (servidor a servidor). El gateway de
  // tributos de backend-banco llama con `X-API-Key: TRIBUTOS_API_KEY`.
  router.use((req, res, next) => {
    const key = process.env.TRIBUTOS_API_KEY;
    if (!key) return res.status(503).json({ error: 'api_no_configurada' });
    if (req.get('X-API-Key') !== key) return res.status(401).json({ error: 'api_key_invalida' });
    next();
  });

  async function cicloDelMes(mes) {
    const state = await getBankState();
    const cnic = await cargarCnic();
    const contribuyentes = calcularContribuyentes(state, mes, cnic);
    const ciclo = calcularCicloFacturacion({ state, contribuyentes, mes, cnic });
    return { state, ciclo };
  }

  // Marca y persiste las facturas de la empresa cuyo IVA ya se pagó por una
  // transferencia REAL del Banco a TGLP (canal ciudadano). Idempotente.
  async function reconciliarPagosExternos(state, emp, mes) {
    const filas = new Map((await storeFacturacion.listar({ filtros: { mes } }) || [])
      .filter((r) => r.documento === 'factura').map((r) => [r.id, r]));
    let marcadas = 0;
    const pagos = pagosIvaExternosDeEmpresa(state, emp);
    for (const [fid, pago] of pagos) {
      const f = emp.facturas.find((x) => x.id === fid);
      if (!f || f.ivaPagado) continue;
      const patch = { ivaPagado: true, fechaPagoIva: pago.fecha || null, transaccionPagoIva: pago.transaccionId };
      const fila = filas.get(fid);
      if (fila) await storeFacturacion.actualizar(fid, patch);
      else await storeFacturacion.insertar({
        id: f.id, documento: 'factura', tipo: f.tipo, eip: emp.eip, nombre: emp.nombre, mes: f.mes,
        concepto: f.concepto, cliente: f.cliente, importe: f.bruto, base: f.base, iva: f.iva,
        transaccionId: f.transaccionId, fecha: f.fecha, estado: 'abonada', ...patch,
      });
      f.ivaPagado = true;
      f.fechaPagoIva = patch.fechaPagoIva;
      f.transaccionPagoIva = patch.transaccionPagoIva;
      marcadas += 1;
    }
    // Replica también las marcas hechas por el panel (rsp_facturacion.iva_pagado).
    for (const f of emp.facturas) {
      if (f.ivaPagado) continue;
      const fila = filas.get(f.id);
      if (!fila || !fila.ivaPagado) continue;
      f.ivaPagado = true;
      f.fechaPagoIva = fila.fechaPagoIva || null;
      f.transaccionPagoIva = fila.transaccionPagoIva || null;
      marcadas += 1;
    }
    return marcadas;
  }

  // GET /api/v1/tributos/facturacion?eip=EIP-…&mes=YYYY-MM
  // Facturas del mes de UNA empresa + el IVA pendiente por factura. Los
  // recibos de Tributos (IRM/IGF) NO se exponen aquí: esta superficie es
  // para que la empresa vea y pague el IVA de sus facturas.
  router.get('/facturacion', async (req, res) => {
    try {
      const eip = String(req.query.eip || '').toUpperCase();
      const mes = String(req.query.mes || mesActual());
      if (!eip) return res.status(400).json({ error: 'eip_requerido' });
      const { state, ciclo } = await cicloDelMes(mes);
      const emp = (ciclo.empresas || []).find((e) => e.eip === eip);
      if (!emp) return res.status(404).json({ error: 'empresa_sin_facturacion', eip, mes });
      await reconciliarPagosExternos(state, emp, mes);
      emp.ivaAIngresar = round2(emp.facturas.reduce((s, f) => s + (f.ivaPagado ? 0 : f.iva), 0));
      emp.totalIvaPagado = round2(emp.facturas.reduce((s, f) => s + (f.ivaPagado ? f.iva : 0), 0));
      res.json({
        ok: true,
        eip: emp.eip,
        mes,
        empresa: { eip: emp.eip, nombre: emp.nombre },
        cuentas: emp.cuentas,
        facturas: emp.facturas.map((f) => ({
          id: f.id, tipo: f.tipo, fecha: f.fecha, concepto: f.concepto,
          cliente: f.cliente, bruto: f.bruto, base: f.base, iva: f.iva,
          ivaPagado: !!f.ivaPagado, fechaPagoIva: f.fechaPagoIva || null, transaccionPagoIva: f.transaccionPagoIva || null,
        })),
        totalFacturas: emp.facturas.length,
        totalIvaVentas: emp.totalIvaVentas,
        ivaAIngresar: emp.ivaAIngresar,
        totalIvaPagado: emp.totalIvaPagado,
        totalIvaPendiente: emp.ivaAIngresar,
      });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  return router;
}
