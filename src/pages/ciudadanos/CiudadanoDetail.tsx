import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Card, CardHeader, Button, Empty, Field, PageHeader, Spinner, Table, Tabs, useToast, type Column } from '../../components/ui';
import { Icon, ICONO_SEMANTICO } from '../../components/icons';
import type { ContextoCiudadano, DocumentoCiudadano, FirmaCiudadano, Obligacion } from '../../types';
import { generarPdfFichaCiudadano } from '../../lib/pdf';

export default function CiudadanoDetail() {
  const { dip } = useParams<{ dip: string }>();
  const { toast } = useToast();
  const [ctx, setCtx] = useState<ContextoCiudadano | null>(null);
  const [docs, setDocs] = useState<DocumentoCiudadano[] | null>(null);
  const [firmas, setFirmas] = useState<FirmaCiudadano[] | null>(null);
  const [obligs, setObligs] = useState<Obligacion[] | null>(null);
  const [tab, setTab] = useState('contexto');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [tutorDip, setTutorDip] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [documentosAlta, setDocumentosAlta] = useState<Array<{ id: string; titulo: string; tipo: string; contenido?: string; enviado?: boolean }>>([]);

  useEffect(() => {
    if (!dip) return;
    provider.contextoCiudadano(dip).then(setCtx).catch((e) => setError(e.message));
    provider.documentosDeCiudadano(dip).then(setDocs).catch(() => setDocs([]));
    provider.firmasDeCiudadano(dip).then(setFirmas).catch(() => setFirmas([]));
    provider.obligacionesDeCiudadano(dip).then(setObligs).catch(() => setObligs([]));
  }, [dip]);

  useEffect(() => {
    if (ctx) {
      setEmail(ctx.email ?? '');
      setTelefono(ctx.telefono ?? '');
      setNombre(ctx.nombre ?? '');
    }
  }, [ctx]);

  async function guardarDatos() {
    if (!ctx) return;
    try {
      await provider.actualizarCiudadano(ctx.dip, { email, telefono, nombre });
      toast('Datos actualizados', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function migrarJunior() {
    if (!ctx) return;
    try {
      const r = await provider.migrarJunior(ctx.dip, ctx.nombre, tutorDip);
      setDocumentosAlta(r.firmas ?? []);
      toast(r.requiereTutor ? 'Trámite iniciado: falta el DIP del tutor legal.' : `Migración a Placeta Junior: ${String(r.tramite.id ?? '')}`, r.requiereTutor ? 'info' : 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  if (error) return <div className="rsp-alert rsp-alert-danger">{error}</div>;
  if (!ctx) return <Spinner label="Agregando Contexto Único…" />;

  const colsDocs: Column<DocumentoCiudadano>[] = [
    { key: 'nombre', header: 'Documento', render: (d) => <span className="u-row"><Icon name="file" size={14} /> {d.nombre}</span> },
    { key: 'tipo', header: 'Tipo', render: (d) => <Badge tone="neutral">{d.tipo}</Badge> },
    { key: 'estado', header: 'Estado', render: (d) => <Badge tone={d.estado === 'firmado' ? 'success' : d.estado === 'pendiente' ? 'warning' : 'info'}>{d.estado}</Badge> },
    { key: 'fecha', header: 'Fecha', render: (d) => d.fecha },
  ];

  const colsFirmas: Column<FirmaCiudadano>[] = [
    { key: 'documento', header: 'Documento', render: (f) => <strong>{f.documento}</strong> },
    { key: 'firmante', header: 'Firmante', render: (f) => f.firmante },
    { key: 'estado', header: 'Estado', render: (f) => <Badge tone={f.estado === 'completada' ? 'success' : 'warning'}>{f.estado}</Badge> },
    { key: 'version', header: 'Versión firmada', render: (f) => f.version ?? '—' },
    { key: 'fecha', header: 'Fecha', render: (f) => f.fecha ?? '—' },
  ];

  const colsObligs: Column<Obligacion>[] = [
    { key: 'titulo', header: 'Obligación', render: (o) => <strong>{o.titulo}</strong> },
    { key: 'tipo', header: 'Tipo', render: (o) => <Badge tone="info">{o.tipo}</Badge> },
    { key: 'estado', header: 'Estado', render: (o) => <Badge tone="neutral">{o.estado}</Badge> },
    { key: 'plazo', header: 'Plazo', render: (o) => o.plazo ?? '—' },
  ];

  async function descargarFicha() {
    if (!ctx) return;
    await generarPdfFichaCiudadano(ctx, docs ?? [], firmas ?? [], obligs ?? []);
  }

  return (
    <>
      <PageHeader
        title={ctx.nombre}
        subtitle={<span className="u-mono">{ctx.dip}</span>}
        breadcrumb={<>RSP / Ciudadanos / <span className="u-mono">{ctx.dip}</span></>}
        actions={<><Badge tone={ctx.nivel === 'N3' ? 'success' : 'info'}>Verificación {ctx.nivel}</Badge><Button size="sm" variant="outline" onClick={migrarJunior}>Migrar a Junior</Button><Button size="sm" variant="outline" icon="download" onClick={descargarFicha}>Ficha PDF</Button></>}
      />

      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        <CardHeader title="Datos personales" subtitle="Correo electrónico y teléfono de contacto" />
        <div className="rsp-form-grid">
          <Field label="Nombre completo">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" />
          </Field>
          <Field label="Correo electrónico">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@laplaceta.org" />
          </Field>
          <Field label="Teléfono">
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+34 …" />
          </Field>
          <Field label="Tutor legal (DIP, para migrar a Junior)">
            <input value={tutorDip} onChange={(e) => setTutorDip(e.target.value)} placeholder="DIP del tutor legal" />
          </Field>
        </div>
        <Button icon="check" onClick={guardarDatos} style={{ marginTop: 'var(--sp-3)' }}>Guardar</Button>
      </Card>

      {documentosAlta.length > 0 && <Card style={{ marginBottom: 'var(--sp-4)' }}>
        <CardHeader title="Documentos nuevos para firmar" subtitle="Vista previa del contenido que recibirá el tutor en PlacetaID Móvil" />
        <div className="rsp-grid rsp-grid-2">
          {documentosAlta.map((doc) => <Card key={doc.id}>
            <CardHeader title={doc.titulo} subtitle={doc.enviado ? 'Enviado a PlacetaID Móvil' : 'Pendiente de envío'} />
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, maxHeight: 260, overflow: 'auto', fontFamily: 'inherit', fontSize: 'var(--fs-sm)' }}>{doc.contenido || 'Contenido disponible en PlacetaID Móvil.'}</pre>
          </Card>)}
        </div>
      </Card>}

      <Card>
        <Tabs
          tabs={[
            { id: 'contexto', label: 'Contexto único' },
            { id: 'documentos', label: `Documentos (${docs?.length ?? 0})` },
            { id: 'firmas', label: `Firmas (${firmas?.length ?? 0})` },
            { id: 'obligaciones', label: `Obligaciones (${obligs?.length ?? 0})` },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'contexto' && (
          <>
            <p className="u-muted" style={{ marginTop: 0 }}>
              Contexto Único federado: cada dominio sigue siendo dueño de sus datos; esta vista los agrega vía APIs.
            </p>
            <div className="rsp-grid rsp-grid-2">
              {ctx.bloques.map((b) => (
                <Card key={b.clave}>
                  <CardHeader title={<><Icon name={ICONO_SEMANTICO[b.icono] ?? 'user'} size={16} /> {b.etiqueta}</>} />
                  <dl className="rsp-dl">
                    {b.items.map((it) => (
                      <div key={it.clave} className="rsp-dl-row">
                        <dt>{it.etiqueta}</dt>
                        <dd>{it.valor}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              ))}
            </div>
          </>
        )}

        {tab === 'documentos' && (
          docs && docs.length === 0 ? <Empty icon="file" title="Sin documentos" /> : (
            <Table columns={colsDocs} rows={docs ?? []} rowKey={(d) => d.id} />
          )
        )}

        {tab === 'firmas' && (
          firmas && firmas.length === 0 ? <Empty icon="stamp" title="Sin firmas" /> : (
            <Table columns={colsFirmas} rows={firmas ?? []} rowKey={(f) => f.id} />
          )
        )}

        {tab === 'obligaciones' && (
          obligs && obligs.length === 0 ? <Empty icon="clipboard" title="Sin obligaciones" /> : (
            <Table columns={colsObligs} rows={obligs ?? []} rowKey={(o) => o.id} />
          )
        )}
      </Card>
    </>
  );
}
