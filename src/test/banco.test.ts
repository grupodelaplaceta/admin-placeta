import { describe, expect, it } from 'vitest';
import { mockProvider } from '../api/mock';

describe('reglas de cierre de cuentas bancarias (mock)', () => {
  it('rechaza cerrar una cuenta personal con capital sin motivo', async () => {
    const cuentas = await mockProvider.listarCuentas();
    const mikel = cuentas.find((c) => c.id === 'acc-1765153714103')!;
    await expect(mockProvider.accionCuenta(mikel.id, 'cerrar')).rejects.toThrow(/personales con capital/i);
  });

  it('permite cerrar una cuenta personal con capital por baja o herencia', async () => {
    const cuentas = await mockProvider.listarCuentas();
    const uriel = cuentas.find((c) => c.dip === '45134577U')!;
    await expect(mockProvider.accionCuenta(uriel.id, 'cerrar', { motivo: 'baja' })).resolves.toBeUndefined();
    const after = await mockProvider.listarCuentas();
    expect(after.find((c) => c.id === uriel.id)!.estado).toBe('cerrada');
  });

  it('obliga a repartir antes de cerrar una empresa con fondos', async () => {
    await expect(mockProvider.accionCuenta('acc-co-1765320068081', 'cerrar')).rejects.toThrow(/Reparte antes/i);
  });

  it('reparte los fondos conforme al % y luego permite cerrar la empresa', async () => {
    const antes = await mockProvider.listarCuentas();
    const mikel = antes.find((c) => c.id === 'acc-1765153714103')!;
    const unai = antes.find((c) => c.dip === '72583347U')!;
    const mikelAntes = mikel.saldo;
    const unaiAntes = unai.saldo;

    await mockProvider.repartirCuenta('acc-co-1765320068081');

    const despues = await mockProvider.listarCuentas();
    const red = despues.find((c) => c.id === 'acc-co-1765320068081')!;
    expect(red.saldo).toBe(0);

    // Red del Grupo: Mikel 60% · Unai 40% (18.421,83 Pz)
    const mikelDespues = despues.find((c) => c.id === 'acc-1765153714103')!.saldo;
    const unaiDespues = despues.find((c) => c.dip === '72583347U')!.saldo;
    expect(mikelDespues - mikelAntes).toBeCloseTo(18421.83 * 0.6, 2);
    expect(unaiDespues - unaiAntes).toBeCloseTo(18421.83 * 0.4, 2);

    await expect(mockProvider.accionCuenta(red.id, 'cerrar')).resolves.toBeUndefined();
  });

  it('impide cerrar y repartir una fundación', async () => {
    await expect(mockProvider.accionCuenta('FUND-BLP', 'cerrar')).rejects.toThrow(/fundaciones/i);
    await expect(mockProvider.repartirCuenta('FUND-BLP')).rejects.toThrow(/fundaciones/i);
  });

  it('cambia el tipo de cuenta y permite abrir cuentas nuevas', async () => {
    const cuentas = await mockProvider.listarCuentas();
    const salma = cuentas.find((c) => c.dip === '20521220S')!;
    await mockProvider.cambiarTipoCuenta(salma.id, 'Savings');
    const afterTipo = await mockProvider.listarCuentas();
    expect(afterTipo.find((c) => c.id === salma.id)!.tipo).toBe('Savings');

    const nueva = await mockProvider.abrirCuenta({ nombre: 'Cuenta Test', dip: '23749931M', tipo: 'Current', saldoInicial: 100 });
    expect(nueva.saldo).toBe(100);
    expect((await mockProvider.listarCuentas()).some((c) => c.id === nueva.id)).toBe(true);
  });

  it('permite fijar límites y congelar tarjetas', async () => {
    await mockProvider.establecerLimiteTarjeta('card-acc-1765153714103', { contactlessLimitPz: 750, weeklyLimitPz: 1500 });
    await mockProvider.congelarTarjeta('card-acc-1765153714103', true);
    const tarjetas = await mockProvider.listarTarjetas();
    const t = tarjetas.find((x) => x.id === 'card-acc-1765153714103')!;
    expect(t.contactlessLimitPz).toBe(750);
    expect(t.weeklyLimitPz).toBe(1500);
    expect(t.frozen).toBe(true);
  });
});
