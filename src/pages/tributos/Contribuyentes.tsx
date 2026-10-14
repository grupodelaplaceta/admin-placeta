import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Empty, KPI, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { Contribuyente } from '../../types';

const TIPO_TONE: Record<string, 'brand' | 'info' | 'success'> = {
  persona: 'brand',
  empresa: 'info',
  junior: 'success',
};

export default function Contribuyentes() {
  const [items, setItems] = useState<Contribuyente[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    provider.listarContribuyentes().then(setItems).catch(() => setItems([]));
  }, []);

  const alDia = items?.filter((c) => c.estadoFiscal === 'al_dia').length ?? 0;
  const pendientes = items?.filter((c) => c.estadoFiscal === 'pendiente').length ?? 0;

  const columns: Column<Contribuyente>[] = [
    { key: 'id', header: 'Ident.', render: (c) => <span className="u-mono">{c.id}</span>, width: '150px' },
    { key: 'nombre', header: 'Contribuyente', render: (c) => <strong>{c.nombre}</strong> },
    { key: 'tipo', header: 'Tipo', render: (c) => <Badge tone={TIPO_TONE[c.tipo]}>{c.tipo}</Badge> },
    { key: 'cuentas', header: 'Cuentas', render: (c) => c.cuentas },
    { key: 'saldo', header: 'Saldo total', render: (c) => `${c.saldoTotalPz.toLocaleString('es-ES')} Pz` },
    {
      key: 'estado', header: 'Estado fiscal', render: (c) =>
        <Badge tone={c.estadoFiscal === 'al_dia' ? 'success' : c.estadoFiscal === 'inhibido' ? 'danger' : 'warning'}>{c.estadoFiscal}</Badge>,
    },
    { key: 'ultima', header: 'Última declaración', render: (c) => c.ultimaDeclaracion ?? '—' },
  ];

  function abrir(c: Contribuyente) {
    if (c.tipo === 'empresa') navigate(`/entidades/${c.id}`);
    else navigate(`/ciudadanos/${c.id}`);
  }

  return (
    <>
      <PageHeader
        title="Contribuyentes"
        subtitle="Censo tributario por DIP/EIP. Cada fila abre la ficha de ciudadano o entidad."
        breadcrumb="RSP / Tributos"
      />
      <div className="rsp-kpi-grid">
        <KPI label="Contribuyentes" value={items?.length ?? '—'} icon="users" tone="brand" />
        <KPI label="Al día" value={alDia} icon="check" tone="success" />
        <KPI label="Pendientes" value={pendientes} icon="clock" tone="warning" />
      </div>
      {items === null ? (
        <Spinner label="Cargando censo…" />
      ) : items.length === 0 ? (
        <Empty icon="users" title="Sin contribuyentes" />
      ) : (
        <Table columns={columns} rows={items} rowKey={(c) => c.id} onRowClick={abrir} />
      )}
    </>
  );
}
