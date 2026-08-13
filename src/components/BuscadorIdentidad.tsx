import { useEffect, useRef, useState } from 'react';
import { provider } from '../api';
import { Icon } from './icons';
import type { CiudadanoResumen, EntidadRegistral } from '../types';

interface Sugerencia {
  id: string;
  nombre: string;
  tipo: 'persona' | 'entidad';
}

/**
 * Campo DIP/EIP con búsqueda en el censo y en el Registro Mercantil:
 * escribe y sugiere a quién puedes estar buscando.
 */
export function BuscadorIdentidad({
  value, onChange, placeholder = 'Buscar DIP/EIP…', incluirEntidades = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  incluirEntidades?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
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
    const [ciudadanos, entidades] = await Promise.all([
      provider.buscarCiudadanos(q).catch(() => [] as CiudadanoResumen[]),
      incluirEntidades ? provider.listarEntidades().catch(() => [] as EntidadRegistral[]) : Promise.resolve([] as EntidadRegistral[]),
    ]);
    const ql = q.toLowerCase();
    const sug: Sugerencia[] = [
      ...ciudadanos
        .filter((c) => c.nombre.toLowerCase().includes(ql) || c.dip.toLowerCase().includes(ql))
        .map((c) => ({ id: c.dip, nombre: c.nombre, tipo: 'persona' as const })),
      ...entidades
        .filter((e) => e.nombre.toLowerCase().includes(ql) || e.eip.toLowerCase().includes(ql))
        .map((e) => ({ id: e.eip, nombre: e.nombre, tipo: 'entidad' as const })),
    ];
    setSugerencias(sug.slice(0, 8));
    setAbierto(sug.length > 0);
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
            <li key={`${s.tipo}-${s.id}`}>
              <button type="button" onClick={() => { onChange(s.id); setAbierto(false); }}>
                <Icon name={s.tipo === 'entidad' ? 'building' : 'user'} size={14} />
                <span className="u-ellipsis">{s.nombre}</span>
                <span className="u-mono u-muted">{s.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
