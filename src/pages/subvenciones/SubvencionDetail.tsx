import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, badgeToneDeEstado, Button, Card, CardHeader, Field, Modal, PageHeader, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { Confirmacion2FA } from '../../components/Confirmacion2FA';
import type { SubvencionDetalle } from '../../types';
import { generarPdfSubvencion } from '../../lib/pdf';

export default function SubvencionDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [det, setDet] = useState<SubvencionDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState('');
  const [mostrarDocs, setMostrarDocs] = useState(false);
  const [gastosSel, setGastosSel] = useState<string[]>([]);
  const [pedir2FA, setPedir2FA] = useState(false);

  const cargar = useCallback(() => {
    if (!id) return;
    provider.getSubvencion(id).then(setDet).catch((e) => setError(e.message));
  }, [id]);

  useEffect(cargar, [cargar]);

  if (error) return <div className="rsp-alert rsp-alert-danger">{error}</div>;
  if (!det) return <Spinner label="Cargando subvención…" />;

  const noJustificados = det.gastos.filter((g) => !g.justificado);

  async function requerirDocs() {
    if (!det) return;
    const lista = docs.split('\n').map((s) => s.trim()).filter(Boolean);
    if (lista.length === 0) {
      toast('Escribe al menos un documento (uno por línea)', 'error');
      return;
    }
    try {
      await provider.requerirDocumentosSubvencion(det.id, lista);
      toast('Documentos requeridos al beneficiario', 'success');
      setMostrarDocs(false);
      setDocs('');
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function justificar() {
    if (!det) return;
    if (gastosSel.length === 0) {
      toast('Selecciona al menos un gasto', 'error');
      return;
    }
    try {
      await provider.justificarPagoSubvencion(det.id, gastosSel);
      toast('Pago justificado y transferencia ejecutada vía Banco de La Placeta', 'success');
      setGastosSel([]);
      setPedir2FA(false);
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function descargarPdf() {
    if (!det) return;
    await generarPdfSubvencion(det);
  }

  return (
    <>
      <PageHeader
        title={<span className="u-mono">{det.id}</span>}
        subtitle={det.concepto}
        breadcrumb={<>RSP / Subvenciones / <span className="u-mono">{det.id}</span></>}
        actions={<><Badge tone={badgeToneDeEstado(det.estado)}>{det.estado}</Badge><Button size="sm" variant="outline" icon="download" onClick={descargarPdf}>PDF</Button></>}
      />

      <div className="rsp-grid rsp-grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <Card>
          <CardHeader title="Datos" />
          <dl className="rsp-dl">
            <div className="rsp-dl-row"><dt>Emisor</dt><dd>{det.emisorNombre} <span className="u-mono">({det.emisorEip})</span></dd></div>
            <div className="rsp-dl-row"><dt>Receptor</dt><dd>{det.receptorNombre} <span className="u-mono">({det.receptorEip})</span></dd></div>
            <div className="rsp-dl-row"><dt>Importe</dt><dd>{det.importe.toLocaleString('es-ES')} Pz</dd></div>
            <div className="rsp-dl-row"><dt>Restante</dt><dd><strong>{det.importeRestante.toLocaleString('es-ES')} Pz</strong></dd></div>
            <div className="rsp-dl-row"><dt>Concedida</dt><dd>{det.fechaConcesion}</dd></div>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Documentos requeridos" subtitle="El beneficiario debe aportarlos de verdad" actions={<Button size="sm" variant="outline" icon="plus" onClick={() => setMostrarDocs(true)}>Requerir documentos</Button>} />
          {det.documentosRequeridos.length === 0 ? (
            <p className="u-muted">Sin documentos requeridos.</p>
          ) : (
            <ul className="rsp-doclist">
              {det.documentosRequeridos.map((d) => (
                <li key={d.id} className="rsp-doc">
                  <Icon name={d.aportado ? 'circleCheck' : 'circleX'} size={16} className={d.aportado ? 'rsp-check-ok' : undefined} />
                  <span>{d.nombre}</span>
                  <Badge tone={d.aportado ? 'success' : 'warning'}>{d.aportado ? 'aportado' : 'pendiente'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card style={{ marginBottom: 'var(--sp-4)' }}>
        <CardHeader
          title="Justificar pagos"
          subtitle="Selecciona los gastos del receptor; el importe se transfiere vía Banco de La Placeta."
          actions={noJustificados.length > 0
            ? <Button icon="banknote" critical onClick={() => setPedir2FA(true)} disabled={gastosSel.length === 0}>Justificar pago</Button>
            : undefined}
        />
        {det.gastos.length === 0 ? (
          <p className="u-muted">No hay gastos registrados del receptor.</p>
        ) : (
          <ul className="rsp-checklist">
            {det.gastos.map((g) => (
              <li key={g.id} className="rsp-check">
                <input
                  type="checkbox"
                  disabled={g.justificado}
                  checked={g.justificado || gastosSel.includes(g.id)}
                  onChange={(e) => setGastosSel((prev) => e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id))}
                />
                <span>{g.concepto} · <span className="u-muted">{g.fecha}</span></span>
                <strong style={{ marginLeft: 'auto' }}>{g.importe} Pz</strong>
                {g.justificado && <Badge tone="success">justificado</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Justificaciones ejecutadas" subtitle="Transferencias realizadas por el Banco de La Placeta" />
        {det.justificaciones.length === 0 ? (
          <p className="u-muted">Aún no se ha ejecutado ningún pago.</p>
        ) : (
          <ul className="rsp-doclist">
            {det.justificaciones.map((j) => (
              <li key={j.id} className="rsp-doc">
                <Icon name="banknote" size={16} />
                <span>{j.importe} Pz</span>
                <span className="u-mono">TRF: {j.transferenciaId}</span>
                <Badge tone="info">{j.fecha}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={mostrarDocs}
        title="Requerir documentos"
        onClose={() => setMostrarDocs(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMostrarDocs(false)}>Cancelar</Button>
            <Button onClick={requerirDocs} icon="check">Requerir</Button>
          </>
        }
      >
        <Field label="Documentos (uno por línea)" hint="Se notificará al beneficiario para que los aporte.">
          <textarea rows={4} value={docs} onChange={(e) => setDocs(e.target.value)} placeholder={'Presupuesto\nFactura proforma'} />
        </Field>
      </Modal>

      <Confirmacion2FA
        open={pedir2FA}
        titulo="Confirmar pago en PlacetaID móvil"
        objetoId={det.id}
        accion="justificar_pago"
        onClose={() => setPedir2FA(false)}
        onConfirmado={justificar}
      />
    </>
  );
}
