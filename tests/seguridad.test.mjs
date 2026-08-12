/**
 * Tests de seguridad / scoping (FASE 11.3)
 * ----------------------------------------
 * Verifican que las reglas de seguridad se mantienen (fail-closed, scoping
 * por propietario, sin bulk data). Algunos son estáticos (inspeccionan el
 * código fuente) y otros de lógica (módulos).
 * Ejecutar: node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..');

test('2FA: acciones críticas exigen verificación', async () => {
  const { exigir2FA } = await import('../src/config/dosfa.js');
  assert.equal(exigir2FA('aprobar'), true);
  assert.equal(exigir2FA('autorizar'), true);
  assert.equal(exigir2FA('rechazar'), true);
  assert.equal(exigir2FA('aportar_documentos'), false, 'las acciones no críticas no deben exigir 2FA');
});

test('2FA: fail-closed sin configuración (código no puede validar)', async () => {
  const mod = await import('../src/config/dosfa.js');
  const prev = process.env.RSP_2FA_CODE;
  delete process.env.RSP_2FA_CODE;
  try {
    assert.equal(await mod.verificarCodigo({}, 'cualquier'), false, 'sin RSP_2FA_CODE la verificación debe fallar (fail-closed)');
  } finally {
    if (prev) process.env.RSP_2FA_CODE = prev;
  }
});

test('Normativa BOP: catálogo apunta a códigos reales y devuelve números', async () => {
  const mod = await import('../src/config/normativa-dinamica.js');
  assert.equal(mod.CATALOGO.IVA.codigo, 'CNIC-IVA', 'el IVA debe leerse del CNIC real');
  assert.equal(mod.CATALOGO.LIMITE_PERSONAL.codigo, 'CNIC-LIMITE-CAPITAL-PERSONAL');
  await mod.cargarSnapshot();
  for (const k of ['IVA', 'LIMITE_PERSONAL', 'SMI']) {
    const v = mod.getSnapshot(k);
    assert.equal(typeof v, 'number', `${k} debe ser numérico, recibido: ${typeof v} (${v})`);
  }
});

test('Scoping: gdlp-crm no monta /api/bancario-proxy (brecha cerrada)', () => {
  const server = fs.readFileSync(path.resolve(repo, '../gdlp-crm/server.js'), 'utf8');
  assert.ok(!server.includes("app.use('/api/bancario-proxy'"), 'no debe existir el montaje de bancario-proxy');
  assert.ok(!server.includes('bancarioProxyRoutes'), 'no debe importarse bancario-proxy');
});

test('Scoping: gdlp-crm impuestos-irm valida propiedad (fix IDOR)', () => {
  const fiscal = fs.readFileSync(path.resolve(repo, '../gdlp-crm/src/routes/fiscal.js'), 'utf8');
  assert.ok(fiscal.includes('esPropio'), 'debe existir la comprobación de propiedad');
  assert.ok(fiscal.includes('403'), 'debe devolver 403 cuando no es propietario/gestor');
});

test('Scoping: gdlp-crm no contiene la clave del banco en el código', () => {
  const files = ['junior-academy.js', 'junior-admin.js', 'junior-auth.js', 'junior-mgmt.js', 'tributos.js', 'services/bankApi.js'];
  for (const f of files) {
    const p = path.resolve(repo, '../gdlp-crm/src/routes', f);
    if (fs.existsSync(p)) {
      const src = fs.readFileSync(p, 'utf8');
      assert.ok(!src.includes('crm-gdlp-shared-key-2026'), `${f} no debe contener la clave del banco hardcodeada`);
    }
  }
});

test('Trámites: subsanación genera checklist (FASE 8.1)', async () => {
  const mod = await import('../src/config/tramites.js');
  assert.equal(typeof mod.PLAZOS_DEFECTO, 'object', 'deben existir plazos por defecto');
  assert.ok(mod.PLAZOS_DEFECTO.revision > 0);
  assert.equal(mod.getSilencioTipo('subvencion'), 'negativo', 'sin silencio positivo por defecto');
  assert.ok(mod.ESTADOS.includes('subsanacion'));
});
