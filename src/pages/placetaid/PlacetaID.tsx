import { useEffect, useState } from 'react';
import { http } from '../../api/client';
import { Badge, Button, Card, CardHeader, Empty, Field, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';

type Registro = { dip: string; nombre: string; edad: number | null; rol: string; activo: boolean; bloqueado: boolean; creadoEn: string | null };

export default function PlacetaID() {
  const { toast } = useToast();
  const [items, setItems] = useState<Registro[] | null>(null);
  const [seleccionado, setSeleccionado] = useState<Registro | null>(null);
  const [nueva, setNueva] = useState('');
  const [repita, setRepita] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { http.get<Registro[]>('/rsp/api/placetaid/registros').then(setItems).catch(() => setItems([])); }, []);
  const columns: Column<Registro>[] = [
    { key: 'nombre', header: 'Identidad', render: r => <strong>{r.nombre || '—'}</strong> },
    { key: 'dip', header: 'DIP', render: r => <span className="u-mono">{r.dip}</span> },
    { key: 'edad', header: 'Edad', render: r => r.edad == null ? '—' : `${r.edad} años` },
    { key: 'rol', header: 'Rol', render: r => <Badge tone={r.edad != null && r.edad < 18 ? 'success' : 'info'}>{r.edad != null && r.edad < 18 ? 'Junior' : r.rol}</Badge> },
    { key: 'estado', header: 'Estado', render: r => <Badge tone={r.activo && !r.bloqueado ? 'success' : 'danger'}>{r.bloqueado ? 'Bloqueada' : r.activo ? 'Activa' : 'Inactiva'}</Badge> },
    { key: 'acciones', header: 'Gestión', render: r => <Button size="sm" variant="outline" onClick={() => { setSeleccionado(r); setNueva(''); setRepita(''); }}>Fijar contraseña</Button> },
  ];
  return <><PageHeader title="Administrar PlacetaID" subtitle="Registro oficial de identidades, incluidos los perfiles Junior." breadcrumb="RSP / PlacetaID" />
    {items === null ? <Spinner label="Cargando registro de PlacetaID…" /> : items.length === 0 ? <Empty icon="users" title="No hay identidades" /> : <Table columns={columns} rows={items} rowKey={r => r.dip} />}
    {seleccionado && <Card style={{ marginTop: 'var(--sp-4)' }}>
      <CardHeader title={`Nueva contraseña · ${seleccionado.nombre || seleccionado.dip}`} subtitle="Se envía directamente a PlacetaID; RSP no guarda la contraseña." />
      <div className="rsp-form-grid">
        <Field label="Contraseña nueva"><input type="password" value={nueva} onChange={e => setNueva(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Repetir contraseña"><input type="password" value={repita} onChange={e => setRepita(e.target.value)} autoComplete="new-password" /></Field>
      </div>
      <div className="u-row" style={{ marginTop: 'var(--sp-3)' }}><Button variant="outline" onClick={() => setSeleccionado(null)}>Cancelar</Button><Button disabled={guardando} onClick={async () => {
        if (nueva !== repita) { toast('Las contraseñas no coinciden', 'error'); return; }
        setGuardando(true);
        try { await (await import('../../api/client')).http.post(`/rsp/api/placetaid/${encodeURIComponent(seleccionado.dip)}/password`, { password: nueva }); toast('Contraseña actualizada en PlacetaID', 'success'); setSeleccionado(null); }
        catch (e) { toast((e as Error).message, 'error'); } finally { setGuardando(false); }
      }}>Guardar contraseña</Button></div>
    </Card>}</>;
}
