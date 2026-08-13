import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Card, CardHeader, Field, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';
import { Icon } from '../../components/icons';
import type { CNICRegla } from '../../types';

export default function Bop() {
  const { toast } = useToast();
  const [items, setItems] = useState<CNICRegla[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [form, setForm] = useState({ codigo: 'CNIC-', valor: '', motivo: '' });

  const cargar = () => provider.listarCNIC().then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); }, []);

  async function refrescar() {
    setSincronizando(true);
    try {
      const r = await provider.refrescarNormativa();
      toast(`Sincronizado con ${r.fuente} (${r.total} reglas)`, 'success');
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSincronizando(false);
    }
  }

  async function nuevaVersion() {
    if (!form.codigo.trim() || form.valor.trim() === '') return;
    try {
      await provider.crearVersionCNIC({ codigo: form.codigo.trim(), valor: Number(form.valor), motivo: form.motivo });
      toast('Nueva versión creada (borrador). Se publicará en el BOP al aprobarse.', 'success');
      setForm({ codigo: 'CNIC-', valor: '', motivo: '' });
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const columns: Column<CNICRegla>[] = [
    { key: 'codigo', header: 'Código', render: (c) => <span className="u-mono">{c.codigo}</span>, width: '240px' },
    { key: 'etiqueta', header: 'Regla', render: (c) => <strong>{c.etiqueta}</strong> },
    { key: 'valor', header: 'Valor', render: (c) => <span className="u-mono">{c.valor}{c.unidad ?? ''}</span> },
    { key: 'version', header: 'Versión', render: (c) => `v${c.version}` },
    { key: 'fuente', header: 'Fuente', render: (c) => c.fuente === 'BOP'
      ? <a href={c.bopUrl} target="_blank" rel="noreferrer"><Badge tone="success">BOP ↗</Badge></a>
      : <Badge tone="warning">local</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Boletín Oficial (BOP)"
        subtitle="La normativa vive en el BOP. El RSP consume la versión vigente de cada CNIC y propone nuevas versiones."
        breadcrumb="RSP / Normativa"
      />
      <div className="rsp-grid rsp-grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <Card>
          <CardHeader title="Conexión con el BOP" subtitle="bop.laplaceta.org" />
          <div className="u-stack">
            <div className="u-row">
              <Badge tone="success"><Icon name="circleCheck" size={14} /> Conectado</Badge>
              <span className="u-muted">Fuente de verdad de los CNIC</span>
            </div>
            <Button variant="outline" icon="refresh" onClick={refrescar} disabled={sincronizando}>
              {sincronizando ? 'Sincronizando…' : 'Refrescar desde BOP'}
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Nueva versión CNIC" subtitle="Se crea en borrador y se publica en el BOP al aprobarse" />
          <div className="rsp-form-grid">
            <Field label="Código CNIC">
              <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="CNIC-FISC-001" />
            </Field>
            <Field label="Nuevo valor">
              <input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="80" inputMode="numeric" />
            </Field>
            <Field label="Motivo del cambio">
              <input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ajuste de la bonificación" />
            </Field>
          </div>
          <Button icon="plus" onClick={nuevaVersion} style={{ marginTop: 'var(--sp-3)' }}>Crear versión</Button>
        </Card>
      </div>

      {items === null ? (
        <Spinner label="Cargando CNIC…" />
      ) : (
        <Table columns={columns} rows={items} rowKey={(c) => c.codigo} />
      )}
    </>
  );
}
