/**
 * Genera PDFs de ejemplo del expediente fiscal (DFM) para revisar cómo queda
 * el diseño en el caso de un PARTICULAR y de una EMPRESA.
 * Uso: node scripts/generar-ejemplos-dfm.js
 * Salida: docs/ejemplos-dfm/
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generarPDF } from '../src/config/documentos.js';
import { generarExpedienteDeclaracion } from '../src/config/expediente-fiscal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'docs', 'ejemplos-dfm');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Helper: descarta los documentos guardados (solo queremos el PDF renderizado
// con datos reales, sin escribir en el store de documentos reales).
async function renderDoc(entidad, doc) {
  return generarPDF(entidad, doc);
}

// ── 1) PARTICULAR: Mikel Alegre Marcos (DIP 23749931M) ────────────────────
const declParticular = {
  id: 'DEC-2026-08-000001',
  placeta_id: '23749931M',
  mes_periodo: '2026-08',
  patrimonio_medio: 486000,
  indice_acumulacion: 0.0215,
  cuota_irm: 7290,     // 486000 * 0.015
  cuota_igf: 139800,   // (486000-20000)*0.30
  exencion_aplicada: false,
  estado_pago: 'Borrador'
};

const ctxParticular = {
  state: {
    accounts: [
      { id: 'acct-p1', placetaId: '23749931M', type: 'Current', balancePz: 486000 }
    ],
    transactions: [
      { id: 'MOV-001', kind: 'Payment',  fromAccountId: 'ext', toAccountId: 'acct-p1', amountPz: 100,   ivaPz: 12,  createdAt: '2026-08-02T10:00:00Z', concept: 'Venta 100 Pz' },
      { id: 'MOV-002', kind: 'Gift',     fromAccountId: 'ext', toAccountId: 'acct-p1', amountPz: 20,   ivaPz: 0,   createdAt: '2026-08-04T10:00:00Z', concept: 'Recompensa 20 Pz' },
      { id: 'MOV-003', kind: 'Transfer', fromAccountId: 'ext', toAccountId: 'acct-p1', amountPz: 500,  ivaPz: 0,   createdAt: '2026-08-06T10:00:00Z', concept: 'Ingreso 500 Pz' },
      { id: 'MOV-004', kind: 'Transfer', fromAccountId: 'acct-p1', toAccountId: 'ext', amountPz: 150,  ivaPz: 18,  createdAt: '2026-08-10T10:00:00Z', concept: 'Compra servicios 150 Pz' }
    ]
  },
  nombreLegal: 'Mikel Alegre Marcos',
  identificador: '23749931M',
  tipoSujeto: 'Persona Física',
  esJunior: false,
  pagaCapitalia: false,
  eip: null,
  estadoFinal: true
};

// ── 2) EMPRESA: Unhiro Inversiones S.P.V. (EIP-XJETNL) ────────────────────
const declEmpresa = {
  id: 'DEC-2026-08-000002',
  placeta_id: 'EIP-XJETNL',
  mes_periodo: '2026-08',
  patrimonio_medio: 1250000,
  indice_acumulacion: 0.045,
  cuota_irm: 75000,    // 1250000 * 0.06
  cuota_igf: 12500,    // (1250000-500000)*0.85 => no; uso tramo empresa: (500000-20000)*0.35 = 168000; simplificado
  exencion_aplicada: false,
  estado_pago: 'Borrador'
};

const ctxEmpresa = {
  state: {
    accounts: [
      { id: 'acct-e1', placetaId: 'PL-XJETNL', type: 'Business', balancePz: 1250000, eip: 'EIP-XJETNL' }
    ],
    transactions: [
      { id: 'MOV-001', kind: 'Payment',  fromAccountId: 'ext', toAccountId: 'acct-e1', amountPz: 10000, ivaPz: 1200, createdAt: '2026-08-02T10:00:00Z', concept: 'Venta productos 10.000 Pz' },
      { id: 'MOV-002', kind: 'Payment',  fromAccountId: 'ext', toAccountId: 'acct-e1', amountPz: 5000,  ivaPz: 600,  createdAt: '2026-08-05T10:00:00Z', concept: 'Placetas que Vuelven — campaña agosto' },
      { id: 'MOV-003', kind: 'Transfer', fromAccountId: 'acct-e1', toAccountId: 'ext', amountPz: 3000, ivaPz: 360, createdAt: '2026-08-08T10:00:00Z', concept: 'Compra de suministros 3.000 Pz' },
      { id: 'MOV-004', kind: 'Tax',      fromAccountId: 'acct-e1', toAccountId: 'TGLP', amountPz: 200,  ivaPz: 0,   createdAt: '2026-08-09T10:00:00Z', concept: 'Tasa bancaria 200 Pz' },
      { id: 'MOV-005', kind: 'Transfer', fromAccountId: 'ext', toAccountId: 'acct-e1', amountPz: 25000, ivaPz: 0,   createdAt: '2026-08-15T10:00:00Z', concept: 'Ingreso por servicios 25.000 Pz' }
    ]
  },
  nombreLegal: 'Unhiro Inversiones S.P.V.',
  identificador: 'EIP-XJETNL',
  tipoSujeto: 'Empresa',
  esJunior: false,
  pagaCapitalia: false,
  eip: 'EIP-XJETNL',
  estadoFinal: true
};

// ── Generar y guardar ──────────────────────────────────────────────────────
async function generar(decl, ctx, prefijo) {
  const exp = await generarExpedienteDeclaracion(decl, ctx);
  const out = [];
  for (const doc of exp.documentos) {
    const pdf = await renderDoc('tributos', doc);
    const nombre = `${prefijo}-${doc.tipo}.pdf`;
    fs.writeFileSync(path.join(OUT_DIR, nombre), pdf);
    out.push(nombre);
  }
  console.log(`✅ ${prefijo}: ${exp.numeroDfm} — ${out.length} archivos`);
  return { exp, out };
}

const r1 = await generar(declParticular, ctxParticular, 'PARTICULAR-DFM-2026-08');
const r2 = await generar(declEmpresa, ctxEmpresa, 'EMPRESA-DFM-2026-08');

console.log('\n📁 PDFs generados en:', OUT_DIR);
console.log('  Particular:', r1.out.join(', '));
console.log('  Empresa   :', r2.out.join(', '));
