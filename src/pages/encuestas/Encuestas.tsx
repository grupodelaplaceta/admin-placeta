import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';
import type { Encuesta } from '../../types';

export default function Encuestas() {
  const [items, setItems] = useState<Encuesta[] | null>(null);
  const [modal, setModal] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [pregunta, setPregunta] = useState('');
  const [opciones, setOpciones] = useState('');
  const [rango, setRango] = useState('todos');
  const { toast } = useToast();

  const cargar = () => provider.listarEncuestas().then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); }, []);

  async function crear() {
    try {
      await provider.crearEncuesta({ titulo, pregunta, opciones: opciones.split('\n').map((s) => s.trim()).filter(Boolean), rango });
      toast('Encuesta abierta', 'success');
      setModal(false); setTitulo(''); setPregunta(''); setOpciones('');
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function publicar(e: Encuesta) {
    try { await provider.publicarEncuesta(e.id); toast('Publicada en BOP', 'success'); cargar(); }
    catch (err) { toast((err as Error).message, 'error'); }
  }

  const columns: Column<Encuesta>[] = [
    { key: 'id', header: 'ID', render: (e) => <span className="u-mono">{e.id}</span>, width: '130px' },
    { key: 'titulo', header: 'Encuesta', render: (e) => <strong>{e.titulo}</strong> },
    { key: 'pregunta', header: 'Pregunta', render: (e) => <span className="u-muted">{e.pregunta}</span> },
    { key: 'rango', header: 'Rango', render: (e) => e.rango },
    { key: 'respuestas', header: 'Respuestas', render: (e) => e.totalRespuestas },
    { key: 'estado', header: 'Estado', render: (e) => <Badge tone={e.estado === 'publicada' ? 'brand' : e.estado === 'abierta' ? 'success' : 'neutral'}>{e.estado}</Badge> },
    {
      key: 'acciones', header: 'Acciones', render: (e) =>
        e.estado === 'cerrada' || e.estado === 'abierta' ? (
          <Button size="sm" variant="outline" icon="send" onClick={() => publicar(e)}>Publicar BOP</Button>
        ) : e.bopUrl ? <a href={e.bopUrl} target="_blank" rel="noreferrer">BOP ↗</a> : <span className="u-muted">—</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Encuestas"
        subtitle="Encuestas por rangos democráticos con transparencia en el BOP una vez publicadas."
        breadcrumb="RSP / Participación"
        actions={<Button icon="plus" onClick={() => setModal(true)}>Nueva encuesta</Button>}
      />
      <div className="rsp-kpi-grid">
        <KPI label="Encuestas" value={items?.length ?? '—'} icon="clipboard" tone="brand" />
        <KPI label="Abiertas" value={items?.filter((e) => e.estado === 'abierta').length ?? 0} icon="check" tone="success" />
        <KPI label="Publicadas (BOP)" value={items?.filter((e) => e.estado === 'publicada').length ?? 0} icon="landmark" tone="info" />
      </div>
      {items === null ? <Spinner label="Cargando encuestas…" /> : items.length === 0
        ? <Empty icon="clipboard" title="Sin encuestas" /> : <Table columns={columns} rows={items} rowKey={(e) => e.id} />}

      <Modal open={modal} title="Nueva encuesta" onClose={() => setModal(false)}
        footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button><Button icon="plus" onClick={crear} disabled={!titulo.trim()}>Abrir</Button></>}>
        <div className="rsp-form-grid">
          <Field label="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></Field>
          <Field label="Pregunta"><input value={pregunta} onChange={(e) => setPregunta(e.target.value)} /></Field>
          <Field label="Opciones (una por línea)"><textarea rows={4} value={opciones} onChange={(e) => setOpciones(e.target.value)} /></Field>
          <Field label="Rango">
            <select className="rsp-select" value={rango} onChange={(e) => setRango(e.target.value)}>
              <option value="todos">Todos</option><option value="ciudadania_plena">Ciudadanía plena</option><option value="junior">Junior</option><option value="junta">Junta</option>
            </select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
