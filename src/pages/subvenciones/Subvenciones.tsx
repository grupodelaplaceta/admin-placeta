import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, badgeToneDeEstado, Button, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';
import type { SubvencionResumen } from '../../types';
import { BuscadorIdentidad } from '../../components/BuscadorIdentidad';
import { TIPOS_TRANSACCION_BANCO, TIPOS_APTOS_POR_DEFECTO } from '../../config/tipos-transaccion';
import { BAREMOS_AUTOMATICOS } from '../../config/baremos';

export default function Subvenciones() {
  const [items, setItems] = useState<SubvencionResumen[] | null>(null);
  const [concediendo, setConcediendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ emisorEip: 'AGLDP', receptorEip: '', importe: '', concepto: '' });
  const [tiposAptosSel, setTiposAptosSel] = useState<string[]>(TIPOS_APTOS_POR_DEFECTO);
  const [publicar, setPublicar] = useState(false);
  const [baremosSel, setBaremosSel] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const cargar = () => provider.listarSubvenciones().then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); }, []);

  const totalConcedido = items?.reduce((s, x) => s + x.importe, 0) ?? 0;
  const totalRestante = items?.reduce((s, x) => s + x.importeRestante, 0) ?? 0;
  const justificadas = items?.filter((x) => x.estado !== 'concedida').length ?? 0;
  const publicadas = items?.filter((x) => x.publicada).length ?? 0;

  async function conceder() {
    if (!form.receptorEip.trim() || !form.importe.trim() || !form.concepto.trim()) {
      toast('Rellena receptor, importe y concepto', 'error');
      return;
    }
    setGuardando(true);
    try {
      const baremos = Object.entries(baremosSel)
        .filter(([, peso]) => Number(peso) > 0)
        .map(([id, peso]) => {
          const t = BAREMOS_AUTOMATICOS.find((b) => b.id === id);
          return { id, descripcion: t?.etiqueta ?? id, descripcionCalculo: t?.explicacion ?? t?.descripcion, peso: Number(peso) || 0 };
        });
      await provider.concederSubvencion({
        emisorEip: form.emisorEip.trim(),
        receptorEip: form.receptorEip.trim().toUpperCase(),
        importe: Number(form.importe),
        concepto: form.concepto.trim(),
        tiposAptos: tiposAptosSel,
        publicada: publicar,
        baremos,
      });
      toast(publicar ? 'Subvención concedida y publicada en la web del GDLP' : 'Subvención concedida (no mueve placetas hasta justificar)', 'success');
      setConcediendo(false);
      setForm({ emisorEip: 'AGLDP', receptorEip: '', importe: '', concepto: '' });
      setTiposAptosSel(TIPOS_APTOS_POR_DEFECTO);
      setPublicar(false);
      setBaremosSel({});
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
    { key: 'publicada', header: 'Publicación', render: (s) => s.publicada ? <Badge tone="brand">web GDLP</Badge> : <span className="u-muted">—</span> },
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
        <KPI label="Publicadas en GDLP" value={publicadas} icon="landmark" tone="info" />
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
          <Field label="Tipos de transacción justificables (aptos)" hint="Qué tipos de transacción del banco se pueden justificar como gasto.">
            <ul className="rsp-checklist">
              {TIPOS_TRANSACCION_BANCO.map((t) => (
                <li key={t.id} className="rsp-check">
                  <input
                    type="checkbox"
                    checked={tiposAptosSel.includes(t.id)}
                    onChange={(e) => {
                      setTiposAptosSel((s) => e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id));
                    }}
                  />
                  <span>{t.etiqueta}</span>
                  <span className="u-muted" style={{ fontSize: 'var(--fs-xs)', flexBasis: '100%' }}>{t.id} — {t.descripcion}</span>
                </li>
              ))}
            </ul>
          </Field>
          <Field label="Baremos automáticos para empresas" hint="Criterios que una empresa debe cumplir para optar.">
            <ul className="rsp-checklist">
              {BAREMOS_AUTOMATICOS.map((b) => (
                <li key={b.id} className="rsp-check">
                  <input
                    type="checkbox"
                    checked={baremosSel[b.id] !== undefined}
                    onChange={(e) => {
                      if (e.target.checked) setBaremosSel((s) => ({ ...s, [b.id]: '10' }));
                      else setBaremosSel((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== b.id)));
                    }}
                  />
                  <span>{b.etiqueta}</span>
                  <span className="u-muted" style={{ fontSize: 'var(--fs-xs)', flexBasis: '100%' }}>{b.explicacion}</span>
                </li>
              ))}
            </ul>
          </Field>
          <Field label="Publicación">
            <label className="u-row" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={publicar} onChange={(e) => setPublicar(e.target.checked)} />
              <span>Publicar en la web del GDLP</span>
            </label>
          </Field>
        </div>
      </Modal>
    </>
  );
}
