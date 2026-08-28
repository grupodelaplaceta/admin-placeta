import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Card, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, Tabs, useToast, type Column } from '../../components/ui';
import { generarPdfDiplomaJunior } from '../../lib/pdf';
import type { ActividadJunior, CodigoJunior, ColaboradorJunior, DiplomaJunior, Subapartado, CategoriaJunior, BundleJunior, EstadisticasJunior, FinanzasJunior } from '../../types';

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
  const [categorias, setCategorias] = useState<CategoriaJunior[]>([]);
  const [bundles, setBundles] = useState<BundleJunior[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasJunior[]>([]);
  const [finanzas, setFinanzas] = useState<FinanzasJunior[]>([]);
  const [modal, setModal] = useState<null | 'codigo' | 'actividad' | 'categoria' | 'bundle' | { kind: 'subapartados'; actividad: ActividadJunior }>(null);
  const [editActividad, setEditActividad] = useState<ActividadJunior | null>(null);
  const [fAct, setFAct] = useState({ titulo: '', descripcion: '', categoria: 'General', tipo: 'test', edadMin: '6', edadMax: '17', dificultad: 'Media', fechaPublicacion: '', precioLicencia: '0', precioIntento: '0', recompensa: '0', portadaUrl: '', subvencionada: false, contenidoJson: '{\n  "version": 2,\n  "bloques": []\n}' });
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [fCat, setFCat] = useState({ nombre: '', descripcion: '' });
  const [fBundle, setFBundle] = useState({ nombre: '', descripcion: '', precioLicencia: '0', precioIntento: '0', actividadIds: [] as string[], fechaPublicacion: '' });
  const [fCod, setFCod] = useState({ tipo: 'recarga' as 'recarga' | 'un_uso' | 'actividades', valor: '0', actividadIds: [] as string[], demo: false });
  const [fSub, setFSub] = useState({ titulo: '', tipo: 'diapositiva', recompensa: '0', contenidoJson: '{\n  "version": 2,\n  "bloques": []\n}' });
  const [tab, setTab] = useState('actividades');
  const { toast } = useToast();

  useEffect(() => {
    provider.listarActividadesJunior().then(setActividades).catch(() => setActividades([]));
    provider.listarColaboradoresJunior().then(setColaboradores).catch(() => setColaboradores([]));
    provider.listarDiplomasJunior().then(setDiplomas).catch(() => setDiplomas([]));
    provider.listarCodigosJunior().then(setCodigos).catch(() => setCodigos([]));
    provider.listarCategoriasJunior().then(setCategorias).catch(() => setCategorias([]));
    provider.listarBundlesJunior().then(setBundles).catch(() => setBundles([]));
    provider.listarEstadisticasJunior().then(setEstadisticas).catch(() => setEstadisticas([]));
    provider.listarFinanzasJunior().then(setFinanzas).catch(() => setFinanzas([]));
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

  function abrirEditar(a: ActividadJunior) {
    setEditActividad(a); setVistaPrevia(false); setFAct({ titulo: a.titulo, descripcion: a.descripcion || '', categoria: a.categoria || 'General', tipo: a.tipo || 'test', edadMin: String(a.edadMin), edadMax: String(a.edadMax), dificultad: a.complejidad || 'Media', fechaPublicacion: a.fechaPublicacion || '', precioLicencia: String(a.precioLicencia ?? 0), precioIntento: String(a.precioIntento ?? 0), recompensa: String(a.recompensa), portadaUrl: a.portadaUrl || '', subvencionada: a.subvencionada === true || a.contenido?.subvencionada === true, contenidoJson: JSON.stringify(a.contenido || { version: 2, bloques: [] }, null, 2) }); setModal('actividad');
  }
  async function guardarActividad() {
    try { const contenido = JSON.parse(fAct.contenidoJson); if (!contenido || typeof contenido !== 'object' || !Array.isArray(contenido.bloques)) throw new Error('El contenido debe incluir un array bloques'); const datos = { ...fAct, contenido, edadMin: Number(fAct.edadMin), edadMax: Number(fAct.edadMax), complejidad: fAct.dificultad, precioLicencia: Number(fAct.precioLicencia), precioIntento: Number(fAct.precioIntento), recompensa: Number(fAct.recompensa), fechaPublicacion: fAct.fechaPublicacion || null }; if (editActividad) await provider.editarActividadJunior(editActividad.id, datos); else await provider.crearActividadJunior(datos); toast('Actividad guardada', 'success'); setModal(null); setEditActividad(null); setActividades(await provider.listarActividadesJunior()); } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo guardar la actividad', 'error'); }
  }
  function abrirNuevaActividad() { setEditActividad(null); setVistaPrevia(false); setFAct({ titulo: '', descripcion: '', categoria: 'General', tipo: 'test', edadMin: '6', edadMax: '17', dificultad: 'Media', fechaPublicacion: '', precioLicencia: '0', precioIntento: '0', recompensa: '0', portadaUrl: '', subvencionada: false, contenidoJson: '{\n  "version": 2,\n  "bloques": []\n}' }); setModal('actividad'); }
  async function guardarCategoria() { try { await provider.crearCategoriaJunior(fCat); setCategorias(await provider.listarCategoriasJunior()); setFCat({ nombre: '', descripcion: '' }); setModal(null); toast('Categoría creada', 'success'); } catch { toast('No se pudo crear la categoría', 'error'); } }
  async function guardarBundle() { try { await provider.crearBundleJunior({ ...fBundle, precioLicencia: Number(fBundle.precioLicencia), precioIntento: Number(fBundle.precioIntento), fechaPublicacion: fBundle.fechaPublicacion || null }); setBundles(await provider.listarBundlesJunior()); setModal(null); toast('Bundle creado', 'success'); } catch { toast('No se pudo crear el bundle', 'error'); } }
  function descargarActividad(a: ActividadJunior) { const blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${a.id}-${a.titulo.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`; link.click(); URL.revokeObjectURL(url); }

  function descargarDiploma(d: DiplomaJunior) {
    generarPdfDiplomaJunior(d).catch(() => toast('No se pudo generar el PDF', 'error'));
  }

  async function cargarCodigos() {
    setCodigos(await provider.listarCodigosJunior());
  }

  async function crearCodigo() {
    try {
      await provider.crearCodigoJunior({ tipo: fCod.tipo, valor: Number(fCod.valor), actividadIds: fCod.actividadIds, demo: fCod.demo });
      toast('Código creado', 'success');
      setModal(null);
      setFCod({ tipo: 'recarga', valor: '0', actividadIds: [], demo: false });
      cargarCodigos();
    } catch { toast('No se pudo crear el código', 'error'); }
  }

  async function accionCodigo(id: string, accion: 'revocar' | 'desvincular' | 'eliminar') {
    try {
      await provider.accionCodigoJunior(id, accion);
      toast(accion === 'revocar' ? 'Código revocado' : accion === 'desvincular' ? 'Código desvinculado' : 'Código demo eliminado', 'success');
      cargarCodigos();
    } catch { toast('No se pudo aplicar la acción', 'error'); }
  }

  async function abrirSubapartados(a: ActividadJunior) {
    setModal({ kind: 'subapartados', actividad: a });
    setSubapartados(await provider.listarSubapartados(a.id).catch(() => []));
  }

  async function crearSubapartado() {
    if (!modal || typeof modal !== 'object') return;
    try {
      const contenido = JSON.parse(fSub.contenidoJson); if (!Array.isArray(contenido.bloques)) throw new Error('El nivel necesita contenido.bloques');
      await provider.crearSubapartado(modal.actividad.id, { titulo: fSub.titulo, tipo: fSub.tipo, recompensa: Number(fSub.recompensa), contenido });
      toast('Subapartado creado', 'success');
      setFSub({ titulo: '', tipo: 'diapositiva', recompensa: '0', contenidoJson: '{\n  "version": 2,\n  "bloques": []\n}' });
      setSubapartados(await provider.listarSubapartados(modal.actividad.id));
    } catch { toast('No se pudo crear el subapartado', 'error'); }
  }

  async function desbloquearSubapartado(subId: string) {
    if (!modal || typeof modal !== 'object') return;
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
    { key: 'subvencionada', header: 'Financiación', render: (a) => (a.subvencionada || a.contenido?.subvencionada) ? <Badge tone="success">Subvencionada</Badge> : <Badge tone="neutral">Pago</Badge> },
    { key: 'estado', header: 'Estado', render: (a) => <Badge tone={a.estado === 'aprobada' ? 'success' : a.estado === 'rechazada' ? 'danger' : 'warning'}>{a.estado}</Badge> },
    { key: 'colaborador', header: 'Colaborador', render: (a) => a.colaborador },
    { key: 'acciones', header: 'Gestión', render: (a) => (
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
        <Button size="sm" variant="outline" onClick={() => abrirEditar(a)}>Editar</Button><Button size="sm" variant="outline" onClick={() => descargarActividad(a)}>Descargar</Button><Button size="sm" variant="outline" onClick={() => abrirSubapartados(a)}>Diapositivas</Button>
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
    { key: 'tipo', header: 'Tipo', render: (c) => <Badge tone={c.tipo === 'recarga' ? 'info' : c.tipo === 'un_uso' ? 'warning' : 'brand'}>{c.tipo === 'un_uso' ? 'un uso' : c.tipo}</Badge> },
    { key: 'valor', header: 'Valor', render: (c) => c.tipo === 'recarga' ? `${c.valor} Pz` : `${c.actividadIds.length} act.` },
    { key: 'estado', header: 'Estado', render: (c) => <Badge tone={c.estado === 'disponible' ? 'success' : c.estado === 'canjeado' ? 'warning' : 'neutral'}>{c.estado}</Badge> },
    { key: 'demo', header: 'Entorno', render: (c) => c.demo ? <Badge tone="info">demo</Badge> : 'producción' },
    { key: 'dip', header: 'Cuenta vinculada', render: (c) => c.dipVinculado ? <span className="u-mono">{c.dipVinculado}</span> : '—' },
    { key: 'acciones', header: '', render: (c) => (
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {c.estado === 'canjeado' && <Button size="sm" variant="outline" onClick={() => accionCodigo(c.id, 'desvincular')}>Desvincular</Button>}
        {c.estado !== 'revocado' && <Button size="sm" variant="outline" onClick={() => accionCodigo(c.id, 'revocar')}>Revocar</Button>}
        {c.demo && <Button size="sm" variant="outline" onClick={() => accionCodigo(c.id, 'eliminar')}>Eliminar</Button>}
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
        actions={<div style={{ display: 'flex', gap: '.5rem' }}><Button icon="plus" onClick={abrirNuevaActividad}>Actividad / Studio / DevAI</Button><Button variant="outline" onClick={() => setModal('codigo')}>Código</Button></div>}
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
            { id: 'categorias', label: `Categorías (${categorias.length})` },
            { id: 'bundles', label: `Bundles (${bundles.length})` },
            { id: 'estadisticas', label: 'Estadísticas' },
            { id: 'finanzas', label: 'Facturado/regalado' },
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

        {tab === 'categorias' && <><div style={{ padding: '1rem' }}><Button onClick={() => setModal('categoria')}>Crear categoría</Button></div><Table columns={[{ key: 'nombre', header: 'Categoría', render: (c: CategoriaJunior) => <strong>{c.nombre}</strong> }, { key: 'descripcion', header: 'Descripción' }, { key: 'activa', header: 'Estado', render: (c: CategoriaJunior) => c.activa ? 'Activa' : 'Inactiva' }]} rows={categorias} rowKey={(c) => c.id} /></>}
        {tab === 'bundles' && <><div style={{ padding: '1rem' }}><Button onClick={() => setModal('bundle')}>Crear bundle</Button></div><Table columns={[{ key: 'nombre', header: 'Bundle', render: (b: BundleJunior) => <strong>{b.nombre}</strong> }, { key: 'actividadIds', header: 'Actividades', render: (b: BundleJunior) => b.actividadIds.length }, { key: 'precioLicencia', header: 'Licencia', render: (b: BundleJunior) => `${b.precioLicencia} Pz` }, { key: 'fechaPublicacion', header: 'Publicación', render: (b: BundleJunior) => b.fechaPublicacion || 'Inmediata' }]} rows={bundles} rowKey={(b) => b.id} /></>}
        {tab === 'estadisticas' && <Table columns={[{ key: 'actividad', header: 'Actividad', render: (s: EstadisticasJunior) => s.actividad || s.actividadId || 'Total' }, { key: 'jugadas', header: 'Jugadas' }, { key: 'completadas', header: 'Completadas' }, { key: 'comprasLicencia', header: 'Licencias' }, { key: 'comprasIntento', header: 'Intentos' }, { key: 'recompensas', header: 'Recompensas' }]} rows={estadisticas} rowKey={(s) => s.actividadId || s.actividad || 'total'} />}
        {tab === 'finanzas' && <Table columns={[{ key: 'concepto', header: 'Concepto' }, { key: 'tipo', header: 'Tipo', render: (f: FinanzasJunior) => f.tipo }, { key: 'origen', header: 'Origen' }, { key: 'cantidad', header: 'Pz', render: (f: FinanzasJunior) => f.cantidad }]} rows={finanzas} rowKey={(f) => `${f.fecha}-${f.concepto}`} />}

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
          <select className="rsp-select" value={fCod.tipo} onChange={(e) => setFCod({ ...fCod, tipo: e.target.value as 'recarga' | 'un_uso' | 'actividades' })}>
            <option value="recarga">Recarga (solo app)</option>
            <option value="un_uso">Placetas de un uso</option>
            <option value="actividades">Multi-actividad (desvinculable)</option>
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
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}><input type="checkbox" checked={fCod.demo} onChange={e => setFCod({ ...fCod, demo: e.target.checked })} /> Código demo (se podrá eliminar después)</label>
      </Modal>

      <Modal open={modal === 'actividad'} title={editActividad ? 'Edición completa de actividad' : 'Crear actividad'} onClose={() => setModal(null)} footer={<Button onClick={guardarActividad}>Guardar borrador</Button>}>
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}><Button size="sm" variant="outline" onClick={() => window.open('https://junior.laplaceta.org/studio', '_blank')}>Abrir Studio</Button><Button size="sm" variant="outline" onClick={() => window.open('https://junior.laplaceta.org/devai', '_blank')}>Abrir DevAI</Button><Button size="sm" variant="outline" onClick={() => setVistaPrevia(!vistaPrevia)}>{vistaPrevia ? 'Editar contenido' : 'Previsualizar'}</Button></div>
        {vistaPrevia ? <Card><h3>{fAct.titulo || 'Sin título'}</h3><p>{fAct.descripcion || 'Sin descripción'}</p><Badge tone="brand">{fAct.categoria} · {fAct.tipo}</Badge><pre style={{ maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{fAct.contenidoJson}</pre></Card> : <><Field label="Título"><input value={fAct.titulo} onChange={e => setFAct({ ...fAct, titulo: e.target.value })} /></Field><Field label="Descripción"><textarea value={fAct.descripcion} onChange={e => setFAct({ ...fAct, descripcion: e.target.value })} /></Field><div style={{ display: 'flex', gap: '.5rem' }}><Field label="Categoría"><input value={fAct.categoria} onChange={e => setFAct({ ...fAct, categoria: e.target.value })} /></Field><Field label="Tipo"><input value={fAct.tipo} onChange={e => setFAct({ ...fAct, tipo: e.target.value })} /></Field><Field label="Dificultad"><input value={fAct.dificultad} onChange={e => setFAct({ ...fAct, dificultad: e.target.value })} /></Field></div><div style={{ display: 'flex', gap: '.5rem' }}><Field label="Edad mínima"><input type="number" value={fAct.edadMin} onChange={e => setFAct({ ...fAct, edadMin: e.target.value })} /></Field><Field label="Edad máxima"><input type="number" value={fAct.edadMax} onChange={e => setFAct({ ...fAct, edadMax: e.target.value })} /></Field><Field label="Carátula (URL)"><input value={fAct.portadaUrl} onChange={e => setFAct({ ...fAct, portadaUrl: e.target.value })} /></Field></div><label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', margin: '0.75rem 0' }}><input type="checkbox" checked={fAct.subvencionada} onChange={e => setFAct({ ...fAct, subvencionada: e.target.checked })} /> Actividad subvencionada (gratuita para el junior)</label><Field label="Contenido completo JSON · pega aquí la salida de Studio o DevAI"><textarea rows={14} value={fAct.contenidoJson} onChange={e => setFAct({ ...fAct, contenidoJson: e.target.value })} /></Field><Field label="Publicar el (opcional)"><input type="datetime-local" value={fAct.fechaPublicacion} onChange={e => setFAct({ ...fAct, fechaPublicacion: e.target.value })} /></Field><div style={{ display: 'flex', gap: '.5rem' }}><Field label="Licencia Pz"><input type="number" value={fAct.precioLicencia} onChange={e => setFAct({ ...fAct, precioLicencia: e.target.value })} /></Field><Field label="Intento Pz"><input type="number" value={fAct.precioIntento} onChange={e => setFAct({ ...fAct, precioIntento: e.target.value })} /></Field><Field label="Recompensa"><input type="number" value={fAct.recompensa} onChange={e => setFAct({ ...fAct, recompensa: e.target.value })} /></Field></div></>}
      </Modal>
      <Modal open={modal === 'categoria'} title="Nueva categoría" onClose={() => setModal(null)} footer={<Button onClick={guardarCategoria}>Guardar</Button>}><Field label="Nombre"><input value={fCat.nombre} onChange={e => setFCat({ ...fCat, nombre: e.target.value })} /></Field><Field label="Descripción"><textarea value={fCat.descripcion} onChange={e => setFCat({ ...fCat, descripcion: e.target.value })} /></Field></Modal>
      <Modal open={modal === 'bundle'} title="Nuevo bundle" onClose={() => setModal(null)} footer={<Button onClick={guardarBundle}>Guardar</Button>}><Field label="Nombre"><input value={fBundle.nombre} onChange={e => setFBundle({ ...fBundle, nombre: e.target.value })} /></Field><Field label="Descripción"><textarea value={fBundle.descripcion} onChange={e => setFBundle({ ...fBundle, descripcion: e.target.value })} /></Field><Field label="Publicar el (opcional)"><input type="datetime-local" value={fBundle.fechaPublicacion} onChange={e => setFBundle({ ...fBundle, fechaPublicacion: e.target.value })} /></Field><Field label="Actividades"><div style={{ maxHeight: 160, overflow: 'auto' }}>{actividades?.map(a => <label key={a.id} style={{ display: 'block' }}><input type="checkbox" checked={fBundle.actividadIds.includes(a.id)} onChange={e => setFBundle(p => ({ ...p, actividadIds: e.target.checked ? [...p.actividadIds, a.id] : p.actividadIds.filter(id => id !== a.id) }))} /> {a.titulo}</label>)}</div></Field></Modal>

      <Modal
        open={modal !== null && typeof modal === 'object'}
        title={`Diapositivas · ${modal !== null && typeof modal === 'object' ? modal.actividad.titulo : ''}`}
        onClose={() => setModal(null)}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
          <Field label="Título"><input value={fSub.titulo} onChange={(e) => setFSub({ ...fSub, titulo: e.target.value })} /></Field>
          <Field label="Recompensa (pts)"><input type="number" value={fSub.recompensa} onChange={(e) => setFSub({ ...fSub, recompensa: e.target.value })} /></Field>
          <Button onClick={crearSubapartado}>Añadir</Button>
        </div>
        <Field label="Contenido del nivel (JSON generado por Studio/DevAI)"><textarea rows={8} value={fSub.contenidoJson} onChange={(e) => setFSub({ ...fSub, contenidoJson: e.target.value })} /></Field>
        {subapartados.length === 0 ? <Empty icon="file" title="Sin diapositivas" /> : (
          <Table columns={colsSub} rows={subapartados} rowKey={(s) => s.id} />
        )}
      </Modal>
    </>
  );
}
