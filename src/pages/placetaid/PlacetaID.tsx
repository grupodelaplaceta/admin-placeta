import { useEffect, useState } from 'react';
import { http } from '../../api/client';
import { Badge, Empty, PageHeader, Spinner, Table, type Column } from '../../components/ui';

type Registro = { dip: string; nombre: string; edad: number | null; rol: string; activo: boolean; bloqueado: boolean; creadoEn: string | null };

export default function PlacetaID() {
  const [items, setItems] = useState<Registro[] | null>(null);
  useEffect(() => { http.get<Registro[]>('/rsp/api/placetaid/registros').then(setItems).catch(() => setItems([])); }, []);
  const columns: Column<Registro>[] = [
    { key: 'nombre', header: 'Identidad', render: r => <strong>{r.nombre || '—'}</strong> },
    { key: 'dip', header: 'DIP', render: r => <span className="u-mono">{r.dip}</span> },
    { key: 'edad', header: 'Edad', render: r => r.edad == null ? '—' : `${r.edad} años` },
    { key: 'rol', header: 'Rol', render: r => <Badge tone={r.edad != null && r.edad < 18 ? 'success' : 'info'}>{r.edad != null && r.edad < 18 ? 'Junior' : r.rol}</Badge> },
    { key: 'estado', header: 'Estado', render: r => <Badge tone={r.activo && !r.bloqueado ? 'success' : 'danger'}>{r.bloqueado ? 'Bloqueada' : r.activo ? 'Activa' : 'Inactiva'}</Badge> },
  ];
  return <><PageHeader title="Administrar PlacetaID" subtitle="Registro oficial de identidades, incluidos los perfiles Junior." breadcrumb="RSP / PlacetaID" />
    {items === null ? <Spinner label="Cargando registro de PlacetaID…" /> : items.length === 0 ? <Empty icon="users" title="No hay identidades" /> : <Table columns={columns} rows={items} rowKey={r => r.dip} />}</>;
}
