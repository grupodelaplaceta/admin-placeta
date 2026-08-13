import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, badgeToneDeEstado, Empty, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { Notificacion } from '../../types';

export default function Notificaciones() {
  const [items, setItems] = useState<Notificacion[] | null>(null);

  useEffect(() => {
    provider.listarNotificaciones().then(setItems).catch(() => setItems([]));
  }, []);

  const columns: Column<Notificacion>[] = [
    { key: 'nivel', header: 'Nivel', render: (n) => <Badge tone={badgeToneDeEstado(n.nivel)}>{n.nivel}</Badge>, width: '120px' },
    { key: 'titulo', header: 'Título', render: (n) => <strong>{n.titulo}</strong> },
    { key: 'mensaje', header: 'Mensaje', render: (n) => n.mensaje },
    { key: 'leida', header: 'Leída', render: (n) => (n.leida ? <Badge tone="success">sí</Badge> : <Badge tone="warning">no</Badge>) },
    { key: 'acuse', header: 'Acuse', render: (n) => (n.acuseRecibido ? '✅' : '—') },
  ];

  return (
    <>
      <PageHeader
        title="Notificaciones"
        subtitle="Canal oficial de comunicación administrativa con acuse de recibo."
        breadcrumb="RSP / Control"
      />
      {items === null ? (
        <Spinner label="Cargando notificaciones…" />
      ) : items.length === 0 ? (
        <Empty icon="bell" title="Sin notificaciones" hint="No hay notificaciones registradas." />
      ) : (
        <Table columns={columns} rows={items} rowKey={(n) => n.id} />
      )}
    </>
  );
}
