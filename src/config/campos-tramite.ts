/* Formularios específicos por tipo de trámite: campos precisos, no genéricos. */
import type { CampoTramite } from '../types';

export const CAMPOS_POR_TIPO: Record<string, CampoTramite[]> = {
  subvencion: [
    { id: 'importe', etiqueta: 'Importe (Pz)', tipo: 'numero', requerido: true, placeholder: '1000' },
    { id: 'beneficiario', etiqueta: 'DIP/EIP beneficiario', tipo: 'texto', requerido: true, placeholder: 'EIP-XJETNL' },
    { id: 'destino', etiqueta: 'Destino del gasto', tipo: 'textarea', requerido: true, placeholder: 'Material escolar…' },
    { id: 'documentos_requeridos', etiqueta: 'Documentos a requerir (uno por línea)', tipo: 'textarea', placeholder: 'Presupuesto\nFactura proforma' },
  ],
  cambio_titularidad: [
    { id: 'cuenta', etiqueta: 'IBAN de la cuenta', tipo: 'texto', requerido: true, placeholder: 'GDLP-AP98-605' },
    { id: 'cedente', etiqueta: 'DIP cedente', tipo: 'texto', requerido: true },
    { id: 'cesionario', etiqueta: 'DIP cesionario', tipo: 'texto', requerido: true },
    { id: 'porcentaje', etiqueta: 'Porcentaje a transmitir (%)', tipo: 'numero', requerido: true, placeholder: '50' },
  ],
  herencia: [
    { id: 'causante', etiqueta: 'DIP del causante', tipo: 'identidad', requerido: true },
    { id: 'testamento', etiqueta: 'Testamento digital (referencia)', tipo: 'texto', placeholder: 'TEST-2026-0001' },
    { id: 'herederos', etiqueta: 'Herederos y %', tipo: 'reparto', requerido: true },
  ],
  baja: [
    { id: 'motivo', etiqueta: 'Motivo de la baja', tipo: 'select', requerido: true, opciones: ['Traslado fuera del ecosistema', 'Fallecimiento', 'Renuncia voluntaria'] },
    { id: 'fecha_efecto', etiqueta: 'Fecha de efecto', tipo: 'fecha', requerido: true },
    { id: 'documentacion', etiqueta: 'Documentación a aportar', tipo: 'textarea' },
  ],
  reclamacion: [
    { id: 'servicio_afectado', etiqueta: 'Servicio afectado', tipo: 'select', requerido: true, opciones: ['Banco', 'Tributos', 'RSP', 'Patrimonio', 'Placeta Junior'] },
    { id: 'descripcion', etiqueta: 'Descripción de la reclamación', tipo: 'textarea', requerido: true },
  ],
  certificado: [
    { id: 'tipo_certificado', etiqueta: 'Tipo de certificado', tipo: 'select', requerido: true, opciones: ['Residencia', 'Patrimonio', 'Estar al corriente', 'Antecedentes administrativos'] },
    { id: 'destinatario', etiqueta: 'Destinatario del certificado', tipo: 'texto', placeholder: 'Uso propio / tercera entidad' },
  ],
  reparto_empresa: [
    { id: 'empresa', etiqueta: 'EIP de la empresa a repartir', tipo: 'identidad', requerido: true },
    { id: 'socios', etiqueta: 'Socios y %', tipo: 'reparto', requerido: true },
    { id: 'fecha_efecto', etiqueta: 'Fecha de efecto', tipo: 'fecha', requerido: true },
  ],
  cuenta_bancaria: [
    { id: 'titular', etiqueta: 'Titular (DIP/EIP)', tipo: 'identidad', requerido: true },
    { id: 'tipo_cuenta', etiqueta: 'Tipo de cuenta', tipo: 'select', requerido: true, opciones: ['Current', 'Business', 'Savings', 'Investment'] },
  ],
  cuenta_compartida: [
    { id: 'titulares', etiqueta: 'Cotitulares y %', tipo: 'reparto', requerido: true },
    { id: 'tipo_cuenta', etiqueta: 'Tipo de cuenta', tipo: 'select', requerido: true, opciones: ['Current', 'Savings'] },
  ],
  cuenta_ahorro: [
    { id: 'titular', etiqueta: 'Titular (DIP)', tipo: 'identidad', requerido: true },
    { id: 'objetivo', etiqueta: 'Objetivo del ahorro', tipo: 'texto', placeholder: 'Vivienda, estudios…' },
    { id: 'saldo_inicial', etiqueta: 'Saldo inicial (Pz)', tipo: 'numero' },
  ],
  tarjeta_digital: [
    { id: 'titular', etiqueta: 'Titular (DIP)', tipo: 'identidad', requerido: true },
    { id: 'tipo_tarjeta', etiqueta: 'Tipo de tarjeta', tipo: 'select', requerido: true, opciones: ['Débito', 'Crédito', 'Virtual'] },
    { id: 'limite', etiqueta: 'Límite (Pz)', tipo: 'numero' },
    { id: 'cuenta', etiqueta: 'Cuenta asociada (IBAN)', tipo: 'cuenta', placeholder: 'GDLP-…' },
  ],
  solicitud_bono: [
    { id: 'bono', etiqueta: 'Bono al que opta', tipo: 'bono', requerido: true },
    { id: 'dip', etiqueta: 'Ciudadano solicitante', tipo: 'identidad', requerido: true },
    { id: 'motivacion', etiqueta: 'Motivación', tipo: 'textarea' },
  ],
};

export function etiquetaCampo(tipo: string, campoId: string): string {
  const campos = CAMPOS_POR_TIPO[tipo] ?? [];
  return campos.find((c) => c.id === campoId)?.etiqueta ?? campoId;
}
