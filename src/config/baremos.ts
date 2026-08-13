/* Plantillas de baremos que el sistema puede comprobar AUTOMÁTICAMENTE
   (patrimonio, edad, nivel de verificación, cuentas, junior…). */
export interface PlantillaBaremo {
  id: string;
  etiqueta: string;
  descripcion: string;
  tipo: 'patrimonio' | 'edad' | 'nivel' | 'cuentas' | 'junior';
  operador: '<' | '>' | '<=' | '>=' | '==';
  valor: number;
}

export const BAREMOS_AUTOMATICOS: PlantillaBaremo[] = [
  { id: 'renta_baja', etiqueta: 'Renta baja', descripcion: 'Patrimonio medio < 20.000 Pz', tipo: 'patrimonio', operador: '<', valor: 20000 },
  { id: 'renta_media', etiqueta: 'Renta media', descripcion: 'Patrimonio medio < 100.000 Pz', tipo: 'patrimonio', operador: '<', valor: 100000 },
  { id: 'menor_16', etiqueta: 'Menor de 16 años', descripcion: 'Edad < 16', tipo: 'edad', operador: '<', valor: 16 },
  { id: 'nivel_n3', etiqueta: 'Verificación N3', descripcion: 'Nivel de verificación = N3', tipo: 'nivel', operador: '==', valor: 3 },
  { id: 'familia_numerosa', etiqueta: 'Familia numerosa', descripcion: '3+ cuentas vinculadas', tipo: 'cuentas', operador: '>=', valor: 3 },
  { id: 'junior_activo', etiqueta: 'Junior activo', descripcion: 'Tiene cuenta junior activa', tipo: 'junior', operador: '==', valor: 1 },
];
