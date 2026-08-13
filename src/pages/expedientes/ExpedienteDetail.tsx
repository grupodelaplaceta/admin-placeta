import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, badgeToneDeEstado, Card, CardHeader, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { Expediente, Actuacion } from '../../types';

type Detalle = Expediente & { actuaciones: Actuacion[] };

export default function ExpedienteDetail() {
  const { id } = useParams<{ id: string }>();
  const [det, setDet] = useState<Detalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    provider.getExpediente(id).then(setDet).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="rsp-alert rsp-alert-danger">{error}</div>;
  if (!det) return <Spinner label="Cargando expediente…" />;

  const columns: Column<Actuacion>[] = [
    { key: 'fecha', header: 'Fecha', render: (a) => <span className="u-mono">{new Date(a.fecha).toLocaleString()}</span>, width: '180px' },
    { key: 'tipo', header: 'Tipo', render: (a) => <Badge tone="info">{a.tipo}</Badge> },
    { key: 'descripcion', header: 'Descripción', render: (a) => a.descripcion },
    { key: 'autor', header: 'Autor', render: (a) => a.autor },
  ];

  return (
    <>
      <PageHeader
        title={<span className="u-mono">{det.id}</span>}
        subtitle={det.titulo}
        breadcrumb={<>RSP / Expedientes / <span className="u-mono">{det.id}</span></>}
        actions={<Badge tone={badgeToneDeEstado(det.estado)}>{det.estado}</Badge>}
      />
      <div className="rsp-grid rsp-grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <Card><CardHeader title="Titular" /><p>{det.nombreCiudadano} · <span className="u-mono">{det.dip}</span></p></Card>
        <Card><CardHeader title="Servicio" /><p>{det.servicio}</p></Card>
      </div>
      <Card>
        <CardHeader title="Actuaciones" subtitle={`${det.actuaciones.length} actuaciones vinculadas`} />
        {det.actuaciones.length === 0 ? (
          <p className="u-muted">Sin actuaciones registradas todavía.</p>
        ) : (
          <Table columns={columns} rows={det.actuaciones} rowKey={(a) => a.id} />
        )}
      </Card>
    </>
  );
}
