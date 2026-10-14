import { useEffect, useState } from 'react';
import { provider } from '../api';
import type { RegimenBono } from '../types';

/** Selector de bonos activos (para el trámite de adhesión). */
export function SelectorBono({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [bonos, setBonos] = useState<RegimenBono[]>([]);

  useEffect(() => {
    provider.listarBonos().then(setBonos).catch(() => setBonos([]));
  }, []);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecciona un bono…</option>
      {bonos.map((b) => (
        <option key={b.id} value={b.id} disabled={b.estado !== 'activo'}>
          {b.nombre} ({b.id}) — {b.presupuesto - b.presupuestoUsado} Pz disponibles
        </option>
      ))}
    </select>
  );
}
