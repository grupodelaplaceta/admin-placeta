import { useAuth } from '../../auth/AuthContext';
import { Card, CardHeader, PageHeader, Badge } from '../../components/ui';
import { Icon } from '../../components/icons';

export default function Configuracion() {
  const { session } = useAuth();

  return (
    <>
      <PageHeader
        title="Configuración"
        subtitle="Seguridad y preferencias del panel."
        breadcrumb="RSP / Sistema"
      />
      <div className="rsp-grid rsp-grid-2">
        <Card>
          <CardHeader title="Seguridad" subtitle="Decisiones aplicadas en esta versión" />
          <ul className="rsp-list">
            <li><Icon name="check" size={14} /> Sesión en cookie httpOnly (sin tokens en localStorage).</li>
            <li><Icon name="check" size={14} /> Sin secretos hardcodeados en el cliente (solo variables de entorno).</li>
            <li><Icon name="check" size={14} /> Sin superadmins hardcodeados: RBAC desde la sesión del backend.</li>
            <li><Icon name="check" size={14} /> Acciones críticas marcadas con 2FA (fail-closed).</li>
            <li><Icon name="check" size={14} /> CORS allowlist + rate limiting en el backend.</li>
            <li><Icon name="check" size={14} /> Auditoría y acuse de recibo en notificaciones.</li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="Tu sesión" />
          <dl className="rsp-dl">
            <div className="rsp-dl-row"><dt>Usuario</dt><dd>{session?.usuario.nombre}</dd></div>
            <div className="rsp-dl-row"><dt>DIP</dt><dd className="u-mono">{session?.usuario.dip}</dd></div>
            <div className="rsp-dl-row"><dt>Roles</dt><dd>{(session?.roles ?? []).map((r) => <Badge key={r} tone="brand">{r}</Badge>)}</dd></div>
            <div className="rsp-dl-row"><dt>Entidades</dt><dd>{(session?.entidades ?? []).join(', ')}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
