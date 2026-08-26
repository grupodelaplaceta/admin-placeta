import { NavLink } from 'react-router-dom';
import { NAV_SECTIONS } from '../../router/nav';
import { useAuth } from '../../auth/AuthContext';
import { RSP_ENTIDAD } from '../../router/nav';
import { cn } from '../ui';
import { Icon } from '../icons';

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { session, tienePermiso } = useAuth();
  const roles = session?.roles ?? [];

  return (
    <aside className={cn('rsp-sidebar', open && 'rsp-sidebar-open')}>
      <div className="rsp-sidebar-brand">
        <span className="rsp-sidebar-brand-logo"><Icon name="landmark" size={20} /></span>
        <span>RSP</span>
      </div>
      <nav className="rsp-sidebar-nav" aria-label="Navegación principal">
        {NAV_SECTIONS.map((seccion) => {
          const links = seccion.links.filter((l) => !l.permiso || tienePermiso(RSP_ENTIDAD, l.permiso));
          if (links.length === 0) return null;
          return (
            <div className="rsp-nav-section" key={seccion.title}>
              <span className="rsp-nav-section-label">{seccion.title}</span>
              {links.map((l) => l.external ? (
                <a key={l.to} href={l.to} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className="rsp-nav-item">
                  <span className="rsp-nav-item-icon"><Icon name={l.icon} size={18} /></span>
                  <span>{l.label}</span>
                </a>
              ) : (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) => cn('rsp-nav-item', isActive && 'rsp-nav-active')}
                >
                  <span className="rsp-nav-item-icon"><Icon name={l.icon} size={18} /></span>
                  <span>{l.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="rsp-sidebar-footer">
        Red de Servicios de La Placeta
        <br />
        {roles.length} rol(es) · v1.0.0
      </div>
    </aside>
  );
}
