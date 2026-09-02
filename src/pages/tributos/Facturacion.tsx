import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Card, CardHeader, Empty, KPI, PageHeader, Spinner, Table, useToast, type Column } from '../../components/ui';
import type { CicloFacturacion, EmpresaCiclo, FacturaCiclo, PlanCierre, ReciboTributos } from '../../types';

const MES_ACTUAL = new Date().toISOString().slice(0, 7);

function estadoReciboTone(estado: ReciboTributos['estado']): 'info' | 'warning' | 'success' | 'danger' | 'neutral' {
  const map: Record<ReciboTributos['estado'], 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
    'sin_cuota': 'neutral',
    'emitida': 'info',
    'parcial': 'warning',
    'vencida': 'warning',
    'pendiente_cargo': 'warning',
    'pagada': 'success',
    'cobrada': 'success',
    'impagada': 'danger',
    'anulada': 'danger',
  };
  return map[estado];
}

function fmt(n: number): string {
  return `${Number(n || 0).toLocaleString('es-ES')} Pz`;
}

export default function Facturacion() {
  const [mes, setMes] = useState(MES_ACTUAL);
  const [ciclo, setCiclo] = useState<CicloFacturacion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [plan, setPlan] = useState<{ accion: string; detalle: PlanCierre } | null>(null);
  const { toast } = useToast();

  const cargar = (m = mes) => {
    setOcupado(true);
    return provider.cicloFacturacion(m)
      .then((c) => setCiclo(c))
      .catch((e) => { toast((e as Error).message, 'error'); setCiclo(null); })
      .finally(() => setOcupado(false));
  };

  useEffect(() => { cargar(MES_ACTUAL); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function emitir() {
    setOcupado(true);
    try {
      const r = await provider.emitirCicloFacturacion(mes);
      toast(`Ciclo ${r.mes} emitido: ${r.persistidos} documentos`, 'success');
      await cargar(mes);
    } catch (e) {
      toast((e as Error).message, 'error');
      setOcupado(false);
    }
  }

  async function cierre(ejecutar: boolean) {
    if (ejecutar && !window.confirm('¿Ejecutar el cargo (domiciliación) de los recibos vencidos en las cuentas BLP? Esta acción mueve dinero real.')) return;
    setOcupado(true);
    try {
      const r = await provider.cierreFacturacion(mes, ejecutar);
      setPlan({ accion: ejecutar ? (r.accesoBanco ? 'Cobro ejecutado' : 'Cobro sin acceso al banco (solo simulado)') : 'Simulación de cobro fin de mes', detalle: r.plan });
      toast(`Plan de cierre ${r.mes}: ${r.plan.cobros.length} cobros (${r.plan.totalCobrar.toLocaleString('es-ES')} Pz) · ${r.plan.impagados.length} impagados`, ejecutar ? 'success' : 'info');
      await cargar(mes);
    } catch (e) {
      toast((e as Error).message, 'error');
      setOcupado(false);
    }
  }

  const cols: Column<EmpresaCiclo>[] = [
    { key: 'empresa', header: 'Empresa', render: (e) => <><strong>{e.nombre}</strong><div className="u-mono u-muted">{e.eip}</div></> },
    { key: 'recibo', header: 'Recibo', render: (e) => e.recibo.importe > 0 ? <span className="u-mono">{e.recibo.id}</span> : <span className="u-muted">—</span> },
    { key: 'irm', header: 'IRM', render: (e) => fmt(e.recibo.irm) },
    { key: 'igf', header: 'IGF', render: (e) => fmt(e.recibo.igf) },
    { key: 'iva', header: 'IVA ventas', render: (e) => fmt(e.totalIvaVentas) },
    { key: 'importe', header: 'Importe', render: (e) => <strong>{fmt(e.recibo.importe)}</strong> },
    { key: 'pagado', header: 'Abonado', render: (e) => e.recibo.totalPagado ? fmt(e.recibo.totalPagado) : <span className="u-muted">—</span> },
    { key: 'vencimiento', header: 'Vencimiento', render: (e) => <span className="u-mono">{e.recibo.vencimiento}</span> },
    { key: 'cuenta', header: 'Cuenta débito', render: (e) => e.recibo.cuentaDebito ? <span className="u-mono">{e.recibo.cuentaDebito.id}</span> : <span className="u-muted">—</span> },
    { key: 'estado', header: 'Estado', render: (e) => <Badge tone={estadoReciboTone(e.recibo.estado)}>{e.recibo.estado}</Badge> },
  ];

  const facturas: FacturaCiclo[] = (ciclo?.empresas ?? []).flatMap((e) => e.facturas);
  const colsFact: Column<FacturaCiclo>[] = [
    { key: 'id', header: 'Factura', render: (f) => <span className="u-mono">{f.id}</span>, width: '190px' },
    { key: 'empresa', header: 'Empresa', render: (f) => `${f.nombre} (${f.eip})` },
    { key: 'concepto', header: 'Concepto', render: (f) => <strong>{f.concepto}</strong> },
    { key: 'tipo', header: 'Tipo', render: (f) => <Badge tone={f.tipo === 'servicio' ? 'info' : 'neutral'}>{f.tipo}</Badge> },
    { key: 'cliente', header: 'Cliente', render: (f) => <span className="u-mono">{f.cliente}</span> },
    { key: 'fecha', header: 'Fecha', render: (f) => f.fecha },
    { key: 'base', header: 'Base', render: (f) => fmt(f.base) },
    { key: 'iva', header: 'IVA', render: (f) => fmt(f.iva) },
    { key: 'total', header: 'Total', render: (f) => <strong>{fmt(f.bruto)}</strong> },
    { key: 'estado', header: 'Estado', render: (f) => <Badge tone="success">{f.estado}</Badge> },
  ];

  const r = ciclo?.resumen;
  return (
    <>
      <PageHeader
        title="Facturación central"
        subtitle="RSP factura automáticamente a las empresas del Banco cada mes: recibo de Tributos (IRM+IGF) con vencimiento a fin de mes, facturas de venta y de servicios internos abonadas. Lo no pagado se cobra por domiciliación el último día del mes."
        breadcrumb="RSP / Tributos"
        actions={
          <div className="u-row" style={{ gap: 8 }}>
            <input type="month" value={mes} onChange={(e) => { setMes(e.target.value || MES_ACTUAL); cargar(e.target.value || MES_ACTUAL); }} aria-label="Mes del ciclo" />
            <Button icon="send" onClick={emitir} disabled={ocupado}>Emitir mes</Button>
            <Button variant="outline" icon="eye" onClick={() => cierre(false)} disabled={ocupado}>Simular cobro fin de mes</Button>
            <Button variant="danger" icon="banknote" onClick={() => cierre(true)} disabled={ocupado}>Ejecutar cobro</Button>
          </div>
        }
      />

      {plan && (
        <Card>
          <CardHeader title={plan.accion} subtitle={`Cierre ${mes}`} />
          <div className="rsp-kpi-grid">
            <KPI label="Recibos a cobrar" value={plan.detalle.cobros.length} icon="receipt" tone="warning" />
            <KPI label="Total a cobrar" value={fmt(plan.detalle.totalCobrar)} icon="banknote" tone="warning" />
            <KPI label="Impagados (sin saldo)" value={plan.detalle.impagados.length} icon="alert" tone="danger" />
            <KPI label="Total impagado" value={fmt(plan.detalle.totalImpagado)} icon="alert" tone="danger" />
          </div>
          {plan.detalle.cobros.map((c) => (
            <p key={c.reciboId} className="u-muted">→ {c.nombre} ({c.eip}) · {fmt(c.cantidad)} desde <span className="u-mono">{c.from}</span> a <span className="u-mono">{c.to}</span> · {c.concepto}</p>
          ))}
          {plan.detalle.impagados.map((i) => (
            <p key={i.reciboId} className="u-muted">✗ {i.nombre} ({i.eip}) · {fmt(i.importe)} · saldo {fmt(i.saldo)} · {i.motivo}</p>
          ))}
          {plan.detalle.cobros.length === 0 && plan.detalle.impagados.length === 0 && <p className="u-muted">Sin recibos vencidos pendientes para este mes.</p>}
        </Card>
      )}

      {r && (
        <div className="rsp-kpi-grid">
          <KPI label="Empresas del ciclo" value={r.empresas} icon="building" tone="brand" />
          <KPI label="Recibos pendientes" value={r.recibosPendientes} icon="receipt" tone="warning" />
          <KPI label="Recibos abonados" value={r.recibosPagados} icon="check" tone="success" />
          <KPI label="Tributos del mes" value={fmt(r.totalTributos)} icon="banknote" tone="info" />
          <KPI label="Abonado hasta hoy" value={fmt(r.totalPagado)} icon="check" tone="success" />
          <KPI label="Facturas auto (venta/servicio)" value={r.facturas} icon="fileCheck" tone="info" />
          <KPI label="Ventas del mes" value={fmt(r.totalVentas)} icon="wallet" tone="info" />
        </div>
      )}

      {ciclo === null ? (
        <Spinner label="Calculando el ciclo de facturación…" />
      ) : ciclo.empresas.length === 0 ? (
        <Empty icon="receipt" title="Sin empresas con censo fiscal este mes" hint="El motor necesita empresas del Banco con EIP y censo/declaración del mes (IRM/IGF)." />
      ) : (
        <Card>
          <CardHeader title={`Recibos de tributos · ${mes}`} subtitle="IRM + IGF del motor fiscal (CNIC del BOP); vencimiento último día del mes." />
          <Table columns={cols} rows={ciclo.empresas} rowKey={(e) => e.recibo.id} />
        </Card>
      )}

      {facturas.length > 0 && (
        <Card>
          <CardHeader title={`Facturas automáticas de venta y servicio · ${mes}`} subtitle="Se emiten automáticamente cuando la empresa cobra una venta/servicio en el Banco (IVA según CNIC-IVA). Estado abonada: el pago ya llegó." />
          <Table columns={colsFact} rows={facturas} rowKey={(f) => f.id} />
        </Card>
      )}
    </>
  );
}
