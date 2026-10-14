import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Card, CardHeader, Empty, KPI, PageHeader, Spinner, Table, type Column } from '../../components/ui';
import type { BeneficiarioSubvenciones } from '../../types';

const fmt = (n: number) => `${Number(n || 0).toLocaleString('es-ES')} Pz`;

function catTone(c: string): 'brand' | 'info' | 'neutral' {
  if (c === 'iva') return 'brand';
  if (c === 'tributos' || c === 'irm_igf') return 'info';
  return 'neutral';
}

export default function BeneficiariosSubvenciones() {
  const [payload, setPayload] = useState<{ beneficiarios: BeneficiarioSubvenciones[]; resumen: { concedido: number; justificado: number; devuelto: number; pendiente: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    provider.listarBeneficiariosSubvenciones()
      .then((r) => setPayload(r))
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <div className="rsp-alert rsp-alert-danger">{error}</div>;
  if (!payload) return <Spinner label="Cargando beneficiarios…" />;

  const cols: Column<BeneficiarioSubvenciones>[] = [
    { key: 'beneficiario', header: 'Beneficiario', render: (b) => <><strong>{b.nombre}</strong><div className="u-mono u-muted">{b.id}</div></> },
    { key: 'tipo', header: 'Tipo', render: (b) => <Badge tone={b.tipo === 'empresa' ? 'info' : 'neutral'}>{b.tipo}</Badge> },
    { key: 'subvenciones', header: 'Subv.', render: (b) => b.subvenciones },
    { key: 'concedido', header: 'Concedido', render: (b) => fmt(b.concedido) },
    { key: 'justificado', header: 'Justificado', render: (b) => fmt(b.justificado) },
    { key: 'devuelto', header: 'Devuelto', render: (b) => b.devuelto > 0 ? <strong style={{ color: 'var(--danger)' }}>{fmt(b.devuelto)}</strong> : <span className="u-muted">—</span> },
    { key: 'pendiente', header: 'Pendiente justificar', render: (b) => fmt(b.pendienteJustificar) },
    { key: 'operaciones', header: 'Operaciones', render: (b) => b.operaciones.length },
  ];

  const seleccionado = payload.beneficiarios.find((b) => b.id === sel) ?? null;
  const colsOp: Column<BeneficiarioSubvenciones['operaciones'][number]>[] = [
    { key: 'subvencion', header: 'Subvención', render: (o) => <span className="u-mono">{o.subvencionId}</span> },
    { key: 'concepto', header: 'Concepto', render: (o) => <strong>{o.concepto}</strong> },
    { key: 'gasto', header: 'Gasto', render: (o) => <span className="u-mono">{o.gastoId}</span> },
    { key: 'categoria', header: 'Categoría', render: (o) => <Badge tone={catTone(o.categoria)}>{o.categoria}</Badge> },
    { key: 'importe', header: 'Importe', render: (o) => fmt(o.importe) },
    { key: 'fecha', header: 'Fecha', render: (o) => o.fecha },
    { key: 'justificacion', header: 'Justificación', render: (o) => <span className="u-mono">{o.justificacionId}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Subvenciones por beneficiario"
        subtitle="Cada empresa y cada particular subvencionado, con el total concedido, justificado y devuelto, y todas sus operaciones justificadas para control y detección de fraude."
        breadcrumb="RSP / Subvenciones"
      />
      <div className="rsp-kpi-grid">
        <KPI label="Concedido" value={fmt(payload.resumen.concedido)} icon="banknote" tone="info" />
        <KPI label="Justificado" value={fmt(payload.resumen.justificado)} icon="check" tone="success" />
        <KPI label="Devuelto al emisor EIP" value={fmt(payload.resumen.devuelto)} icon="alert" tone="danger" />
        <KPI label="Pendiente justificar" value={fmt(payload.resumen.pendiente)} icon="receipt" tone="warning" />
      </div>

      {payload.beneficiarios.length === 0 ? (
        <Empty icon="users" title="Sin beneficiarios con subvenciones" hint="Concede una subvención para empezar a justificar y trazar." />
      ) : (
        <>
          <Table columns={cols} rows={payload.beneficiarios} rowKey={(b) => b.id} onRowClick={(b) => setSel(sel === b.id ? null : b.id)} />
          {seleccionado && (
            <Card>
              <CardHeader title={`Operaciones justificadas · ${seleccionado.nombre} (${seleccionado.id})`} subtitle="Trazabilidad completa de lo justificado por este beneficiario." />
              {seleccionado.operaciones.length === 0 ? (
                <p className="u-muted">Sin operaciones justificadas todavía.</p>
              ) : (
                <Table columns={colsOp} rows={seleccionado.operaciones} rowKey={(o) => `${o.justificacionId}-${o.gastoId}`} />
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}
