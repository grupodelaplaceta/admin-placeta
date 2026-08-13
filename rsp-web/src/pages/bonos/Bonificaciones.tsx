import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Button, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';
import type { RegimenBono } from '../../types';
import { BuscadorIdentidad } from '../../components/BuscadorIdentidad';
import { BAREMOS_AUTOMATICOS } from '../../config/baremos';

export default function Bonificaciones() {
  const [items, setItems] = useState<RegimenBono[] | null>(null);
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ nombre: '', emisorEip: 'EIP-X4NGQU', presupuesto: '', maxPorPersona: '', fechaLimite: '' });
  const [baremosSel, setBaremosSel] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const cargar = () => provider.listarBonos().then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); }, []);

  const presupuestoTotal = items?.reduce((s, x) => s + x.presupuesto, 0) ?? 0;
  const usadoTotal = items?.reduce((s, x) => s + x.presupuestoUsado, 0) ?? 0;
  const activos = items?.filter((x) => x.estado === 'activo').length ?? 0;

  async function crear() {
    if (!form.nombre.trim() || !form.presupuesto.trim() || !form.maxPorPersona.trim()) {
      toast('Rellena nombre, presupuesto y máximo por persona', 'error');
      return;
    }
    setGuardando(true);
    try {
      const baremos = Object.entries(baremosSel)
        .filter(([, peso]) => Number(peso) > 0)
        .map(([id, peso]) => {
          const t = BAREMOS_AUTOMATICOS.find((b) => b.id === id);
          return { id, descripcion: t?.etiqueta ?? id, peso: Number(peso) || 0 };
        });
      await provider.crearBono({
        nombre: form.nombre.trim(),
        emisorEip: form.emisorEip.trim(),
        presupuesto: Number(form.presupuesto),
        maxPorPersona: Number(form.maxPorPersona),
        fechaLimite: form.fechaLimite.trim() || undefined,
        baremos,
      });
      toast('Bono creado', 'success');
      setCreando(false);
      setForm({ nombre: '', emisorEip: 'EIP-X4NGQU', presupuesto: '', maxPorPersona: '', fechaLimite: '' });
      setBaremosSel({});
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  const columns: Column<RegimenBono>[] = [
    { key: 'id', header: 'Bono', render: (b) => <span className="u-mono">{b.id}</span>, width: '150px' },
    { key: 'nombre', header: 'Nombre', render: (b) => <strong>{b.nombre}</strong> },
    { key: 'emisor', header: 'Emisor', render: (b) => `${b.emisorNombre} (${b.emisorEip})` },
    { key: 'presupuesto', header: 'Presupuesto', render: (b) => `${b.presupuesto.toLocaleString('es-ES')} Pz` },
    { key: 'usado', header: 'Usado', render: (b) => `${b.presupuestoUsado.toLocaleString('es-ES')} Pz` },
    { key: 'max', header: 'Máx/persona', render: (b) => `${b.maxPorPersona} Pz` },
    { key: 'adscritos', header: 'Adscritos', render: (b) => b.adscritos },
    { key: 'estado', header: 'Estado', render: (b) => <Badge tone={b.estado === 'activo' ? 'success' : 'neutral'}>{b.estado}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Bonificaciones"
        subtitle="Regímenes de bono (empresa → particular) con presupuesto, máximo por persona y baremos opcionales."
        breadcrumb="RSP / Tributos"
        actions={<Button icon="plus" onClick={() => setCreando(true)}>Nuevo bono</Button>}
      />
      <div className="rsp-kpi-grid">
        <KPI label="Presupuesto total" value={`${presupuestoTotal.toLocaleString('es-ES')} Pz`} icon="sparkles" tone="brand" />
        <KPI label="Usado" value={`${usadoTotal.toLocaleString('es-ES')} Pz`} icon="banknote" tone="warning" />
        <KPI label="Bonos activos" value={activos} icon="check" tone="success" />
      </div>
      {items === null ? (
        <Spinner label="Cargando bonos…" />
      ) : items.length === 0 ? (
        <Empty icon="sparkles" title="Sin bonos" hint="Crea el primer régimen de bono." />
      ) : (
        <Table columns={columns} rows={items} rowKey={(b) => b.id} onRowClick={(b) => navigate(`/bonos/${b.id}`)} />
      )}

      <Modal
        open={creando}
        title="Nuevo bono"
        onClose={() => setCreando(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreando(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={guardando} icon="send">{guardando ? 'Creando…' : 'Crear bono'}</Button>
          </>
        }
      >
        <div className="rsp-form-grid">
          <Field label="Nombre del bono" hint="Ej.: Bono material escolar">
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Bono X" />
          </Field>
          <Field label="Emisor (EIP)">
            <BuscadorIdentidad value={form.emisorEip} onChange={(v) => setForm({ ...form, emisorEip: v })} />
          </Field>
          <Field label="Presupuesto total (Pz)">
            <input type="number" value={form.presupuesto} onChange={(e) => setForm({ ...form, presupuesto: e.target.value })} placeholder="10000" />
          </Field>
          <Field label="Máximo por persona (Pz)">
            <input type="number" value={form.maxPorPersona} onChange={(e) => setForm({ ...form, maxPorPersona: e.target.value })} placeholder="500" />
          </Field>
          <Field label="Fecha límite">
            <input type="date" value={form.fechaLimite} onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })} />
          </Field>
          <Field label="Baremos (comprobación automática)" hint="El sistema verifica cada criterio al adscribir al ciudadano.">
            <ul className="rsp-checklist">
              {BAREMOS_AUTOMATICOS.map((b) => (
                <li key={b.id} className="rsp-check">
                  <input
                    type="checkbox"
                    checked={baremosSel[b.id] !== undefined}
                    onChange={(e) => {
                      if (e.target.checked) setBaremosSel((s) => ({ ...s, [b.id]: '10' }));
                      else {
                        const resto = Object.fromEntries(Object.entries(baremosSel).filter(([k]) => k !== b.id));
                        setBaremosSel(resto);
                      }
                    }}
                  />
                  <span>{b.etiqueta}</span>
                  <span className="u-muted" style={{ fontSize: 'var(--fs-xs)' }}>{b.descripcion}</span>
                  {baremosSel[b.id] !== undefined && (
                    <input
                      type="number"
                      value={baremosSel[b.id]}
                      onChange={(e) => setBaremosSel((s) => ({ ...s, [b.id]: e.target.value }))}
                      className="rsp-reparto-pct"
                      style={{ width: 70, marginLeft: 'auto' }}
                      placeholder="peso"
                      aria-label="Peso"
                    />
                  )}
                </li>
              ))}
            </ul>
          </Field>
        </div>
      </Modal>
    </>
  );
}
