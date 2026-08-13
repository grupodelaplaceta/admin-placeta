import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, badgeToneDeEstado, Button, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';
import type { SubvencionResumen } from '../../types';
import { BuscadorIdentidad } from '../../components/BuscadorIdentidad';

export default function Subvenciones() {
  const [items, setItems] = useState<SubvencionResumen[] | null>(null);
  const [concediendo, setConcediendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ emisorEip: 'AGLDP', receptorEip: '', importe: '', concepto: '' });
  const navigate = useNavigate();
  const { toast } = useToast();

  const cargar = () => provider.listarSubvenciones().then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); }, []);

  const totalConcedido = items?.reduce((s, x) => s + x.importe, 0) ?? 0;
  const totalRestante = items?.reduce((s, x) => s + x.importeRestante, 0) ?? 0;
  const justificadas = items?.filter((x) => x.estado !== 'concedida').length ?? 0;

  async function conceder() {
    if (!form.receptorEip.trim() || !form.importe.trim() || !form.concepto.trim()) {
      toast('Rellena receptor, importe y concepto', 'error');
      return;
    }
    setGuardando(true);
    try {
      await provider.concederSubvencion({
        emisorEip: form.emisorEip.trim(),
        receptorEip: form.receptorEip.trim().toUpperCase(),
        importe: Number(form.importe),
        concepto: form.concepto.trim(),
      });
      toast('Subvención concedida (no mueve placetas hasta justificar)', 'success');
      setConcediendo(false);
      setForm({ emisorEip: 'AGLDP', receptorEip: '', importe: '', concepto: '' });
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  const columns: Column<SubvencionResumen>[] = [
    { key: 'id', header: 'Subvención', render: (s) => <span className="u-mono">{s.id}</span>, width: '150px' },
    { key: 'flujo', header: 'Emisor → Receptor', render: (s) => <span className="u-mono">{s.emisorEip} → {s.receptorEip}</span> },
    { key: 'concepto', header: 'Concepto', render: (s) => <strong>{s.concepto}</strong> },
    { key: 'importe', header: 'Importe', render: (s) => `${s.importe.toLocaleString('es-ES')} Pz` },
    { key: 'restante', header: 'Restante', render: (s) => `${s.importeRestante.toLocaleString('es-ES')} Pz` },
    { key: 'estado', header: 'Estado', render: (s) => <Badge tone={badgeToneDeEstado(s.estado)}>{s.estado}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Subvenciones"
        subtitle="Conceder no mueve placetas; se justifican gastos y el pago se ejecuta vía Banco de La Placeta."
        breadcrumb="RSP / Tributos"
        actions={<Button icon="plus" onClick={() => setConcediendo(true)}>Conceder subvención</Button>}
      />
      <div className="rsp-kpi-grid">
        <KPI label="Concedido" value={`${totalConcedido.toLocaleString('es-ES')} Pz`} icon="handshake" tone="brand" />
        <KPI label="Pendiente de justificar" value={`${totalRestante.toLocaleString('es-ES')} Pz`} icon="clock" tone="warning" />
        <KPI label="Justificadas / cerradas" value={justificadas} icon="check" tone="success" />
      </div>
      {items === null ? (
        <Spinner label="Cargando subvenciones…" />
      ) : items.length === 0 ? (
        <Empty icon="handshake" title="Sin subvenciones" />
      ) : (
        <Table columns={columns} rows={items} rowKey={(s) => s.id} onRowClick={(s) => navigate(`/subvenciones/${s.id}`)} />
      )}

      <Modal
        open={concediendo}
        title="Conceder subvención"
        onClose={() => setConcediendo(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConcediendo(false)}>Cancelar</Button>
            <Button onClick={conceder} disabled={guardando} icon="send">{guardando ? 'Concediendo…' : 'Conceder'}</Button>
          </>
        }
      >
        <div className="rsp-form-grid">
          <Field label="Emisor (EIP)">
            <BuscadorIdentidad value={form.emisorEip} onChange={(v) => setForm({ ...form, emisorEip: v })} />
          </Field>
          <Field label="Receptor (DIP/EIP)">
            <BuscadorIdentidad value={form.receptorEip} onChange={(v) => setForm({ ...form, receptorEip: v })} />
          </Field>
          <Field label="Importe (Pz)">
            <input type="number" value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} placeholder="1000" />
          </Field>
          <Field label="Concepto">
            <input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} placeholder="Material escolar" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
