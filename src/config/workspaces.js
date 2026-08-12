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
    logo: '/img/tributos-logo.png',
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
    logo: '/img/junta-logo.png',
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
          { texto: 'Subvenciones', url: '/junta/subvenciones', icono: '💸' },
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
    logo: '/img/administracion.png',
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
          { texto: 'Subvenciones', url: '/administracion/subvenciones', icono: '💸' },
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
    logo: '/img/rsp-logo.png',
    descripcion: 'Conexiones, facturación y fondos de la RSP',
    color: '#3702b3',
    colorDark: '#1f0070',
    iban: 'GDLP-AP64-583',
    background: 'linear-gradient(135deg, #065f7a 0%, #0891b2 100%)',
    secciones: [
      {
        titulo: '🏠 Inicio',
        enlaces: [
          { texto: 'Dashboard', url: '/rsp', icono: '📊' },
          { texto: 'Conexiones', url: '/rsp/conexiones', icono: '📡' },
          { texto: 'Facturación RSP', url: '/rsp/facturacion', icono: '🧾' },
          { texto: 'Fondos', url: '/rsp/fondos', icono: '💰' },
        ]
      },
      {
        titulo: '📥 Trámites y bandeja',
        enlaces: [
          { texto: 'Bandeja de trabajo', url: '/rsp/trabajo', icono: '🗂️' },
          { texto: 'Trámites', url: '/rsp/tramites', icono: '📋' },
        ]
      },
      {
        titulo: '🧮 Hacienda y economía',
        enlaces: [
          { texto: 'Dashboard Económico', url: '/rsp/economico', icono: '📈' },
          { texto: 'Patrimonio y activos', url: '/rsp/patrimonio', icono: '💎' },
          { texto: 'Fiscalidad ampliada', url: '/rsp/fiscalidad', icono: '🧮' },
          { texto: 'Facturas', url: '/rsp/facturas', icono: '🧾' },
          { texto: 'Nóminas', url: '/rsp/nominas', icono: '📄' },
          { texto: 'Contabilidad', url: '/rsp/contabilidad', icono: '📒' },
          { texto: 'Fundación', url: '/rsp/fundacion', icono: '🏛️' },
        ]
      },
      {
        titulo: '👥 Personas y herencias',
        enlaces: [
          { texto: 'Bajas y Herencias', url: '/rsp/herencias', icono: '📜' },
          { texto: 'Expedientes', url: '/rsp/expedientes', icono: '🗂️' },
          { texto: 'Incidencias', url: '/rsp/incidencias', icono: '⚠️' },
          { texto: 'Notificaciones', url: '/rsp/notificaciones', icono: '🔔' },
        ]
      },
      {
        titulo: '📜 Marco legal y control',
        enlaces: [
          { texto: 'Centro Normativo (CNIC)', url: '/rsp/normativo', icono: '📜' },
          { texto: 'Auditoría', url: '/rsp/auditoria', icono: '🛡️' },
          { texto: 'Comprobación ecosistema', url: '/rsp/comprobacion', icono: '🔍' },
          { texto: 'Operation Engine', url: '/rsp/operaciones', icono: '⚙️' },
        ]
      },
      {
        titulo: '🛠️ Supervisión y desarrollo',
        enlaces: [
          { texto: 'Banco (config y reversiones)', url: '/rsp/supervision/banco', icono: '🏦' },
          { texto: 'Soporte del banco', url: '/rsp/supervision/soporte', icono: '🎧' },
          { texto: 'Sistema (control)', url: '/rsp/sistema', icono: '🕹️' },
          { texto: 'APIs', url: '/rsp/apis', icono: '🔌' },
          { texto: 'Gastos RSP', url: '/rsp/gastos', icono: '💰' },
        ]
      }
    ]
  },
  junior: {
    id: 'junior',
    nombre: 'Placeta Junior',
    icono: '🧒',
    logo: '/img/junior-logo.png',
    descripcion: 'Gestión de menores, tutores, cuentas infantiles y autorizaciones',
    color: '#e91e63',
    colorDark: '#880e4f',
    iban: 'GDLP-AP76-179',
    background: 'linear-gradient(135deg, #880e4f 0%, #e91e63 100%)',
    secciones: [
      {
        titulo: '🧒 Placeta Junior',
        enlaces: [
          { texto: 'Dashboard', url: '/junior', icono: '📊' },
          { texto: 'Menores', url: '/junior/menores', icono: '👶' },
          { texto: 'Tutores', url: '/junior/tutores', icono: '👤' },
          { texto: 'Autorizaciones', url: '/junior/autorizaciones', icono: '📝' },
          { texto: 'Cuentas', url: '/junior/cuentas', icono: '🏦' },
          { texto: 'Documentos', url: '/junior/documentos', icono: '📑' },
        ]
      },
      {
        titulo: '🎓 Academia',
        enlaces: [
          { texto: 'Actividades (revisar/editar/publicar)', url: '/junior/academia', icono: '🧩' },
          { texto: 'Retos de Candela', url: '/junior/retos', icono: '🏆' },
          { texto: 'Bundles (packs)', url: '/junior/bundles', icono: '🧺' },
          { texto: 'Premium (precios/licencias)', url: '/junior/premium', icono: '💎' },
          { texto: 'Config. Económica (canje)', url: '/junior/config', icono: '⚙️' },
          { texto: 'Puntos de los Juniors', url: '/junior/puntos', icono: '🔴🟢' },
        ]
      },
      {
        titulo: '🔌 Desarrollo',
        enlaces: [
          { texto: 'APIs', url: '/junior/apis', icono: '🔌' },
          { texto: 'Gastos RSP', url: '/junior/gastos-rsp', icono: '💰' },
        ]
      }
    ]
  }
};

const ORDEN_WORKSPACES = ['banco', 'tributos', 'junta', 'administracion', 'rsp', 'junior'];

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
