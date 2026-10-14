/* Tipos de transacción reales del Banco de La Placeta (TransactionKind,
   copiado del motor del banco-app). Se usan para marcar qué tipos son APTOS
   para justificar una subvención (los gastos elegibles). */
export interface TipoTransaccionBanco {
  id: string;
  etiqueta: string;
  descripcion: string;
  /** Sugerencia: apto por defecto para justificar subvenciones. */
  aptoPorDefecto: boolean;
}

export const TIPOS_TRANSACCION_BANCO: TipoTransaccionBanco[] = [
  { id: 'Consumption', etiqueta: 'Consumo', descripcion: 'Compra de bienes o servicios', aptoPorDefecto: true },
  { id: 'Retribucion', etiqueta: 'Retribución', descripcion: 'Nómina / salario abonado', aptoPorDefecto: true },
  { id: 'PayrollLoan', etiqueta: 'Anticipo de nómina', descripcion: 'Préstamo/anticipo salarial', aptoPorDefecto: true },
  { id: 'OperationalFee', etiqueta: 'Tasa operativa', descripcion: 'Gasto de operación del servicio', aptoPorDefecto: true },
  { id: 'BusinessRegistrationFee', etiqueta: 'Alta de empresa', descripcion: 'Tasa de constitución de empresa', aptoPorDefecto: true },
  { id: 'CapitaliaServiceFee', etiqueta: 'Comisión Capitália', descripcion: 'Comisión de servicios Capitália', aptoPorDefecto: true },
  { id: 'InvestmentBuy', etiqueta: 'Compra de inversión', descripcion: 'Adquisición de activo financiero', aptoPorDefecto: true },
  { id: 'Donation', etiqueta: 'Donación', descripcion: 'Donación realizada', aptoPorDefecto: false },
  { id: 'Gift', etiqueta: 'Regalo', descripcion: 'Transferencia a título gratuito', aptoPorDefecto: false },
  { id: 'Allowance', etiqueta: 'Paga', descripcion: 'Paga/periódica recibida', aptoPorDefecto: false },
  { id: 'Subsidy', etiqueta: 'Subvención', descripcion: 'Subvención recibida', aptoPorDefecto: false },
  { id: 'Dividend', etiqueta: 'Dividendo', descripcion: 'Reparto de beneficios', aptoPorDefecto: false },
  { id: 'SavingsInterest', etiqueta: 'Interés de ahorro', descripcion: 'Intereses generados', aptoPorDefecto: false },
  { id: 'LotteryPrize', etiqueta: 'Premio de lotería', descripcion: 'Premio recibido', aptoPorDefecto: false },
  { id: 'WelcomeBonus', etiqueta: 'Bono de bienvenida', descripcion: 'Bono de alta', aptoPorDefecto: false },
  { id: 'Rbu', etiqueta: 'RBU', descripcion: 'Renta básica universal', aptoPorDefecto: false },
  { id: 'Placezum', etiqueta: 'PlaceZum', descripcion: 'Pago contactless PlaceZum', aptoPorDefecto: true },
  { id: 'InvestmentSell', etiqueta: 'Venta de inversión', descripcion: 'Liquidación de activo', aptoPorDefecto: false },
  { id: 'Fine', etiqueta: 'Multa', descripcion: 'Sanción abonada', aptoPorDefecto: false },
  { id: 'Tax', etiqueta: 'Impuesto', descripcion: 'Pago de impuesto', aptoPorDefecto: false },
  { id: 'IrmCharge', etiqueta: 'Cargo IRM', descripcion: 'Liquidación IRM', aptoPorDefecto: false },
  { id: 'IvaAdjustment', etiqueta: 'Ajuste IVA', descripcion: 'Regularización de IVA', aptoPorDefecto: false },
  { id: 'InvestmentTax', etiqueta: 'Impuesto de inversión', descripcion: 'Impuesto sobre inversiones', aptoPorDefecto: false },
  { id: 'InvestmentCommission', etiqueta: 'Comisión de inversión', descripcion: 'Comisión de inversión', aptoPorDefecto: false },
  { id: 'LateTaxInterest', etiqueta: 'Interés de demora', descripcion: 'Recargo por impago', aptoPorDefecto: false },
  { id: 'CardIssueFee', etiqueta: 'Emisión de tarjeta', descripcion: 'Tasa de tarjeta', aptoPorDefecto: false },
  { id: 'ForcedVatRegularization', etiqueta: 'Regularización forzosa IVA', descripcion: 'Regularización automática', aptoPorDefecto: false },
  { id: 'MonetaryEmission', etiqueta: 'Emisión monetaria', descripcion: 'Emisión de placetas', aptoPorDefecto: false },
  { id: 'Reversal', etiqueta: 'Reversión', descripcion: 'Operación revertida', aptoPorDefecto: false },
  { id: 'ExternalBlocked', etiqueta: 'Bloqueo externo', descripcion: 'Movimiento bloqueado', aptoPorDefecto: false },
];

/** Lista de ids aptos por defecto (gastos elegibles). */
export const TIPOS_APTOS_POR_DEFECTO = TIPOS_TRANSACCION_BANCO.filter((t) => t.aptoPorDefecto).map((t) => t.id);
