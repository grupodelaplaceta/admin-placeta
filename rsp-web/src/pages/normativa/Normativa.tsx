import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, badgeToneDeEstado, Button, Empty, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';
import type { CNICRegla } from '../../types';

export default function Normativa() {
  const { toast } = useToast();
  const [items, setItems] = useState<CNICRegla[] | null>(null);

  const cargar = () => provider.listarCNIC().then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); }, []);

  async function refrescar() {
    try {
      const r = await provider.refrescarNormativa();
      toast(`Sincronizado con ${r.fuente} (${r.total} reglas)`, 'success');
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
    { key: 'estado', header: 'Estado', render: (c) => <Badge tone={badgeToneDeEstado(c.estado)}>{c.estado}</Badge> },
    {
      key: 'fuente', header: 'Fuente', render: (c) => c.fuente === 'BOP'
        ? <a href={c.bopUrl} target="_blank" rel="noreferrer"><Badge tone="success">BOP ↗</Badge></a>
        : <Badge tone="warning">borrador local</Badge>,
    },
    {
      key: 'historial', header: 'Historial', render: (c) => (
        <span className="u-muted">
          {c.historial?.length
            ? c.historial.slice(0, 2).map((h) => `v${h.version} (${h.estado})`).join(' · ')
            : '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="CNIC · Motor normativo"
        subtitle="Reglas versionadas que se publican en el BOP. Nunca se edita una versión vigente: cada cambio crea una versión nueva."
        breadcrumb="RSP / Normativa"
        actions={<Button variant="outline" icon="refresh" onClick={refrescar}>Refrescar desde BOP</Button>}
      />
      {items === null ? (
        <Spinner label="Cargando normativa…" />
      ) : items.length === 0 ? (
        <Empty icon="scale" title="Sin reglas" />
      ) : (
        <Table columns={columns} rows={items} rowKey={(c) => c.codigo} />
      )}
    </>
  );
}
