/* Plantillas de baremos que el sistema puede comprobar AUTOMÁTICAMENTE
   (patrimonio, edad, nivel de verificación, cuentas, junior…). */
export interface PlantillaBaremo {
  id: string;
  etiqueta: string;
  descripcion: string;
  /** Cómo se calcula/comprueba automáticamente este criterio. */
  explicacion: string;
  tipo: 'patrimonio' | 'edad' | 'nivel' | 'cuentas' | 'junior';
  operador: '<' | '>' | '<=' | '>=' | '==';
  valor: number;
}

export const BAREMOS_AUTOMATICOS: PlantillaBaremo[] = [
  { id: 'renta_baja', etiqueta: 'Renta baja', descripcion: 'Patrimonio medio < 20.000 Pz', explicacion: 'Se suma el saldo de todas las cuentas personales (Current, Savings, Investment) del solicitante y se compara con 20.000 Pz.', tipo: 'patrimonio', operador: '<', valor: 20000 },
  { id: 'renta_media', etiqueta: 'Renta media', descripcion: 'Patrimonio medio < 100.000 Pz', explicacion: 'Se suma el saldo de todas las cuentas personales del solicitante y se compara con 100.000 Pz.', tipo: 'patrimonio', operador: '<', valor: 100000 },
  { id: 'menor_16', etiqueta: 'Menor de 16 años', descripcion: 'Edad < 16', explicacion: 'Se calcula la edad a partir de la fecha de nacimiento registrada en PlacetaID.', tipo: 'edad', operador: '<', valor: 16 },
  { id: 'nivel_n3', etiqueta: 'Verificación N3', descripcion: 'Nivel de verificación = N3', explicacion: 'Se comprueba el nivel de verificación de identidad en PlacetaID (N3 = identidad plenamente verificada).', tipo: 'nivel', operador: '==', valor: 3 },
  { id: 'familia_numerosa', etiqueta: 'Familia numerosa', descripcion: '3+ cuentas vinculadas', explicacion: 'Se cuentan las cuentas bancarias activas vinculadas al mismo titular/tutor.', tipo: 'cuentas', operador: '>=', valor: 3 },
  { id: 'junior_activo', etiqueta: 'Junior activo', descripcion: 'Tiene cuenta junior activa', explicacion: 'Se comprueba si el solicitante tiene una cuenta Child activa en el banco.', tipo: 'junior', operador: '==', valor: 1 },
];
