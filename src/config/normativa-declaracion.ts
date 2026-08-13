/* Normativa (CNIC del BOP) aplicada a las declaraciones, para explicar cada concepto. */
export interface NormaAplicada {
  codigo: string;
  descripcion: string;
  valor: string;
}

export const NORMATIVA_APLICADA: NormaAplicada[] = [
  { codigo: 'CNIC-IVA', descripcion: 'Impuesto sobre el Valor Añadido (tipo general)', valor: '12%' },
  { codigo: 'CNIC-IGF-PF-TRAMO-1', descripcion: 'Mínimo exento de IGF (personas físicas)', valor: '5.000 Pz' },
  { codigo: 'CNIC-IGF-PF-TIPO-1/2/3', descripcion: 'Tipos IGF personas físicas por tramos', valor: '0% / 10% / 30%' },
  { codigo: 'CNIC-IGF-PF-TRAMO-2', descripcion: 'Segundo tramo IGF', valor: '20.000 Pz' },
  { codigo: 'CNIC-IGF-PF-TRAMO-3', descripcion: 'Tercer tramo IGF', valor: '500.000 Pz' },
  { codigo: 'CNIC-IRM-PARTICULAR-0..4', descripcion: 'Tipos IRM cuenta particular (por IA)', valor: '0% / 0.5% / 1.5% / 4% / 6%' },
  { codigo: 'CNIC-IRM-EMPRESA-0..4', descripcion: 'Tipos IRM cuenta empresa (por IA)', valor: '0% / 0.75% / 2% / 5% / 9%' },
  { codigo: 'CNIC-COTIZACION-TRABAJADOR-*', descripcion: 'Cotización a cargo del trabajador (por tramo salarial)', valor: '7.5% / 10.5% / 17.5%' },
  { codigo: 'CNIC-SMI-MENSUAL', descripcion: 'Salario Mínimo Interprofesional', valor: '150 Pz' },
  { codigo: 'CNIC-LIMITE-CAPITAL-PERSONAL', descripcion: 'Límite de capital de la cuenta personal', valor: '500.000 Pz' },
];
