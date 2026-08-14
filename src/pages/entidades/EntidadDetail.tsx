import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Card, CardHeader, Button, KPI, PageHeader, Spinner, Table, Tabs, type Column } from '../../components/ui';
import { Icon } from '../../components/icons';
import type { EntidadDetalle, DocumentoCiudadano, Obligacion, CuentaBancaria, FacturaEmitida, ParticipacionEmpresa, Tramite } from '../../types';
import { generarPdfFichaEntidad } from '../../lib/pdf';

export default function EntidadDetail() {
  const { eip } = useParams<{ eip: string }>();
  const [det, setDet] = useState<EntidadDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('resumen');

  useEffect(() => {
    if (!eip) return;
    provider.getEntidad(eip).then(setDet).catch((e) => setError(e.message));
  }, [eip]);

  if (error) return <div className="rsp-alert rsp-alert-danger">{error}</div>;
  if (!det) return <Spinner label="Cargando entidad…" />;

  const saldoCuentas = det.cuentas.reduce((s, c) => s + c.saldo, 0);
  const facturado = det.facturasEmitidas.reduce((s, f) => s + (f.estado === 'anulada' ? 0 : f.importe), 0);

  const colsCuentas: Column<CuentaBancaria>[] = [
    { key: 'id', header: 'Cuenta', render: (c) => <span className="u-mono">{c.id}</span> },
    { key: 'tipo', header: 'Tipo', render: (c) => <Badge tone="neutral">{c.tipo}</Badge> },
    { key: 'saldo', header: 'Saldo', render: (c) => <strong>{c.saldo.toLocaleString('es-ES')} Pz</strong> },
    { key: 'titulares', header: 'Titulares', render: (c) => (c.participaciones?.length ?? 0) > 0 ? c.participaciones!.map((p) => <span key={p.dip} className="u-row"><span className="u-mono">{p.dip}</span> {p.pct}%</span>) : <span className="u-muted">—</span> },
    { key: 'estado', header: 'Estado', render: (c) => <Badge tone={c.estado === 'activa' ? 'success' : c.estado === 'bloqueada' ? 'warning' : 'danger'}>{c.estado}</Badge> },
  ];

  const colsFact: Column<FacturaEmitida>[] = [
    { key: 'numero', header: 'Factura', render: (f) => <span className="u-mono">{f.numero}</span> },
    { key: 'concepto', header: 'Concepto', render: (f) => <strong>{f.concepto}</strong> },
    { key: 'receptor', header: 'Receptor', render: (f) => <span>{f.receptor || '—'}{f.receptorId ? <span className="u-mono"> ({f.receptorId})</span> : null}</span> },
    { key: 'importe', header: 'Importe', render: (f) => <strong>{f.importe.toLocaleString('es-ES')} Pz</strong> },
    { key: 'fecha', header: 'Fecha', render: (f) => f.fecha },
    { key: 'estado', header: 'Estado', render: (f) => <Badge tone={f.estado === 'cobrada' ? 'success' : f.estado === 'pendiente' ? 'warning' : 'neutral'}>{f.estado}</Badge> },
  ];

  const colsTram: Column<Tramite>[] = [
    { key: 'id', header: 'Trámite', render: (t) => <span className="u-mono">{t.id}</span> },
    { key: 'titulo', header: 'Título', render: (t) => <strong>{t.titulo}</strong> },
    { key: 'servicio', header: 'Servicio', render: (t) => t.servicio ?? '—' },
    { key: 'estado', header: 'Estado', render: (t) => <Badge tone="info">{t.estado}</Badge> },
    { key: 'plazo', header: 'Plazo', render: (t) => `${t.plazo} días` },
  ];

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

      <div className="rsp-kpi-grid">
        <KPI label="Cuentas de banco" value={det.cuentas.length} icon="landmark" tone="brand" />
        <KPI label="Saldo total" value={`${saldoCuentas.toLocaleString('es-ES')} Pz`} icon="wallet" tone="info" />
        <KPI label="Facturas emitidas" value={det.facturasEmitidas.length} icon="receipt" tone="success" />
        <KPI label="Titulares" value={det.participacion.length} icon="users" tone="warning" />
      </div>

      <Card>
        <Tabs
          tabs={[
            { id: 'resumen', label: 'Resumen' },
            { id: 'cuentas', label: `Cuentas (${det.cuentas.length})` },
            { id: 'facturas', label: `Facturas (${det.facturasEmitidas.length})` },
            { id: 'participacion', label: `Participación (${det.participacion.length})` },
            { id: 'tramites', label: `Trámites (${det.tramites.length})` },
            { id: 'documentos', label: `Documentos (${det.documentos.length})` },
            { id: 'obligaciones', label: `Obligaciones (${det.obligaciones.length})` },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'resumen' && (
          <div className="rsp-grid rsp-grid-2">
            <Card>
              <CardHeader title="Datos registrales" />
              <dl className="rsp-dl">
                <div className="rsp-dl-row"><dt>EIP</dt><dd><span className="u-mono">{det.eip}</span></dd></div>
                <div className="rsp-dl-row"><dt>Tipo</dt><dd>{det.tipo}</dd></div>
                <div className="rsp-dl-row"><dt>Estado</dt><dd>{det.estado}</dd></div>
                <div className="rsp-dl-row"><dt>Cumplimiento</dt><dd>{det.cumplimiento ?? '—'}</dd></div>
                <div className="rsp-dl-row"><dt>Facturado</dt><dd><strong>{facturado.toLocaleString('es-ES')} Pz</strong></dd></div>
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
        )}

        {tab === 'cuentas' && (
          det.cuentas.length === 0 ? <p className="u-muted">Sin cuentas bancarias a nombre de la entidad.</p> :
            <Table columns={colsCuentas} rows={det.cuentas} rowKey={(c) => c.id} />
        )}

        {tab === 'facturas' && (
          det.facturasEmitidas.length === 0 ? <p className="u-muted">Sin facturas emitidas.</p> :
            <Table columns={colsFact} rows={det.facturasEmitidas} rowKey={(f) => f.id} />
        )}

        {tab === 'participacion' && (
          det.participacion.length === 0 ? <p className="u-muted">Sin titulares con % de participación registrado.</p> : (
            <ul className="rsp-doclist">
              {det.participacion.map((p: ParticipacionEmpresa) => (
                <li key={p.dip} className="rsp-doc">
                  <Icon name="user" size={16} />
                  <span>{p.nombre}</span>
                  <span className="u-mono">{p.dip}</span>
                  <span style={{ marginLeft: 'auto' }}><Badge tone="success">{p.pct}%</Badge></span>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === 'tramites' && (
          det.tramites.length === 0 ? <p className="u-muted">Sin trámites en los que la entidad sea interesada.</p> :
            <Table columns={colsTram} rows={det.tramites} rowKey={(t) => t.id} />
        )}

        {tab === 'documentos' && (
          det.documentos.length === 0 ? <p className="u-muted">Sin documentos.</p> :
            <Table columns={colsDocs} rows={det.documentos} rowKey={(d) => d.id} />
        )}

        {tab === 'obligaciones' && (
          det.obligaciones.length === 0 ? <p className="u-muted">Sin obligaciones.</p> :
            <Table columns={colsObl} rows={det.obligaciones} rowKey={(o) => o.id} />
        )}
      </Card>
    </>
  );
}
