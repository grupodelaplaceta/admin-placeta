// Diagnóstico: datos reales del banco para empresas y personas
import { apiBancoGetState } from '../src/config/db.js';

const state = await apiBancoGetState();
const cuentas = state?.accounts || [];
console.log('TOTAL CUENTAS:', cuentas.length);
console.log('TOTAL TRANSACCIONES:', (state?.transactions || []).length);

const empresas = cuentas.filter(c => c.type === 'Business' || c.type === 'State');
console.log('\n=== EMPRESAS REALES ===');
for (const c of empresas) {
  console.log(c.id, '|', String(c.displayName || '').slice(0, 45), '| tipo:', c.type, '| EIP:', c.eip, '| saldo:', c.balancePz, '| placetaId:', c.placetaId);
}

console.log('\n=== PERSONAS (muestra) ===');
const personas = cuentas.filter(c => c.type !== 'Business' && c.type !== 'State' && c.type !== 'Child');
for (const c of personas.slice(0, 15)) {
  console.log(c.id, '|', String(c.displayName || '').slice(0, 45), '| tipo:', c.type, '| saldo:', c.balancePz, '| placetaId:', c.placetaId);
}

console.log('\n=== JUNIORS ===');
const childs = cuentas.filter(c => c.type === 'Child');
for (const c of childs.slice(0, 10)) {
  console.log(c.id, '|', String(c.displayName || '').slice(0, 45), '| tipo:', c.type, '| saldo:', c.balancePz, '| placetaId:', c.placetaId);
}
