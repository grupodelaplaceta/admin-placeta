import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Card, CardHeader, Button, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import { Icon } from '../../components/icons';
import type { EntidadDetalle, DocumentoCiudadano, Obligacion } from '../../types';
import { generarPdfFichaEntidad } from '../../lib/pdf';

export default function EntidadDetail() {
  const { eip } = useParams<{ eip: string }>();
  const [det, setDet] = useState<EntidadDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eip) return;
    provider.getEntidad(eip).then(setDet).catch((e) => setError(e.message));
  }, [eip]);

  if (error) return <div className="rsp-alert rsp-alert-danger">{error}</div>;
  if (!det) return <Spinner label="Cargando entidad…" />;

  const colsDocs: Column<DocumentoCiudadano>[] = [
    { key: 'nombre', header: 'Documento', render: (d) => <span className="u-row"><Icon name="file" size={14} /> {d.nombre}</span> },
    { key: 'tipo', header: 'Tipo', render: (d) => <Badge tone="neutral">{d.tipo}</Badge> },
    { key: 'estado', header: 'Estado', render: (d) => <Badge tone={d.estado === 'firmado' ? 'success' : d.estado === 'pendiente' ? 'warning' : 'info'}>{d.estado}</Badge> },
    { key: 'fecha', header: 'Fecha', render: (d) => d.fecha },
  ];

  const colsObl: Column<Obligacion>[] = [
    { key: 'titulo', header: 'Obligación', render: (o) => <strong>{o.titulo}</strong> },
    { key: 'tipo', header: 'Tipo', render: (o) => <Badge tone="info">{o.tipo}</Badge> },
    { key: 'estado', header: 'Estado', render: (o) => <Badge tone="neutral">{o.estado}</Badge> },
    { key: 'plazo', header: 'Plazo', render: (o) => o.plazo ?? '—' },
  ];

  async function descargarFicha() {
    if (!det) return;
    await generarPdfFichaEntidad(det);
  }

  return (
    <>
      <PageHeader
        title={det.nombre}
        subtitle={<span className="u-mono">{det.eip}</span>}
        breadcrumb={<>RSP / Entidades / <span className="u-mono">{det.eip}</span></>}
        actions={<><Badge tone={det.estado === 'activa' ? 'success' : 'danger'}>{det.estado}</Badge><Button size="sm" variant="outline" icon="download" onClick={descargarFicha}>Ficha PDF</Button></>}
      />
      <div className="rsp-grid rsp-grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <Card>
          <CardHeader title="Datos registrales" />
          <dl className="rsp-dl">
            <div className="rsp-dl-row"><dt>Tipo</dt><dd>{det.tipo}</dd></div>
            <div className="rsp-dl-row"><dt>Cumplimiento</dt><dd>{det.cumplimiento ?? '—'}</dd></div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Representantes legales" />
          {det.representantes.length === 0 ? (
            <p className="u-muted">Sin representantes registrados.</p>
          ) : (
            <ul className="rsp-doclist">
              {det.representantes.map((r) => (
                <li key={r.dip} className="rsp-doc">
                  <Icon name="user" size={16} />
                  <span>{r.nombre}</span>
                  <Badge tone="brand">{r.cargo}</Badge>
                  <span className="u-mono">{r.dip}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        <CardHeader title="Documentos" />
        {det.documentos.length === 0 ? <p className="u-muted">Sin documentos.</p> : <Table columns={colsDocs} rows={det.documentos} rowKey={(d) => d.id} />}
      </Card>
      <Card>
        <CardHeader title="Obligaciones" />
        {det.obligaciones.length === 0 ? <p className="u-muted">Sin obligaciones.</p> : <Table columns={colsObl} rows={det.obligaciones} rowKey={(o) => o.id} />}
      </Card>
    </>
  );
}
