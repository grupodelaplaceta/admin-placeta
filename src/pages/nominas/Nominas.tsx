import { useCallback, useEffect, useMemo, useState } from 'react';
import { provider } from '../../api';
import {
  Badge, Button, Card, CardHeader, Empty, Field, KPI, Modal, PageHeader, Spinner, Table, Tabs, useToast,
  type Column,
} from '../../components/ui';
import { generarPdfNomina } from '../../lib/pdf';
import type {
  NominaComplemento, NominaComplementoTipo, NominaConfig, NominaContrato, NominaEstadoBanco,
  NominaPeriodoBanco, NominaResumen,
} from '../../types';

const pz = (n: number) => `${Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })} Pz`;
const mesActual = () => new Date().toISOString().slice(0, 7);

export function calcularIalNomina({ brutoPz, antiguedadPct = 0 }: { brutoPz: number; antiguedadPct?: number }) {
  const salario = Number(brutoPz || 0);
  const total = salario * 0.24;
  const empleador = {
    totalPz: salario * 0.12,
    valorizacionPz: salario * 0.06,
    bancoPz: salario * 0.06,
  };
  const antiguedadPz = salario * (Number(antiguedadPct || 0) / 100) * 0.12;
  const trabajador = {
    totalPz: salario * 0.12,
    antiguedadPz,
    bancoPz: salario * 0.06,
  };
  return {
    salarioPz: salario,
    totalPz: total,
    empleador,
    trabajador,
  };
}

export function calcularPenalizacionFueraPlazo({ nominasFueraPlazo }: { nominasFueraPlazo: number }) {
  if (!Number.isFinite(nominasFueraPlazo) || nominasFueraPlazo <= 0) return 0;
  return 100 + 10 * nominasFueraPlazo;
}

export function obtenerMesesVisibles({ contratos = [], periodos = [] }: { contratos?: Array<{ id?: string; status?: string; startDate?: string }>; periodos?: Array<{ id?: string; contractId?: string; periodo?: string }> }): string[] {
  const meses = new Set<string>();
  const activos = new Set<string>();

  for (const contrato of contratos) {
    if (contrato.status !== 'Active') continue;
    if (contrato.id) activos.add(String(contrato.id));
    if (!contrato.startDate) continue;
    const fecha = new Date(`${contrato.startDate}T00:00:00Z`);
    if (Number.isNaN(fecha.getTime())) continue;
    const y = fecha.getUTCFullYear();
    const m = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    meses.add(`${y}-${m}`);
  }

  for (const periodo of periodos) {
    if (!periodo.periodo) continue;
    if (periodo.contractId) {
      if (!activos.has(String(periodo.contractId))) continue;
      meses.add(periodo.periodo);
      continue;
    }
    if (meses.has(periodo.periodo)) meses.add(periodo.periodo);
  }

  return [...meses].sort((a, b) => b.localeCompare(a));
}

function formatearMes(mes: string) {
  const [year, month] = mes.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }).replace('.', '').replace(/^(\w)/, (l) => l.toUpperCase());
}

const CONTRATO_NUEVO: Partial<NominaContrato> = {
  companyAccountId: '', employeeDip: '', employeeName: '', roleTitle: '',
  grossSalaryPz: 0, workloadPct: 100, frequency: 'Monthly', status: 'Active', complementos: [],
};

const COMPLEMENTO_NUEVO: NominaComplemento = {
  id: '', concepto: '', tipo: 'cargo', periodicidad: 'mensual', importePz: 0, activo: true,
};

/** Suma mensual de los complementos: los anuales se reparten en 12. */
function totalMensual(contrato: NominaContrato) {
  const base = Number(contrato.grossSalaryPz) || 0;
  const complementos = (contrato.complementos || []).filter((c) => c.activo !== false);
  const fijos = complementos
    .filter((c) => c.tipo === 'cargo')
    .reduce((s, c) => s + (c.periodicidad === 'anual' ? Number(c.importePz) / 12 : Number(c.importePz)), 0);
  const actividad = complementos.filter((c) => c.tipo === 'actividad').reduce((s, c) => s + Number(c.importePz), 0);
  return { base, fijos, actividad };
}

export default function Nominas() {
  const { toast } = useToast();
  const [periodo, setPeriodo] = useState(mesActual());
  const [estado, setEstado] = useState<NominaEstadoBanco | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState('contratos');
  const mesesVisibles = useMemo(() => obtenerMesesVisibles({
    contratos: estado?.contratos ?? [],
    periodos: estado?.periodos ?? [],
  }), [estado]);
  const [editando, setEditando] = useState<Partial<NominaContrato> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [config, setConfig] = useState<NominaConfig | null>(null);
  const [confirmando, setConfirmando] = useState<Record<string, boolean>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await provider.estadoNominasBanco(periodo);
      setEstado(data);
      setConfig(data.config);
    } catch (e) {
      toast((e as Error).message, 'error');
      setEstado(null);
    } finally {
      setCargando(false);
    }
  }, [periodo, toast]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!mesesVisibles.length) {
      setPeriodo(mesActual());
      return;
    }
    if (!mesesVisibles.includes(periodo)) {
      setPeriodo(mesesVisibles[0]);
    }
  }, [mesesVisibles, periodo]);

  const resumenes = estado?.resumenes ?? [];
  const totales = useMemo(() => ({
    bruto: resumenes.reduce((s, r) => s + r.brutoPz, 0),
    neto: resumenes.reduce((s, r) => s + r.netoPz, 0),
    retenciones: resumenes.reduce((s, r) => s + r.retencionesPz, 0),
    ial: resumenes.reduce((s, r) => s + Number(r.periodoDoc?.ial?.totalPz || 0), 0),
    contratos: estado?.contratos.length ?? 0,
  }), [resumenes, estado]);

  /* ── Acciones ───────────────────────────────────────────────────── */

  async function guardarContrato() {
    if (!editando) return;
    if (!editando.companyAccountId || !editando.employeeDip) {
      toast('Indica la cuenta de la empresa y el DIP del trabajador', 'error');
      return;
    }
    const workloadPct = Math.min(100, Math.max(1, Number(editando.workloadPct ?? 100) || 100));
    const smi = Number(config?.smiMensualPz || 150);
    const minimo = smi * workloadPct / 100;
    if (Number(editando.grossSalaryPz || 0) < minimo) {
      toast(`El salario base debe ser como mínimo ${pz(minimo)} para una jornada del ${workloadPct}%`, 'error');
      return;
    }
    setGuardando(true);
    try {
      await provider.guardarContratoNomina({
        ...editando,
        grossSalaryPz: Number(editando.grossSalaryPz) || 0,
        workloadPct,
        complementos: (editando.complementos || []).filter((c) => String(c.concepto).trim()),
      });
      toast('Contrato guardado', 'success');
      setEditando(null);
      await cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function borrarContrato(c: NominaContrato) {
    if (!window.confirm(`¿Eliminar el contrato de ${c.employeeName || c.employeeDip}?`)) return;
    try {
      await provider.borrarContratoNomina(c.id);
      toast('Contrato eliminado', 'info');
      await cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function guardarConfirmaciones(r: NominaResumen) {
    const cambios: Record<string, boolean> = {};
    for (const c of r.contrato.complementos || []) {
      if (c.tipo !== 'actividad') continue;
      const clave = `${r.contrato.id}:${c.id}`;
      if (confirmando[clave] !== undefined) cambios[c.id] = confirmando[clave];
    }
    if (!Object.keys(cambios).length) {
      toast('No has cambiado ninguna actividad', 'info');
      return;
    }
    try {
      const res = await provider.confirmarActividadesNomina({ periodo, contractId: r.contrato.id, confirmadas: cambios });
      toast(`${res.confirmadas} actividades actualizadas`, 'success');
      await cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function cerrar(pagar: boolean) {
    const aviso = pagar
      ? `¿Cerrar y PAGAR las nóminas de ${periodo} desde la cuenta de cada empresa?`
      : `¿Cerrar (solo generar) las nóminas de ${periodo}?`;
    if (!window.confirm(aviso)) return;
    try {
      const r = await provider.cerrarPeriodoNominas({ periodo, pagar });
      toast(`Periodo ${r.periodo}: ${r.contratos} contratos procesados`, 'success');
      await cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function pagarFueraDePlazo() {
    const pendientes = (estado?.periodos ?? []).filter((p) => p.status !== 'Paid' && (!p.motivo || /fuera de plazo|vencid|overdue/i.test(p.motivo)));
    if (!pendientes.length) {
      toast('No hay nóminas pendientes fuera de plazo para pagar', 'info');
      return;
    }
    const nominasFueraPlazo = pendientes.length;
    const penalizacion = calcularPenalizacionFueraPlazo({ nominasFueraPlazo });
    const total = pendientes.reduce((sum, p) => sum + Number(p.netoPz || 0), 0) + penalizacion;
    if (!window.confirm(`Hay ${nominasFueraPlazo} nóminas fuera de plazo. La penalización será ${pz(penalizacion)} y el total a pagar será ${pz(total)}. ¿Continuar?`)) return;
    try {
      const resultado = await provider.pagarPeriodoNominas({ periodo });
      toast(`Pago fuera de plazo registrado: ${pz(total)} · penalización ${pz(penalizacion)}`, 'success');
      console.info('pagoFueraDePlazo', resultado);
      await cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function guardarConfig() {
    if (!config) return;
    try {
      await provider.guardarConfigNominas(config);
      toast('Ajustes guardados', 'success');
      await cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  /* ── Columnas ───────────────────────────────────────────────────── */

  const columnasContrato: Column<NominaContrato>[] = [
    {
      key: 'trabajador', header: 'Trabajador',
      render: (c) => (
        <>
          <strong>{c.employeeName || c.employeeDip}</strong>
          <div className="u-muted u-mono" style={{ fontSize: 'var(--fs-xs)' }}>{c.employeeDip}{c.roleTitle ? ` · ${c.roleTitle}` : ''}</div>
        </>
      ),
    },
    { key: 'empresa', header: 'Empresa', render: (c) => <span className="u-mono">{c.companyAccountId}</span> },
    { key: 'base', header: 'Salario base', render: (c) => pz(c.grossSalaryPz) },
    {
      key: 'complementos', header: 'Complementos',
      render: (c) => {
        const cs = (c.complementos || []).filter((x) => x.activo !== false);
        if (!cs.length) return <span className="u-muted">—</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {cs.map((x) => (
              <span key={x.id} style={{ fontSize: 'var(--fs-xs)' }}>
                {x.tipo === 'actividad' ? '🎯' : x.periodicidad === 'anual' ? '📅' : '🧩'} {x.concepto} · {pz(x.importePz)}
                {x.periodicidad === 'anual' ? ' /año' : ''}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'mensual', header: 'Total / mes',
      render: (c) => {
        const t = totalMensual(c);
        return (
          <>
            <strong>{pz(t.base + t.fijos)}</strong>
            {t.actividad > 0 && (
              <div className="u-muted" style={{ fontSize: 'var(--fs-xs)' }}>+ {pz(t.actividad)} en actividades</div>
            )}
          </>
        );
      },
    },
    { key: 'estado', header: 'Estado', render: (c) => <Badge tone={c.status === 'Active' ? 'success' : 'neutral'}>{c.status}</Badge> },
    {
      key: 'acciones', header: '', width: '150px',
      render: (c) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="sm" variant="outline" onClick={() => setEditando({ ...CONTRATO_NUEVO, ...c, complementos: (c.complementos || []).map((x) => ({ ...x })) })}>Editar</Button>
          <Button size="sm" variant="ghost" onClick={() => borrarContrato(c)}>Borrar</Button>
        </div>
      ),
    },
  ];

  const columnasPeriodo: Column<NominaPeriodoBanco>[] = [
    { key: 'periodo', header: 'Periodo', render: (p) => <strong>{p.periodo}</strong> },
    { key: 'trabajador', header: 'Trabajador', render: (p) => p.employeeName || p.employeeDip },
    { key: 'base', header: 'Base', render: (p) => pz(p.basePz) },
    { key: 'fijos', header: 'Complementos', render: (p) => pz(p.complementosFijosPz) },
    { key: 'actividad', header: 'Actividades', render: (p) => pz(p.complementosActividadPz) },
    { key: 'bruto', header: 'Bruto', render: (p) => <strong>{pz(p.brutoPz)}</strong> },
    { key: 'ial', header: 'IAL 24 %', render: (p) => p.ial ? <span title="12 % empleador + 12 % trabajador">{pz(p.ial.totalPz)}</span> : <span className="u-muted">—</span> },
    { key: 'retencion', header: 'IAL trabajador', render: (p) => p.ial ? `${pz(p.ial.trabajador.totalPz)} · RA ${pz(p.ial.trabajador.antiguedadPz)}` : `${p.retencionPct} %` },
    { key: 'retenciones', header: 'Retenciones', render: (p) => `− ${pz(p.retencionesPz)}` },
    { key: 'neto', header: 'Neto', render: (p) => <strong>{pz(p.netoPz)}</strong> },
    {
      key: 'estado', header: 'Estado',
      render: (p) => (
        <>
          <Badge tone={p.status === 'Paid' ? 'success' : p.motivo ? 'warning' : 'brand'}>{p.status === 'Paid' ? 'Pagada' : 'Pendiente'}</Badge>
          {p.motivo && <div className="u-muted" style={{ fontSize: 'var(--fs-xs)' }}>{p.motivo}</div>}
          {p.transactionId && <div className="u-muted u-mono" style={{ fontSize: 'var(--fs-xs)' }}>{p.transactionId.slice(0, 8)}…</div>}
        </>
      ),
    },
    {
      key: 'pdf', header: 'PDF',
      render: (p) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const payload = {
              id: p.id || `${p.employeeDip}-${p.periodo}`,
              dip: p.employeeDip,
              nombre: p.employeeName || p.employeeDip,
              periodo: p.periodo,
              bruto: p.brutoPz,
              retenciones: p.retencionesPz,
              neto: p.netoPz,
              cuentaBanco: p.companyAccountId || '—',
              estado: p.status === 'Paid' ? 'pagada' : 'pendiente',
              actualizadoEn: p.paidAt || p.generadoEn || new Date().toISOString(),
            };
            generarPdfNomina(payload).catch(() => toast('No se pudo generar el PDF de la nómina', 'error'));
          }}
        >
          Descargar
        </Button>
      ),
    },
  ];

  const editandoTotales = editando ? totalMensual({ ...CONTRATO_NUEVO, ...editando } as NominaContrato) : null;

  return (
    <>
      <PageHeader
        title="Nóminas"
        subtitle="Salario base + cargos + actividad puntual. Solo se muestran los meses relacionados con contratos activos y cada nómina puede descargarse en PDF desde la misma tabla."
        breadcrumb="RSP / Banco"
        actions={
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {mesesVisibles.length === 0 ? (
                <span className="u-muted">Sin contratos activos</span>
              ) : (
                mesesVisibles.map((mes) => (
                  <button
                    key={mes}
                    type="button"
                    onClick={() => setPeriodo(mes)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 999,
                      border: periodo === mes ? '1px solid var(--brand)' : '1px solid var(--border-strong)',
                      background: periodo === mes ? 'var(--brand-soft)' : 'var(--panel)',
                      color: periodo === mes ? 'var(--brand)' : 'var(--text)',
                      fontWeight: periodo === mes ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {formatearMes(mes)}
                  </button>
                ))
              )}
            </div>
            <Button variant="outline" onClick={() => cerrar(false)}>Cerrar periodo</Button>
            <Button onClick={() => cerrar(true)}>Cerrar y pagar</Button>
            <Button variant="ghost" onClick={pagarFueraDePlazo} disabled={!((estado?.periodos ?? []).some((p) => p.status !== 'Paid' && (!p.motivo || /fuera de plazo|vencid|overdue/i.test(p.motivo))))}>Pagar pendientes fuera de plazo</Button>
          </>
        }
      />

      <div className="rsp-kpi-grid">
        <KPI label="Contratos activos" value={totales.contratos} />
        <KPI label="Bruto del periodo" value={pz(totales.bruto)} tone="brand" />
        <KPI label="IAL del periodo" value={pz(totales.ial)} tone="warning" />
        <KPI label="Neto a pagar" value={pz(totales.neto)} tone="success" />
      </div>

      {estado && (
        <div className="rsp-card" style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>
            Plazo de confirmación: <strong>día {estado.config.cutoffDay}</strong> ·{' '}
            {estado.plazoVencido
              ? <Badge tone="warning">plazo vencido · cierre automático activo</Badge>
              : <Badge tone="success">abierto hasta {new Date(estado.fechaLimite).toLocaleDateString('es-ES')}</Badge>}
          </span>
          <span className="u-muted">
            Pago automático: <strong>{estado.config.autoPago ? 'sí' : 'no'}</strong> · Retención: <strong>{estado.config.retencionPct}%</strong>
          </span>
          <span className="u-muted">
            Penalización fuera de plazo: <strong>{pz(calcularPenalizacionFueraPlazo({ nominasFueraPlazo: (estado.periodos ?? []).filter((p) => p.status !== 'Paid' && (!p.motivo || /fuera de plazo|vencid|overdue/i.test(p.motivo))).length }))}</strong>
          </span>
        </div>
      )}

      <Tabs
        tabs={[
          { id: 'contratos', label: `Contratos (${totales.contratos})` },
          { id: 'confirmaciones', label: 'Confirmar actividades' },
          { id: 'cierres', label: `Cierres (${estado?.periodos.length ?? 0})` },
          { id: 'ajustes', label: 'Ajustes' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {cargando ? (
        <Spinner label="Cargando nóminas…" />
      ) : !estado ? (
        <Empty icon="banknote" title="Sin conexión con el motor del Banco" hint="Revisa CRM_READ_KEY / BANCO_API_URL en el BFF." />
      ) : tab === 'contratos' ? (
        <Card>
          <CardHeader
            title="Contratos de nómina"
            subtitle="Cada contrato pertenece a una cuenta de empresa y paga a un trabajador."
            actions={<Button onClick={() => setEditando({ ...CONTRATO_NUEVO })}>Nuevo contrato</Button>}
          />
          {estado.contratos.length === 0 ? (
            <Empty icon="users" title="Sin contratos" hint="Crea el primer contrato con su salario base y complementos." />
          ) : (
            <Table columns={columnasContrato} rows={estado.contratos} rowKey={(c) => c.id} />
          )}
        </Card>
      ) : tab === 'confirmaciones' ? (
        resumenes.length === 0 ? (
          <Empty icon="check" title="Sin contratos que confirmar" hint="Crea un contrato con complementos de actividad." />
        ) : (
          <>
            {resumenes.map((r) => {
              const actividades = (r.contrato.complementos || []).filter((c) => c.tipo === 'actividad' && c.activo !== false);
              return (
                <Card key={r.contrato.id} className="rsp-fade-up" >
                  <CardHeader
                    title={r.contrato.employeeName || r.contrato.employeeDip}
                    subtitle={`${r.contrato.roleTitle || 'Sin cargo'} · base ${pz(r.basePz)} · complementos fijos ${pz(r.complementosFijosPz)}`}
                    actions={
                      <>
                        {r.plazoVencido
                          ? <Badge tone="warning">plazo vencido</Badge>
                          : <Badge tone="success">{r.estado === 'Paid' ? 'pagada' : 'abierto'}</Badge>}
                        <Button size="sm" variant="outline" disabled={r.plazoVencido} onClick={() => guardarConfirmaciones(r)}>Guardar</Button>
                      </>
                    }
                  />
                  {actividades.length === 0 ? (
                    <p className="u-muted" style={{ margin: 0 }}>
                      Este contrato no tiene complementos de actividad puntual (solo base y cargos).
                    </p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {actividades.map((c) => {
                          const clave = `${r.contrato.id}:${c.id}`;
                          const confirmada = confirmando[clave] !== undefined ? confirmando[clave] : r.confirmadas.includes(c.id);
                          return (
                            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="checkbox"
                                checked={confirmada}
                                disabled={r.plazoVencido}
                                onChange={(e) => setConfirmando({ ...confirmando, [clave]: e.target.checked })}
                              />
                              <span>{c.concepto} · <strong>{pz(c.importePz)}</strong></span>
                              <Badge tone={confirmada ? 'success' : 'neutral'}>{confirmada ? 'hecha' : 'no confirmada'}</Badge>
                            </label>
                          );
                        })}
                      </div>
                      <p className="u-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 10, marginBottom: 0 }}>
                        Total del periodo si se confirman todas: <strong>{pz(r.complementosFijosPz + r.complementosActividadPz + r.basePz)}</strong> bruto ·
                        neto <strong>{pz(r.netoPz)}</strong> (retención {r.retencionPct}%).
                      </p>
                    </>
                  )}
                </Card>
              );
            })}
          </>
        )
      ) : tab === 'cierres' ? (
        <Card>
          <CardHeader
            title={`Nóminas generadas · ${periodo}`}
            subtitle="El cierre es idempotente: lo ya pagado no se repite y lo que falló se reintenta."
            actions={<Button variant="outline" onClick={() => cerrar(false)}>Cerrar sin pagar</Button>}
          />
          {estado.periodos.length === 0 ? (
            <Empty icon="fileCheck" title="Sin nóminas generadas" hint="Se generan solas al llegar el plazo, o pulsa «Cerrar periodo»." />
          ) : (
            <Table columns={columnasPeriodo} rows={estado.periodos} rowKey={(p) => p.id} />
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader title="Ajustes del motor" subtitle="El plazo es global para todo el grupo." />
          {config && (
            <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
              <Field label="Día límite de confirmación" hint="Del 1 al 28. Al vencer, el Banco cierra y paga.">
                <input
                  type="number" min={1} max={28} value={config.cutoffDay}
                  onChange={(e) => setConfig({ ...config, cutoffDay: Number(e.target.value) || 25 })}
                  style={{ width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
                />
              </Field>
              <Field label="Retención del trabajador (%)" hint="Se descuenta del bruto y se liquida a TGLP.">
                <input
                  type="number" min={0} max={35} value={config.retencionPct}
                  onChange={(e) => setConfig({ ...config, retencionPct: Number(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
                />
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox" checked={config.autoPago}
                  onChange={(e) => setConfig({ ...config, autoPago: e.target.checked })}
                />
                Pagar automáticamente al vencer el plazo (desde la cuenta de la empresa)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox" checked={config.activo}
                  onChange={(e) => setConfig({ ...config, activo: e.target.checked })}
                />
                Motor de nóminas activo
              </label>
              <div><Button onClick={guardarConfig}>Guardar ajustes</Button></div>
            </div>
          )}
        </Card>
      )}

      <Modal
        open={!!editando}
        title={editando?.id ? 'Editar contrato' : 'Nuevo contrato'}
        onClose={() => setEditando(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={guardarContrato} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar contrato'}</Button>
          </>
        }
      >
        {editando && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Cuenta de la empresa (IBAN / referencia visible)" hint="Usa la cuenta Business visible para el cliente, no el identificador interno del sistema.">
              <input
                value={editando.companyAccountId || ''}
                onChange={(e) => setEditando({ ...editando, companyAccountId: e.target.value })}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
              />
            </Field>
            <Field label="DIP del trabajador">
              <input
                value={editando.employeeDip || ''}
                onChange={(e) => setEditando({ ...editando, employeeDip: e.target.value.toUpperCase() })}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
              />
            </Field>
            <Field label="Nombre">
              <input
                value={editando.employeeName || ''}
                onChange={(e) => setEditando({ ...editando, employeeName: e.target.value })}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
              />
            </Field>
            <Field label="Cargo">
              <input
                value={editando.roleTitle || ''}
                onChange={(e) => setEditando({ ...editando, roleTitle: e.target.value })}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
              />
            </Field>
            <Field label="Jornada (%)" hint="El SMI se prorratea para jornadas parciales.">
              <input
                type="number" min={1} max={100} value={editando.workloadPct ?? 100}
                onChange={(e) => setEditando({ ...editando, workloadPct: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
              />
            </Field>
            <Field label="Salario base (Pz)" hint={`SMI vigente: ${pz(config?.smiMensualPz || 150)} a jornada completa.`}>
              <input
                type="number" min={0} value={editando.grossSalaryPz ?? 0}
                onChange={(e) => setEditando({ ...editando, grossSalaryPz: Number(e.target.value) || 0 })}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
              />
            </Field>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>Complementos</strong>
                <Button
                  size="sm" variant="outline"
                  onClick={() => setEditando({
                    ...editando,
                    complementos: [...(editando.complementos || []), { ...COMPLEMENTO_NUEVO, id: `comp-${Date.now()}` }],
                  })}
                >
                  Añadir complemento
                </Button>
              </div>
              {(editando.complementos || []).length === 0 && <p className="u-muted">Sin complementos.</p>}
              <div style={{ display: 'grid', gap: 8 }}>
                {(editando.complementos || []).map((c, i) => (
                  <div key={c.id || i} className="rsp-card" style={{ padding: 10, display: 'grid', gap: 8 }}>
                    <input
                      placeholder="Concepto (p. ej. Dietas de Junta)"
                      value={c.concepto}
                      onChange={(e) => {
                        const lista = [...(editando.complementos || [])];
                        lista[i] = { ...c, concepto: e.target.value };
                        setEditando({ ...editando, complementos: lista });
                      }}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                      <select
                        value={c.tipo}
                        onChange={(e) => {
                          const tipo = e.target.value as NominaComplementoTipo;
                          const lista = [...(editando.complementos || [])];
                          lista[i] = { ...c, tipo, periodicidad: tipo === 'actividad' ? 'unica' : (c.periodicidad === 'unica' ? 'mensual' : c.periodicidad) };
                          setEditando({ ...editando, complementos: lista });
                        }}
                        style={{ padding: '8px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
                      >
                        <option value="cargo">Cargo</option>
                        <option value="actividad">Actividad puntual</option>
                      </select>
                      <select
                        value={c.periodicidad}
                        disabled={c.tipo === 'actividad'}
                        onChange={(e) => {
                          const lista = [...(editando.complementos || [])];
                          lista[i] = { ...c, periodicidad: e.target.value as NominaComplemento['periodicidad'] };
                          setEditando({ ...editando, complementos: lista });
                        }}
                        style={{ padding: '8px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
                      >
                        <option value="mensual">Mensual</option>
                        <option value="anual">Anual (÷12)</option>
                        <option value="unica">Puntual</option>
                      </select>
                      <input
                        type="number" min={0} value={c.importePz}
                        onChange={(e) => {
                          const lista = [...(editando.complementos || [])];
                          lista[i] = { ...c, importePz: Number(e.target.value) || 0 };
                          setEditando({ ...editando, complementos: lista });
                        }}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-strong)' }}
                      />
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setEditando({ ...editando, complementos: (editando.complementos || []).filter((_, j) => j !== i) })}
                      >
                        ✕
                      </Button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)' }}>
                      <input
                        type="checkbox" checked={c.activo !== false}
                        onChange={(e) => {
                          const lista = [...(editando.complementos || [])];
                          lista[i] = { ...c, activo: e.target.checked };
                          setEditando({ ...editando, complementos: lista });
                        }}
                      />
                      Activo · {c.tipo === 'actividad'
                        ? 'se paga solo si la empresa lo confirma antes del plazo'
                        : c.periodicidad === 'anual' ? `se reparte: ${pz(Number(c.importePz) / 12)} / mes` : 'se paga cada mes'}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {editandoTotales && (
              <p className="u-muted" style={{ margin: 0 }}>
                Fijos al mes: <strong>{pz(editandoTotales.base + editandoTotales.fijos)}</strong> ·
                actividades si se confirman: <strong>{pz(editandoTotales.actividad)}</strong>
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
