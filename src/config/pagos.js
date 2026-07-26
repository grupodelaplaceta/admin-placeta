/**
 * SISTEMA DE PAGOS — Integración con Banco de La Placeta real
 * 
 * Procesa pagos, transferencias y cobros usando la API real del banco:
 *   POST /api/crm-state → emitir, quemar, transferencias
 *   
 * Cuentas del sistema:
 *   TGLP  (GDLP-AP98-605) → Tesoro/IVA/Tributos
 *   AGLDP                → Administración (bonos, sanciones)
 *   RSP   (GDLP-AP99-001) → Red de Servicios (ingresos RSP)
 *   CAPITALIA_BANK       → Placeta Junior
 */

import { apiBancoPost } from './db.js';

const BANCO_API = (process.env.BANCO_API_URL || 'https://api.banco.laplaceta.org').replace(/\/+$/, '');

// ── CUENTAS DEL SISTEMA ───────────────────────────────────────────────
export const CUENTAS = {
  tributos_iva: { id: 'TGLP', iban: 'GDLP-AP98-605', nombre: 'Tesoro/Tributos' },
  administracion: { id: 'AGLDP', iban: '', nombre: 'Administración GDLP' },
  rsp: { id: null, iban: 'GDLP-AP99-001', nombre: 'Red de Servicios' },
  capitalia: { id: 'CAPITALIA_BANK', iban: 'GDLP-AP76-179', nombre: 'Capitalia (Junior)' },
  boveda: { id: 'VAULT_EMISION', iban: '', nombre: 'Bóveda de Emisión' }
};

// ── Config IBANs editables por entidad ─────────────────────────────────
const CONFIG_IBAN = {
  banco: { iban: 'GDLP-AP98-605', cuentaId: 'TGLP' },
  tributos: { iban: 'GDLP-TRBX-001', cuentaId: null },
  junta: { iban: 'GDLP-AP00-001', cuentaId: null },
  administracion: { iban: 'GDLP-AP00-002', cuentaId: 'AGLDP' },
  rsp: { iban: 'GDLP-AP99-001', cuentaId: null },
  junior: { iban: 'GDLP-AP76-179', cuentaId: 'CAPITALIA_BANK' }
};

/**
 * Obtiene el IBAN configurado para una entidad
 */
export function getIBAN(entidad) {
  return CONFIG_IBAN[entidad]?.iban || '—';
}

/**
 * Obtiene la configuración completa de IBAN de una entidad
 */
export function getConfigEntidad(entidad) {
  return CONFIG_IBAN[entidad] || null;
}

/**
 * Actualiza el IBAN de una entidad
 */
export function setIBAN(entidad, iban, cuentaId) {
  if (!CONFIG_IBAN[entidad]) CONFIG_IBAN[entidad] = {};
  CONFIG_IBAN[entidad].iban = iban;
  if (cuentaId) CONFIG_IBAN[entidad].cuentaId = cuentaId;
  return CONFIG_IBAN[entidad];
}

/**
 * Obtiene todas las configuraciones IBAN
 */
export function getAllConfigIBAN() {
  return { ...CONFIG_IBAN };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGOS VÍA BANCO REAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Realiza un pago entre cuentas del sistema usando la API real del banco
 * 
 * @param {object} opts
 * @param {string} opts.from - Cuenta origen (id en bank_accounts)
 * @param {string} opts.to - Cuenta destino (id en bank_accounts)
 * @param {number} opts.monto - Cantidad en Placetas
 * @param {string} opts.concepto - Concepto del pago
 * @param {string} opts.kind - Tipo de transacción (Tax, Fine, Transfer, OperationalFee)
 * @returns {object} Resultado de la operación
 */
export async function pagarEntreCuentas({ from, to, monto, concepto, kind = 'Transfer' }) {
  if (monto <= 0) return { success: false, error: 'El monto debe ser positivo' };

  try {
    // Emitir desde la cuenta origen
    const emision = await apiBancoPost('emitir', {
      dip: from,
      monto: -monto,
      concepto: `[SISTEMA] ${concepto}`,
      kind
    });

    if (!emision?.success) {
      return { success: false, error: `Error debitando de ${from}: ${emision?.error || 'sin respuesta'}` };
    }

    // Acreditar en la cuenta destino
    if (to) {
      const ingreso = await apiBancoPost('emitir', {
        dip: to,
        monto,
        concepto: `[SISTEMA] ${concepto}`,
        kind
      });

      if (!ingreso?.success) {
        return { success: false, error: `Error acreditando a ${to}: ${ingreso?.error || 'sin respuesta'}` };
      }
    }

    return { success: true, monto, from, to, concepto };
  } catch (err) {
    return { success: false, error: `Error en pago: ${err.message}` };
  }
}

/**
 * Paga el IVA a Tributos (TGLP)
 * El IVA se envía automáticamente a la cuenta TGLP
 */
export async function pagarIVATGLP({ entidad, base, iva, concepto }) {
  const cfg = CONFIG_IBAN[entidad];
  const fromId = cfg?.cuentaId || cfg?.iban || 'TGLP';
  const toId = CUENTAS.tributos_iva.id;

  if (iva <= 0) return { success: true, monto: 0, mensaje: 'Sin IVA que liquidar' };

  return pagarEntreCuentas({
    from: fromId,
    to: toId,
    monto: iva,
    concepto: `IVA ${concepto} — ${entidad} (base: ${base} Pz, IVA 12%)`,
    kind: 'Tax'
  });
}

/**
 * Paga una factura RSP usando el banco real
 * Reparte: base→entidad destino, IVA→Tributos (TGLP)
 */
export async function pagarFacturaBanco({ entidad, base, iva, total, concepto, facturaId }) {
  const cfg = CONFIG_IBAN[entidad];
  const cuentaOrigen = cfg?.cuentaId || cfg?.iban;
  const cuentaRSP = 'GDLP-AP99-001';

  if (!cuentaOrigen) {
    return { success: false, error: `No hay cuenta configurada para ${entidad}` };
  }

  const results = [];

  // 1. Cobrar base a RSP (ingreso por servicio)
  if (base > 0) {
    const r1 = await pagarEntreCuentas({
      from: cuentaOrigen,
      to: cuentaRSP,
      monto: base,
      concepto: `RSP: ${concepto} (base) — Factura ${facturaId}`,
      kind: 'OperationalFee'
    });
    results.push(r1);
  }

  // 2. Enviar IVA a Tributos (TGLP)
  if (iva > 0) {
    const r2 = await pagarIVATGLP({
      entidad,
      base,
      iva,
      concepto: `RSP: ${concepto} — Factura ${facturaId}`
    });
    results.push(r2);
  }

  const errores = results.filter(r => !r.success);
  if (errores.length > 0) {
    return { success: false, errores, results };
  }

  return {
    success: true,
    total,
    base,
    iva,
    desglose: `Base ${base} Pz + IVA ${iva} Pz = ${total} Pz`,
    results
  };
}

/**
 * Paga una sanción usando el banco real
 * La sanción se cobra de la cuenta RSP y se envía a Administración (AGLDP)
 */
export async function pagarSancionBanco(monto, concepto) {
  const rspIBAN = 'GDLP-AP99-001';
  const adminId = 'AGLDP';
  const tributosId = 'TGLP';

  const results = [];

  // 1. Debitar de RSP
  const r1 = await pagarEntreCuentas({
    from: rspIBAN,
    monto: -monto,
    concepto: `SANCIÓN: ${concepto}`,
    kind: 'Fine'
  });

  // 2. Acreditar a Administración
  const r2 = await pagarEntreCuentas({
    from: rspIBAN,
    to: adminId,
    monto,
    concepto: `SANCIÓN: ${concepto}`,
    kind: 'Fine'
  });
  results.push(r2);

  const errores = results.filter(r => !r.success);
  if (errores.length > 0) {
    return { success: false, errores };
  }

  return { success: true, monto, desde: rspIBAN, hasta: adminId };
}

export default {
  pagarEntreCuentas,
  pagarIVATGLP,
  pagarFacturaBanco,
  pagarSancionBanco,
  getIBAN,
  setIBAN,
  getConfigEntidad,
  getAllConfigIBAN,
  CUENTAS
};
