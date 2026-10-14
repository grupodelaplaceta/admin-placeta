import { useEffect, useState } from 'react';
import { provider } from '../api';
import { Button, Modal } from './ui';
import { Icon } from './icons';

/**
 * Confirmación 2FA por PlacetaID móvil (nunca un código tecleado en el panel).
 * 1. envía la petición al móvil (enviar2FA)
 * 2. el usuario confirma en PlacetaID (webhook / confirmar2FA en demo)
 */
export function Confirmacion2FA({
  open, titulo, objetoId, accion, onClose, onConfirmado,
}: {
  open: boolean;
  titulo: string;
  objetoId: string;
  accion: string;
  onClose: () => void;
  onConfirmado: () => void;
}) {
  const [estado, setEstado] = useState<'enviando' | 'pendiente' | 'error'>('enviando');
  const [reqId, setReqId] = useState('');

  useEffect(() => {
    if (!open) return;
    setEstado('enviando');
    provider
      .enviar2FA(objetoId, accion)
      .then((r) => {
        setReqId(r.id);
        setEstado('pendiente');
      })
      .catch(() => setEstado('error'));
  }, [open, objetoId, accion]);

  async function confirmar() {
    const ok = await provider.confirmar2FA(reqId).catch(() => false);
    if (ok) onConfirmado();
    else setEstado('error');
  }

  return (
    <Modal
      open={open}
      title={titulo}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          {estado === 'pendiente' && (
            <Button icon="scan" onClick={confirmar}>Confirmar en PlacetaID móvil</Button>
          )}
        </>
      }
    >
      <div className="u-stack">
        {estado === 'enviando' && (
          <div className="rsp-loading"><span className="rsp-spinner" /> Enviando petición a PlacetaID móvil…</div>
        )}
        {estado === 'pendiente' && (
          <>
            <div className="rsp-2fa-card">
              <Icon name="scan" size={32} />
              <div>
                <strong>Abre PlacetaID móvil y confirma</strong>
                <p className="u-muted" style={{ margin: '4px 0 0' }}>
                  Operación <span className="u-mono">{accion}</span> sobre <span className="u-mono">{objetoId}</span>.
                </p>
              </div>
            </div>
            <p className="u-muted" style={{ fontSize: 'var(--fs-xs)' }}>
              En producción, el webhook de PlacetaID avanza el trámite automáticamente. En demo, pulsa «Confirmar».
            </p>
          </>
        )}
        {estado === 'error' && <div className="rsp-alert rsp-alert-danger">No se pudo confirmar la operación. Inténtalo de nuevo.</div>}
      </div>
    </Modal>
  );
}
