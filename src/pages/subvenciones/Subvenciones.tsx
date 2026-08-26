import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Empty, KPI, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { SubvencionResumen } from '../../types';

export default function Subvenciones() {
  const [items, setItems] = useState<SubvencionResumen[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    provider.listarSubvenciones().then(setItems).catch(() => setItems([]));
  }, []);

  const rows = items ?? [];
  const columns: Column<SubvencionResumen>[] = [
    { key: 'id', header: 'Subvención', render: (s) => <span className="u-mono">{s.id}</span> },
    { key: 'receptor', header: 'Receptor', render: (s) => <span className="u-mono">{s.receptorEip}</span> },
    { key: 'concepto', header: 'Concepto', render: (s) => s.concepto },
    { key: 'importe', header: 'Importe', render: (s) => `${s.importe.toLocaleString('es-ES')} Pz` },
    { key: 'estado', header: 'Estado', render: (s) => <Badge>{s.estado}</Badge> },
  ];

  return (
    <>
      <PageHeader title="Subvenciones" subtitle="Gestión administrativa de subvenciones desde RSP" breadcrumb="RSP / Tributos" />
      <div className="rsp-kpi-grid">
        <KPI label="Subvenciones" value={rows.length} icon="handshake" tone="brand" />
        <KPI label="Importe concedido" value={`${rows.reduce((sum, s) => sum + s.importe, 0).toLocaleString('es-ES')} Pz`} icon="banknote" />
      </div>
      {items === null ? <Spinner label="Cargando subvenciones…" /> : rows.length === 0 ? <Empty icon="handshake" title="Sin subvenciones" /> : <Table columns={columns} rows={rows} rowKey={(s) => s.id} onRowClick={(s) => navigate(`/subvenciones/${s.id}`)} />}
    </>
  );
}
