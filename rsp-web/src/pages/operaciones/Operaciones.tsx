import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Empty, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { Operacion } from '../../types';

export default function Operaciones() {
  const [items, setItems] = useState<Operacion[] | null>(null);

  useEffect(() => {
    provider.listarOperaciones().then(setItems).catch(() => setItems([]));
  }, []);

  const columns: Column<Operacion>[] = [
    { key: 'id', header: 'Operación', render: (o) => <span className="u-mono">{o.id}</span>, width: '160px' },
    { key: 'concepto', header: 'Concepto', render: (o) => <strong>{o.concepto}</strong> },
    { key: 'importe', header: 'Importe', render: (o) => `${o.importe} Pz` },
    { key: 'flujo', header: 'Origen → Destino', render: (o) => <span className="u-mono">{o.origen} → {o.destino}</span> },
    { key: 'clasificacion', header: 'Clasificación', render: (o) => <Badge tone="brand">{o.clasificacion}</Badge> },
    {
      key: 'inconsistencia', header: 'Control', render: (o) =>
        o.inconsistencia ? <Badge tone="danger">{o.inconsistencia}</Badge> : <Badge tone="success">OK</Badge>,
    },
    { key: 'estado', header: 'Estado', render: (o) => <Badge tone={o.estado === 'retenida' ? 'warning' : o.estado === 'rechazada' ? 'danger' : 'success'}>{o.estado}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Operaciones"
        subtitle="Operation Engine: clasificación y detección de operaciones inconsistentes."
        breadcrumb="RSP / Control"
      />
      {items === null ? (
        <Spinner label="Cargando operaciones…" />
      ) : items.length === 0 ? (
        <Empty icon="cog" title="Sin operaciones" hint="No hay operaciones registradas." />
      ) : (
        <Table columns={columns} rows={items} rowKey={(o) => o.id} />
      )}
    </>
  );
}
