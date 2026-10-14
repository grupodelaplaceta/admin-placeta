import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Button, Card, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, useToast, badgeToneDeEstado, type Column } from '../../components/ui';
import type { Propuesta } from '../../types';

const TIPOS = ['norma', 'cni', 'estatuto', 'politica', 'enmienda'];

export default function Propuestas() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<Propuesta[] | null>(null);
  const [crear, setCrear] = useState(false);
  const [form, setForm] = useState({ titulo: '', tipo: 'norma', departamento: '', descripcion: '', codigoDocumento: '' });
  const [guardando, setGuardando] = useState(false);

  const cargar = () => provider.listarPropuestas().then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); }, []);

  async function nueva() {
    if (!form.titulo.trim()) { toast('Escribe el título de la propuesta', 'error'); return; }
    try {
      setGuardando(true);
      await provider.crearPropuesta({
        titulo: form.titulo.trim(),
        tipo: form.tipo,
        departamento: form.departamento.trim(),
        descripcion: form.descripcion.trim(),
        codigoDocumento: form.codigoDocumento.trim() || undefined,
      });
      setCrear(false);
      setForm({ titulo: '', tipo: 'norma', departamento: '', descripcion: '', codigoDocumento: '' });
      toast('Propuesta creada (borrador)', 'success');
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  const columns: Column<Propuesta>[] = [
    { key: 'id', header: 'ID', render: (p) => <span className="u-mono">{p.id}</span>, width: '150px' },
    {
      key: 'titulo', header: 'Propuesta', render: (p) => (
        <div>
          <strong>{p.titulo}</strong>
          {p.departamento ? <div className="u-muted" style={{ fontSize: 12 }}>{p.departamento}</div> : null}
        </div>
      ),
    },
    { key: 'tipo', header: 'Tipo', render: (p) => <Badge tone="brand">{p.tipo}</Badge> },
    { key: 'codigoDocumento', header: 'Norma', render: (p) => p.codigoDocumento ? <span className="u-mono">{p.codigoDocumento}</span> : <span className="u-muted">—</span> },
    { key: 'version', header: 'V', render: (p) => <span className="u-mono">v{p.version}</span>, width: '46px' },
    { key: 'estado', header: 'Estado', render: (p) => <Badge tone={badgeToneDeEstado(p.estado)}>{p.estado}</Badge> },
    {
      key: 'acciones', header: '', render: (p) => <Button size="sm" variant="outline" onClick={() => navigate(`/propuestas/${p.id}`)}>Abrir</Button>, width: '90px',
    },
  ];

  const publicadas = (items || []).filter((p) => p.estado === 'publicada').length;
  const enVotacion = (items || []).filter((p) => p.estado === 'en_votacion').length;

  return (
    <>
      <PageHeader
        title="Propuestas normativas"
        subtitle="Borradores institucionales de normas y enmiendas: Departamento → revisión → Junta (votación) → publicación en el BOLP."
        breadcrumb="RSP / Participación"
        actions={<Button icon="plus" onClick={() => setCrear(true)}>Nueva propuesta</Button>}
      />
      <div className="rsp-kpi-grid">
        <KPI label="Propuestas" value={items?.length ?? '—'} icon="fileCheck" tone="brand" />
        <KPI label="En votación" value={enVotacion ?? 0} icon="vote" tone="warning" />
        <KPI label="Publicadas (BOLP)" value={publicadas ?? 0} icon="landmark" tone="success" />
      </div>

      {items === null ? <Spinner label="Cargando propuestas…" /> : items.length === 0
        ? <Card><Empty icon="fileCheck" title="Sin propuestas" hint="Crea la primera propuesta normativa del Grupo." actions={<Button icon="plus" onClick={() => setCrear(true)}>Nueva propuesta</Button>} /></Card>
        : <Table columns={columns} rows={items} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/propuestas/${p.id}`)} />}

      <Modal open={crear} title="Nueva propuesta normativa" onClose={() => setCrear(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setCrear(false)}>Cancelar</Button>
            <Button icon="plus" disabled={guardando} onClick={nueva}>{guardando ? 'Creando…' : 'Crear borrador'}</Button>
          </>
        }>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Título" hint="Descripción corta de lo que se propone.">
            <input style={{ width: '100%', padding: '9px 11px' }} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="p. ej. Reforma del CNI-BANCO (Art. 4.10)" />
          </Field>
          <Field label="Tipo">
            <select style={{ width: '100%', padding: '9px 11px' }} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Departamento / órgano proponente">
            <input style={{ width: '100%', padding: '9px 11px' }} value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} placeholder="p. ej. Tributos" />
          </Field>
          <Field label="Norma que se crea o enmienda (código del BOP)" hint="Opcional. Si se deja vacío, habrá que fijarlo antes de la Junta.">
            <input style={{ width: '100%', padding: '9px 11px' }} value={form.codigoDocumento} onChange={(e) => setForm({ ...form, codigoDocumento: e.target.value })} placeholder="p. ej. CNI-BANCO" />
          </Field>
          <Field label="Descripción">
            <textarea rows={3} style={{ width: '100%', padding: '9px 11px' }} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
