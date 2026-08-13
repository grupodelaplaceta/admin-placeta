import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
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
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(dip.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
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
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="rsp-alert rsp-alert-danger">{error}</div>}
        <Button type="submit" disabled={loading} icon="lock">
          {loading ? 'Verificando…' : 'Iniciar sesión'}
        </Button>
        <p className="u-muted" style={{ fontSize: 'var(--fs-xs)' }}>
          Acceso con credenciales verificadas contra el BFF (sesión httpOnly). En modo demo la contraseña es <code>demo</code>.
        </p>
      </form>
    </div>
  );
}
