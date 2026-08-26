import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, badgeToneDeEstado, Empty, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { Tramite } from '../../types';

export default function Bandeja() {
  const [items, setItems] = useState<Tramite[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    provider.bandeja().then(setItems).catch(() => setItems([]));
  }, []);

  const columns: Column<Tramite>[] = [
    { key: 'id', header: 'Trámite', render: (t) => <span className="u-mono">{t.id}</span>, width: '180px' },
    { key: 'titulo', header: 'Concepto', render: (t) => <strong>{t.titulo}</strong> },
    { key: 'ciudadano', header: 'Ciudadano', render: (t) => `${t.nombreCiudadano} (${t.dip})` },
    {
      key: 'estado', header: 'Estado', render: (t) => <Badge tone={badgeToneDeEstado(t.estado)}>{t.estado}</Badge>,
    },
    {
      key: 'plazo', header: 'Plazo', render: (t) => (
        <span className={t.vencido ? 'u-mono' : 'u-mono u-muted'} style={t.vencido ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
          {t.vencido ? 'vencido' : `${t.plazo} días`}
        </span>
      ),
    },
    { key: 'asignado', header: 'Asignado a', render: (t) => t.asignadoA ?? '—' },
  ];

  return (
    <>
      <PageHeader
        title="Bandeja de trabajo"
        subtitle="Trámites asignados a ti o que requieren atención inmediata."
        breadcrumb="RSP / Trabajo"
      />
      {items === null ? (
        <Spinner label="Cargando bandeja…" />
      ) : items.length === 0 ? (
        <Empty icon="check" title="Bandeja vacía" hint="No tienes trámites pendientes. Buen trabajo." />
      ) : (
        <Table columns={columns} rows={items} rowKey={(t) => t.id} onRowClick={(t) => navigate(`/tramites/${t.id}`)} />
      )}
    </>
  );
}
