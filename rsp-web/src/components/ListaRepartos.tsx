import { useState } from 'react';
import { BuscadorIdentidad } from './BuscadorIdentidad';
import { Icon } from './icons';

interface Reparto {
  dip: string;
  pct: string;
}

/** Lista editable de titulares/socios/herederos con % (buscador, no texto plano). */
export function ListaRepartos({
  value, onChange, placeholderDIP = 'Buscar DIP/EIP…',
}: {
  value: string; // JSON string: [{ dip, pct }]
  onChange: (v: string) => void;
  placeholderDIP?: string;
}) {
  const [items, setItems] = useState<Reparto[]>(() => {
    try {
      const p = JSON.parse(value || '[]');
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  });

  function actualizar(next: Reparto[]) {
    setItems(next);
    onChange(JSON.stringify(next));
  }

  function cambiar(i: number, patch: Partial<Reparto>) {
    const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    actualizar(next);
  }

  return (
    <div className="rsp-repartos u-stack">
      {items.map((it, i) => (
        <div key={i} className="rsp-reparto-row">
          <div className="rsp-reparto-buscador">
            <BuscadorIdentidad value={it.dip} onChange={(v) => cambiar(i, { dip: v })} placeholder={placeholderDIP} />
          </div>
          <input
            type="number"
            value={it.pct}
            onChange={(e) => cambiar(i, { pct: e.target.value })}
            placeholder="%"
            aria-label="Porcentaje"
            className="rsp-reparto-pct"
          />
          <button type="button" className="rsp-icon-btn" onClick={() => actualizar(items.filter((_, j) => j !== i))} aria-label="Quitar">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="rsp-btn rsp-btn-outline rsp-btn-sm" onClick={() => actualizar([...items, { dip: '', pct: '' }])}>
        <Icon name="plus" size={14} /> Añadir
      </button>
    </div>
  );
}
