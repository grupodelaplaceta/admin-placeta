import { describe, expect, it } from 'vitest';
import { getEntidadesPermitidas, tienePermiso } from '../auth/permisos';
import { esAccionCritica } from '../types';

describe('RBAC en cliente (sin superadmins hardcodeados)', () => {
  it('un operador RSP solo accede a rsp', () => {
    expect(getEntidadesPermitidas(['rsp_operador'])).toEqual(['rsp']);
  });

  it('superadmin accede a todas las entidades', () => {
    const entidades = getEntidadesPermitidas(['superadmin']);
    expect(entidades).toContain('banco');
    expect(entidades).toContain('junior');
  });

  it('operador puede ver pero NO gestionar trámites', () => {
    expect(tienePermiso(['rsp_operador'], 'rsp', 'ver_tramites')).toBe(true);
    expect(tienePermiso(['rsp_operador'], 'rsp', 'gestionar_tramites')).toBe(false);
  });

  it('admin RSP puede gestionar trámites', () => {
    expect(tienePermiso(['rsp_admin'], 'rsp', 'gestionar_tramites')).toBe(true);
  });
});

describe('Acciones críticas (2FA)', () => {
  it('aprobar exige 2FA', () => {
    expect(esAccionCritica('aprobar')).toBe(true);
  });

  it('aportar_documentos no exige 2FA', () => {
    expect(esAccionCritica('aportar_documentos')).toBe(false);
  });
});
