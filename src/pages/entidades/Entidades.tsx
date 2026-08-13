import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Empty, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { EntidadRegistral } from '../../types';

export default function Entidades() {
  const [items, setItems] = useState<EntidadRegistral[] | null>(null);

  useEffect(() => {
    provider.listarEntidades().then(setItems).catch(() => setItems([]));
  }, []);

  const columns: Column<EntidadRegistral>[] = [
    { key: 'eip', header: 'EIP', render: (e) => <span className="u-mono">{e.eip}</span>, width: '150px' },
    { key: 'nombre', header: 'Entidad', render: (e) => <strong>{e.nombre}</strong> },
    { key: 'tipo', header: 'Tipo', render: (e) => e.tipo },
    { key: 'representantes', header: 'Representantes', render: (e) => e.representantes.join(', ') },
    { key: 'cumplimiento', header: 'Cumplimiento', render: (e) => <Badge tone={e.cumplimiento === 'Al día' ? 'success' : 'warning'}>{e.cumplimiento ?? '—'}</Badge> },
    { key: 'estado', header: 'Estado', render: (e) => <Badge tone={e.estado === 'activa' ? 'success' : 'danger'}>{e.estado}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Entidades"
        subtitle="Registro Mercantil: EIP, representantes legales y cumplimiento."
        breadcrumb="RSP / Personas y entidades"
      />
      {items === null ? (
        <Spinner label="Cargando entidades…" />
      ) : items.length === 0 ? (
        <Empty icon="building" title="Sin entidades" hint="No hay entidades registradas." />
      ) : (
        <Table columns={columns} rows={items} rowKey={(e) => e.eip} />
      )}
    </>
  );
}
