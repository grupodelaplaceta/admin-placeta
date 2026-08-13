import { useEffect, useState } from 'react';
import { provider } from '../../api';
import { Badge, Button, Card, Empty, Field, KPI, Modal, PageHeader, Spinner, useToast } from '../../components/ui';
import type { TarjetaDigital } from '../../types';

function CardVisual({ t }: { t: TarjetaDigital }) {
  const img = t.promoPhysical ? '/img/promocard.jpg' : '/img/vitualcard.jpg';
  const numero = t.cardNumber.replace(/\D/g, '').padStart(6, '0').slice(-6);
  return (
    <div className={`rsp-card-visual${t.frozen ? ' is-frozen' : ''}`}>
      <img src={img} alt={t.alias} draggable={false} />
      {t.frozen && <div className="rsp-card-visual-veil">Congelada</div>}
      <div className="rsp-card-visual-body">
        <div className="rsp-card-visual-row">
          <strong>{t.alias}</strong>
          <Badge tone={t.tier === 'Business' ? 'info' : 'brand'}>{t.tier}</Badge>
        </div>
        <div className="rsp-card-visual-num">Nº {numero}</div>
        <div className="rsp-card-visual-foot">
          <span>{t.promoPhysical ? 'Promo Card' : 'Virtual'} · cuenta {t.accountId || 'libre'}</span>
          <span>PIN {t.pin ?? '****'}</span>
        </div>
      </div>
    </div>
  );
}

export default function Tarjetas() {
  const [items, setItems] = useState<TarjetaDigital[] | null>(null);
  const [limiteCard, setLimiteCard] = useState<TarjetaDigital | null>(null);
  const [fContactless, setFContactless] = useState('500');
  const [fWeekly, setFWeekly] = useState('1000');
  const { toast } = useToast();

  const cargar = () => provider.listarTarjetas().then(setItems).catch(() => setItems([]));
  useEffect(() => { cargar(); }, []);

  const activas = items?.filter((t) => !t.frozen).length ?? 0;
  const congeladas = items?.filter((t) => t.frozen).length ?? 0;

  async function congelar(t: TarjetaDigital) {
    try {
      await provider.congelarTarjeta(t.id, !t.frozen);
      toast(t.frozen ? 'Tarjeta reactivada' : 'Tarjeta congelada', 'success');
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function guardarLimites() {
    if (!limiteCard) return;
    try {
      await provider.establecerLimiteTarjeta(limiteCard.id, {
        contactlessLimitPz: Number(fContactless) || 0,
        weeklyLimitPz: Number(fWeekly) || 0,
      });
      toast('Límites actualizados', 'success');
      setLimiteCard(null);
      cargar();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  function abrirLimites(t: TarjetaDigital) {
    setFContactless(String(t.contactlessLimitPz ?? 500));
    setFWeekly(String(t.weeklyLimitPz ?? 1000));
    setLimiteCard(t);
  }

  return (
    <>
      <PageHeader
        title="Tarjetas digitales"
        subtitle="Tarjetas emitidas en el sistema bancario: imagen, límites y congelación."
        breadcrumb="RSP / Banco"
      />
      <div className="rsp-kpi-grid">
        <KPI label="Tarjetas" value={items?.length ?? '—'} icon="creditCard" tone="brand" />
        <KPI label="Activas" value={activas} icon="check" tone="success" />
        <KPI label="Congeladas" value={congeladas} icon="lock" tone="warning" />
      </div>

      {items === null ? (
        <Spinner label="Cargando tarjetas…" />
      ) : items.length === 0 ? (
        <Empty icon="creditCard" title="Sin tarjetas" />
      ) : (
        <div className="rsp-cardgrid">
          {items.map((t) => (
            <Card key={t.id} className="rsp-card-no-pad">
              <CardVisual t={t} />
              <div className="rsp-cardvisual-actions">
                <Button size="sm" variant={t.frozen ? 'outline' : 'danger'} icon={t.frozen ? 'unlock' : 'lock'} onClick={() => congelar(t)}>
                  {t.frozen ? 'Reactivar' : 'Congelar'}
                </Button>
                <Button size="sm" variant="outline" icon="settings" onClick={() => abrirLimites(t)}>Límites</Button>
              </div>
              <dl className="rsp-cardvisual-meta">
                <div><dt>Límite contactless</dt><dd>{t.contactlessLimitPz ?? 500} Pz</dd></div>
                <div><dt>Límite semanal</dt><dd>{t.weeklyLimitPz ?? 1000} Pz</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={limiteCard !== null}
        title={limiteCard ? `Límites · ${limiteCard.alias}` : ''}
        onClose={() => setLimiteCard(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setLimiteCard(null)}>Cancelar</Button>
            <Button icon="check" onClick={guardarLimites}>Guardar</Button>
          </>
        }
      >
        <div className="rsp-form-grid">
          <Field label="Límite contactless (Pz)" hint="Pago sin autenticación hasta este importe.">
            <input type="number" value={fContactless} onChange={(e) => setFContactless(e.target.value)} />
          </Field>
          <Field label="Límite semanal (Pz)" hint="Gasto semanal máximo (PlaceZum incluido).">
            <input type="number" value={fWeekly} onChange={(e) => setFWeekly(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
