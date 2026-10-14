import { describe, expect, it } from 'vitest';
import { mockProvider } from '../api/mock';

describe('códigos Junior demo', () => {
  it('marca y elimina un código demo', async () => {
    const codigo = await mockProvider.crearCodigoJunior({ tipo: 'recarga', valor: 10, demo: true });
    expect(codigo.demo).toBe(true);
    await mockProvider.accionCodigoJunior(codigo.id, 'eliminar');
    expect((await mockProvider.listarCodigosJunior()).some(c => c.id === codigo.id)).toBe(false);
  });

  it('no permite eliminar códigos reales', async () => {
    const codigo = await mockProvider.crearCodigoJunior({ tipo: 'recarga', valor: 10 });
    await expect(mockProvider.accionCodigoJunior(codigo.id, 'eliminar')).rejects.toThrow('Solo se pueden eliminar');
    await mockProvider.accionCodigoJunior(codigo.id, 'revocar');
  });
});
