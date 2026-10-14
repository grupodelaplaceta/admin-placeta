import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { provider } from '../../api';
import type { Notificacion } from '../../types';
import { badgeToneDeEstado, Badge } from '../ui';
import { Icon } from '../icons';

export function Topbar({ onMenu, title }: { onMenu: () => void; title: string }) {
  const { session, logout } = useAuth();
  const [notifs, setNotifs] = useState<Notificacion[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    provider.listarNotificaciones().then(setNotifs).catch(() => setNotifs([]));
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const noLeidas = notifs.filter((n) => !n.leida).length;
  const iniciales = (session?.usuario.nombre ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function marcar(n: Notificacion) {
    if (n.leida) return;
    await provider.marcarLeida(n.id);
    setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
  }

  return (
    <header className="rsp-topbar">
      <button className="rsp-icon-btn rsp-hamburger" onClick={onMenu} aria-label="Abrir menú"><Icon name="menu" /></button>
      <span className="rsp-topbar-title">{title}</span>
      <div className="rsp-topbar-spacer" />
      <label className="rsp-search">
        <Icon name="search" size={16} />
        <input placeholder="Buscar ciudadano, expediente, trámite…" onKeyDown={(e) => {
          if (e.key === 'Enter') navigate(`/ciudadanos?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`);
        }} />
      </label>
      <div className="rsp-bell" ref={ref}>
        <button className="rsp-icon-btn" aria-label={`Notificaciones (${noLeidas} sin leer)`} onClick={() => setOpen((v) => !v)}>
          <Icon name="bell" />
          {noLeidas > 0 && <span className="rsp-bell-dot" />}
        </button>
        {open && (
          <div className="rsp-card rsp-bell-menu">
            <div className="rsp-card-header">
              <h3 className="rsp-card-title">Notificaciones</h3>
              <Badge tone="brand">{noLeidas} sin leer</Badge>
            </div>
            {notifs.length === 0 ? (
              <p className="u-muted" style={{ margin: 0 }}>Sin notificaciones.</p>
            ) : (
              notifs.slice(0, 6).map((n) => (
                <button key={n.id} type="button" className="rsp-bell-item" onClick={() => marcar(n)}>
                  <span className="u-spread">
                    <strong style={{ fontSize: 'var(--fs-sm)' }}>{n.titulo}</strong>
                    <Badge tone={badgeToneDeEstado(n.nivel)}>{n.nivel}</Badge>
                  </span>
                  <span className="u-muted" style={{ fontSize: 'var(--fs-sm)', display: 'block' }}>{n.mensaje}</span>
                </button>
              ))
            )}
            <button type="button" className="rsp-linkbtn" style={{ display: 'block', marginTop: 8 }} onClick={() => { setOpen(false); navigate('/notificaciones'); }}>
              Ver todas
            </button>
          </div>
        )}
      </div>
      <div className="rsp-userchip">
        <span className="rsp-avatar">{iniciales}</span>
        <span className="u-ellipsis" style={{ maxWidth: 180 }}>{session?.usuario.nombre}</span>
        <button
          className="rsp-icon-btn"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          onClick={async () => { await logout(); navigate('/login'); }}
        >
          <Icon name="logout" />
        </button>
      </div>
    </header>
  );
}
