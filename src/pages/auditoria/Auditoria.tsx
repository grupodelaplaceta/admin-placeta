import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Empty, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { EventoAuditoria } from '../../types';

export default function Auditoria() {
  const [items, setItems] = useState<EventoAuditoria[] | null>(null);

  useEffect(() => {
    provider.listarAuditoria().then(setItems).catch(() => setItems([]));
  }, []);

  const columns: Column<EventoAuditoria>[] = [
    { key: 'id', header: 'ID', render: (a) => <span className="u-mono">{a.id}</span>, width: '160px' },
    { key: 'fecha', header: 'Fecha', render: (a) => <span className="u-mono">{new Date(a.fecha).toLocaleString()}</span>, width: '180px' },
    { key: 'usuario', header: 'Usuario', render: (a) => a.usuario },
    { key: 'servicio', header: 'Servicio', render: (a) => <Badge tone="brand">{a.servicio}</Badge> },
    { key: 'accion', header: 'Acción', render: (a) => a.accion },
    { key: 'objeto', header: 'Objeto', render: (a) => <span className="u-mono">{a.objetoTipo} · {a.objetoId}</span> },
    { key: 'motivo', header: 'Motivo', render: (a) => a.motivo ?? '—' },
  ];

  return (
    <>
      <PageHeader
        title="Auditoría"
        subtitle="Registro central de todas las acciones administrativas (AUD-)."
        breadcrumb="RSP / Control"
      />
      {items === null ? (
        <Spinner label="Cargando auditoría…" />
      ) : items.length === 0 ? (
        <Empty icon="scroll" title="Sin eventos" hint="No hay eventos de auditoría registrados." />
      ) : (
        <Table columns={columns} rows={items} rowKey={(a) => a.id} />
      )}
    </>
  );
}
