import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Empty, KPI, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import { Icon } from '../../components/icons';
import type { EntidadRegistral } from '../../types';

export default function Entidades() {
  const navigate = useNavigate();
  const [items, setItems] = useState<EntidadRegistral[] | null>(null);

  useEffect(() => {
    provider.listarEntidades().then(setItems).catch(() => setItems([]));
  }, []);

  const totalCuentas = items?.reduce((s, e) => s + (e.cuentas ?? 0), 0) ?? 0;

  const columns: Column<EntidadRegistral>[] = [
    { key: 'eip', header: 'EIP', render: (e) => <span className="u-mono">{e.eip}</span>, width: '150px' },
    { key: 'nombre', header: 'Entidad', render: (e) => <span className="u-row"><Icon name="building" size={15} /> <strong>{e.nombre}</strong></span> },
    { key: 'tipo', header: 'Tipo', render: (e) => e.tipo },
    { key: 'cuentas', header: 'Cuentas', render: (e) => <Badge tone="neutral">{e.cuentas ?? 0}</Badge> },
    { key: 'titulares', header: 'Titulares', render: (e) => (e.titulares ?? 0) > 0 ? <Badge tone="info">{e.titulares}</Badge> : <span className="u-muted">—</span> },
    { key: 'cumplimiento', header: 'Cumplimiento', render: (e) => <Badge tone={e.cumplimiento === 'Al día' ? 'success' : 'warning'}>{e.cumplimiento ?? '—'}</Badge> },
    { key: 'estado', header: 'Estado', render: (e) => <Badge tone={e.estado === 'activa' ? 'success' : 'danger'}>{e.estado}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Entidades"
        subtitle="Registro Mercantil con datos reales del banco: cuentas, titulares y participación."
        breadcrumb="RSP / Personas y entidades"
      />
      <div className="rsp-kpi-grid">
        <KPI label="Entidades" value={items?.length ?? '—'} icon="building" tone="brand" />
        <KPI label="Cuentas de empresa" value={totalCuentas} icon="landmark" tone="info" />
        <KPI label="Titulares" value={items?.reduce((s, e) => s + (e.titulares ?? 0), 0) ?? '—'} icon="users" tone="success" />
      </div>
      {items === null ? (
        <Spinner label="Cargando entidades…" />
      ) : items.length === 0 ? (
        <Empty icon="building" title="Sin entidades" hint="No hay entidades registradas." />
      ) : (
        <Table columns={columns} rows={items} rowKey={(e) => e.eip} onRowClick={(e) => navigate(`/entidades/${e.eip}`)} />
      )}
    </>
  );
}
