import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from './icons';
import type { Entidad } from '../types';

/** Protege una ruta: exige sesión y, opcionalmente, permiso granular. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="rsp-loading">Cargando sesión…</div>;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

export function RequirePermiso({
  entidad,
  permiso,
  children,
}: {
  entidad: Entidad;
  permiso: string;
  children: ReactNode;
}) {
  const { tienePermiso } = useAuth();
  if (!tienePermiso(entidad, permiso)) {
    return (
      <div className="rsp-empty">
        <span className="rsp-empty-icon"><Icon name="lock" size={28} /></span>
        <h3>Sin permiso</h3>
        <p className="u-muted">No tienes el permiso <code>{permiso}</code> en <code>{entidad}</code>.</p>
      </div>
    );
  }
  return <>{children}</>;
}
