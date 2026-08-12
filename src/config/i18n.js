/**
 * i18n (FASE 12.2) — traducción mínima ES/EN.
 * Infraestructura lista para ampliar; por defecto ES.
 */
const TRADUCCIONES = {
  es: {
    lang: 'Español',
    dashboard: 'Inicio',
    tramites: 'Trámites',
    bandeja: 'Bandeja',
    trabajo: 'Bandeja de trabajo',
    expedientes: 'Expedientes',
    patrimonio: 'Patrimonio',
    cumplimiento: 'Cumplimiento',
    heredades: 'Bajas, Herencias y Testamento',
    conexiones: 'Conexiones',
    facturacion: 'Facturación',
    guardar: 'Guardar',
    cancelar: 'Cancelar',
    volver: 'Volver',
    buscar: 'Buscar',
    sinDatos: 'Sin datos',
  },
  en: {
    lang: 'English',
    dashboard: 'Home',
    tramites: 'Procedures',
    bandeja: 'Inbox',
    trabajo: 'Work queue',
    expedientes: 'Files',
    patrimonio: 'Assets',
    cumplimiento: 'Compliance',
    heredades: 'Departures, Inheritances & Will',
    conexiones: 'Connections',
    facturacion: 'Billing',
    guardar: 'Save',
    cancelar: 'Cancel',
    volver: 'Back',
    buscar: 'Search',
    sinDatos: 'No data',
  },
};

export function t(key, lang = 'es') {
  const tabla = TRADUCCIONES[lang] || TRADUCCIONES.es;
  return tabla[key] || key;
}

export function langFromReq(req) {
  const cookie = (req.headers.cookie || '');
  const m = cookie.match(/lang=([a-z]{2})/);
  if (m && TRADUCCIONES[m[1]]) return m[1];
  const header = (req.headers['accept-language'] || '').toLowerCase();
  if (header.startsWith('en')) return 'en';
  return 'es';
}
