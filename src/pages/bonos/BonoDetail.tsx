import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Button, Card, CardHeader, PageHeader, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { BuscadorIdentidad } from '../../components/BuscadorIdentidad';
import type { BonoDetalle } from '../../types';

export default function BonoDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [det, setDet] = useState<BonoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dip, setDip] = useState('');

  const cargar = useCallback(() => {
    if (!id) return;
    provider.getBono(id).then(setDet).catch((e) => setError(e.message));
  }, [id]);

  useEffect(cargar, [cargar]);

  if (error) return <div className="rsp-alert rsp-alert-danger">{error}</div>;
  if (!det) return <Spinner label="Cargando bono…" />;

  const pct = det.presupuesto > 0 ? Math.min(100, Math.round((det.presupuestoUsado / det.presupuesto) * 100)) : 0;

  async function adscribir() {
    if (!det) return;
    if (!dip.trim()) {
      toast('Busca y selecciona un ciudadano', 'error');
      return;
    }
    try {
      await provider.adscribirCiudadano(det.id, dip.trim().toUpperCase());
      toast('Ciudadano adscrito al bono', 'success');
      setDip('');
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <>
      <PageHeader
        title={det.nombre}
        subtitle={<span className="u-mono">{det.id}</span>}
        breadcrumb={<>RSP / Tributos / Bonificaciones / <span className="u-mono">{det.id}</span></>}
        actions={<Badge tone={det.estado === 'activo' ? 'success' : 'neutral'}>{det.estado}</Badge>}
      />

      <div className="rsp-grid rsp-grid-2" style={{ marginBottom: 'var(--sp-4)' }}>
        <Card>
          <CardHeader title="Presupuesto" />
          <dl className="rsp-dl">
            <div className="rsp-dl-row"><dt>Emisor</dt><dd>{det.emisorNombre} <span className="u-mono">({det.emisorEip})</span></dd></div>
            <div className="rsp-dl-row"><dt>Presupuesto</dt><dd>{det.presupuesto.toLocaleString('es-ES')} Pz</dd></div>
            <div className="rsp-dl-row"><dt>Usado</dt><dd>{det.presupuestoUsado.toLocaleString('es-ES')} Pz</dd></div>
            <div className="rsp-dl-row"><dt>Máx/persona</dt><dd>{det.maxPorPersona} Pz</dd></div>
            <div className="rsp-dl-row"><dt>Fecha límite</dt><dd>{det.fechaLimite ?? 'Sin límite'}</dd></div>
          </dl>
          <div className="rsp-progress" style={{ marginTop: 'var(--sp-3)' }}>
            <div className="rsp-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <p className="u-muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-1)' }}>{pct}% del presupuesto comprometido</p>
        </Card>
        <Card>
          <CardHeader title="Baremos" subtitle="Criterios comprobables automáticamente por el sistema" />
          {!det.baremos || det.baremos.length === 0 ? (
            <p className="u-muted">Sin baremos definidos.</p>
          ) : (
            <ul className="rsp-doclist">
              {det.baremos.map((b) => (
                <li key={b.id} className="rsp-doc" style={{ alignItems: 'flex-start' }}>
                  <Icon name="scale" size={16} />
                  <span style={{ flex: 1 }}>
                    <strong>{b.descripcion}</strong>
                    {b.descripcionCalculo && <><br /><span className="u-muted" style={{ fontSize: 'var(--fs-xs)' }}>{b.descripcionCalculo}</span></>}
                  </span>
                  <Badge tone="success">auto</Badge>
                  <Badge tone="brand">peso {b.peso}</Badge>
                </li>
              ))}
            </ul>
          )}
          <CardHeader title="Requisitos" subtitle="Condiciones verificadas automáticamente al adscribir" />
          {!det.requisitos || det.requisitos.length === 0 ? (
            <p className="u-muted">Sin requisitos.</p>
          ) : (
            <ul className="rsp-doclist">
              {det.requisitos.map((r) => (
                <li key={r.id} className="rsp-doc" style={{ alignItems: 'flex-start' }}>
                  <Icon name="check" size={16} />
                  <span style={{ flex: 1 }}>
                    <strong>{r.descripcion}</strong>
                    <br /><span className="u-muted" style={{ fontSize: 'var(--fs-xs)' }}>{r.explicacion}</span>
                  </span>
                  <Badge tone="success">auto</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Ciudadanos adscritos"
          subtitle="Los ciudadanos justifican operaciones del banco que cumplan los requisitos."
          actions={
            <div className="u-row">
              <div style={{ width: 240 }}><BuscadorIdentidad value={dip} onChange={setDip} /></div>
              <Button size="sm" icon="plus" onClick={adscribir}>Adscribir</Button>
            </div>
          }
        />
        {det.adscripciones.length === 0 ? (
          <p className="u-muted">Sin ciudadanos adscritos todavía.</p>
        ) : (
          <ul className="rsp-doclist">
            {det.adscripciones.map((a) => (
              <li key={a.dip} className="rsp-doc">
                <Icon name="user" size={16} />
                <span>{a.nombre} <span className="u-mono">({a.dip})</span></span>
                <span className="u-muted" style={{ marginLeft: 'auto' }}>Justificado {a.justificado} Pz · {a.fechaAdscripcion}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
