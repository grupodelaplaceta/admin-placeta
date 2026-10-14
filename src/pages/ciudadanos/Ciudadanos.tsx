import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Empty, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import { Icon } from '../../components/icons';
import type { CiudadanoResumen } from '../../types';

export default function Ciudadanos() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [items, setItems] = useState<CiudadanoResumen[] | null>(null);
  const [busqueda, setBusqueda] = useState(q);
  const navigate = useNavigate();

  useEffect(() => {
    provider.buscarCiudadanos(q).then(setItems).catch(() => setItems([]));
  }, [q]);

  const columns: Column<CiudadanoResumen>[] = [
    { key: 'nombre', header: 'Ciudadano', render: (c) => <span className="u-row"><strong>{c.nombre}</strong>{c.junior && <Badge tone="success">Junior</Badge>}</span> },
    { key: 'dip', header: 'DIP', render: (c) => <span className="u-mono">{c.dip}</span> },
    { key: 'nivel', header: 'Verificación', render: (c) => <Badge tone={c.nivel === 'N3' ? 'success' : 'info'}>{c.nivel}</Badge> },
    { key: 'cuentas', header: 'Cuentas', render: (c) => c.cuentas },
    { key: 'expedientes', header: 'Expedientes activos', render: (c) => c.expedientesActivos },
    { key: 'estado', header: 'Estado', render: (c) => <Badge tone={c.estado === 'activo' ? 'success' : 'danger'}>{c.estado}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Ciudadanos"
        subtitle="Buscador del censo. La ficha agrega el Contexto Único (identidad, banco, fiscalidad, patrimonio, expedientes)."
        breadcrumb="RSP / Personas y entidades"
        actions={
          <form
            className="rsp-search"
            style={{ width: 280 }}
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/ciudadanos?q=${encodeURIComponent(busqueda)}`);
            }}
          >
            <Icon name="search" size={16} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o DIP…" />
          </form>
        }
      />
      {items === null ? (
        <Spinner label="Buscando…" />
      ) : items.length === 0 ? (
        <Empty icon="users" title="Sin resultados" hint="Prueba con otro nombre o DIP." />
      ) : (
        <Table columns={columns} rows={items} rowKey={(c) => c.dip} onRowClick={(c) => navigate(`/ciudadanos/${c.dip}`)} />
      )}
    </>
  );
}
