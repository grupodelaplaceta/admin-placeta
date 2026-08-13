import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, badgeToneDeEstado, Empty, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { Expediente } from '../../types';

export default function Expedientes() {
  const [items, setItems] = useState<Expediente[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    provider.listarExpedientes().then(setItems).catch(() => setItems([]));
  }, []);

  const columns: Column<Expediente>[] = [
    { key: 'id', header: 'Expediente', render: (e) => <span className="u-mono">{e.id}</span>, width: '180px' },
    { key: 'titulo', header: 'Título', render: (e) => <strong>{e.titulo}</strong> },
    { key: 'servicio', header: 'Servicio', render: (e) => e.servicio },
    { key: 'ciudadano', header: 'Titular', render: (e) => `${e.nombreCiudadano} (${e.dip})` },
    { key: 'estado', header: 'Estado', render: (e) => <Badge tone={badgeToneDeEstado(e.estado)}>{e.estado}</Badge> },
    { key: 'docs', header: 'Docs', render: (e) => e.documentos },
  ];

  return (
    <>
      <PageHeader
        title="Expedientes"
        subtitle="Objeto central del RSP: agrupa documentos, actuaciones, firmas y pagos."
        breadcrumb="RSP / Trabajo"
      />
      {items === null ? (
        <Spinner label="Cargando expedientes…" />
      ) : items.length === 0 ? (
        <Empty icon="folder" title="Sin expedientes" hint="Aún no hay expedientes registrados." />
      ) : (
        <Table columns={columns} rows={items} rowKey={(e) => e.id} onRowClick={(e) => navigate(`/expedientes/${e.id}`)} />
      )}
    </>
  );
}
