/* Navegación del panel: una única fuente para sidebar y rutas. */
import type { Entidad } from '../types';
import type { IconName } from '../components/icons';

export interface NavLink {
  to: string;
  label: string;
  icon: IconName;
  permiso?: string; // permiso requerido (entidad rsp por defecto)
}

export interface NavSection {
  title: string;
  links: NavLink[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Panel',
    links: [
      { to: '/', label: 'Dashboard', icon: 'dashboard', permiso: 'ver_dashboard' },
    ],
  },
  {
    title: 'Trabajo',
    links: [
      { to: '/bandeja', label: 'Bandeja de trabajo', icon: 'inbox', permiso: 'gestionar_bandeja' },
      { to: '/tramites', label: 'Trámites', icon: 'workflow', permiso: 'ver_tramites' },
      { to: '/expedientes', label: 'Expedientes', icon: 'folder', permiso: 'ver_expedientes' },
    ],
  },
  {
    title: 'Tributos',
    links: [
      { to: '/tributos', label: 'Contribuyentes', icon: 'users', permiso: 'ver_contribuyentes' },
      { to: '/tributos/declaraciones', label: 'Declaraciones', icon: 'fileCheck', permiso: 'ver_declaraciones' },
      { to: '/subvenciones', label: 'Subvenciones', icon: 'handshake', permiso: 'ver_subvenciones' },
      { to: '/bonos', label: 'Bonificaciones', icon: 'sparkles', permiso: 'ver_bonos' },
    ],
  },
  {
    title: 'Placeta Junior',
    links: [
      { to: '/junior', label: 'Academia', icon: 'sparkles', permiso: 'ver_junior' },
    ],
  },
  {
    title: 'Banco',
    links: [
      { to: '/banco/cuentas', label: 'Cuentas', icon: 'wallet', permiso: 'ver_cuentas' },
      { to: '/banco/tarjetas', label: 'Tarjetas', icon: 'creditCard', permiso: 'ver_tarjetas' },
    ],
  },
  {
    title: 'Personas y entidades',
    links: [
      { to: '/ciudadanos', label: 'Ciudadanos', icon: 'users', permiso: 'ver_ciudadanos' },
      { to: '/entidades', label: 'Entidades', icon: 'building', permiso: 'ver_entidades' },
    ],
  },
  {
    title: 'Control',
    links: [
      { to: '/operaciones', label: 'Operaciones', icon: 'cog', permiso: 'ver_operaciones' },
      { to: '/auditoria', label: 'Auditoría', icon: 'scroll', permiso: 'ver_auditoria' },
      { to: '/notificaciones', label: 'Notificaciones', icon: 'bell', permiso: 'ver_notificaciones' },
    ],
  },
  {
    title: 'Participación',
    links: [
      { to: '/votaciones', label: 'Votaciones', icon: 'vote', permiso: 'ver_votaciones' },
      { to: '/juntas', label: 'Juntas', icon: 'users', permiso: 'ver_juntas' },
      { to: '/encuestas', label: 'Encuestas', icon: 'clipboard', permiso: 'ver_encuestas' },
    ],
  },
  {
    title: 'Normativa',
    links: [
      { to: '/normativa', label: 'CNIC · Normativa', icon: 'scale', permiso: 'ver_normativa' },
      { to: '/bop', label: 'Boletín (BOP)', icon: 'landmark', permiso: 'ver_normativa' },
    ],
  },
  {
    title: 'Sistema',
    links: [
      { to: '/informes', label: 'Informes', icon: 'fileCheck', permiso: 'ver_informes' },
      { to: '/configuracion', label: 'Configuración', icon: 'settings', permiso: 'ver_dashboard' },
    ],
  },
];

export const RSP_ENTIDAD: Entidad = 'rsp';
