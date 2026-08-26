import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { provider } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Card, CardHeader, KPI, PageHeader, Spinner, Badge, ErrorState } from '../components/ui';
import { Icon } from '../components/icons';
import type { DashboardStats } from '../types';

export default function Dashboard() {
  const { session } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    setError(null);
    setStats(null);
    provider.dashboard().then(setStats).catch((e) => setError(e.message));
  };
  useEffect(cargar, []);

  if (error) {
    return (
      <>
        <PageHeader title={`Hola, ${session?.usuario.nombre.split(' ')[0] ?? 'admin'}`} subtitle="Resumen operativo del ecosistema de La Placeta." />
        <ErrorState
          title="No se pudo cargar el panel"
          message={error}
          hint="Comprueba la conexión con el backend y vuelve a intentarlo."
          onRetry={cargar}
        />
      </>
    );
  }
  if (!stats) return <Spinner label="Cargando panel…" />;

  return (
    <>
      <PageHeader
        title={`Hola, ${session?.usuario.nombre.split(' ')[0] ?? 'admin'}`}
        subtitle="Resumen operativo del ecosistema de La Placeta."
      />

      <div className="rsp-kpi-grid">
        <KPI label="Expedientes" value={stats.expedientes} icon="folder" tone="brand" />
        <KPI label="Trámites activos" value={stats.notificacionesNoLeidas + stats.operacionesRetenidas + stats.bloqueos500k} icon="workflow" tone="info" />
        <KPI label="Operaciones retenidas" value={stats.operacionesRetenidas} icon="alert" tone={stats.operacionesRetenidas > 0 ? 'danger' : 'success'} />
        <KPI label="Incidencias abiertas" value={stats.incidenciasAbiertas} icon="alert" tone={stats.incidenciasAbiertas > 0 ? 'warning' : 'success'} />
        <KPI label="CNIC vigentes" value={stats.cnicVigentes} icon="scale" />
        <KPI label="Bloqueos 500k" value={stats.bloqueos500k} icon="shield" tone={stats.bloqueos500k > 0 ? 'warning' : 'neutral'} />
        <KPI label="Notificaciones sin leer" value={stats.notificacionesNoLeidas} icon="bell" />
        <KPI label="Comprobaciones" value={stats.comprobaciones} icon="eye" />
      </div>

      <div className="rsp-grid rsp-grid-2">
        <Card>
          <CardHeader
            title="Acceso rápido"
            subtitle="Módulos del RSP Core"
          />
          <div className="rsp-acciones">
            <Link className="rsp-accion" to="/bandeja"><Icon name="inbox" size={16} /> Bandeja de trabajo</Link>
            <Link className="rsp-accion" to="/tramites"><Icon name="workflow" size={16} /> Trámites</Link>
            <Link className="rsp-accion" to="/expedientes"><Icon name="folder" size={16} /> Expedientes</Link>
            <Link className="rsp-accion" to="/ciudadanos"><Icon name="users" size={16} /> Ciudadanos</Link>
            <Link className="rsp-accion" to="/normativa"><Icon name="scale" size={16} /> Normativa</Link>
            <Link className="rsp-accion" to="/auditoria"><Icon name="scroll" size={16} /> Auditoría</Link>
          </div>
        </Card>
        <Card>
          <CardHeader title="Sesión" subtitle="Tu identidad en el panel" />
          <dl className="rsp-dl">
            <dt>Usuario</dt><dd>{session?.usuario.nombre}</dd>
            <dt>DIP</dt><dd className="u-mono">{session?.usuario.dip}</dd>
            <dt>Nivel de verificación</dt><dd><Badge tone="success">{session?.usuario.nivel ?? 'N3'}</Badge></dd>
            <dt>Entidades</dt><dd>{(session?.entidades ?? []).join(', ')}</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
