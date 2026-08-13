import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { provider } from '../../api';
import {
  Badge, badgeToneDeEstado, Button, Card, CardHeader, Modal, PageHeader, Spinner,
  Stepper, Tabs, useToast,
} from '../../components/ui';
import { Icon, type IconName } from '../../components/icons';
import { Confirmacion2FA } from '../../components/Confirmacion2FA';
import { etiquetaCampo } from '../../config/campos-tramite';
import { ORDEN_ESTADOS, type Requisito, type TramiteDetalle } from '../../types';
import { generarPdfTramite } from '../../lib/pdf';

interface Accion {
  id: string;
  etiqueta: string;
  icono: IconName;
  variante: 'primary' | 'outline' | 'danger';
  critica: boolean;
}

const ACCIONES_POR_ESTADO: Record<string, Accion[]> = {
  inicio: [{ id: 'validar', etiqueta: 'Validar', icono: 'eye', variante: 'primary', critica: false }],
  revision: [
    { id: 'aprobar', etiqueta: 'Aprobar', icono: 'check', variante: 'primary', critica: true },
    { id: 'subsanar', etiqueta: 'Solicitar subsanación', icono: 'pen', variante: 'outline', critica: false },
    { id: 'rechazar', etiqueta: 'Rechazar', icono: 'circleX', variante: 'danger', critica: true },
  ],
  subsanacion: [{ id: 'validar_subsanacion', etiqueta: 'Validar subsanación', icono: 'check', variante: 'primary', critica: false }],
  resolucion: [
    { id: 'emitir_firma', etiqueta: 'Emitir para firma', icono: 'stamp', variante: 'primary', critica: true },
    { id: 'cerrar', etiqueta: 'Cerrar', icono: 'fileCheck', variante: 'outline', critica: true },
  ],
  firma: [{ id: 'resolver', etiqueta: 'Resolver', icono: 'fileCheck', variante: 'primary', critica: true }],
  cierre: [],
};

export default function TramiteDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [det, setDet] = useState<TramiteDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('resumen');
  const [accion, setAccion] = useState<Accion | null>(null);
  const [pedir2FA, setPedir2FA] = useState(false);
  const [requisitos, setRequisitos] = useState<Requisito[]>([]);
  const [ejecutando, setEjecutando] = useState(false);

  const cargar = useCallback(() => {
    if (!id) return;
    provider.getTramite(id).then(setDet).catch((e) => setError(e.message));
  }, [id]);

  useEffect(cargar, [cargar]);

  if (error) return <div className="rsp-alert rsp-alert-danger">{error}</div>;
  if (!det) return <Spinner label="Cargando trámite…" />;

  const paso = Math.max(0, ORDEN_ESTADOS.indexOf(det.estado));
  const acciones = ACCIONES_POR_ESTADO[det.estado] ?? [];

  function abrirAccion(a: Accion) {
    if (!det) return;
    setAccion(a);
    setPedir2FA(false);
    setRequisitos(det.requisitos.map((r) => ({ ...r })));
    if (a.id === 'subsanar') return; // abre modal de checklist
    if (a.critica) setPedir2FA(true); // abre Confirmacion2FA (PlacetaID móvil)
  }

  async function ejecutar() {
    if (!accion || !det) return;
    setEjecutando(true);
    try {
      await provider.avanzarTramite(det.id, accion.id, accion.id === 'subsanar' ? { requisitos } : undefined);
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
    await generarPdfTramite(det);
  }

  async function verPdf() {
    if (!det) return;
    await generarPdfTramite(det, true);
  }

  const datos = Object.entries(det.datosEspecificos ?? {});

  return (
    <>
      <PageHeader
        title={<span className="u-mono">{det.id}</span>}
        subtitle={det.titulo}
        breadcrumb={<>RSP / Trámites / <span className="u-mono">{det.id}</span></>}
        actions={<Badge tone={badgeToneDeEstado(det.estado)}>{det.estado}</Badge>}
      />

      <Card style={{ marginBottom: 'var(--sp-5)' }}>
        <Stepper pasos={ORDEN_ESTADOS} actual={paso} />
      </Card>

      <div className="rsp-grid rsp-grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <Card>
          <CardHeader
            title="Datos del trámite"
            actions={<>
              <Button size="sm" variant="outline" icon="eye" onClick={verPdf}>Ver PDF</Button>
              <Button size="sm" variant="outline" icon="download" onClick={descargarPdf}>Descargar</Button>
            </>}
          />
          <dl className="rsp-dl">
            <div className="rsp-dl-row"><dt>Titular</dt><dd>{det.nombreCiudadano} <span className="u-mono">({det.dip})</span></dd></div>
            <div className="rsp-dl-row"><dt>Servicio</dt><dd>{det.servicio ?? det.tipo}</dd></div>
            <div className="rsp-dl-row"><dt>Plazo</dt><dd>{det.vencido ? <Badge tone="warning">Vencido</Badge> : `${det.plazo} días`}</dd></div>
            <div className="rsp-dl-row"><dt>Firmas</dt><dd>{det.firmasCompletas ?? 0} / {det.firmasRequeridas ?? 1}</dd></div>
            <div className="rsp-dl-row"><dt>Expediente</dt><dd className="u-mono">{det.expedienteId ?? '—'}</dd></div>
            {datos.map(([k, v]) => (
              <div className="rsp-dl-row" key={k}><dt>{etiquetaCampo(det.tipo, k)}</dt><dd>{v || '—'}</dd></div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Acciones del gestor" subtitle="Las acciones críticas se confirman en PlacetaID móvil" />
          {acciones.length === 0 ? (
            <p className="u-muted">No hay acciones disponibles en el estado «{det.estado}».</p>
          ) : (
            <div className="rsp-action-panel">
              {acciones.map((a) => (
                <Button key={a.id} variant={a.variante} icon={a.icono} critical={a.critica} onClick={() => abrirAccion(a)}>
                  {a.etiqueta}
                </Button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <Tabs
          tabs={[
            { id: 'resumen', label: 'Resumen' },
            { id: 'requisitos', label: `Requisitos (${det.requisitos.length})` },
            { id: 'documentos', label: `Documentos (${det.documentos.length})` },
            { id: 'actuaciones', label: `Actuaciones (${det.actuaciones.length})` },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'resumen' && (
          <div className="u-stack">
            <p>Trámite en estado <Badge tone={badgeToneDeEstado(det.estado)}>{det.estado}</Badge>. Sigue el flujo desde el panel de acciones.</p>
            <p className="u-muted">Última actualización: {new Date(det.actualizadoEn).toLocaleString()}</p>
          </div>
        )}

        {tab === 'requisitos' && (
          det.requisitos.length === 0 ? <p className="u-muted">Sin requisitos registrados.</p> : (
            <ul className="rsp-checklist">
              {det.requisitos.map((r) => (
                <li key={r.id} className="rsp-check">
                  <Icon name={r.cumplido ? 'circleCheck' : 'circleX'} size={16} className={r.cumplido ? 'rsp-check-ok' : undefined} />
                  <span>{r.descripcion}</span>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === 'documentos' && (
          det.documentos.length === 0 ? <p className="u-muted">Sin documentos vinculados.</p> : (
            <ul className="rsp-doclist">
              {det.documentos.map((d) => (
                <li key={d.id} className="rsp-doc">
                  <Icon name="file" size={16} />
                  <span>{d.nombre}</span>
                  <Badge tone="neutral">{d.tipo}</Badge>
                  {d.firmado && <Badge tone="success">firmado</Badge>}
                </li>
              ))}
            </ul>
          )
        )}

        {tab === 'actuaciones' && (
          det.actuaciones.length === 0 ? <p className="u-muted">Sin actuaciones registradas.</p> : (
            <ul className="rsp-timeline">
              {det.actuaciones.map((a) => (
                <li key={a.id} className="rsp-timeline-item">
                  <span className="rsp-timeline-dot" />
                  <div className="rsp-timeline-meta">
                    <Badge tone="info">{a.tipo}</Badge>
                    <span>{a.autor}</span>
                    <span>·</span>
                    <span>{new Date(a.fecha).toLocaleString()}</span>
                  </div>
                  <p style={{ margin: '4px 0 0' }}>{a.descripcion}</p>
                </li>
              ))}
            </ul>
          )
        )}
      </Card>

      {/* Confirmación 2FA por PlacetaID móvil (acciones críticas) */}
      <Confirmacion2FA
        open={pedir2FA && accion !== null}
        titulo="Confirmación en PlacetaID móvil"
        objetoId={det.id}
        accion={accion?.id ?? ''}
        onClose={() => setPedir2FA(false)}
        onConfirmado={confirmado2FA}
      />

      {/* Modal de subsanación (checklist) */}
      <Modal
        open={accion !== null && accion.id === 'subsanar'}
        title="Solicitar subsanación"
        onClose={() => setAccion(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAccion(null)}>Cancelar</Button>
            <Button onClick={ejecutar} disabled={ejecutando} icon="check">
              {ejecutando ? 'Ejecutando…' : 'Confirmar subsanación'}
            </Button>
          </>
        }
      >
        <div className="u-stack">
          <p>Marca lo que falta para que el ciudadano lo aporte:</p>
          <ul className="rsp-checklist">
            {requisitos.map((r, i) => (
              <li key={r.id} className="rsp-check">
                <input
                  type="checkbox"
                  checked={!r.cumplido}
                  onChange={(e) => {
                    const next = [...requisitos];
                    next[i] = { ...next[i], cumplido: !e.target.checked };
                    setRequisitos(next);
                  }}
                />
                <span>{r.descripcion}</span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      {/* Modal de confirmación para acciones NO críticas (salvo subsanación) */}
      <Modal
        open={accion !== null && accion.id !== 'subsanar' && !pedir2FA}
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
