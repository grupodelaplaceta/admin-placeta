import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
const url = (env.match(/^SUPABASE_URL=(.+)$/m) || [])[1];
const key = (env.match(/^SUPABASE_SERVICE_KEY=(.+)$/m) || [])[1];
if (!url || !key) { console.log('NO_CREDS'); process.exit(0); }

const COLUMNAS_DECLARACION = new Set([
  'id', 'contributor_id', 'placeta_id', 'mes_periodo', 'cuenta_id_blp',
  'patrimonio_medio', 'indice_acumulacion', 'cuota_irm', 'cuota_igf',
  'exencion_aplicada', 'dias_declarados_banco', 'dias_reconstruidos_crm',
  'dias_activos_mes', 'pdf_hash', 'estado_pago', 'bypass_junta_directiva',
  'id_permiso_junta', 'is_rectified', 'created_at', 'updated_at'
]);
const filtrar = (obj) => { const o = {}; for (const [k, v] of Object.entries(obj||{})) { if (COLUMNAS_DECLARACION.has(k)) o[k] = v; } return o; };

const prueba = filtrar({
  id: 'DEC-TESTSCHEMA-01', placeta_id: 'TEST-SCHEMA-CHECK-2', mes_periodo: '2026-08', cuenta_id_blp: 'TEST',
  patrimonio_medio: 123, indice_acumulacion: 0.001, cuota_irm: 10, cuota_igf: 5,
  estado_pago: 'Borrador', exencion_aplicada: false, dias_declarados_banco: 31, dias_activos_mes: 31,
  eip: null, iva_exento_empresa: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
});
console.log('Columnas tras filtrar:', Object.keys(prueba).join(', '));

const r2 = await fetch(url.replace(/\/+$/, '') + '/rest/v1/tributos_declaraciones', {
  method: 'POST',
  headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify(prueba)
});
console.log('INSERT status:', r2.status);
console.log('INSERT respuesta:', (await r2.text()).slice(0, 300));

if (r2.status >= 200 && r2.status < 300) {
  const del = await fetch(url.replace(/\/+$/, '') + '/rest/v1/tributos_declaraciones?placeta_id=eq.TEST-SCHEMA-CHECK-2', {
    method: 'DELETE', headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  console.log('DELETE status:', del.status);
}
