import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import {
  Badge, badgeToneDeEstado, Button, Empty, Field, Modal, PageHeader, Spinner,
  Table, useToast, type Column,
} from '../../components/ui';
import type { Tramite } from '../../types';
import { TIPOS_TRAMITE } from '../../types';
import { CAMPOS_POR_TIPO } from '../../config/campos-tramite';
import { BuscadorIdentidad } from '../../components/BuscadorIdentidad';
import { BuscadorCuenta } from '../../components/BuscadorCuenta';
import { ListaRepartos } from '../../components/ListaRepartos';
import { SelectorBono } from '../../components/SelectorBono';

const ESTADOS = ['inicio', 'revision', 'subsanacion', 'resolucion', 'firma', 'cierre'];

export default function Tramites() {
  const [items, setItems] = useState<Tramite[] | null>(null);
  const [estado, setEstado] = useState('');
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    tipo: 'subvencion', dip: '', nombre: '', concepto: '', datos: {} as Record<string, string>,
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    provider.listarTramites(estado ? { estado } : undefined).then(setItems).catch(() => setItems([]));
  }, [estado]);

  const tipoActual = useMemo(() => TIPOS_TRAMITE.find((t) => t.id === form.tipo), [form.tipo]);
  const campos = CAMPOS_POR_TIPO[form.tipo] ?? [];

  function cambiarTipo(tipo: string) {
    setForm({ tipo, dip: '', nombre: '', concepto: '', datos: {} });
  }

  function setDato(campoId: string, valor: string) {
    setForm((f) => ({ ...f, datos: { ...f.datos, [campoId]: valor } }));
  }

  async function crear() {
    if (!form.dip.trim()) {
      toast('Indica el DIP del ciudadano/entidad', 'error');
      return;
    }
    for (const c of campos) {
      if (!c.requerido) continue;
      if (c.tipo === 'reparto') {
        try {
          const lista = JSON.parse(form.datos[c.id] ?? '[]') as { dip?: string; pct?: string }[];
          if (!Array.isArray(lista) || lista.length === 0 || lista.some((x) => !x.dip?.trim() || !x.pct?.trim())) {
            toast(`Completa «${c.etiqueta}»`, 'error');
            return;
          }
        } catch {
          toast(`Completa «${c.etiqueta}»`, 'error');
          return;
        }
        continue;
      }
      if (!(form.datos[c.id] ?? '').trim()) {
        toast(`Falta el campo «${c.etiqueta}»`, 'error');
        return;
      }
    }
    if (!form.concepto.trim()) {
      toast('Indica el concepto del trámite', 'error');
      return;
    }
    setGuardando(true);
    try {
      const t = await provider.crearTramite({
        tipo: form.tipo,
        servicio: tipoActual?.servicio ?? 'General',
        dip: form.dip.trim().toUpperCase(),
        nombre: form.nombre.trim() || undefined,
        concepto: form.concepto.trim(),
        datos: form.datos,
      });
      toast('Trámite creado · expediente abierto', 'success');
      setCreando(false);
      setForm({ tipo: 'subvencion', dip: '', nombre: '', concepto: '', datos: {} });
      navigate(`/tramites/${t.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  const columns: Column<Tramite>[] = [
    { key: 'id', header: 'Trámite', render: (t) => <span className="u-mono">{t.id}</span>, width: '170px' },
    { key: 'titulo', header: 'Concepto', render: (t) => <strong>{t.titulo}</strong> },
    { key: 'servicio', header: 'Servicio', render: (t) => t.servicio ?? t.tipo },
    { key: 'ciudadano', header: 'Titular', render: (t) => `${t.nombreCiudadano} (${t.dip})` },
    { key: 'estado', header: 'Estado', render: (t) => <Badge tone={badgeToneDeEstado(t.estado)}>{t.estado}</Badge> },
    { key: 'firmas', header: 'Firmas', render: (t) => `${t.firmasCompletas ?? 0}/${t.firmasRequeridas ?? 1}` },
  ];

  return (
    <>
      <PageHeader
        title="Trámites"
        subtitle="Formularios específicos por tipo de trámite. Cada trámite abre su expediente."
        breadcrumb="RSP / Trabajo"
        actions={<Button icon="plus" onClick={() => setCreando(true)}>Nuevo trámite</Button>}
      />

      <div className="rsp-chips" role="tablist" aria-label="Filtrar por estado">
        <button className={`rsp-chip ${estado === '' ? 'rsp-chip-active' : ''}`} onClick={() => setEstado('')}>Todos</button>
        {ESTADOS.map((e) => (
          <button key={e} className={`rsp-chip ${estado === e ? 'rsp-chip-active' : ''}`} onClick={() => setEstado(e)}>{e}</button>
        ))}
      </div>

      {items === null ? (
        <Spinner label="Cargando trámites…" />
      ) : items.length === 0 ? (
        <Empty icon="workflow" title="Sin trámites" hint="No hay trámites con este filtro." />
      ) : (
        <Table columns={columns} rows={items} rowKey={(t) => t.id} onRowClick={(t) => navigate(`/tramites/${t.id}`)} />
      )}

      <Modal
        open={creando}
        title={`Nuevo trámite · ${tipoActual?.etiqueta ?? ''}`}
        onClose={() => setCreando(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreando(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={guardando} icon="send">{guardando ? 'Creando…' : 'Crear trámite'}</Button>
          </>
        }
      >
        <div className="rsp-form-grid">
          <Field label="Tipo de trámite">
            <select value={form.tipo} onChange={(e) => cambiarTipo(e.target.value)}>
              {TIPOS_TRAMITE.map((t) => <option key={t.id} value={t.id}>{t.etiqueta}</option>)}
            </select>
          </Field>
          <Field label="DIP / EIP del titular">
            <BuscadorIdentidad value={form.dip} onChange={(v) => setForm({ ...form, dip: v })} />
          </Field>
          <Field label="Nombre legal (opcional)">
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre legal" />
          </Field>
          <Field label="Concepto">
            <input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} placeholder="Resumen del trámite" />
          </Field>

          {campos.map((c) => (
            <Field key={c.id} label={c.etiqueta} hint={c.requerido ? 'Requerido' : undefined}>
              {c.tipo === 'identidad' ? (
                <BuscadorIdentidad value={form.datos[c.id] ?? ''} onChange={(v) => setDato(c.id, v)} />
              ) : c.tipo === 'cuenta' ? (
                <BuscadorCuenta value={form.datos[c.id] ?? ''} onChange={(v) => setDato(c.id, v)} />
              ) : c.tipo === 'reparto' ? (
                <ListaRepartos value={form.datos[c.id] ?? '[]'} onChange={(v) => setDato(c.id, v)} />
              ) : c.tipo === 'bono' ? (
                <SelectorBono value={form.datos[c.id] ?? ''} onChange={(v) => setDato(c.id, v)} />
              ) : c.tipo === 'textarea' ? (
                <textarea rows={3} value={form.datos[c.id] ?? ''} onChange={(e) => setDato(c.id, e.target.value)} placeholder={c.placeholder} />
              ) : c.tipo === 'select' ? (
                <select value={form.datos[c.id] ?? ''} onChange={(e) => setDato(c.id, e.target.value)}>
                  <option value="">Selecciona…</option>
                  {c.opciones?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={c.tipo === 'numero' ? 'number' : c.tipo === 'fecha' ? 'date' : 'text'}
                  value={form.datos[c.id] ?? ''}
                  onChange={(e) => setDato(c.id, e.target.value)}
                  placeholder={c.placeholder}
                />
              )}
            </Field>
          ))}
        </div>
      </Modal>
    </>
  );
}
