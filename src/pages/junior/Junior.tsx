import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Card, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, Tabs, useToast, type Column } from '../../components/ui';
import { generarPdfDiplomaJunior } from '../../lib/pdf';
import type { ActividadJunior, CodigoJunior, ColaboradorJunior, DiplomaJunior, Subapartado } from '../../types';

const NORMATIVA_JUNIOR = [
  { clave: 'Franjas', valor: 'Menor de 16: tutelada básica (500 Pz / 50 Pz día). 16-17: tutelada senior (1.000 Pz / 100 Pz día).' },
  { clave: 'Bono bienvenida', valor: '750 Pz (<16) · 500 Pz (resto). Intransferible 30 días.' },
  { clave: 'RBU', valor: '5 Pz semanales, reclamo manual, caduca si no se reclama.' },
  { clave: 'Tributos', valor: 'Los menores tributan; Capitalia (CAPITALIA_BANK) paga IVA/IRM/IGF hasta los 16 (Art. 5).' },
  { clave: 'Academia', valor: 'Precios con IVA 12% incluido; Capitalia abona el IVA a TGLP. Puntos verdes/rojos y diplomas.' },
];

export default function Junior() {
  const [actividades, setActividades] = useState<ActividadJunior[] | null>(null);
  const [colaboradores, setColaboradores] = useState<ColaboradorJunior[] | null>(null);
  const [diplomas, setDiplomas] = useState<DiplomaJunior[] | null>(null);
  const [codigos, setCodigos] = useState<CodigoJunior[] | null>(null);
  const [subapartados, setSubapartados] = useState<Subapartado[]>([]);
  const [modal, setModal] = useState<null | 'codigo' | { kind: 'subapartados'; actividad: ActividadJunior }>(null);
  const [fCod, setFCod] = useState({ tipo: 'recarga' as 'recarga' | 'actividades', valor: '0', actividadIds: [] as string[] });
  const [fSub, setFSub] = useState({ titulo: '', tipo: 'diapositiva', recompensa: '0' });
  const [tab, setTab] = useState('actividades');
  const { toast } = useToast();

  useEffect(() => {
    provider.listarActividadesJunior().then(setActividades).catch(() => setActividades([]));
    provider.listarColaboradoresJunior().then(setColaboradores).catch(() => setColaboradores([]));
    provider.listarDiplomasJunior().then(setDiplomas).catch(() => setDiplomas([]));
    provider.listarCodigosJunior().then(setCodigos).catch(() => setCodigos([]));
  }, []);

  async function cambiarEstadoActividad(id: string, estado: 'aprobada' | 'rechazada' | 'en_revision') {
    try {
      await provider.cambiarEstadoActividadJunior(id, estado);
      toast(estado === 'aprobada' ? 'Actividad aprobada' : estado === 'rechazada' ? 'Actividad rechazada' : 'Actividad en revisión', 'success');
      setActividades(await provider.listarActividadesJunior());
    } catch {
      toast('No se pudo actualizar el estado', 'error');
    }
  }

  function descargarDiploma(d: DiplomaJunior) {
    generarPdfDiplomaJunior(d).catch(() => toast('No se pudo generar el PDF', 'error'));
  }

  async function cargarCodigos() {
    setCodigos(await provider.listarCodigosJunior());
  }

  async function crearCodigo() {
    try {
      await provider.crearCodigoJunior({ tipo: fCod.tipo, valor: Number(fCod.valor), actividadIds: fCod.actividadIds });
      toast('Código creado', 'success');
      setModal(null);
      setFCod({ tipo: 'recarga', valor: '0', actividadIds: [] });
      cargarCodigos();
    } catch { toast('No se pudo crear el código', 'error'); }
  }

  async function accionCodigo(id: string, accion: 'revocar' | 'desvincular') {
    try {
      await provider.accionCodigoJunior(id, accion);
      toast(accion === 'revocar' ? 'Código revocado' : 'Código desvinculado', 'success');
      cargarCodigos();
    } catch { toast('No se pudo aplicar la acción', 'error'); }
  }

  async function abrirSubapartados(a: ActividadJunior) {
    setModal({ kind: 'subapartados', actividad: a });
    setSubapartados(await provider.listarSubapartados(a.id).catch(() => []));
  }

  async function crearSubapartado() {
    if (!modal || modal === 'codigo') return;
    try {
      await provider.crearSubapartado(modal.actividad.id, { titulo: fSub.titulo, tipo: fSub.tipo, recompensa: Number(fSub.recompensa) });
      toast('Subapartado creado', 'success');
      setFSub({ titulo: '', tipo: 'diapositiva', recompensa: '0' });
      setSubapartados(await provider.listarSubapartados(modal.actividad.id));
    } catch { toast('No se pudo crear el subapartado', 'error'); }
  }

  async function desbloquearSubapartado(subId: string) {
    if (!modal || modal === 'codigo') return;
    try {
      await provider.desbloquearSubapartado(modal.actividad.id, subId);
      setSubapartados(await provider.listarSubapartados(modal.actividad.id));
    } catch { toast('No se pudo desbloquear', 'error'); }
  }

  const aprobadas = actividades?.filter((a) => a.estado === 'aprobada').length ?? 0;

  const colsAct: Column<ActividadJunior>[] = [
    { key: 'titulo', header: 'Actividad', render: (a) => <strong>{a.titulo}</strong> },
    { key: 'edad', header: 'Edad', render: (a) => `${a.edadMin}-${a.edadMax}` },
    { key: 'complejidad', header: 'Complejidad', render: (a) => <Badge tone="neutral">{a.complejidad}</Badge> },
    { key: 'precio', header: 'Precio (IVA incl.)', render: (a) => `${a.precio} Pz` },
    { key: 'recompensa', header: 'Recompensa', render: (a) => `${a.recompensa} pts` },
    { key: 'estado', header: 'Estado', render: (a) => <Badge tone={a.estado === 'aprobada' ? 'success' : a.estado === 'rechazada' ? 'danger' : 'warning'}>{a.estado}</Badge> },
    { key: 'colaborador', header: 'Colaborador', render: (a) => a.colaborador },
    { key: 'acciones', header: 'Moderación', render: (a) => (
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline" onClick={() => abrirSubapartados(a)}>Diapositivas</Button>
        {a.estado !== 'aprobada' && <Button size="sm" variant="outline" onClick={() => cambiarEstadoActividad(a.id, 'aprobada')}>Aprobar</Button>}
        {a.estado !== 'rechazada' && <Button size="sm" variant="outline" onClick={() => cambiarEstadoActividad(a.id, 'rechazada')}>Rechazar</Button>}
        {a.estado !== 'en_revision' && <Button size="sm" variant="outline" onClick={() => cambiarEstadoActividad(a.id, 'en_revision')}>Revisión</Button>}
      </div>
    ) },
  ];

  const colsCol: Column<ColaboradorJunior>[] = [
    { key: 'nombre', header: 'Colaborador', render: (c) => <strong>{c.nombre}</strong> },
    { key: 'dip', header: 'DIP', render: (c) => <span className="u-mono">{c.dip}</span> },
    { key: 'acuerdo', header: 'Acuerdo firmado', render: (c) => c.acuerdoFirmado ? <Badge tone="success">sí</Badge> : <Badge tone="warning">no</Badge> },
    { key: 'actividades', header: 'Actividades', render: (c) => c.actividades },
    { key: 'puntos', header: 'Puntos', render: (c) => c.puntos },
  ];

  const colsDip: Column<DiplomaJunior>[] = [
    { key: 'id', header: 'Diploma', render: (d) => <span className="u-mono">{d.id}</span> },
    { key: 'nombre', header: 'Junior', render: (d) => <strong>{d.nombre}</strong> },
    { key: 'dip', header: 'DIP', render: (d) => <span className="u-mono">{d.dip}</span> },
    { key: 'actividad', header: 'Actividad', render: (d) => d.actividad },
    { key: 'fecha', header: 'Fecha', render: (d) => d.fecha },
    { key: 'pdf', header: '', render: (d) => <Button size="sm" variant="outline" onClick={() => descargarDiploma(d)}>PDF</Button> },
  ];

  const colsCod: Column<CodigoJunior>[] = [
    { key: 'codigo', header: 'Código', render: (c) => <span className="u-mono">{c.codigo}</span> },
    { key: 'tipo', header: 'Tipo', render: (c) => <Badge tone={c.tipo === 'recarga' ? 'info' : 'brand'}>{c.tipo}</Badge> },
    { key: 'valor', header: 'Valor', render: (c) => c.tipo === 'recarga' ? `${c.valor} Pz` : `${c.actividadIds.length} act.` },
    { key: 'estado', header: 'Estado', render: (c) => <Badge tone={c.estado === 'disponible' ? 'success' : c.estado === 'canjeado' ? 'warning' : 'neutral'}>{c.estado}</Badge> },
    { key: 'dip', header: 'Cuenta vinculada', render: (c) => c.dipVinculado ? <span className="u-mono">{c.dipVinculado}</span> : '—' },
    { key: 'acciones', header: '', render: (c) => (
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {c.estado === 'canjeado' && <Button size="sm" variant="outline" onClick={() => accionCodigo(c.id, 'desvincular')}>Desvincular</Button>}
        {c.estado !== 'revocado' && <Button size="sm" variant="outline" onClick={() => accionCodigo(c.id, 'revocar')}>Revocar</Button>}
      </div>
    ) },
  ];

  const colsSub: Column<Subapartado>[] = [
    { key: 'orden', header: '#', width: '40px', render: (s) => s.orden },
    { key: 'titulo', header: 'Diapositiva', render: (s) => <strong>{s.titulo}</strong> },
    { key: 'tipo', header: 'Tipo', render: (s) => s.tipo },
    { key: 'recompensa', header: 'Pts', render: (s) => s.recompensa },
    { key: 'estado', header: 'Estado', render: (s) => s.desbloqueado ? <Badge tone="success">desbloqueado</Badge> : <Badge tone="warning">bloqueado</Badge> },
    { key: 'acciones', header: '', render: (s) => !s.desbloqueado ? <Button size="sm" variant="outline" onClick={() => desbloquearSubapartado(s.id)}>Desbloquear</Button> : null },
  ];

  return (
    <>
      <PageHeader
        title="Placeta Junior"
        subtitle="Administración del programa educativo y bancario de menores (CNI Cap. III, Art. 5-6)."
        breadcrumb="RSP / Junior"
        actions={<Button icon="plus" onClick={() => setModal('codigo')}>Crear código</Button>}
      />
      <div className="rsp-kpi-grid">
        <KPI label="Actividades" value={actividades?.length ?? '—'} icon="sparkles" tone="brand" />
        <KPI label="Aprobadas" value={aprobadas} icon="check" tone="success" />
        <KPI label="Colaboradores" value={colaboradores?.length ?? '—'} icon="users" tone="info" />
        <KPI label="Diplomas" value={diplomas?.length ?? '—'} icon="badgeCheck" tone="warning" />
      </div>

      <Card>
        <Tabs
          tabs={[
            { id: 'actividades', label: 'Actividades' },
            { id: 'colaboradores', label: 'Colaboradores' },
            { id: 'diplomas', label: 'Diplomas' },
            { id: 'codigos', label: 'Códigos' },
            { id: 'normativa', label: 'Normativa' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'actividades' && (actividades === null ? <Spinner label="Cargando actividades…" /> :
          actividades.length === 0 ? <Empty icon="sparkles" title="Sin actividades" /> :
            <Table columns={colsAct} rows={actividades} rowKey={(a) => a.id} />)}

        {tab === 'colaboradores' && (colaboradores === null ? <Spinner label="Cargando colaboradores…" /> :
          colaboradores.length === 0 ? <Empty icon="users" title="Sin colaboradores" /> :
            <Table columns={colsCol} rows={colaboradores} rowKey={(c) => c.dip} />)}

        {tab === 'diplomas' && (diplomas === null ? <Spinner label="Cargando diplomas…" /> :
          diplomas.length === 0 ? <Empty icon="badgeCheck" title="Sin diplomas" /> :
            <Table columns={colsDip} rows={diplomas} rowKey={(d) => d.id} />)}

        {tab === 'codigos' && (codigos === null ? <Spinner label="Cargando códigos…" /> :
          codigos.length === 0 ? <Empty icon="key" title="Sin códigos" hint="Crea códigos de recarga o de actividades" /> :
            <Table columns={colsCod} rows={codigos} rowKey={(c) => c.id} />)}

        {tab === 'normativa' && (
          <ul className="rsp-doclist">
            {NORMATIVA_JUNIOR.map((n) => (
              <li key={n.clave} className="rsp-doc">
                <Badge tone="brand">{n.clave}</Badge>
                <span>{n.valor}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={modal === 'codigo'} title="Crear código" onClose={() => setModal(null)} footer={<Button onClick={crearCodigo}>Crear código</Button>}>
        <Field label="Tipo">
          <select className="rsp-select" value={fCod.tipo} onChange={(e) => setFCod({ ...fCod, tipo: e.target.value as 'recarga' | 'actividades' })}>
            <option value="recarga">Recarga (solo app)</option>
            <option value="actividades">Actividades</option>
          </select>
        </Field>
        {fCod.tipo === 'recarga' ? (
          <Field label="Valor (Pz)"><input type="number" value={fCod.valor} onChange={(e) => setFCod({ ...fCod, valor: e.target.value })} /></Field>
        ) : (
          <Field label={`Actividades (${fCod.actividadIds.length} seleccionadas)`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '200px', overflow: 'auto' }}>
              {actividades?.map((a) => (
                <label key={a.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
                  <input type="checkbox" checked={fCod.actividadIds.includes(a.id)} onChange={(e) => setFCod((prev) => ({ ...prev, actividadIds: e.target.checked ? [...prev.actividadIds, a.id] : prev.actividadIds.filter((x) => x !== a.id) }))} />
                  {a.titulo}
                </label>
              ))}
            </div>
          </Field>
        )}
      </Modal>

      <Modal
        open={modal !== null && modal !== 'codigo'}
        title={`Diapositivas · ${modal !== null && modal !== 'codigo' ? modal.actividad.titulo : ''}`}
        onClose={() => setModal(null)}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
          <Field label="Título"><input value={fSub.titulo} onChange={(e) => setFSub({ ...fSub, titulo: e.target.value })} /></Field>
          <Field label="Recompensa (pts)"><input type="number" value={fSub.recompensa} onChange={(e) => setFSub({ ...fSub, recompensa: e.target.value })} /></Field>
          <Button onClick={crearSubapartado}>Añadir</Button>
        </div>
        {subapartados.length === 0 ? <Empty icon="file" title="Sin diapositivas" /> : (
          <Table columns={colsSub} rows={subapartados} rowKey={(s) => s.id} />
        )}
      </Modal>
    </>
  );
}
