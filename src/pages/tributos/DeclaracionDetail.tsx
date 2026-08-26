import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { provider } from '../../api';
import {
  Badge, badgeToneDeEstado, Button, Card, CardHeader, Modal, PageHeader, Spinner,
  useToast,
} from '../../components/ui';
import { Icon, type IconName } from '../../components/icons';
import { Confirmacion2FA } from '../../components/Confirmacion2FA';
import { esAccionCritica, type DeclaracionDetalle } from '../../types';
import { generarPdfDeclaracion } from '../../lib/pdf';
import { NORMATIVA_APLICADA } from '../../config/normativa-declaracion';

interface Accion { id: string; etiqueta: string; icono: IconName; variante: 'primary' | 'outline' | 'danger'; }

const ACCIONES_POR_ESTADO: Record<string, Accion[]> = {
  borrador: [{ id: 'publicar', etiqueta: 'Publicar', icono: 'send', variante: 'primary' }],
  pendiente_aprobacion: [
    { id: 'aprobar', etiqueta: 'Aprobar', icono: 'check', variante: 'primary' },
    { id: 'rechazar', etiqueta: 'Rechazar', icono: 'circleX', variante: 'danger' },
  ],
  aprobada: [{ id: 'emitir', etiqueta: 'Emitir y cobrar', icono: 'banknote', variante: 'primary' }],
  emitida: [{ id: 'cobrar', etiqueta: 'Registrar cobro', icono: 'banknote', variante: 'primary' }],
  cobrada: [],
};

export default function DeclaracionDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [det, setDet] = useState<DeclaracionDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [pedir2FA, setPedir2FA] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);

  const cargar = useCallback(() => {
    if (!id) return;
    provider.getDeclaracion(id).then(setDet).catch((e) => setError(e.message));
  }, [id]);

  useEffect(cargar, [cargar]);

  if (error) return <div className="rsp-alert rsp-alert-danger">{error}</div>;
  if (!det) return <Spinner label="Cargando declaración…" />;

  const acciones = ACCIONES_POR_ESTADO[det.estado] ?? [];
  const total = det.cuotaIrm + det.cuotaIgf;

  function abrirAccion(a: Accion) {
    setAccion(a);
    setPedir2FA(esAccionCritica(a.id));
  }

  async function ejecutar() {
    if (!accion || !det) return;
    setEjecutando(true);
    try {
      await provider.accionDeclaracion(det.id, accion.id);
      toast(`«${accion.etiqueta}» ejecutado`, 'success');
      setAccion(null);
      setPedir2FA(false);
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setEjecutando(false);
    }
  }

  async function confirmado2FA() {
    setPedir2FA(false);
    await ejecutar();
  }

  async function descargarPdf() {
    if (!det) return;
    await generarPdfDeclaracion(det);
  }

  return (
    <>
      <PageHeader
        title={<span className="u-mono">{det.id}</span>}
        subtitle={`${det.contribuyenteNombre} · periodo ${det.mesPeriodo}`}
        breadcrumb={<>RSP / Tributos / Declaraciones / <span className="u-mono">{det.id}</span></>}
        actions={<Badge tone={badgeToneDeEstado(det.estado)}>{det.estado}</Badge>}
      />

      <div className="rsp-grid rsp-grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <Card>
          <CardHeader title="Liquidación" />
          <dl className="rsp-dl">
            <div className="rsp-dl-row"><dt>Patrimonio medio</dt><dd>{det.patrimonioMedio.toLocaleString('es-ES')} Pz</dd></div>
            <div className="rsp-dl-row"><dt>Cuota IRM</dt><dd>{det.cuotaIrm} Pz</dd></div>
            <div className="rsp-dl-row"><dt>Cuota IGF</dt><dd>{det.cuotaIgf} Pz</dd></div>
            <div className="rsp-dl-row"><dt>Total</dt><dd><strong>{total} Pz</strong></dd></div>
            <div className="rsp-dl-row"><dt>Exención</dt><dd>{det.exencionAplicada}</dd></div>
            {det.ivaExento !== undefined && (
              <div className="rsp-dl-row"><dt>IVA</dt><dd>{det.ivaExento ? <Badge tone="success">exento</Badge> : <Badge tone="neutral">no exento</Badge>}</dd></div>
            )}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Acciones" subtitle="Las acciones críticas se confirman en PlacetaID móvil" />
          {acciones.length === 0 ? (
            <p className="u-muted">No hay acciones disponibles en el estado «{det.estado}».</p>
          ) : (
            <div className="rsp-action-panel">
              {acciones.map((a) => (
                <Button
                  key={a.id}
                  variant={a.variante}
                  icon={a.icono}
                  critical={esAccionCritica(a.id)}
                  onClick={() => abrirAccion(a)}
                >
                  {a.etiqueta}
                </Button>
              ))}
            </div>
          )}
          <Button variant="outline" icon="download" onClick={descargarPdf} style={{ marginTop: 'var(--sp-3)' }}>Descargar PDF</Button>
          {det.pdfUrl && (
            <a className="rsp-btn rsp-btn-ghost" href={det.pdfUrl} target="_blank" rel="noreferrer" style={{ marginTop: 'var(--sp-2)' }}>
              <Icon name="file" size={16} /> PDF del servidor
            </a>
          )}
        </Card>
      </div>

      {det.desglose && (
        <Card style={{ marginBottom: 'var(--sp-4)' }}>
          <CardHeader title="Desglose de cálculo" subtitle="De dónde procede cada cuota: tramos aplicados, cuentas y movimientos" />

          <h4 style={{ margin: '0 0 var(--sp-2)' }}>IRM — {det.desglose.escalaIrm ?? 'escala'} · base imponible = patrimonio medio {det.desglose.baseIrm.toLocaleString('es-ES')} Pz</h4>
          <p className="u-muted" style={{ margin: '0 0 var(--sp-2)' }}>
            Ingresos {det.desglose.ingresosMes?.toLocaleString('es-ES') ?? '0'} Pz − Pagos {det.desglose.pagosMes?.toLocaleString('es-ES') ?? '0'} Pz = acumulación {det.desglose.acumulacionNeta?.toLocaleString('es-ES') ?? '0'} Pz → IA {(det.desglose.ia ?? 0).toLocaleString('es-ES')}% (tramo {det.desglose.tramoIA ?? 0}) → tipo {det.desglose.tipoIrm}%
          </p>
          <ul className="rsp-doclist" style={{ marginBottom: 'var(--sp-4)' }}>
            {(det.desglose.tramosIrm ?? []).map((t, i) => (
              <li key={i} className="rsp-doc">
                <Icon name="scale" size={16} />
                <span>Tipo {t.tipoPct}%</span>
                <span className="u-mono" style={{ marginLeft: 'auto' }}>base {t.base.toLocaleString('es-ES')} → {t.cuota.toLocaleString('es-ES')} Pz</span>
              </li>
            ))}
          </ul>

          <h4 style={{ margin: '0 0 var(--sp-2)' }}>IGF — {det.desglose.escalaIgf ?? 'escala'} · base {det.desglose.baseIgf.toLocaleString('es-ES')} Pz</h4>
          <ul className="rsp-doclist" style={{ marginBottom: 'var(--sp-4)' }}>
            {(det.desglose.tramosIgf ?? []).map((t, i) => (
              <li key={i} className="rsp-doc">
                <Icon name="scale" size={16} />
                <span>Tramo {t.desde.toLocaleString('es-ES')} – {t.hasta == null ? '∞' : t.hasta.toLocaleString('es-ES')} Pz</span>
                <span className="u-muted">{t.tipoPct}%</span>
                <span className="u-mono" style={{ marginLeft: 'auto' }}>base {t.base.toLocaleString('es-ES')} → {t.cuota.toLocaleString('es-ES')} Pz</span>
              </li>
            ))}
          </ul>

          {det.desglose.cuentas && det.desglose.cuentas.length > 0 && (
            <>
              <h4 style={{ margin: '0 0 var(--sp-2)' }}>Cuentas que componen el patrimonio ({det.desglose.cuentas.length})</h4>
              <ul className="rsp-doclist" style={{ marginBottom: 'var(--sp-4)' }}>
                {det.desglose.cuentas.map((cu) => (
                  <li key={cu.id} className="rsp-doc">
                    <Icon name="wallet" size={16} />
                    <span>{cu.nombre}</span>
                    <span className="u-mono" style={{ marginLeft: 'auto' }}>{cu.saldo.toLocaleString('es-ES')} Pz</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {det.desglose.movimientos && det.desglose.movimientos.length > 0 && (
            <>
              <h4 style={{ margin: '0 0 var(--sp-2)' }}>Ingresos del mes (entradas desde cuentas ajenas)</h4>
              <ul className="rsp-doclist">
                {det.desglose.movimientos.map((m) => (
                  <li key={m.id} className="rsp-doc">
                    <Icon name="banknote" size={16} />
                    <span><Badge tone="info">{m.kind}</Badge></span>
                    <span>{m.concepto}</span>
                    <span className="u-mono" style={{ marginLeft: 'auto' }}>+{m.importe.toLocaleString('es-ES')} Pz</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {det.desglose.saldosDiarios && (
            <>
              <h4 style={{ margin: '0 0 var(--sp-2)' }}>Saldos diarios reconstruidos (patrimonio medio)</h4>
              <p className="u-muted" style={{ margin: '0 0 var(--sp-2)' }}>
                Saldo inicio de mes {det.desglose.saldosDiarios.saldoInicio.toLocaleString('es-ES')} Pz · media {det.desglose.saldosDiarios.patrimonioMedio.toLocaleString('es-ES')} Pz · {det.desglose.saldosDiarios.diasActivos} días activos
              </p>
              <ul className="rsp-doclist">
                {det.desglose.saldosDiarios.serie.map((s) => (
                  <li key={s.dia} className="rsp-doc">
                    <Icon name="wallet" size={16} />
                    <span className="u-mono">{s.dia}</span>
                    <span className="u-mono" style={{ marginLeft: 'auto' }}>{s.saldo.toLocaleString('es-ES')} Pz</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {det.empleos && det.empleos.length > 0 && (
        <Card style={{ marginBottom: 'var(--sp-4)' }}>
          <CardHeader title="Empleos y cotizaciones" subtitle="% del salario retenido al trabajador (CNIC-COTIZACION-TRABAJADOR-*)" />
          <ul className="rsp-doclist">
            {det.empleos.map((e) => (
              <li key={e.empleadorEip} className="rsp-doc">
                <Icon name="user" size={16} />
                <span><strong>{e.empleadorNombre}</strong> <span className="u-mono">({e.empleadorEip})</span></span>
                <span className="u-muted" style={{ marginLeft: 'auto' }}>
                  Bruto {e.salarioBruto} Pz · Cotización −{e.cotizacionTrabajador} Pz ({e.cotizacionPct}%) · Neto {e.salarioNeto} Pz
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Expediente fiscal" subtitle="Documentos vinculados a la declaración" />
        {det.documentos.length === 0 ? (
          <p className="u-muted">Sin documentos vinculados.</p>
        ) : (
          <ul className="rsp-doclist">
            {det.documentos.map((d) => (
              <li key={d.id} className="rsp-doc">
                <Icon name="file" size={16} />
                <span>{d.nombre}</span>
                <Badge tone="neutral">{d.tipo}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card style={{ marginTop: 'var(--sp-4)' }}>
        <CardHeader title="Normativa aplicada" subtitle="Cada concepto se calcula según el CNIC vigente del BOP" />
        <ul className="rsp-doclist">
          {NORMATIVA_APLICADA.map((n) => (
            <li key={n.codigo} className="rsp-doc">
              <Icon name="scale" size={16} />
              <span className="u-mono">{n.codigo}</span>
              <span>{n.descripcion}</span>
              <span style={{ marginLeft: 'auto' }}><Badge tone="brand">{n.valor}</Badge></span>
            </li>
          ))}
        </ul>
      </Card>

      <Confirmacion2FA
        open={pedir2FA && accion !== null}
        titulo="Confirmación en PlacetaID móvil"
        objetoId={det.id}
        accion={accion?.id ?? ''}
        onClose={() => setPedir2FA(false)}
        onConfirmado={confirmado2FA}
      />

      <Modal
        open={accion !== null && !pedir2FA}
        title={`Confirmar: ${accion?.etiqueta ?? ''}`}
        onClose={() => setAccion(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAccion(null)}>Cancelar</Button>
            <Button onClick={ejecutar} disabled={ejecutando} icon="check">
              {ejecutando ? 'Ejecutando…' : 'Confirmar'}
            </Button>
          </>
        }
      >
        <p>Vas a ejecutar <strong>{accion?.etiqueta}</strong> sobre <span className="u-mono">{det.id}</span>.</p>
      </Modal>
    </>
  );
}
