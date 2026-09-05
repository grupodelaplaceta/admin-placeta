/* ═══════════════════════════════════════════════════════════════════════
   RSP Web · Permisos (RBAC en cliente)
   Espejo del modelo del backend. IMPORTANTE (mejora S2/S6): NO hay
   superadmins hardcodeados en el cliente. El cliente confía en los roles
   y permisos que devuelve la sesión del backend; si no hay permiso, se
   bloquea la vista (fail-closed en UI).
   ═══════════════════════════════════════════════════════════════════════ */

import type { Entidad } from '../types';

export const ROLES_ENTIDADES: Record<string, Entidad[]> = {
  banco_admin: ['banco'],
  banco_gestor: ['banco'],
  tributos_admin: ['tributos'],
  tributos_inspector: ['tributos'],
  presidente: ['junta', 'administracion', 'rsp'],
  vicepresidente: ['junta', 'administracion', 'rsp'],
  secretario: ['junta'],
  cargo_autorizado: ['junta'],
  funcionario: ['administracion'],
  rsp_admin: ['rsp'],
  rsp_operador: ['rsp'],
  junior_admin: ['junior'],
  junior_gestor: ['junior'],
  superadmin: ['banco', 'tributos', 'junta', 'administracion', 'rsp', 'junior'],
};

export const PERMISOS_ENTIDAD: Record<string, Record<string, string[]>> = {
  rsp: {
    admin: [
      'ver_dashboard', 'ver_conexiones', 'ver_facturas', 'ver_fondos',
      'ver_normativa', 'editar_normativa', 'aprobar_normativa',
      'ver_expedientes', 'gestionar_expedientes',
      'ver_incidencias', 'gestionar_incidencias',
      'ver_auditoria', 'ver_notificaciones', 'gestionar_notificaciones',
      'ver_contabilidad', 'gestionar_contabilidad',
      'ver_fundacion', 'gestionar_fundacion',
      'ver_patrimonio', 'gestionar_patrimonio',
      'ver_comprobacion', 'gestionar_comprobacion',
      'ver_operaciones', 'gestionar_operaciones',
      'ver_contribuyentes', 'ver_declaraciones', 'gestionar_declaraciones',
      'ver_subvenciones', 'gestionar_subvenciones', 'ver_bonos', 'gestionar_bonos',
      'ver_cuentas', 'ver_tarjetas',
      'ver_junior', 'ver_voleyclub',
      'ver_votaciones', 'gestionar_votaciones', 'ver_juntas', 'gestionar_juntas',
      'ver_encuestas', 'gestionar_encuestas', 'ver_informes',
      'ver_propuestas', 'gestionar_propuestas', 'aprobar_propuestas',
      'ver_tramites', 'gestionar_tramites', 'gestionar_bandeja',
      'ver_ciudadanos', 'ver_entidades',
    ],
    operador: [
      'ver_dashboard', 'ver_conexiones', 'ver_facturas', 'ver_fondos',
      'ver_normativa', 'ver_expedientes', 'ver_incidencias',
      'ver_auditoria', 'ver_notificaciones', 'ver_contabilidad',
      'ver_fundacion', 'ver_patrimonio', 'ver_comprobacion', 'ver_operaciones',
      'ver_contribuyentes', 'ver_declaraciones', 'ver_subvenciones', 'ver_bonos',
      'ver_cuentas', 'ver_tarjetas',
      'ver_junior', 'ver_voleyclub',
      'ver_votaciones', 'ver_juntas', 'ver_encuestas', 'ver_informes',
      'ver_propuestas',
      'ver_tramites', 'ver_ciudadanos', 'ver_entidades',
    ],
  },
};

export function getEntidadesPermitidas(roles: string[]): Entidad[] {
  if (roles.includes('superadmin')) {
    return ['banco', 'tributos', 'junta', 'administracion', 'rsp', 'junior'];
  }
  const set = new Set<Entidad>();
  for (const rol of roles) {
    ROLES_ENTIDADES[rol]?.forEach((e) => set.add(e));
  }
  return [...set];
}

/** Permisos de un usuario en una entidad, dados sus roles. */
export function getPermisosEntidad(entidad: string, roles: string[]): string[] {
  const tabla = PERMISOS_ENTIDAD[entidad];
  if (!tabla) return [];
  const permisos = new Set<string>();
  if (roles.includes('superadmin')) {
    (tabla.admin ?? []).forEach((p) => permisos.add(p));
    return [...permisos];
  }
  for (const rol of roles) {
    const local = rol.replace(`${entidad}_`, '');
    const grant = tabla[local];
    grant?.forEach((p) => permisos.add(p));
  }
  return [...permisos];
}

export function tienePermiso(roles: string[], entidad: string, permiso: string): boolean {
  if (roles.includes('superadmin')) return true;
  return getPermisosEntidad(entidad, roles).includes(permiso);
}
