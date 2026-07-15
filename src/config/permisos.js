/**
 * SISTEMA DE PERMISOS Y ROLES
 * 
 * Entidades: banco, tributos, junta, administracion
 * Roles globales: superadmin, admin, gestor, inspector, secretario, presidente, vicepresidente, funcionario, cargo_autorizado
 * 
 * Cada entidad define qué roles tienen acceso a qué secciones.
 */

// Mapa de roles → entidades permitidas
const ROLES_ENTIDADES = {
  // Banco
  'banco_admin': ['banco'],
  'banco_gestor': ['banco'],
  // Tributos
  'tributos_admin': ['tributos'],
  'tributos_inspector': ['tributos'],
  // Junta
  'presidente': ['junta', 'administracion'],
  'vicepresidente': ['junta', 'administracion'],
  'secretario': ['junta'],
  'cargo_autorizado': ['junta'],
  // Administración
  'funcionario': ['administracion'],
  // Superadmin (todo)
  'superadmin': ['banco', 'tributos', 'junta', 'administracion'],
};

// Permisos específicos por entidad y rol
const PERMISOS_ENTIDAD = {
  banco: {
    admin: [
      'ver_cuentas', 'crear_cuentas', 'modificar_cuentas', 'bloquear_cuentas', 'eliminar_cuentas',
      'ver_operaciones', 'revertir_operaciones', 'inspeccionar_operaciones',
      'ver_tarjetas', 'gestionar_tarjetas',
      'ver_trabajadores', 'gestionar_trabajadores_banco',
      'ver_nominas', 'gestionar_nominas',
      'control_cumplimiento', 'movimientos_institucionales',
      'ver_auditoria'
    ],
    gestor: [
      'ver_cuentas', 'crear_cuentas', 'modificar_cuentas',
      'ver_operaciones', 'inspeccionar_operaciones',
      'gestionar_nominas_entidad'
    ]
  },
  tributos: {
    admin: [
      'ver_contribuyentes', 'crear_declaraciones', 'aprobar_declaraciones',
      'emitir_pagos', 'gestionar_incidencias', 'gestionar_regimenes',
      'inspeccion_automatica', 'ver_trabajadores_tributos',
      'modificar_declaraciones', 'anular_declaraciones'
    ],
    inspector: [
      'ver_contribuyentes', 'inspeccion_automatica',
      'crear_declaraciones', 'gestionar_incidencias',
      'ver_trabajadores_tributos'
    ]
  },
  junta: {
    presidente: [
      'gestion_ciudadanos', 'gestion_placetaid', 'gestion_reclamaciones',
      'gestion_reuniones', 'crear_votaciones', 'gestion_recursos',
      'gestion_cargos', 'gestion_departamentos', 'gestion_junior'
    ],
    vicepresidente: [
      'gestion_ciudadanos', 'gestion_placetaid', 'gestion_reclamaciones',
      'gestion_reuniones', 'gestion_recursos', 'gestion_junior'
    ],
    secretario: [
      'gestion_reclamaciones', 'gestion_reuniones', 'gestion_recursos'
    ],
    cargo_autorizado: [
      'gestion_reuniones', 'gestion_recursos'
    ]
  },
  administracion: {
    presidente: [
      'gestion_tramites', 'gestion_ciudadanos_basica',
      'gestion_tributos_basica', 'gestion_banco_basica',
      'gestion_actas', 'inspeccion_votaciones',
      'gestion_placetid_completa', 'gestion_junior'
    ],
    vicepresidente: [
      'gestion_tramites', 'gestion_ciudadanos_basica',
      'gestion_actas', 'inspeccion_votaciones'
    ],
    funcionario: [
      'gestion_tramites', 'gestion_ciudadanos_basica',
      'gestion_actas', 'gestion_placetid_completa'
    ]
  }
};

/**
 * Obtiene las entidades a las que un usuario tiene acceso según sus roles
 */
export function getEntidadesPermitidas(roles = []) {
  const entidades = new Set();
  for (const rol of roles) {
    const ents = ROLES_ENTIDADES[rol];
    if (ents) ents.forEach(e => entidades.add(e));
  }
  // Si tiene superadmin, todas
  if (roles.includes('superadmin')) {
    return ['banco', 'tributos', 'junta', 'administracion'];
  }
  return [...entidades];
}

/**
 * Obtiene los permisos de un usuario para una entidad específica
 */
export function getPermisosEntidad(entidad, roles = []) {
  const permisosEntidad = PERMISOS_ENTIDAD[entidad];
  if (!permisosEntidad) return [];

  const permisos = new Set();
  for (const rol of roles) {
    // Extraer el rol específico para esta entidad
    const rolEspecifico = roles
      .map(r => r.replace(`${entidad}_`, ''))
      .find(r => Object.keys(permisosEntidad).includes(r));

    if (rolEspecifico && permisosEntidad[rolEspecifico]) {
      permisosEntidad[rolEspecifico].forEach(p => permisos.add(p));
    }

    // Roles globales
    if (roles.includes('superadmin') && permisosEntidad.admin) {
      permisosEntidad.admin.forEach(p => permisos.add(p));
    }
  }

  return [...permisos];
}

/**
 * Verifica si un usuario tiene un permiso específico en una entidad
 */
export function tienePermiso(entidad, permiso, roles = []) {
  const permisos = getPermisosEntidad(entidad, roles);
  return permisos.includes(permiso) || roles.includes('superadmin');
}

/**
 * Determina los roles de un usuario basado en sus cargos y permisos almacenados
 */
export function determinarRoles(cargos = [], permisosAlmacenados = []) {
  const roles = new Set();

  for (const cargo of cargos) {
    const nombre = (cargo.cargo || cargo.nombre || '').toLowerCase();
    const departamento = (cargo.departamento || '').toLowerCase();

    if (nombre === 'presidente') roles.add('presidente');
    else if (nombre === 'vicepresidente') roles.add('vicepresidente');
    else if (nombre === 'secretario') roles.add('secretario');
    else if (nombre === 'funcionario') roles.add('funcionario');
    else if (cargo.es_autorizado) roles.add('cargo_autorizado');

    // Roles específicos por entidad
    if (departamento === 'banco') {
      if (nombre.includes('admin')) roles.add('banco_admin');
      if (nombre.includes('gestor')) roles.add('banco_gestor');
    }
    if (departamento === 'tributos') {
      if (nombre.includes('admin')) roles.add('tributos_admin');
      if (nombre.includes('inspector')) roles.add('tributos_inspector');
    }
  }

  // Permisos almacenados directamente
  for (const perm of permisosAlmacenados) {
    const tipo = (perm.tipo || '').toLowerCase();
    if (tipo === 'superadmin') roles.add('superadmin');
    if (tipo === 'banco_admin') roles.add('banco_admin');
    if (tipo === 'banco_gestor') roles.add('banco_gestor');
    if (tipo === 'tributos_admin') roles.add('tributos_admin');
    if (tipo === 'tributos_inspector') roles.add('tributos_inspector');
    if (tipo === 'funcionario') roles.add('funcionario');
  }

  return [...roles];
}

export default {
  getEntidadesPermitidas,
  getPermisosEntidad,
  tienePermiso,
  determinarRoles,
  PERMISOS_ENTIDAD,
  ROLES_ENTIDADES
};
