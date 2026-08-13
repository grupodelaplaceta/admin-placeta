import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Card, Empty, KPI, PageHeader, Spinner, Table, Tabs, type Column } from '../../components/ui';
import type { ActividadJunior, ColaboradorJunior, DiplomaJunior } from '../../types';

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
  const [tab, setTab] = useState('actividades');

  useEffect(() => {
    provider.listarActividadesJunior().then(setActividades).catch(() => setActividades([]));
    provider.listarColaboradoresJunior().then(setColaboradores).catch(() => setColaboradores([]));
    provider.listarDiplomasJunior().then(setDiplomas).catch(() => setDiplomas([]));
  }, []);

  const aprobadas = actividades?.filter((a) => a.estado === 'aprobada').length ?? 0;

  const colsAct: Column<ActividadJunior>[] = [
    { key: 'titulo', header: 'Actividad', render: (a) => <strong>{a.titulo}</strong> },
    { key: 'edad', header: 'Edad', render: (a) => `${a.edadMin}-${a.edadMax}` },
    { key: 'complejidad', header: 'Complejidad', render: (a) => <Badge tone="neutral">{a.complejidad}</Badge> },
    { key: 'precio', header: 'Precio (IVA incl.)', render: (a) => `${a.precio} Pz` },
    { key: 'recompensa', header: 'Recompensa', render: (a) => `${a.recompensa} pts` },
    { key: 'estado', header: 'Estado', render: (a) => <Badge tone={a.estado === 'aprobada' ? 'success' : a.estado === 'rechazada' ? 'danger' : 'warning'}>{a.estado}</Badge> },
    { key: 'colaborador', header: 'Colaborador', render: (a) => a.colaborador },
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
  ];

  return (
    <>
      <PageHeader
        title="Placeta Junior"
        subtitle="Administración del programa educativo y bancario de menores (CNI Cap. III, Art. 5-6)."
        breadcrumb="RSP / Junior"
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
    </>
  );
}
