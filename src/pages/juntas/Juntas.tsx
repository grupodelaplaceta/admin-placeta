import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';
import { generarPdfActa } from '../../lib/pdf';
import type { Junta, Votacion } from '../../types';

export default function Juntas() {
  const [items, setItems] = useState<Junta[] | null>(null);
  const [votaciones, setVotaciones] = useState<Votacion[]>([]);
  const [modal, setModal] = useState(false);
  const [actaModal, setActaModal] = useState<Junta | null>(null);
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState('');
  const [asistentes, setAsistentes] = useState('');
  const [orden, setOrden] = useState('');
  const [votacionesSel, setVotacionesSel] = useState<string[]>([]);
  const [actaTexto, setActaTexto] = useState('');
  const { toast } = useToast();

  const cargar = () => provider.listarJuntas().then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); provider.listarVotaciones().then(setVotaciones).catch(() => setVotaciones([])); }, []);

  async function crear() {
    try {
      await provider.crearJunta({
        titulo, fecha: fecha || new Date().toISOString().slice(0, 10),
        asistentes: asistentes.split(',').map((s) => s.trim()).filter(Boolean),
        ordenDelDia: orden.split('\n').map((s) => s.trim()).filter(Boolean),
        votaciones: votacionesSel,
      });
      toast('Junta convocada', 'success');
      setModal(false); setTitulo(''); setAsistentes(''); setOrden(''); setVotacionesSel([]);
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function emitir() {
    if (!actaModal) return;
    try {
      await provider.emitirActa(actaModal.id, actaTexto);
      toast('Acta emitida', 'success');
      const detalle = await provider.getJunta(actaModal.id);
      await generarPdfActa({ ...detalle, acta: actaTexto });
      setActaModal(null); setActaTexto('');
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  const columns: Column<Junta>[] = [
    { key: 'id', header: 'ID', render: (j) => <span className="u-mono">{j.id}</span>, width: '130px' },
    { key: 'titulo', header: 'Sesión', render: (j) => <strong>{j.titulo}</strong> },
    { key: 'fecha', header: 'Fecha', render: (j) => j.fecha },
    { key: 'asistentes', header: 'Asistentes', render: (j) => j.asistentes.length },
    { key: 'votaciones', header: 'Votaciones', render: (j) => j.votaciones.length },
    { key: 'estado', header: 'Estado', render: (j) => <Badge tone={j.estado === 'acta_emitida' ? 'success' : j.estado === 'celebrada' ? 'info' : 'warning'}>{j.estado}</Badge> },
    {
      key: 'acciones', header: 'Acciones', render: (j) => (
        <Button size="sm" variant="outline" icon="fileCheck" onClick={() => { setActaModal(j); setActaTexto(j.acta); }}>Acta</Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Juntas"
        subtitle="Reuniones de la Junta, vinculación de votaciones y emisión de actas."
        breadcrumb="RSP / Participación"
        actions={<Button icon="plus" onClick={() => setModal(true)}>Convocar junta</Button>}
      />
      <div className="rsp-kpi-grid">
        <KPI label="Juntas" value={items?.length ?? '—'} icon="users" tone="brand" />
        <KPI label="Con acta" value={items?.filter((j) => j.estado === 'acta_emitida').length ?? 0} icon="fileCheck" tone="success" />
        <KPI label="Votaciones vinculadas" value={items?.reduce((s, j) => s + j.votaciones.length, 0) ?? 0} icon="vote" tone="info" />
      </div>
      {items === null ? <Spinner label="Cargando juntas…" /> : items.length === 0
        ? <Empty icon="users" title="Sin juntas" /> : <Table columns={columns} rows={items} rowKey={(j) => j.id} />}

      <Modal open={modal} title="Convocar junta" onClose={() => setModal(false)}
        footer={<><Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button><Button icon="plus" onClick={crear} disabled={!titulo.trim()}>Convocar</Button></>}>
        <div className="rsp-form-grid">
          <Field label="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Sesión ordinaria" /></Field>
          <Field label="Fecha"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
          <Field label="Asistentes (DIPs separados por coma)"><input value={asistentes} onChange={(e) => setAsistentes(e.target.value)} placeholder="23749931M, 72583347U" /></Field>
          <Field label="Orden del día (uno por línea)"><textarea rows={3} value={orden} onChange={(e) => setOrden(e.target.value)} /></Field>
          <Field label="Votaciones vinculadas">
            <select className="rsp-select" multiple value={votacionesSel} onChange={(e) => setVotacionesSel([...e.target.selectedOptions].map((o) => o.value))}>
              {votaciones.map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}
            </select>
          </Field>
        </div>
      </Modal>

      <Modal open={actaModal !== null} title={actaModal ? `Acta · ${actaModal.titulo}` : ''} onClose={() => setActaModal(null)}
        footer={<><Button variant="outline" onClick={() => setActaModal(null)}>Cancelar</Button><Button icon="fileCheck" onClick={emitir}>Emitir acta y PDF</Button></>}>
        <Field label="Texto del acta">
          <textarea rows={8} value={actaTexto} onChange={(e) => setActaTexto(e.target.value)} placeholder="En la ciudad de La Placeta, siendo las…" />
        </Field>
      </Modal>
    </>
  );
}
