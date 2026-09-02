import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { provider } from '../api';
import { Button } from '../components/ui';
import { ApiError } from '../api/client';
import { Icon } from '../components/icons';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dip, setDip] = useState('23749931M');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [mostrarDemo, setMostrarDemo] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  function mostrarError(err: unknown, fallback: string) {
    if (err instanceof ApiError) {
      setError(err.message);
      setErrorStatus(err.status);
    } else {
      setError(fallback);
      setErrorStatus(0);
    }
  }

  async function entrarConPlacetaID() {
    setError(null);
    setSsoLoading(true);
    try {
      const { redirect } = await provider.iniciarPlacetaID();
      if (redirect) {
        window.location.assign(redirect);
        return;
      }
      setMostrarDemo(true);
      setError('PlacetaID no está disponible aquí; usa el acceso de administrador.');
      setErrorStatus(0);
    } catch (err) {
      setMostrarDemo(true);
      mostrarError(err, 'No se pudo conectar con PlacetaID');
    } finally {
      setSsoLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(dip.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      mostrarError(err, 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rsp-login">
      <form className="rsp-card rsp-login-card rsp-fade-up" onSubmit={onSubmit}>
        <div className="rsp-sidebar-brand-logo" style={{ width: 56, height: 56, fontSize: '1.6rem' }}><Icon name="landmark" size={24} /></div>
        <h1>Red de Servicios de La Placeta</h1>
        <p className="u-muted">Panel de administración · acceso restringido</p>

        <Button type="button" variant="primary" icon="shield" onClick={entrarConPlacetaID} disabled={ssoLoading} style={{ width: '100%' }}>
          {ssoLoading ? 'Conectando…' : 'Continuar con PlacetaID'}
        </Button>

        <div className="u-row" style={{ width: '100%', justifyContent: 'center' }}>
          <button
            type="button"
            className="rsp-linkbtn"
            onClick={() => setMostrarDemo((v) => !v)}
            aria-expanded={mostrarDemo}
          >
            {mostrarDemo ? 'Ocultar acceso de administrador' : 'Acceso de administrador (demo)'}
          </button>
        </div>

        {mostrarDemo && (
          <>
            <label className="rsp-field">
              <span>DIP de acceso</span>
              <input
                value={dip}
                onChange={(e) => setDip(e.target.value)}
                placeholder="23749931M"
                autoComplete="username"
                required
              />
            </label>
            <label className="rsp-field">
              <span>Contraseña de administrador (RSP)</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </label>
            <p className="u-muted" style={{ fontSize: 'var(--fs-xs)' }}>
              Este campo es la contraseña de administrador del RSP (definida en el backend). <strong>No es tu contraseña de PlacetaID</strong>: para entrar con tu identidad PlacetaID usa el botón «Continuar con PlacetaID» de arriba.
            </p>
            <Button type="submit" disabled={loading} icon="lock" variant="outline">
              {loading ? 'Verificando…' : 'Entrar'}
            </Button>
          </>
        )}

        {error && (
          <div className="rsp-alert rsp-alert-danger" role="alert" style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'flex-start', textAlign: 'left', width: '100%' }}>
            <Icon name="alert" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <strong>{error}</strong>
              {errorStatus === 0 && (
                <p className="u-muted" style={{ margin: '4px 0 0', fontSize: 'var(--fs-xs)' }}>
                  No hay conexión con el servidor. Comprueba que el backend (rsp-web-api) esté en marcha.
                </p>
              )}
              {errorStatus === 401 && (
                <p className="u-muted" style={{ margin: '4px 0 0', fontSize: 'var(--fs-xs)' }}>
                  Si eres el presidente (23749931M) y no configuras ADMIN_PASSWORD en el backend, el acceso con DIP+contraseña no puede funcionar (es la contraseña del RSP, no la de PlacetaID). Usa «Continuar con PlacetaID» para entrar con tu identidad.
                </p>
              )}
            </div>
          </div>
        )}
        <p className="u-muted" style={{ fontSize: 'var(--fs-xs)' }}>
          Solo entran administradores. La sesión viaja en cookie httpOnly.
        </p>
      </form>
    </div>
  );
}
