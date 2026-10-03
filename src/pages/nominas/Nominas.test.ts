import { describe, expect, it } from 'vitest';
import { calcularIalNomina, calcularPenalizacionFueraPlazo, obtenerMesesVisibles } from './Nominas';

describe('obtenerMesesVisibles', () => {
  it('solo devuelve meses de contratos activos y ordena de más reciente a más antiguo', () => {
    const meses = obtenerMesesVisibles({
      contratos: [
        { id: 'c1', status: 'Active', startDate: '2026-01-10' },
        { id: 'c2', status: 'Inactive', startDate: '2026-03-01' },
        { id: 'c3', status: 'Active', startDate: '2026-06-12' },
      ],
      periodos: [
        { contractId: 'c3', periodo: '2026-06' },
        { contractId: 'c1', periodo: '2026-05' },
        { contractId: 'c2', periodo: '2026-03' },
      ],
    } as any);

    expect(meses).toEqual(['2026-06', '2026-05', '2026-01']);
  });
});

describe('reglas laborales del banco', () => {
  it('aplica el IAL 24% de forma equivalente al 12% empresa y 12% trabajador', () => {
    const ial = calcularIalNomina({ brutoPz: 1000, antiguedadPct: 20 });

    expect(ial.totalPz).toBeCloseTo(240, 5);
    expect(ial.empleador.totalPz).toBeCloseTo(120, 5);
    expect(ial.trabajador.totalPz).toBeCloseTo(120, 5);
    expect(ial.trabajador.antiguedadPz).toBeCloseTo(24, 5);
  });

  it('aplica la penalización por nómina fuera de plazo como 100 + 10 Pz por cada nómina retrasada', () => {
    expect(calcularPenalizacionFueraPlazo({ nominasFueraPlazo: 1 })).toBe(110);
    expect(calcularPenalizacionFueraPlazo({ nominasFueraPlazo: 3 })).toBe(130);
    expect(calcularPenalizacionFueraPlazo({ nominasFueraPlazo: 0 })).toBe(0);
  });
});
