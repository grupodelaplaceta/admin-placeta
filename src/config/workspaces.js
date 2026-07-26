/**
 * WORKSPACES — Definición de entidades públicas de Admin Placeta
 * 
 * Cada workspace es una entidad pública con su propia identidad,
 * navegación y conjunto de módulos.
 * 
 * Estructura:
 *   - id: identificificador único (coincide con la ruta /{id})
 *   - nombre: nombre para mostrar
 *   - icono: emoji o icono representativo
 *   - logo: ruta de la imagen del logo
 *   - descripcion: texto breve
 *   - color: color primario del workspace
 *   - colorDark: color oscuro para sidebar
 *   - iban: IBAN real de la entidad en Banco de La Placeta
 *   - secciones: array de secciones de navegación
 *     - titulo: nombre de la sección
 *     - enlaces: array de { texto, url, icono }
 */

const WORKSPACES = {
  banco: {
    id: 'banco',
    nombre: 'Banco de La Placeta',
    icono: '🏦',
    logo: '/img/logo-banco.png',
    descripcion: 'Gestión bancaria, cuentas, operaciones y cumplimiento normativo',
    color: '#3f00d8',
    colorDark: '#1c005f',
    iban: 'GDLP-AP98-605',
    background: 'linear-gradient(135deg, #1c005f 0%, #3f00d8 100%)',
    secciones: [
      {
        titulo: '💰 Banco',
        enlaces: [
          { texto: 'Dashboard', url: '/banco', icono: '📊' },
          { texto: 'Cuentas', url: '/banco/cuentas', icono: '📋' },
          { texto: 'Operaciones', url: '/banco/operaciones', icono: '🔄' },
          { texto: 'Tarjetas', url: '/banco/tarjetas', icono: '💳' },
          { texto: 'Cumplimiento', url: '/banco/control-cumplimiento', icono: '🛡️' },
          { texto: 'Trabajadores', url: '/banco/trabajadores', icono: '👥' },
          { texto: 'Nóminas', url: '/banco/nominas', icono: '📄' },
          { texto: 'Documentos', url: '/banco/documentos', icono: '📑' },
        ]
      },
      {
        titulo: '🔌 Desarrollo',
        enlaces: [
          { texto: 'APIs', url: '/banco/apis', icono: '🔌' },
          { texto: 'Gastos RSP', url: '/banco/gastos-rsp', icono: '💰' },
        ]
      }
    ]
  },
  tributos: {
    id: 'tributos',
    nombre: 'Tributos de La Placeta',
    icono: '📊',
    logo: '/img/logo-tributos.png',
    descripcion: 'Declaraciones, inspección, regímenes y gestión de contribuyentes',
    color: '#22a06b',
    colorDark: '#0d6b3e',
    iban: 'GDLP-TRBX-001',
    background: 'linear-gradient(135deg, #0d6b3e 0%, #22a06b 100%)',
    secciones: [
      {
        titulo: '📊 Tributos',
        enlaces: [
          { texto: 'Dashboard', url: '/tributos', icono: '🏛️' },
          { texto: 'Contribuyentes', url: '/tributos/contribuyentes', icono: '👤' },
          { texto: 'Declaraciones', url: '/tributos/declaraciones', icono: '📝' },
          { texto: 'Inspección', url: '/tributos/inspeccion', icono: '🔍' },
          { texto: 'Incidencias', url: '/tributos/incidencias', icono: '⚠️' },
          { texto: 'Regímenes', url: '/tributos/regimenes', icono: '📋' },
          { texto: 'Trabajadores', url: '/tributos/trabajadores', icono: '👥' },
          { texto: 'Documentos', url: '/tributos/documentos', icono: '📑' },
        ]
      },
      {
        titulo: '🔌 Desarrollo',
        enlaces: [
          { texto: 'APIs', url: '/tributos/apis', icono: '🔌' },
          { texto: 'Gastos RSP', url: '/tributos/gastos-rsp', icono: '💰' },
        ]
      }
    ]
  },
  junta: {
    id: 'junta',
    nombre: 'Junta de La Placeta',
    icono: '⚖️',
    logo: '/img/logo-gdlp.svg',
    descripcion: 'Gobierno, votaciones, cargos, reclamaciones y recursos',
    color: '#555',
    colorDark: '#333',
    iban: 'GDLP-AP00-001',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #555 100%)',
    secciones: [
      {
        titulo: '⚖️ Junta',
        enlaces: [
          { texto: 'Dashboard', url: '/junta', icono: '🏛️' },
          { texto: 'Ciudadanos', url: '/junta/ciudadanos', icono: '👥' },
          { texto: 'PlacetaID', url: '/junta/placetaid', icono: '🔑' },
          { texto: 'Reclamaciones', url: '/junta/reclamaciones', icono: '📨' },
          { texto: 'Reuniones', url: '/junta/reuniones', icono: '🤝' },
          { texto: 'Votaciones', url: '/junta/votaciones', icono: '🗳️' },
          { texto: 'Cargos', url: '/junta/cargos', icono: '👤' },
          { texto: 'Departamentos', url: '/junta/departamentos', icono: '🏢' },
          { texto: 'Recursos', url: '/junta/recursos', icono: '📦' },
          { texto: 'Junior', url: '/junta/junior', icono: '🧒' },
          { texto: 'Empresas', url: '/junta/empresas', icono: '🏢' },
          { texto: 'Cumplimiento', url: '/junta/empresas/cumplimiento', icono: '📊' },
          { texto: 'Documentos', url: '/junta/documentos', icono: '📑' },
        ]
      },
      {
        titulo: '🔌 Desarrollo',
        enlaces: [
          { texto: 'APIs', url: '/junta/apis', icono: '🔌' },
          { texto: 'Gastos RSP', url: '/junta/gastos-rsp', icono: '💰' },
        ]
      }
    ]
  },
  administracion: {
    id: 'administracion',
    nombre: 'Administración de La Placeta',
    icono: '📋',
    logo: '/img/logo-web.png',
    descripcion: 'Trámites, actas, PlacetaID y gestión ciudadana',
    color: '#d7a02d',
    colorDark: '#92400e',
    iban: 'GDLP-AP00-002',
    background: 'linear-gradient(135deg, #92400e 0%, #d7a02d 100%)',
    secciones: [
      {
        titulo: '📋 Administración',
        enlaces: [
          { texto: 'Dashboard', url: '/administracion', icono: '⚙️' },
          { texto: 'Trámites', url: '/administracion/tramites', icono: '📋' },
          { texto: 'Ciudadanos', url: '/administracion/ciudadanos', icono: '👥' },
          { texto: 'Tributos', url: '/administracion/tributos', icono: '📊' },
          { texto: 'Banco', url: '/administracion/banco', icono: '🏦' },
          { texto: 'Actas', url: '/administracion/actas', icono: '📄' },
          { texto: 'Votaciones', url: '/administracion/votaciones', icono: '🗳️' },
          { texto: 'PlacetaID', url: '/administracion/placetaid', icono: '🔑' },
          { texto: 'Junior', url: '/administracion/junior', icono: '🧒' },
          { texto: 'Empresas', url: '/administracion/empresas', icono: '🏢' },
          { texto: 'Cumplimiento', url: '/administracion/empresas/cumplimiento', icono: '📊' },
          { texto: 'Documentos', url: '/administracion/documentos', icono: '📑' },
        ]
      },
      {
        titulo: '🔌 Desarrollo',
        enlaces: [
          { texto: 'APIs', url: '/administracion/apis', icono: '🔌' },
          { texto: 'Gastos RSP', url: '/administracion/gastos-rsp', icono: '💰' },
        ]
      }
    ]
  },
  rsp: {
    id: 'rsp',
    nombre: 'Red de Servicios de La Placeta',
    icono: '🌐',
    logo: '/img/logo-web.png',
    descripcion: 'Conexiones, facturación y fondos de la RSP',
    color: '#0891b2',
    colorDark: '#065f7a',
    iban: 'GDLP-AP99-001',
    background: 'linear-gradient(135deg, #065f7a 0%, #0891b2 100%)',
    secciones: [
      {
        titulo: '🌐 RSP',
        enlaces: [
          { texto: 'Dashboard', url: '/rsp', icono: '📊' },
          { texto: 'Conexiones', url: '/rsp/conexiones', icono: '📡' },
          { texto: 'Facturación', url: '/rsp/facturacion', icono: '📄' },
          { texto: 'Fondos', url: '/rsp/fondos', icono: '💰' },
        ]
      },
      {
        titulo: '🔌 Desarrollo',
        enlaces: [
          { texto: 'APIs', url: '/rsp/apis', icono: '🔌' },
          { texto: 'Gastos RSP', url: '/rsp/gastos', icono: '💰' },
        ]
      }
    ]
  }
};

/**
 * Orden de workspaces en el selector
 */
const ORDEN_WORKSPACES = ['banco', 'tributos', 'junta', 'administracion', 'rsp'];

/**
 * Obtiene la configuración de un workspace por su ID
 */
export function getWorkspace(id) {
  return WORKSPACES[id] || null;
}

/**
 * Obtiene todos los workspaces a los que un usuario tiene acceso
 */
export function getWorkspacesDisponibles(entidadesPermitidas = []) {
  return ORDEN_WORKSPACES
    .filter(id => entidadesPermitidas.includes(id))
    .map(id => WORKSPACES[id])
    .filter(Boolean);
}

/**
 * Obtiene las secciones de navegación para un workspace
 */
export function getWorkspaceNav(id) {
  const ws = WORKSPACES[id];
  return ws ? ws.secciones : [];
}

/**
 * Detecta el workspace activo basado en la ruta actual
 */
export function detectarWorkspace(pathActual) {
  for (const id of ORDEN_WORKSPACES) {
    if (pathActual === `/${id}` || pathActual.startsWith(`/${id}/`)) {
      return id;
    }
  }
  return null;
}

export { WORKSPACES, ORDEN_WORKSPACES };
export default WORKSPACES;
