/* ═══════════════════════════════════════════════════════════════════════
   Fixture de ESTADO TIPO PRODUCCIÓN para comprobar el motor de
   facturación / tributos SIN tocar la base real ni mover dinero.
   Reproduce la forma del estado del Banco (api/crm-state) con las cuentas
   Business/EIP reales del snapshot de rsp-web y movimientos de un mes.
   ═══════════════════════════════════════════════════════════════════════ */

export function estadoProduccion() {
  return {
    accounts: [
      // Empresas del Grupo (cuentas Business con su EIP)
      { id: 'acc-co-1765312323183', type: 'Business', eip: 'EIP-XJETNL', name: 'Unhiro S.PV.', displayName: 'Unhiro S.PV.', balancePz: 131.3 },
      { id: 'acc-co-1765320068081', type: 'Business', eip: 'EIP-X4NGQU', name: 'Red del Grupo de La Placeta S.P.', displayName: 'Red del Grupo de La Placeta S.P.', balancePz: 18421.83 },
      { id: 'acc-1765307093731-583', type: 'Business', eip: 'EIP-PTTELECOM', name: 'Placeta Telecom S.P.', displayName: 'Placeta Telecom S.P.', balancePz: 460435.91 },
      // Sistema / tesorería (nunca son clientes ni se agrupan por EIP)
      { id: 'TGLP', type: 'Business', name: 'TGLP Tributos', displayName: 'TGLP Tributos', balancePz: -24050.25 },
      { id: 'CAPITALIA_BANK', type: 'Business', name: 'Capitália Empresa', displayName: 'Capitália Empresa', balancePz: 17985 },
      { id: 'FUND-BLP', type: 'Business', name: 'Fundación La Placeta', displayName: 'Fundación La Placeta', balancePz: 4520 },
      // Personas (clientes reales del snapshot)
      { id: 'acc-1765153714103', type: 'Current', placetaId: '23749931M', name: 'Mikel Alegre Marcos', displayName: 'Mikel Alegre Marcos', balancePz: 477763.59 },
      { id: 'acc-1765307093680-656', type: 'Current', placetaId: '20521220S', name: 'Salma El Harrak', displayName: 'Salma El Harrak', balancePz: 35457.1 },
      { id: 'acc-1765267998957', type: 'Current', placetaId: '72583347U', name: 'Unai García Almazán', displayName: 'Unai García Almazán', balancePz: 484857.18 },
      { id: 'acc-45134577', type: 'Current', placetaId: '45134577U', name: 'Uriel', displayName: 'Uriel', balancePz: 9940.14 },
    ],
    transactions: [
      // Venta real: un cliente (persona) paga a Red del Grupo
      { id: 'TX-RED-001', fromAccountId: 'acc-1765153714103', toAccountId: 'acc-co-1765320068081', amountPz: 1120, status: 'settled', kind: 'Consumption', concept: 'Venta servicios', createdAt: '2026-08-05T10:00:00Z' },
      // Servicio interno: Red paga a Placeta Telecom (red interna)
      { id: 'TX-TEL-001', fromAccountId: 'acc-co-1765320068081', toAccountId: 'acc-1765307093731-583', amountPz: 2000, status: 'settled', kind: 'Service', concept: 'Servicio red interna', createdAt: '2026-08-10T10:00:00Z' },
      // Venta real: Salma paga a Placeta Telecom
      { id: 'TX-TEL-002', fromAccountId: 'acc-1765307093680-656', toAccountId: 'acc-1765307093731-583', amountPz: 112, status: 'settled', kind: 'Consumption', concept: 'Venta consumo', createdAt: '2026-08-12T10:00:00Z' },
      // Venta real: Uriel paga a Unhiro
      { id: 'TX-UNH-001', fromAccountId: 'acc-45134577', toAccountId: 'acc-co-1765312323183', amountPz: 224, status: 'settled', kind: 'Placezum', concept: 'Venta placetum', createdAt: '2026-08-15T10:00:00Z' },
      // Pago parcial de tributos: Red transfiere a TGLP (kind Tax)
      { id: 'TX-RED-TAX', fromAccountId: 'acc-co-1765320068081', toAccountId: 'TGLP', amountPz: 400, status: 'settled', kind: 'Tax', concept: 'Tributos mes', createdAt: '2026-08-20T10:00:00Z' },
      // Transferencia entre cuentas del mismo propietario (no cuenta como venta)
      { id: 'TX-PER-001', fromAccountId: 'acc-1765153714103', toAccountId: 'acc-1765267998957', amountPz: 50, status: 'settled', kind: 'Transferencia', concept: 'Pago entre amigos', createdAt: '2026-08-08T10:00:00Z' },
      // Movimiento PENDING (no liquidado): no debe contar
      { id: 'TX-PEND-001', fromAccountId: 'acc-1765153714103', toAccountId: 'acc-co-1765320068081', amountPz: 5000, status: 'pending', kind: 'Consumption', concept: 'Venta sin liquidar', createdAt: '2026-08-25T10:00:00Z' },
    ],
  };
}

/** CNIC vigentes tipo producción (mismo origen que BOP). */
export function cnicProduccion() {
  return [
    { codigo: 'CNIC-IVA', etiqueta: 'IVA tipo general', tipoValor: 'porcentaje', valor: 12, unidad: '%' },
    { codigo: 'CNIC-IRM-EMPRESA-1', valor: 1 }, { codigo: 'CNIC-IRM-EMPRESA-2', valor: 3 },
    { codigo: 'CNIC-IRM-EMPRESA-3', valor: 6 }, { codigo: 'CNIC-IRM-EMPRESA-4', valor: 9 },
    { codigo: 'CNIC-IGF-EMPRESA-TRAMO-1', valor: 5000 }, { codigo: 'CNIC-IGF-EMPRESA-TIPO-1', valor: 0 },
    { codigo: 'CNIC-IGF-EMPRESA-TRAMO-2', valor: 20000 }, { codigo: 'CNIC-IGF-EMPRESA-TIPO-2', valor: 5 },
    { codigo: 'CNIC-IGF-EMPRESA-TRAMO-3', valor: 500000 }, { codigo: 'CNIC-IGF-EMPRESA-TIPO-3', valor: 35 },
    { codigo: 'CNIC-IGF-EMPRESA-TIPO-4', valor: 85 },
    { codigo: 'CNIC-EXENCION-EMPRESA-PEQUENA', valor: 20000 },
  ];
}

/** Cuotas sintéticas y controladas (para tests deterministas). */
export function contribuyentesSinteticos() {
  return [
    { id: 'EIP-XJETNL', nombre: 'Unhiro Inversiones S.P.', tipo: 'empresa', cuotaIrm: 0, cuotaIgf: 0, ivaExento: true, igfExentoReducida: true, estadoFiscal: 'al_dia', patrimonioMedio: 131.3 },
    { id: 'EIP-X4NGQU', nombre: 'Red del Grupo de La Placeta S.P.', tipo: 'empresa', cuotaIrm: 300, cuotaIgf: 150, ivaExento: true, igfExentoReducida: false, estadoFiscal: 'al_dia', patrimonioMedio: 18421.83 },
    { id: 'EIP-PTTELECOM', nombre: 'Placeta Telecom S.P.', tipo: 'empresa', cuotaIrm: 100, cuotaIgf: 50, ivaExento: true, igfExentoReducida: false, estadoFiscal: 'pendiente', patrimonioMedio: 460435.91 },
  ];
}

export const MES = '2026-08';
export const VENCIMIENTO = '2026-08-31';
// Después del vencimiento: permite comprobar vencidas/parciales y el plan de cobro.
export const HOY_POST_CIERRE = '2026-09-01';
