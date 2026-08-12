/**
 * EXPEDIENTE FISCAL AUTOMÁTICO (DFM + anexos)
 *
 * Genera el conjunto completo de documentos tributarios de un sujeto fiscal
 * para un periodo mensual, conforme a la normativa del Grupo de La Placeta:
 *
 *   1. DFM — Declaración Fiscal Mensual (documento principal)
 *   2. Anexo de movimientos fiscales (auditoría: cada movimiento con su
 *      ID, fecha, concepto, importe, impuesto y tratamiento)
 *   3. Declaración específica de IRM
 *   4. Declaración específica de IGF
 *   5. Declaración de IVA (solo si el sujeto realiza operaciones sujetas)
 *   6. Certificado de Bonificación Fiscal (solo Juniors, asumido por CAPITALIA)
 *   7. Certificado de Cierre Fiscal (solo al aprobar/emitir/cobrar)
 *
 * Todos los documentos se guardan vinculados a la declaración
 * (refTipo='declaracion', refId=<id de la declaración>) y se pueden generar
 * PDF bajo demanda a través del sistema de documentación global.
 */
import { createHash } from 'crypto';
import { saveDocumentoAsync, getDocumentosByEntidadAsync } from './documentos.js';
import { calcularIRM, calcularIGF } from './normativa.js';
import { listarDesgravaciones } from './fiscalidad-ampliada.js';

// Kinds que NO son operación sujeta (no generan IRM/IVA)
const KINDS_NO_SUJETO = new Set([
  'Tax', 'OperationalFee', 'InvestmentTax', 'InvestmentCommission',
  'ForcedVatRegularization', 'Rbu', 'Donation', 'Gift', 'Reversal', 'Audit'
]);

// Kinds de operación comercial (sujetas a IVA/IRM si hay ingreso)
const KINDS_INGRESO_SUJETO = new Set(['Payment', 'Send', 'Transfer', 'PljuniorPayment', 'Income']);

// ── Clasificación fiscal de un movimiento ────────────────────────────────
// Devuelve { tratamiento: 'Sujeto'|'No sujeto', impuesto: 'IVA/IRM'|'IRM'|'IVA'|'—' }
export function clasificarMovimiento(tx, ids = new Set()) {
  const kind = tx.kind || tx.category || '';
  const esIngreso = ids.has(tx.toAccountId) && !ids.has(tx.fromAccountId);
  const esGasto = ids.has(tx.fromAccountId) && !ids.has(tx.toAccountId);
  const esInterno = ids.has(tx.toAccountId) && ids.has(tx.fromAccountId);

  if (KINDS_NO_SUJETO.has(kind) || esInterno) {
    return { tratamiento: 'No sujeto', impuesto: '—' };
  }
  // Operación sujeta: ingreso o gasto comercial con IVA
  const impuestos = [];
  if (esIngreso) impuestos.push('IRM');
  if (Number(tx.ivaPz || tx.taxAmount || 0) > 0) impuestos.push('IVA');
  const sujeto = esIngreso || esGasto || KINDS_INGRESO_SUJETO.has(kind);
  return {
    tratamiento: sujeto ? 'Sujeto' : 'No sujeto',
    impuesto: impuestos.length ? impuestos.join('/') : (sujeto ? 'IRM' : '—')
  };
}

// ── Formatea un movimiento para el anexo ─────────────────────────────────
function formatearMovimiento(tx, idx, ids) {
  const clas = clasificarMovimiento(tx, ids);
  return {
    id: tx.id || `MOV-${String(idx + 1).padStart(3, '0')}`,
    fecha: (tx.createdAt || '').slice(0, 10),
    concepto: tx.concept || tx.note || tx.kind || 'Operación',
    importe: Math.round(Number(tx.amountPz || 0) * 100) / 100,
    impuesto: clas.impuesto,
    tratamiento: clas.tratamiento
  };
}

// ── Genera el número DFM del periodo (DFM-YYYY-MM-000001) ────────────────
export async function generarNumeroDFM(mesPeriodo, entidad = 'tributos') {
  const prefijo = `DFM-${mesPeriodo}-`;
  // Contar DFM de este periodo entre todos los documentos de la entidad
  const docs = await getDocumentosByEntidadAsync(entidad).catch(() => []);
  const total = (docs || []).filter(d => d.tipo === 'dfm-mensual' && d.datos?.periodo === mesPeriodo).length;
  const seq = total + 1;
  return `${prefijo}${String(seq).padStart(6, '0')}`;
}

// ── Genera (o regenera) el expediente completo de una declaración ────────
// decl: la declaración desde sbGetDeclaracion
// ctx: { state, nombreLegal, identificador, tipoSujeto, esJunior, pagaCapitalia, eip, estadoFinal }
export async function generarExpedienteDeclaracion(decl, ctx = {}) {
  const {
    state = {}, nombreLegal = decl?.placeta_id || '—',
    identificador = decl?.placeta_id || '—',
    tipoSujeto = 'Persona Física',
    esJunior = false, pagaCapitalia = false, eip = null,
    estadoFinal = false
  } = ctx;

  const placetaId = decl.placeta_id;
  const mesPeriodo = decl.mes_periodo;
  const periodoLabel = mesPeriodo;

  // ── Cuentas del sujeto (misma regla que la reconciliación) ──────────
  const esEIP = /^EIP-[A-Z0-9]{4,}$/i.test(placetaId || '');
  const cuentas = esEIP
    ? (state.accounts || []).filter(a =>
        String(a.eip || '').toUpperCase() === String(placetaId || '').toUpperCase() &&
        (a.type === 'Business' || a.type === 'State'))
    : (state.accounts || []).filter(a =>
        (a.placetaId === placetaId || a.id === placetaId) &&
        a.type !== 'Business' && a.type !== 'State');
  const ids = new Set(cuentas.map(c => c.id));

  // ── Movimientos del periodo ──────────────────────────────────────────
  const [anio, mes] = String(mesPeriodo).split('-').map(Number);
  const trans = (state.transactions || []).filter(t => {
    if (!ids.has(t.fromAccountId) && !ids.has(t.toAccountId)) return false;
    const d = new Date(t.createdAt || t.updatedAt);
    return d.getFullYear() === anio && d.getMonth() + 1 === mes;
  });
  const movimientos = trans.map((t, i) => formatearMovimiento(t, i, ids));
  // Orden cronológico
  movimientos.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  const ingresosPeriodo = trans
    .filter(t => ids.has(t.toAccountId))
    .reduce((s, t) => s + Number(t.amountPz || 0), 0);
  const pagosPeriodo = trans
    .filter(t => ids.has(t.fromAccountId))
    .reduce((s, t) => s + Number(t.amountPz || 0), 0);

  const cuotaIRM = Math.round(Number(decl.cuota_irm || 0) * 100) / 100;
  const cuotaIGF = Math.round(Number(decl.cuota_igf || 0) * 100) / 100;

  // ── IVA: desglose repercutido/soportado (solo si hay operaciones) ───
  const ivaRepercutido = trans
    .filter(t => ids.has(t.toAccountId) && Number(t.ivaPz || t.taxAmount || 0) > 0)
    .reduce((s, t) => s + Number(t.ivaPz || t.taxAmount || 0), 0);
  const ivaSoportado = trans
    .filter(t => ids.has(t.fromAccountId) && Number(t.ivaPz || t.taxAmount || 0) > 0)
    .reduce((s, t) => s + Number(t.ivaPz || t.taxAmount || 0), 0);
  const baseRepercutida = trans
    .filter(t => ids.has(t.toAccountId) && Number(t.ivaPz || t.taxAmount || 0) > 0)
    .reduce((s, t) => s + Number(t.amountPz || 0), 0);
  const baseSoportada = trans
    .filter(t => ids.has(t.fromAccountId) && Number(t.ivaPz || t.taxAmount || 0) > 0)
    .reduce((s, t) => s + Number(t.amountPz || 0), 0);
  const rectificacionesIVA = trans
    .filter(t => (t.kind === 'Reversal') && Number(t.ivaPz || t.taxAmount || 0) > 0)
    .reduce((s, t) => s + Number(t.ivaPz || t.taxAmount || 0), 0);
  const deduccionesIVA = ivaSoportado;
  const resultadoIVA = Math.round((ivaRepercutido + rectificacionesIVA - deduccionesIVA) * 100) / 100;
  const muestraIVA = ivaRepercutido > 0 || ivaSoportado > 0 || resultadoIVA !== 0;

  // ── Operaciones de campaña identificadas (p.ej. «Placetas que Vuelven») ──
  const campanaRe = /placetas?\s+que\s+vuelven|vuelven|retorno|promoci[oó]n|campa[nñ]a/i;
  const campañas = movimientos
    .filter(m => campanaRe.test(String(m.concepto || '')))
    .map(m => ({ id: m.id, fecha: m.fecha, concepto: m.concepto, importe: m.importe }));

  // ── Bonificaciones (Juniors → CAPITALIA) ────────────────────────────
  const bonificaciones = pagaCapitalia ? (cuotaIRM + cuotaIGF) : 0;
  const otrosImpuestos = pagaCapitalia ? 0 : 0;
  const totalImpuestos = Math.round((cuotaIRM + cuotaIGF + (muestraIVA ? resultadoIVA : 0)) * 100) / 100;

  // ── DESGLOSE DETALLADO (DFM extensa tipo Agencia Tributaria) ────────
  const patrimonioMedio = decl.patrimonio_medio || 0;
  const ia = decl.indice_acumulacion || 0;
  const tipoCuenta = tipoSujeto === 'Empresa' ? 'Business' : 'Personal';
  const esEmpresaPequeña = tipoCuenta === 'Business' && patrimonioMedio < 20000;
  // ¿Factura IVA? Empresa con ventas reales con IVA → exenta SOLO de IGF (Art. 4.15);
  // el IRM NUNCA se exime.
  const facturaIVA = esEIP &&
    trans.some(t => ids.has(t.toAccountId) && Number(t.ivaPz || t.taxAmount || 0) > 0);
  const irmTipo = calcularIRM(ia, tipoCuenta);
  const igfDetalle = calcularIGF(patrimonioMedio, tipoCuenta, esEmpresaPequeña, facturaIVA);
  const exencionIGFMotivo = igfDetalle.exento ? (igfDetalle.motivo || 'Exención IGF (Art. 4.15)') : null;

  // Deducciones reales del ejercicio: desgravaciones 6% IVA + donaciones (RSP)
  let desgravaciones = [];
  try { desgravaciones = await listarDesgravaciones(); } catch { /* sin desgravaciones */ }
  const deduccionesLista = desgravaciones.filter(d => {
    const coincideDip = d.titular_dip && !esEIP && d.titular_dip === identificador;
    const coincideEip = d.titular_eip && esEIP && String(d.titular_eip).toUpperCase() === String(identificador).toUpperCase();
    return (coincideDip || coincideEip) && d.estado === 'registrada' &&
      String(d.ejercicio || new Date().getFullYear()) === String(anio);
  });
  const totalDeducciones = Math.round(deduccionesLista.reduce((s, d) => s + (d.cuantia || 0), 0) * 100) / 100;

  const saldoFinal = Math.round(cuentas.reduce((s, c) => s + (c.balancePz || 0), 0) * 100) / 100;
  const diasEnMes = new Date(anio, mes, 0).getDate();
  const mediaIngresos = Math.round((diasEnMes ? ingresosPeriodo / diasEnMes : 0) * 100) / 100;
  const mediaPagos = Math.round((diasEnMes ? pagosPeriodo / diasEnMes : 0) * 100) / 100;
  // Liquidación final: bruto → deducciones → bonificaciones (nunca negativo)
  const impuestoTrasDeducciones = Math.max(0, totalImpuestos - totalDeducciones);
  const cuotaFinal = Math.max(0, impuestoTrasDeducciones - bonificaciones);

  // Nº DFM del periodo
  const numeroDfm = await generarNumeroDFM(mesPeriodo);

  // ── Estado del documento ─────────────────────────────────────────────
  const sem = decl._estado_semantico || decl.estado_pago || 'Borrador';
  const esFinal = estadoFinal || /aprob|emit|pag|cobr/i.test(sem);

  const fechaHoy = new Date().toISOString().slice(0, 10);
  const baseDatos = {
    numeroDfm, titular: nombreLegal, identificador,
    dip: esEIP ? null : identificador, eip: eip || (esEIP ? identificador : null),
    tipoSujeto, periodo: periodoLabel, esJunior, pagaCapitalia,
    patrimonioMedio: patrimonioMedio,
    indiceAcumulacion: ia,
    ingresosPeriodo: Math.round(ingresosPeriodo * 100) / 100,
    pagosPeriodo: Math.round(pagosPeriodo * 100) / 100,
    saldoFinal, mediaIngresos, mediaPagos, diasActivos: diasEnMes,
    cuotaIRM, cuotaIGF, cuotaIVA: Math.round(resultadoIVA * 100) / 100,
    retenciones: 0, bonificaciones: Math.round(bonificaciones * 100) / 100,
    totalImpuestos, totalDeducciones, cuotaFinal,
    tipoIRM: irmTipo,
    tramosIGF: igfDetalle.tramos || [],
    exencionIGF: igfDetalle.exento || false,
    exencionIGFMotivo,
    facturaIVA,
    esEmpresaPequeña,
    deducciones: deduccionesLista.map(d => ({
      id: d.id, tipo: d.tipo, base: d.base || 0, iva_pagado: d.iva_pagado || 0,
      porcentaje: d.porcentaje || 0, cuantia: d.cuantia || 0, origen: d.origen_tipo || ''
    })),
    muestraIVA, muestraRetenciones: false,
    fechaCierre: esFinal ? fechaHoy : '—'
  };

  const hashExpediente = createHash('sha256')
    .update(`${placetaId}|${mesPeriodo}|${cuotaIRM}|${cuotaIGF}|${movimientos.length}|${fechaHoy}`)
    .digest('hex').slice(0, 32).toUpperCase();

  const docsGenerados = [];

  // 1) DFM — documento principal
  docsGenerados.push(await saveDocumentoAsync('tributos', {
    id: `dfm-${decl.id}`, tipo: 'dfm-mensual',
    titulo: `Declaración Fiscal Mensual ${mesPeriodo} — ${numeroDfm}`,
    descripcion: `DFM de ${nombreLegal} para el periodo ${mesPeriodo}`,
    datos: { ...baseDatos, estado: esFinal ? 'Definitivo' : 'Borrador' },
    refId: decl.id, refTipo: 'declaracion', refEntidad: 'tributos',
    createdBy: 'sistema', estado: esFinal ? 'final' : 'borrador',
    hash: createHash('sha256').update(numeroDfm).digest('hex').slice(0, 16)
  }));

  // 2) Anexo de movimientos fiscales
  docsGenerados.push(await saveDocumentoAsync('tributos', {
    id: `anexo-${decl.id}`, tipo: 'anexo-movimientos-fiscales',
    titulo: `Anexo de Movimientos Fiscales ${mesPeriodo} — ${numeroDfm}`,
    descripcion: `Auditoría de movimientos del periodo ${mesPeriodo}`,
    datos: { numeroDfm, titular: nombreLegal, periodo: periodoLabel, movimientos, totalMovimientos: movimientos.length },
    refId: decl.id, refTipo: 'declaracion', refEntidad: 'tributos',
    createdBy: 'sistema', estado: esFinal ? 'final' : 'borrador',
    hash: createHash('sha256').update(placetaId + mesPeriodo).digest('hex').slice(0, 16)
  }));

  // 3) Declaración específica de IRM
  docsGenerados.push(await saveDocumentoAsync('tributos', {
    id: `irm-${decl.id}`, tipo: 'declaracion-irm',
    titulo: `Declaración IRM ${mesPeriodo} — ${nombreLegal}`,
    descripcion: 'Impuesto de Regulación Monetaria (Art. 4.8-4.11)',
    datos: {
      titular: nombreLegal, identificador, periodo: periodoLabel, esJunior, pagaCapitalia,
      ingresosPeriodo: Math.round(ingresosPeriodo * 100) / 100,
      exencionesIRM: 0, reduccionesIRM: 0,
      baseIRM: decl.patrimonio_medio || 0,
      tipoIRM: decl.indice_acumulacion && decl.patrimonio_medio
        ? (decl.cuota_irm || 0) / (decl.patrimonio_medio || 1)
        : 0,
      cuotaIntegraIRM: cuotaIRM, deduccionesIRM: 0, retenciones: 0,
      bonificacionesIRM: pagaCapitalia ? cuotaIRM : 0,
      cuotaFinalIRM: pagaCapitalia ? 0 : cuotaIRM,
      cuotaIRM
    },
    refId: decl.id, refTipo: 'declaracion', refEntidad: 'tributos',
    createdBy: 'sistema', estado: esFinal ? 'final' : 'borrador',
    hash: createHash('sha256').update('irm' + decl.id).digest('hex').slice(0, 16)
  }));

  // 4) Declaración específica de IGF
  docsGenerados.push(await saveDocumentoAsync('tributos', {
    id: `igf-${decl.id}`, tipo: 'declaracion-igf',
    titulo: `Declaración IGF ${mesPeriodo} — ${nombreLegal}`,
    descripcion: 'Impuesto sobre Grandes Fortunas (Art. 4.12-4.16)',
    datos: {
      titular: nombreLegal, identificador, periodo: periodoLabel, esJunior, pagaCapitalia,
      patrimonioBruto: decl.patrimonio_medio || 0,
      bienesComputables: decl.patrimonio_medio || 0,
      deudasComputables: 0, patrimonioExento: 0,
      patrimonioNeto: decl.patrimonio_medio || 0,
      baseIGF: Math.max(0, (decl.patrimonio_medio || 0) - 5000),
      cuotaIGF, bonificacionesIGF: pagaCapitalia ? cuotaIGF : 0,
      resultadoIGF: pagaCapitalia ? 0 : cuotaIGF,
      exencionIGF: decl.exencion_aplicada || false
    },
    refId: decl.id, refTipo: 'declaracion', refEntidad: 'tributos',
    createdBy: 'sistema', estado: esFinal ? 'final' : 'borrador',
    hash: createHash('sha256').update('igf' + decl.id).digest('hex').slice(0, 16)
  }));

  // 5) Declaración de IVA (solo si hay operaciones sujetas)
  if (muestraIVA) {
    docsGenerados.push(await saveDocumentoAsync('tributos', {
      id: `iva-${decl.id}`, tipo: 'declaracion-iva',
      titulo: `Declaración IVA ${mesPeriodo} — ${nombreLegal}`,
      descripcion: 'Liquidación de IVA (Art. 4.4)',
      datos: {
        titular: nombreLegal, identificador, periodo: periodoLabel,
        baseRepercutida: Math.round(baseRepercutida * 100) / 100,
        ivaRepercutido: Math.round(ivaRepercutido * 100) / 100,
        baseSoportada: Math.round(baseSoportada * 100) / 100,
        ivaSoportado: Math.round(ivaSoportado * 100) / 100,
        rectificacionesIVA: Math.round(rectificacionesIVA * 100) / 100,
        deduccionesIVA: Math.round(deduccionesIVA * 100) / 100,
        resultadoIVA: Math.round(resultadoIVA * 100) / 100,
        campañas
      },
      refId: decl.id, refTipo: 'declaracion', refEntidad: 'tributos',
      createdBy: 'sistema', estado: esFinal ? 'final' : 'borrador',
      hash: createHash('sha256').update('iva' + decl.id).digest('hex').slice(0, 16)
    }));
  }

  // 6) Certificado de Bonificación Fiscal (solo Juniors)
  if (pagaCapitalia) {
    docsGenerados.push(await saveDocumentoAsync('tributos', {
      id: `bonif-${decl.id}`, tipo: 'certificado-bonificacion-fiscal',
      titulo: `Certificado de Bonificación Fiscal ${mesPeriodo} — ${nombreLegal}`,
      descripcion: 'Bonificación asumida por CAPITALIA (Art. 5 Normativa Placeta Junior)',
      datos: {
        titular: nombreLegal, periodo: periodoLabel,
        cuotaIRM, cuotaIGF, otrosImpuestos,
        numeroDfm
      },
      refId: decl.id, refTipo: 'declaracion', refEntidad: 'tributos',
      createdBy: 'sistema', estado: 'final', firmado: false,
      hash: createHash('sha256').update('bonif' + decl.id).digest('hex').slice(0, 16)
    }));
  }

  // 7) Certificado de Cierre Fiscal (solo al aprobar/emitir/cobrar)
  if (esFinal) {
    docsGenerados.push(await saveDocumentoAsync('tributos', {
      id: `cierre-${decl.id}`, tipo: 'certificado-cierre-fiscal',
      titulo: `Certificado de Cierre Fiscal ${mesPeriodo} — ${numeroDfm}`,
      descripcion: 'Cierre y conciliación del expediente fiscal',
      datos: {
        numeroDfm, periodo: periodoLabel,
        hashExpediente, fechaCierre: fechaHoy,
        responsable: 'Sistema Fiscal de La Placeta (RSP)',
        estado: 'Definitivo',
        firmaDigital: `QR-${hashExpediente.slice(0, 12)}`
      },
      refId: decl.id, refTipo: 'declaracion', refEntidad: 'tributos',
      createdBy: 'sistema', estado: 'final', firmado: false,
      hash: hashExpediente
    }));
  }

  return {
    success: true,
    numeroDfm, hashExpediente,
    movimientos, ingresosPeriodo, pagosPeriodo,
    iva: { muestraIVA, ivaRepercutido, ivaSoportado, resultadoIVA },
    campanas: campañas.length,
    bonificaciones,
    documentos: docsGenerados
  };
}

export default { generarExpedienteDeclaracion, generarNumeroDFM, clasificarMovimiento };
