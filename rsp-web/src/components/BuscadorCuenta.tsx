import { useEffect, useRef, useState } from 'react';
import { provider } from '../api';
import { Icon } from './icons';
import type { CuentaSugerencia } from '../types';

/** Campo de cuenta/IBAN con búsqueda en las cuentas reales del banco. */
export function BuscadorCuenta({
  value, onChange, placeholder = 'Buscar cuenta / IBAN…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [sugerencias, setSugerencias] = useState<CuentaSugerencia[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function buscar(q: string) {
    if (q.trim().length < 2) {
      setSugerencias([]);
      setAbierto(false);
      return;
    }
    const res = await provider.buscarCuentas(q).catch(() => [] as CuentaSugerencia[]);
    setSugerencias(res.slice(0, 8));
    setAbierto(res.length > 0);
  }

  return (
    <div className="rsp-autocomplete" ref={ref}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          buscar(e.target.value);
        }}
        onFocus={() => value.length >= 2 && buscar(value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {abierto && sugerencias.length > 0 && (
        <ul className="rsp-autocomplete-list">
          {sugerencias.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => { onChange(s.id); setAbierto(false); }}>
                <Icon name="wallet" size={14} />
                <span className="u-ellipsis">{s.etiqueta}</span>
                <span className="u-mono u-muted">{s.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
