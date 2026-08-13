import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { NAV_SECTIONS } from '../../router/nav';
import { cn } from '../ui';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const actual = NAV_SECTIONS.flatMap((s) => s.links).find((l) =>
    l.to === '/' ? location.pathname === '/' : location.pathname.startsWith(l.to),
  );

  return (
    <div className="rsp-layout">
      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      <div className={cn('rsp-sidebar-overlay', open && 'rsp-overlay-show')} onClick={() => setOpen(false)} />
      <div className="rsp-main">
        <Topbar onMenu={() => setOpen((v) => !v)} title={actual?.label ?? 'RSP'} />
        <main className="rsp-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
