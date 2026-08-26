import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, badgeToneDeEstado, Empty, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { DeclaracionResumen } from '../../types';

const ESTADOS = ['borrador', 'pendiente_aprobacion', 'aprobada', 'emitida', 'cobrada'];

export default function Declaraciones() {
  const [items, setItems] = useState<DeclaracionResumen[] | null>(null);
  const [estado, setEstado] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    provider.listarDeclaraciones(estado ? { estado } : undefined).then(setItems).catch(() => setItems([]));
  }, [estado]);

  const columns: Column<DeclaracionResumen>[] = [
    { key: 'id', header: 'Declaración', render: (d) => <span className="u-mono">{d.id}</span>, width: '170px' },
    { key: 'mes', header: 'Periodo', render: (d) => <span className="u-mono">{d.mesPeriodo}</span> },
    { key: 'contribuyente', header: 'Contribuyente', render: (d) => `${d.contribuyenteNombre} (${d.contribuyenteId})` },
    { key: 'patrimonio', header: 'Patrimonio medio', render: (d) => `${d.patrimonioMedio.toLocaleString('es-ES')} Pz` },
    { key: 'irm', header: 'Cuota IRM', render: (d) => `${d.cuotaIrm} Pz` },
    { key: 'igf', header: 'Cuota IGF', render: (d) => `${d.cuotaIgf} Pz` },
    { key: 'estado', header: 'Estado', render: (d) => <Badge tone={badgeToneDeEstado(d.estado)}>{d.estado}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Declaraciones tributarias"
        subtitle="Ciclo: borrador → pendiente → aprobada → emitida → cobrada."
        breadcrumb="RSP / Tributos"
      />
      <div className="rsp-chips" role="tablist" aria-label="Filtrar por estado">
        <button className={`rsp-chip ${estado === '' ? 'rsp-chip-active' : ''}`} onClick={() => setEstado('')}>Todas</button>
        {ESTADOS.map((e) => (
          <button key={e} className={`rsp-chip ${estado === e ? 'rsp-chip-active' : ''}`} onClick={() => setEstado(e)}>{e}</button>
        ))}
      </div>
      {items === null ? (
        <Spinner label="Cargando declaraciones…" />
      ) : items.length === 0 ? (
        <Empty icon="fileCheck" title="Sin declaraciones" />
      ) : (
        <Table columns={columns} rows={items} rowKey={(d) => d.id} onRowClick={(d) => navigate(`/tributos/declaraciones/${d.id}`)} />
      )}
    </>
  );
}
