import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { provider } from '../../api';
import { Badge, Button, Card, CardHeader, PageHeader, Spinner, useToast, badgeToneDeEstado } from '../../components/ui';
import type { Propuesta } from '../../types';

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', en_revision: 'En revisión', pendiente_junta: 'Pendiente de Junta',
  en_votacion: 'En votación', aprobada: 'Aprobada', rechazada: 'Rechazada', publicada: 'Publicada en el BOLP',
};

function censurarDip(dip?: string | null) {
  if (!dip) return '—';
  if (dip.length <= 4) return '••••';
  return `${dip.slice(0, 1)}${'•'.repeat(dip.length - 3)}${dip.slice(-2)}`;
}

export default function PropuestaDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [p, setP] = useState<Propuesta | null>(null);
  const [texto, setTexto] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = () => {
    provider.getPropuesta(id).then((d) => {
      setP(d);
      setTexto(d.contenidoMd);
      setNotas(d.notasCambio || '');
    }).catch((e) => { toast((e as Error).message, 'error'); setP(null); });
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [id]);

  if (p === null) return <Card><Spinner label="Cargando propuesta…" /></Card>;
  const editable = p.estado === 'borrador' || p.estado === 'en_revision';

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    try { setBusy(true); await fn(); toast(okMsg, 'success'); cargar(); }
    catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  const guardar = () => run(() => provider.editarPropuesta(p.id, { contenidoMd: texto, notasCambio: notas }), 'Cambios guardados');
  const avanzar = () => run(() => provider.avanzarPropuesta(p.id), p.estado === 'borrador' ? 'Enviada a revisión' : 'Solicitada su inclusión en la Junta');
  const votar = () => run(() => provider.llevarAVotacionPropuesta(p.id), 'Propuesta llevada a votación (Junta)');
  const resolver = async () => {
    try {
      setBusy(true);
      const r = await provider.resolverPropuesta(p.id);
      if (r.estado === 'publicada' && r.documento) toast(`Publicada en el BOLP como ${r.documento.codigo} (v${r.documento.version})`, 'success');
      else toast(`Resultado: ${r.estado}`, 'success');
      cargar();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  const historial = (p.historial || []).slice().reverse();

  return (
    <>
      <PageHeader
        title={p.titulo}
        subtitle={<span><span className="u-mono">{p.id}</span> · {p.departamento || '—'} · v{p.version}</span>}
        breadcrumb="RSP / Participación / Propuestas"
        actions={
          <div className="u-row u-wrap">
            <Button variant="outline" onClick={() => navigate('/propuestas')}>Volver</Button>
            {editable && <Button disabled={busy || texto === p.contenidoMd && notas === (p.notasCambio || '')} onClick={guardar}>Guardar</Button>}
            {(p.estado === 'borrador' || p.estado === 'en_revision') && <Button variant="outline" icon="send" disabled={busy} onClick={avanzar}>{p.estado === 'borrador' ? 'Enviar a revisión' : 'Solicitar Junta'}</Button>}
            {(p.estado === 'en_revision' || p.estado === 'pendiente_junta') && <Button variant="outline" icon="vote" disabled={busy} onClick={votar}>Llevar a votación</Button>}
            {p.estado === 'en_votacion' && <Button icon="check" disabled={busy} onClick={resolver}>Resolver según votación</Button>}
          </div>
        }
      />

      <div className="rsp-kpi-grid">
        <Card style={{ padding: '12px 16px' }}>
          <Badge tone={badgeToneDeEstado(p.estado)}>{ESTADO_LABEL[p.estado] || p.estado}</Badge>
        </Card>
        <Card style={{ padding: '12px 16px' }}>
          <div className="u-muted" style={{ fontSize: 12 }}>Norma / código</div>
          <strong className="u-mono">{p.codigoDocumento || 'Sin asignar'}</strong>
        </Card>
        <Card style={{ padding: '12px 16px' }}>
          <div className="u-muted" style={{ fontSize: 12 }}>Autor (censurado)</div>
          <strong>{censurarDip(p.autorDip)}</strong>
        </Card>
        {p.votacionId ? (
          <Card style={{ padding: '12px 16px' }}>
            <div className="u-muted" style={{ fontSize: 12 }}>Votación</div>
            <Link to={`/votaciones/${p.votacionId}`} className="u-mono">{p.votacionId}</Link>
          </Card>
        ) : (
          <Card style={{ padding: '12px 16px' }}>
            <div className="u-muted" style={{ fontSize: 12 }}>Fecha propuesta</div>
            <strong>{p.fechaPropuesta || '—'}</strong>
          </Card>
        )}
      </div>

      {p.descripcion ? <Card><p style={{ margin: 0 }}>{p.descripcion}</p></Card> : null}

      <Card>
        <CardHeader
          title="Contenido de la propuesta"
          subtitle={editable ? 'Editable en borrador o revisión. Al guardar con cambios se crea una versión nueva (el historial no se pierde).' : 'Contenido congelado en este estado.'}
        />
        {editable ? (
          <>
            <textarea rows={16} value={texto} onChange={(e) => setTexto(e.target.value)} style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.6, padding: '10px 12px' }} />
            <div style={{ marginTop: 8 }}>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Nota del cambio (aparece en el historial)…" style={{ width: '100%', padding: '9px 11px' }} />
            </div>
          </>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: 13.5, lineHeight: 1.7 }}>{p.contenidoMd || 'Sin contenido.'}</pre>
        )}
      </Card>

      {p.estado === 'publicada' && p.bopUrl ? (
        <Card>
          <CardHeader title="Publicación" subtitle="Aprobada por la Junta y publicada en el Boletín Oficial." />
          <p>Documento <strong className="u-mono">{p.codigoBop}</strong> (v{p.version}).</p>
          <a className="btn" href={p.bopUrl} target="_blank" rel="noopener noreferrer">Ver en el BOLP →</a>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={`Historial de versiones (${historial.length})`} subtitle="Cada cambio queda registrado; las versiones anteriores nunca se eliminan." />
        {historial.length === 0
          ? <p className="u-muted">Sin versiones anteriores todavía.</p>
          : historial.map((h) => (
            <details key={`${h.version}-${h.desde}`} style={{ borderBottom: '1px solid var(--rsp-border, #eee)', padding: '10px 0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                <span className="u-mono">v{h.version}</span> · {h.notas || 'Versión anterior'}
                <span className="u-muted" style={{ fontWeight: 400, marginLeft: 8 }}>{h.desde ? String(h.desde).slice(0, 10) : ''}</span>
              </summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '10px 0 0', fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.6, background: 'var(--rsp-bg, #faf9fd)', padding: 10, borderRadius: 8 }}>{h.contenidoMd || '(vacío)'}</pre>
            </details>
          ))}
      </Card>
    </>
  );
}
