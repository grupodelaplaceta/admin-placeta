import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, CardHeader, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, Tabs, useToast,
  type Column,
} from '../../components/ui';

/* ─────────────────────────────────────────────────────────────────────
   Voley Club La Placeta · módulo de administración dentro del RSP
   Consume la API JSON del backend del Voley Club (VITE_VOLEY_API_URL).
   Las escrituras se autorizan con VITE_VOLEY_ADMIN_KEY (header x-voley-key).
   ───────────────────────────────────────────────────────────────────── */

const VOLEY_API: string = import.meta.env.VITE_VOLEY_API_URL || 'https://vclaplaceta.vercel.app/api';
const VOLEY_KEY: string = import.meta.env.VITE_VOLEY_ADMIN_KEY || 'voley-admin-2026';

async function vfetch(path: string, opts: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.method && opts.method !== 'GET') headers['x-voley-key'] = VOLEY_KEY;
  const res = await fetch(`${VOLEY_API}${path}`, { ...opts, headers: { ...headers, ...((opts.headers as Record<string, string>) || {}) } });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.json();
}

function eur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
}

const ESTADO_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'brand'> = {
  abierto: 'success',
  en_curso: 'info',
  cerrado: 'neutral',
  finalizado: 'neutral',
  pagado: 'success',
  pendiente: 'warning',
  moroso: 'danger',
};

type ModalState =
  | { kind: 'jugador' }
  | { kind: 'torneo' }
  | { kind: 'torneoInterno' }
  | { kind: 'movimiento' }
  | { kind: 'resultado'; torneoId: number }
  | { kind: 'proyecto' }
  | { kind: 'reparto' }
  | null;

export default function VoleyClub() {
  const [tab, setTab] = useState('carteras');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fondos, setFondos] = useState<any>(null);
  const [miembros, setMiembros] = useState<any[]>([]);
  const [torneos, setTorneos] = useState<any[]>([]);
  const [torneosInternos, setTorneosInternos] = useState<any[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const { toast } = useToast();

  const [fJ, setFJ] = useState({ nombre: '', dip: '', posicion: '', planId: 'jugador', cuota: '' });
  const [fT, setFT] = useState({ nombre: '', descripcion: '', fecha: '', modalidad: '', categoria: '', precioEquipo: '0', plazas: '8', ubicacion: '' });
  const [fM, setFM] = useState({ miembroId: '', concepto: '', cantidad: '0', categoria: 'otros' });
  const [fR, setFR] = useState({ equipoA: '', equipoB: '', setsA: '0', setsB: '0' });
  const [fI, setFI] = useState({ nombre: '', fecha: '', ubicacion: '', precioPorJugador: '0', jugadoresAsistentes: [] as number[] });
  const [fP, setFP] = useState({ nombre: '', descripcion: '', objetivo: '0', porcentajeGanancia: '0' });
  const [fRep, setFRep] = useState({ cantidad: '0', concepto: '', porcentajeJugadores: '100', jugadorIds: [] as number[] });

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, m, t, ti] = await Promise.all([
        vfetch('/fondos'),
        vfetch('/miembros'),
        vfetch('/torneos-organizados/admin', { headers: { 'x-voley-key': VOLEY_KEY } }),
        vfetch('/torneos'),
      ]);
      setFondos(f || {});
      setMiembros(Array.isArray(m) ? m : []);
      setTorneos(Array.isArray(t) ? t : []);
      setTorneosInternos(Array.isArray(ti) ? ti : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardarJugador() {
    try {
      await vfetch('/miembros', {
        method: 'POST',
        body: JSON.stringify({
          nombre: fJ.nombre.trim(),
          dip: fJ.dip.trim().toUpperCase(),
          posicion: fJ.posicion.trim(),
          planId: fJ.planId,
          cuotaPersonalizada: fJ.cuota === '' ? null : Number(fJ.cuota),
        }),
      });
      toast('Jugador guardado', 'success');
      setModal(null);
      setFJ({ nombre: '', dip: '', posicion: '', planId: 'jugador', cuota: '' });
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function guardarTorneo() {
    try {
      await vfetch('/torneos-organizados', {
        method: 'POST',
        body: JSON.stringify({
          nombre: fT.nombre.trim(),
          descripcion: fT.descripcion,
          fecha: fT.fecha,
          modalidad: fT.modalidad,
          categoria: fT.categoria,
          precioEquipo: Number(fT.precioEquipo),
          plazas: Number(fT.plazas),
          ubicacion: fT.ubicacion,
        }),
      });
      toast('Torneo creado', 'success');
      setModal(null);
      setFT({ nombre: '', descripcion: '', fecha: '', modalidad: '', categoria: '', precioEquipo: '0', plazas: '8', ubicacion: '' });
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function guardarMovimiento() {
    try {
      const miembroId = Number(fM.miembroId);
      if (!miembroId) throw new Error('Selecciona un jugador');
      await vfetch(`/miembros/${miembroId}/cartera`, {
        method: 'POST',
        body: JSON.stringify({ concepto: fM.concepto, cantidad: Number(fM.cantidad), categoria: fM.categoria }),
      });
      toast('Movimiento de cartera registrado', 'success');
      setModal(null);
      setFM({ miembroId: '', concepto: '', cantidad: '0', categoria: 'otros' });
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function guardarResultado() {
    if (!modal || modal.kind !== 'resultado') return;
    try {
      await vfetch(`/torneos-organizados/${modal.torneoId}/resultado`, {
        method: 'POST',
        body: JSON.stringify({ equipoA: fR.equipoA.trim(), equipoB: fR.equipoB.trim(), setsA: Number(fR.setsA), setsB: Number(fR.setsB) }),
      });
      toast('Resultado registrado', 'success');
      setModal(null);
      setFR({ equipoA: '', equipoB: '', setsA: '0', setsB: '0' });
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function guardarTorneoInterno() {
    try {
      await vfetch('/torneos', {
        method: 'POST',
        body: JSON.stringify({
          nombre: fI.nombre.trim(),
          fecha: fI.fecha,
          ubicacion: fI.ubicacion,
          precioPorJugador: Number(fI.precioPorJugador),
          jugadoresAsistentes: fI.jugadoresAsistentes,
          estado: 'pendiente',
        }),
      });
      toast('Torneo interno creado', 'success');
      setModal(null);
      setFI({ nombre: '', fecha: '', ubicacion: '', precioPorJugador: '0', jugadoresAsistentes: [] });
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function toggleVisibilidad(t: any) {
    try {
      await vfetch(`/torneos-organizados/${t.id}/visibilidad`, {
        method: 'POST',
        body: JSON.stringify({ visiblePublico: !t.visiblePublico }),
      });
      toast(t.visiblePublico ? 'Torneo ocultado al público' : 'Torneo publicado', 'success');
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function guardarProyecto() {
    try {
      await vfetch('/fondos/proyecto', {
        method: 'POST',
        body: JSON.stringify({
          nombre: fP.nombre.trim(),
          descripcion: fP.descripcion,
          objetivo: Number(fP.objetivo),
          porcentajeGanancia: Number(fP.porcentajeGanancia),
        }),
      });
      toast('Proyecto creado', 'success');
      setModal(null);
      setFP({ nombre: '', descripcion: '', objetivo: '0', porcentajeGanancia: '0' });
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function guardarReparto() {
    try {
      await vfetch('/fondos/reparto', {
        method: 'POST',
        body: JSON.stringify({
          cantidad: Number(fRep.cantidad),
          concepto: fRep.concepto,
          porcentajeJugadores: Number(fRep.porcentajeJugadores),
          jugadorIds: fRep.jugadorIds,
        }),
      });
      toast('Reparto GDLP realizado', 'success');
      setModal(null);
      setFRep({ cantidad: '0', concepto: '', porcentajeJugadores: '100', jugadorIds: [] });
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  if (loading) return <Spinner label="Cargando Voley Club…" />;
  if (error) return <Empty icon="alert" title="Sin conexión con el Voley Club" hint={error} />;

  const historial: any[] = fondos?.historial || [];
  const ingresos = historial.filter((m) => m.tipo === 'ingreso').reduce((s: number, m: any) => s + Number(m.cantidad || 0), 0);
  const gastos = historial.filter((m) => m.tipo === 'gasto').reduce((s: number, m: any) => s + Math.abs(Number(m.cantidad || 0)), 0);
  const miembrosConCartera = miembros.map((m) => ({ ...m, cartera: m.cartera || { saldo: 0, movimientos: [] } }));
  const movimientosCartera = miembrosConCartera.flatMap((jugador) => (
    (jugador.cartera.movimientos || []).map((mov: any) => ({ ...mov, jugadorId: jugador.id, jugador: jugador.nombre }))
  )).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || Number(b.id || 0) - Number(a.id || 0));
  const saldoCarteras = miembrosConCartera.reduce((s: number, m: any) => s + Number(m.cartera?.saldo || 0), 0);
  const ingresosCarteras = movimientosCartera.filter((m) => m.tipo === 'ingreso').reduce((s: number, m: any) => s + Number(m.cantidad || 0), 0);
  const gastosCarteras = movimientosCartera.filter((m) => m.tipo === 'gasto').reduce((s: number, m: any) => s + Math.abs(Number(m.cantidad || 0)), 0);

  const columnasMov: Column<any>[] = [
    { key: 'fecha', header: 'Fecha', width: '110px' },
    { key: 'concepto', header: 'Concepto' },
    { key: 'categoria', header: 'Categoría' },
    { key: 'cantidad', header: 'Importe', render: (m) => (
      <span style={{ color: m.tipo === 'ingreso' ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
        {m.tipo === 'ingreso' ? '+' : '−'}{eur(Number(m.cantidad))}
      </span>
    ) },
  ];

  const columnasMovCartera: Column<any>[] = [
    { key: 'fecha', header: 'Fecha', width: '110px' },
    { key: 'jugador', header: 'Jugador', render: (m) => <strong>{m.jugador}</strong> },
    { key: 'concepto', header: 'Concepto' },
    { key: 'categoria', header: 'Categoría' },
    { key: 'cantidad', header: 'Importe', render: (m) => (
      <span style={{ color: m.tipo === 'ingreso' ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
        {m.tipo === 'ingreso' ? '+' : '−'}{eur(Number(m.cantidad))}
      </span>
    ) },
  ];

  const columnasMiembros: Column<any>[] = [
    { key: 'nombre', header: 'Jugador', render: (m) => <strong>{m.nombre}</strong> },
    { key: 'dip', header: 'DIP' },
    { key: 'posicion', header: 'Posición' },
    { key: 'planId', header: 'Plan' },
    { key: 'cartera', header: 'Cartera', render: (m) => <strong>{eur(m.cartera?.saldo || 0)}</strong> },
    { key: 'neto', header: 'Neto previsto (80%)', render: (m) => <span>{eur(Number(m.cartera?.saldo || 0) * 0.8)}</span> },
    { key: 'activo', header: 'Estado', render: (m) => <Badge tone={m.activo === false ? 'neutral' : 'success'}>{m.activo === false ? 'Inactivo' : 'Activo'}</Badge> },
    { key: 'acciones', header: '', render: (m) => (
      <Button
        size="sm"
        variant="outline"
        icon="plus"
        onClick={() => {
          setFM({ miembroId: String(m.id), concepto: '', cantidad: '0', categoria: 'otros' });
          setModal({ kind: 'movimiento' });
        }}
      >
        Movimiento
      </Button>
    ) },
  ];

  const columnasClasif: Column<any>[] = [
    { key: 'pos', header: '#', width: '40px' },
    { key: 'equipo', header: 'Equipo', render: (r) => <strong>{r.equipo}</strong> },
    { key: 'PJ', header: 'PJ' },
    { key: 'PG', header: 'PG' },
    { key: 'PP', header: 'PP' },
    { key: 'SF', header: 'SF' },
    { key: 'SC', header: 'SC' },
    { key: 'PTS', header: 'PTS', render: (r) => <strong>{r.PTS}</strong> },
  ];

  const columnasProyectos: Column<any>[] = [
    { key: 'nombre', header: 'Proyecto', render: (p) => <strong>{p.nombre}</strong> },
    { key: 'objetivo', header: 'Objetivo', render: (p) => eur(Number(p.objetivo || 0)) },
    { key: 'recaudado', header: 'Recaudado', render: (p) => eur(Number(p.recaudado || 0)) },
    { key: 'ganancia', header: '% Ganancia', render: (p) => `${p.porcentajeGanancia || 0}%` },
  ];

  return (
    <div>
      <PageHeader
        title="Voley Club La Placeta"
        subtitle="Fondos, jugadores y torneos organizados por el Grupo de La Placeta"
        actions={
          <>
            <Button icon="plus" onClick={() => setModal({ kind: 'movimiento' })}>Movimiento cartera</Button>
            <Button icon="plus" onClick={() => setModal({ kind: 'jugador' })}>Jugador</Button>
            <Button icon="plus" onClick={() => setModal({ kind: 'torneo' })}>Torneo</Button>
            <Button icon="plus" onClick={() => setModal({ kind: 'torneoInterno' })}>Torneo interno</Button>
            <Button icon="plus" onClick={() => setModal({ kind: 'proyecto' })}>Proyecto</Button>
            <Button icon="plus" onClick={() => setModal({ kind: 'reparto' })}>Reparto GDLP</Button>
          </>
        }
      />

      <Tabs
        tabs={[
          { id: 'carteras', label: 'Carteras' },
          { id: 'jugadores', label: 'Jugadores' },
          { id: 'torneos', label: 'Torneos La Placeta' },
          { id: 'internos', label: 'Torneos internos' },
          { id: 'fondos', label: 'Fondos club' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'carteras' && (
        <div className="rsp-grid">
          <KPI label="Saldo en carteras" value={eur(saldoCarteras)} icon="wallet" tone="brand" />
          <KPI label="Ingresos en carteras" value={eur(ingresosCarteras)} icon="banknote" tone="success" />
          <KPI label="Gastos en carteras" value={eur(gastosCarteras)} icon="receipt" tone="danger" />
          <KPI label="Jugadores con saldo" value={String(miembrosConCartera.filter((m) => Number(m.cartera?.saldo || 0) > 0).length)} icon="users" tone="info" />
          <KPI label="Sobrante total (previsión)" value={eur(saldoCarteras)} icon="wallet" tone="info" />
          <KPI label="Neto a repartir (renovando 80%)" value={eur(saldoCarteras * 0.8)} icon="banknote" tone="warning" />
          <Card>
            <CardHeader title="Reparto de beneficios" subtitle="Previsión anual y cierre" />
            <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', margin: '0 0 0.5rem' }}>
              El reparto definitivo se ejecuta en <strong>diciembre</strong>. Previsión del importe final a repartir:
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-2)', fontSize: '0.875rem' }}>
              <li>Renovando (comisión 20% gestión): <strong>{eur(saldoCarteras * 0.8)}</strong></li>
              <li>Sin renovar (comisión 30% gestión): <strong>{eur(saldoCarteras * 0.7)}</strong></li>
            </ul>
          </Card>
          <Card>
            <CardHeader title="Carteras por jugador" subtitle={`${miembrosConCartera.length} jugadores`} />
            <Table columns={columnasMiembros} rows={miembrosConCartera} rowKey={(m) => String(m.id)} />
          </Card>
          <Card>
            <CardHeader title="Historial de carteras" subtitle={`${movimientosCartera.length} movimientos`} />
            <Table columns={columnasMovCartera} rows={movimientosCartera} rowKey={(m) => `${m.jugadorId}-${m.id}`} />
          </Card>
        </div>
      )}

      {tab === 'fondos' && (
        <div className="rsp-grid">
          <KPI label="Saldo actual" value={eur(fondos?.saldoActual || 0)} icon="wallet" tone="brand" />
          <KPI label="Ingresos" value={eur(ingresos)} icon="banknote" tone="success" />
          <KPI label="Gastos" value={eur(gastos)} icon="receipt" tone="danger" />
          <KPI label="Proyectos bloqueados" value={String((fondos?.proyectosBloqueados || []).length)} icon="lock" tone="warning" />
          <KPI label="Bolsa de proyectos" value={eur(fondos?.bolsaProyectos || 0)} icon="wallet" tone="info" />
          <Card>
            <CardHeader title="Proyectos del club" subtitle={`${(fondos?.proyectos || []).length} proyectos`} />
            {(fondos?.proyectos || []).length === 0 ? (
              <Empty icon="trophy" title="Sin proyectos" />
            ) : (
              <Table columns={columnasProyectos} rows={fondos?.proyectos || []} rowKey={(p) => String(p.id)} />
            )}
          </Card>
          <Card>
            <CardHeader title="Historial de fondos" subtitle={`${historial.length} movimientos`} />
            <Table columns={columnasMov} rows={historial} rowKey={(m) => String(m.id)} />
          </Card>
        </div>
      )}

      {tab === 'jugadores' && (
        <Card>
          <CardHeader title="Plantilla" subtitle={`${miembros.length} jugadores`} />
          <Table columns={columnasMiembros} rows={miembros} rowKey={(m) => String(m.id)} />
        </Card>
      )}

      {tab === 'torneos' && (
        <div className="rsp-grid">
          {torneos.length === 0 && <Empty icon="trophy" title="Sin torneos organizados" />}
          {torneos.map((t) => (
            <Card key={t.id}>
              <CardHeader
                title={`${t.nombre}`}
                subtitle={`${t.modalidad} · ${t.fecha} · ${eur(t.precioEquipo)}/equipo`}
                actions={
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Badge tone={ESTADO_TONE[t.estado] || 'neutral'}>{t.estado}</Badge>
                    <Badge tone={t.visiblePublico ? 'success' : 'neutral'}>{t.visiblePublico ? 'Público' : 'Oculto'}</Badge>
                    <Button size="sm" variant="outline" onClick={() => toggleVisibilidad(t)}>
                      {t.visiblePublico ? 'Ocultar' : 'Publicar'}
                    </Button>
                    <Button size="sm" variant="outline" icon="plus" onClick={() => { setFR({ equipoA: '', equipoB: '', setsA: '0', setsB: '0' }); setModal({ kind: 'resultado', torneoId: t.id }); }}>
                      Resultado
                    </Button>
                  </div>
                }
              />
              <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', margin: '0 0 0.75rem' }}>{t.descripcion}</p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-3)' }}>Plazas: {t.equipos.length}/{t.plazas}</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-3)' }}>Equipos inscritos: {t.equipos.length}</span>
              </div>
              {t.clasificacion && t.clasificacion.length > 0 && (
                <>
                  <h4 style={{ margin: '0 0 0.5rem' }}>Clasificación</h4>
                  <Table
                    columns={columnasClasif}
                    rows={t.clasificacion.map((c: any, i: number) => ({ ...c, pos: i + 1 }))}
                    rowKey={(r) => r.equipo}
                  />
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'internos' && (
        <div className="rsp-grid">
          {torneosInternos.length === 0 && <Empty icon="trophy" title="Sin torneos internos" hint="Crea un torneo jugado por los propios jugadores del club" />}
          {torneosInternos.map((t) => (
            <Card key={t.id}>
              <CardHeader
                title={t.nombre}
                subtitle={`${t.fecha || '—'} · ${eur(t.precioPorJugador)}/jugador`}
                actions={<Badge tone={ESTADO_TONE[t.estado] || 'neutral'}>{t.estado}</Badge>}
              />
              {t.descripcion && <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', margin: '0 0 0.75rem' }}>{t.descripcion}</p>}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-3)' }}>Jugadores: {t.jugadoresAsistentes?.length || 0}</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--success)' }}>Confirmados: {t.confirmados || 0}</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--warning)' }}>Pendientes: {t.pendientes || 0}</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>Rechazados: {t.rechazados || 0}</span>
                <strong style={{ fontSize: '0.8125rem' }}>Coste total: {eur(t.costeTotal)}</strong>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modal?.kind === 'jugador'}
        title="Añadir jugador"
        onClose={() => setModal(null)}
        footer={<Button onClick={guardarJugador}>Guardar jugador</Button>}
      >
        <Field label="Nombre"><input value={fJ.nombre} onChange={(e) => setFJ({ ...fJ, nombre: e.target.value })} /></Field>
        <Field label="DIP (PlacetaID)"><input value={fJ.dip} onChange={(e) => setFJ({ ...fJ, dip: e.target.value })} /></Field>
        <Field label="Posición"><input value={fJ.posicion} onChange={(e) => setFJ({ ...fJ, posicion: e.target.value })} /></Field>
        <Field label="Plan">
          <select className="rsp-select" value={fJ.planId} onChange={(e) => setFJ({ ...fJ, planId: e.target.value })}>
            <option value="jugador">Jugador</option>
            <option value="suplente">Suplente</option>
          </select>
        </Field>
        <Field label="Cuota personalizada (€, opcional)"><input type="number" value={fJ.cuota} onChange={(e) => setFJ({ ...fJ, cuota: e.target.value })} /></Field>
      </Modal>

      <Modal
        open={modal?.kind === 'torneo'}
        title="Crear torneo organizado"
        onClose={() => setModal(null)}
        footer={<Button onClick={guardarTorneo}>Crear torneo</Button>}
      >
        <Field label="Nombre"><input value={fT.nombre} onChange={(e) => setFT({ ...fT, nombre: e.target.value })} /></Field>
        <Field label="Descripción"><input value={fT.descripcion} onChange={(e) => setFT({ ...fT, descripcion: e.target.value })} /></Field>
        <Field label="Fecha"><input type="date" value={fT.fecha} onChange={(e) => setFT({ ...fT, fecha: e.target.value })} /></Field>
        <Field label="Modalidad"><input value={fT.modalidad} onChange={(e) => setFT({ ...fT, modalidad: e.target.value })} placeholder="4x4 Mixto" /></Field>
        <Field label="Categoría"><input value={fT.categoria} onChange={(e) => setFT({ ...fT, categoria: e.target.value })} placeholder="Absoluta" /></Field>
        <Field label="Ubicación"><input value={fT.ubicacion} onChange={(e) => setFT({ ...fT, ubicacion: e.target.value })} /></Field>
        <Field label="Precio por equipo (€)"><input type="number" value={fT.precioEquipo} onChange={(e) => setFT({ ...fT, precioEquipo: e.target.value })} /></Field>
        <Field label="Plazas"><input type="number" value={fT.plazas} onChange={(e) => setFT({ ...fT, plazas: e.target.value })} /></Field>
      </Modal>

      <Modal
        open={modal?.kind === 'torneoInterno'}
        title="Crear torneo interno"
        onClose={() => setModal(null)}
        footer={<Button onClick={guardarTorneoInterno}>Crear torneo interno</Button>}
      >
        <Field label="Nombre"><input value={fI.nombre} onChange={(e) => setFI({ ...fI, nombre: e.target.value })} /></Field>
        <Field label="Fecha"><input type="date" value={fI.fecha} onChange={(e) => setFI({ ...fI, fecha: e.target.value })} /></Field>
        <Field label="Ubicación"><input value={fI.ubicacion} onChange={(e) => setFI({ ...fI, ubicacion: e.target.value })} /></Field>
        <Field label="Precio por jugador (€)"><input type="number" value={fI.precioPorJugador} onChange={(e) => setFI({ ...fI, precioPorJugador: e.target.value })} /></Field>
        <Field label={`Plantilla (${fI.jugadoresAsistentes.length} seleccionados)`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '220px', overflow: 'auto' }}>
            {miembros.map((m) => (
              <label key={m.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={fI.jugadoresAsistentes.includes(Number(m.id))}
                  onChange={(e) => {
                    const id = Number(m.id);
                    setFI((prev) => ({
                      ...prev,
                      jugadoresAsistentes: e.target.checked
                        ? [...prev.jugadoresAsistentes, id]
                        : prev.jugadoresAsistentes.filter((x) => x !== id),
                    }));
                  }}
                />
                {m.nombre} ({m.posicion || '—'})
              </label>
            ))}
          </div>
        </Field>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', margin: '0.5rem 0 0' }}>
          Coste total estimado: <strong>{eur(fI.jugadoresAsistentes.length * Number(fI.precioPorJugador || 0))}</strong>
        </p>
      </Modal>

      <Modal
        open={modal?.kind === 'movimiento'}
        title="Registrar movimiento de cartera"
        onClose={() => setModal(null)}
        footer={<Button onClick={guardarMovimiento}>Guardar movimiento</Button>}
      >
        <Field label="Jugador">
          <select className="rsp-select" value={fM.miembroId} onChange={(e) => setFM({ ...fM, miembroId: e.target.value })}>
            <option value="">Selecciona un jugador</option>
            {miembrosConCartera.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre} · {eur(m.cartera?.saldo || 0)}</option>
            ))}
          </select>
        </Field>
        <Field label="Concepto"><input value={fM.concepto} onChange={(e) => setFM({ ...fM, concepto: e.target.value })} /></Field>
        <Field label="Importe (€) — negativo = gasto"><input type="number" value={fM.cantidad} onChange={(e) => setFM({ ...fM, cantidad: e.target.value })} /></Field>
        <Field label="Categoría"><input value={fM.categoria} onChange={(e) => setFM({ ...fM, categoria: e.target.value })} /></Field>
      </Modal>

      <Modal
        open={modal?.kind === 'resultado'}
        title="Registrar resultado"
        onClose={() => setModal(null)}
        footer={<Button onClick={guardarResultado}>Guardar resultado</Button>}
      >
        <Field label="Equipo A"><input value={fR.equipoA} onChange={(e) => setFR({ ...fR, equipoA: e.target.value })} /></Field>
        <Field label="Equipo B"><input value={fR.equipoB} onChange={(e) => setFR({ ...fR, equipoB: e.target.value })} /></Field>
        <Field label="Sets ganados por A"><input type="number" value={fR.setsA} onChange={(e) => setFR({ ...fR, setsA: e.target.value })} /></Field>
        <Field label="Sets ganados por B"><input type="number" value={fR.setsB} onChange={(e) => setFR({ ...fR, setsB: e.target.value })} /></Field>
      </Modal>

      <Modal
        open={modal?.kind === 'proyecto'}
        title="Crear proyecto del club"
        onClose={() => setModal(null)}
        footer={<Button onClick={guardarProyecto}>Crear proyecto</Button>}
      >
        <Field label="Nombre"><input value={fP.nombre} onChange={(e) => setFP({ ...fP, nombre: e.target.value })} /></Field>
        <Field label="Descripción"><input value={fP.descripcion} onChange={(e) => setFP({ ...fP, descripcion: e.target.value })} /></Field>
        <Field label="Objetivo (€)"><input type="number" value={fP.objetivo} onChange={(e) => setFP({ ...fP, objetivo: e.target.value })} /></Field>
        <Field label="% Ganancia (si se vende)"><input type="number" value={fP.porcentajeGanancia} onChange={(e) => setFP({ ...fP, porcentajeGanancia: e.target.value })} /></Field>
      </Modal>

      <Modal
        open={modal?.kind === 'reparto'}
        title="Reparto € de GDLP al Voley Club"
        onClose={() => setModal(null)}
        footer={<Button onClick={guardarReparto}>Ejecutar reparto</Button>}
      >
        <Field label="Importe total (€)"><input type="number" value={fRep.cantidad} onChange={(e) => setFRep({ ...fRep, cantidad: e.target.value })} /></Field>
        <Field label="Concepto"><input value={fRep.concepto} onChange={(e) => setFRep({ ...fRep, concepto: e.target.value })} placeholder="Reparto GDLP · Voley Club" /></Field>
        <Field label="% a jugadores participantes"><input type="number" min="0" max="100" value={fRep.porcentajeJugadores} onChange={(e) => setFRep({ ...fRep, porcentajeJugadores: e.target.value })} /></Field>
        <Field label={`Jugadores (${fRep.jugadorIds.length} seleccionados; vacío = todos los activos)`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '180px', overflow: 'auto' }}>
            {miembros.map((m) => (
              <label key={m.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={fRep.jugadorIds.includes(Number(m.id))}
                  onChange={(e) => {
                    const id = Number(m.id);
                    setFRep((prev) => ({
                      ...prev,
                      jugadorIds: e.target.checked ? [...prev.jugadorIds, id] : prev.jugadorIds.filter((x) => x !== id),
                    }));
                  }}
                />
                {m.nombre}
              </label>
            ))}
          </div>
        </Field>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', margin: '0.5rem 0 0' }}>
          A jugadores: <strong>{eur(Number(fRep.cantidad || 0) * Number(fRep.porcentajeJugadores || 0) / 100)}</strong> · A bolsa de proyectos: <strong>{eur(Number(fRep.cantidad || 0) - Number(fRep.cantidad || 0) * Number(fRep.porcentajeJugadores || 0) / 100)}</strong>
        </p>
      </Modal>
    </div>
  );
}
