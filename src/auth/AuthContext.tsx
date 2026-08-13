import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { provider } from '../api';
import { getEntidadesPermitidas, tienePermiso } from './permisos';
import type { Session, Entidad } from '../types';

interface AuthState {
  session: Session | null;
  loading: boolean;
  login: (dip: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  tienePermiso: (entidad: Entidad, permiso: string) => boolean;
  puedeEntidad: (entidad: Entidad) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    provider
      .me()
      .then((s) => {
        if (mounted) setSession(s);
      })
      .catch(() => {
        if (mounted) setSession(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (dip: string, password: string) => {
    const s = await provider.login(dip, password);
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    await provider.logout();
    setSession(null);
  }, []);

  const value = useMemo<AuthState>(() => {
    const roles = session?.roles ?? [];
    return {
      session,
      loading,
      login,
      logout,
      tienePermiso: (entidad, permiso) => tienePermiso(roles, entidad, permiso),
      puedeEntidad: (entidad) => getEntidadesPermitidas(roles).includes(entidad),
    };
  }, [session, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
