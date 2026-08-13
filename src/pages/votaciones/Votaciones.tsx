import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Card, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';
import { generarPdfResumenVotacion } from '../../lib/pdf';
import type { Votacion } from '../../types';
import { ANONIMATO_DIAS } from '../../types';

const TONE_ESTADO: Record<string, 'brand' | 'success' | 'warning' | 'neutral'> = {
  abierta: 'success', cerrada: 'neutral', publicada: 'brand', borrador: 'warning',
};

export default function Votaciones() {
  const [items, setItems] = useState<Votacion[] | null>(null);
  const [modal, setModal] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState('referendum');
  const [descripcion, setDescripcion] = useState('');
  const [rango, setRango] = useState('ciudadania_plena');
  const { toast } = useToast();

  const cargar = () => provider.listarVotaciones().then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); }, []);

  async function crear() {
    try {
      await provider.crearVotacion({ titulo, categoria, descripcion, rango, opciones: ['A favor', 'En contra', 'Abstención'] });
      toast('Votación abierta', 'success');
      setModal(false); setTitulo(''); setDescripcion('');
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function accion(v: Votacion, fn: (id: string) => Promise<void>, ok: string) {
    try { await fn(v.id); toast(ok, 'success'); cargar(); } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function resumenPdf(v: Votacion) {
    try {
      const detalle = await provider.getVotacion(v.id);
      await generarPdfResumenVotacion(detalle, detalle.votos);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  const columns: Column<Votacion>[] = [
    { key: 'id', header: 'ID', render: (v) => <span className="u-mono">{v.id}</span>, width: '130px' },
    { key: 'titulo', header: 'Votación', render: (v) => <strong>{v.titulo}</strong> },
    { key: 'categoria', header: 'Tipo', render: (v) => <Badge tone="brand">{v.categoria}</Badge> },
    { key: 'rango', header: 'Rango', render: (v) => <span className="u-muted">{v.rango}</span> },
    { key: 'resultado', header: 'Resultado', render: (v) => `${v.aFavor} / ${v.enContra} / ${v.abstenciones}` },
    { key: 'estado', header: 'Estado', render: (v) => <Badge tone={TONE_ESTADO[v.estado] ?? 'neutral'}>{v.estado}</Badge> },
    {
      key: 'acciones', header: 'Acciones', render: (v) => (
        <div className="u-row u-wrap">
          {v.estado === 'abierta' && <Button size="sm" variant="outline" icon="lock" onClick={() => accion(v, provider.cerrarVotacion, 'Votación cerrada')}>Cerrar</Button>}
          {v.estado === 'cerrada' && <Button size="sm" variant="outline" icon="send" onClick={() => accion(v, provider.publicarVotacion, 'Publicada en BOP')}>Publicar BOP</Button>}
          <Button size="sm" variant="outline" icon="download" onClick={() => resumenPdf(v)}>Resumen</Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Votaciones"
        subtitle="Participación democrática por rangos, vía PlacetaID. Los votos se anonimizan a los 30 días; los de la Junta nunca."
        breadcrumb="RSP / Participación"
        actions={<Button icon="plus" onClick={() => setModal(true)}>Nueva votación</Button>}
      />
      <div className="rsp-kpi-grid">
        <KPI label="Votaciones" value={items?.length ?? '—'} icon="vote" tone="brand" />
        <KPI label="Abiertas" value={items?.filter((v) => v.estado === 'abierta').length ?? 0} icon="check" tone="success" />
        <KPI label="Publicadas (BOP)" value={items?.filter((v) => v.estado === 'publicada').length ?? 0} icon="landmark" tone="info" />
        <KPI label={`Anonimato (${ANONIMATO_DIAS} días)`} value={ANONIMATO_DIAS} icon="shield" tone="warning" />
      </div>
      <Card>
        <p className="u-muted" style={{ margin: 0 }}>
          Regla de anonimato: un voto se hace anónimo a los {ANONIMATO_DIAS} días de emitirlo. Los votos de la Junta <strong>nunca</strong> se anonimizan. A nivel público todos los votos son anónimos.
        </p>
      </Card>
      {items === null ? <Spinner label="Cargando votaciones…" /> : items.length === 0
        ? <Empty icon="vote" title="Sin votaciones" /> : <Table columns={columns} rows={items} rowKey={(v) => v.id} />}

      <Modal open={modal} title="Nueva votación" onClose={() => setModal(false)}
        footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button><Button icon="plus" onClick={crear} disabled={!titulo.trim()}>Abrir</Button></>}>
        <div className="rsp-form-grid">
          <Field label="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Presupuestos 2026" /></Field>
          <Field label="Tipo">
            <select className="rsp-select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="referendum">Referéndum</option><option value="eleccion">Elección</option><option value="consulta">Consulta</option><option value="junta">Junta</option>
            </select>
          </Field>
          <Field label="Rango democrático">
            <select className="rsp-select" value={rango} onChange={(e) => setRango(e.target.value)}>
              <option value="todos">Todos</option><option value="ciudadania_plena">Ciudadanía plena</option><option value="junior">Junior</option><option value="junta">Junta</option>
            </select>
          </Field>
          <Field label="Descripción"><input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}
