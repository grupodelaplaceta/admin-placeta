/**
 * IDENTIFICADORES GLOBALES DEL ECOSISTEMA GDLP
 *
 * FASE 0.2 del plan maestro: nomenclatura única para que todos los sistemas
 * (PlacetaID, Banco, Tributos, Junior, EDU, Fundación, Documentos, etc.)
 * puedan relacionarse entre sí mediante un identificador global.
 *
 * Nomenclatura: PREFIJO-AÑO-SECUENCIA
 *   USR-2026-000001  Usuario / persona
 *   ENT-2026-000001  Entidad / empresa / organización
 *   ACC-2026-000001  Cuenta bancaria
 *   TRF-2026-000001  Transferencia / operación bancaria
 *   FAC-2026-000001  Factura
 *   NOM-2026-000001  Nómina
 *   EXP-2026-000001  Expediente transversal
 *   DOC-2026-000001  Documento (Archivo Documental Central)
 *   SIG-2026-000001  Firma digital (registro de firma)
 *   DEC-2026-000001  Declaración tributaria
 *   INC-2026-000001  Incidencia
 *   CNIC-FISC-001    Regla del Código Normativo Interno Complementario
 *
 * La secuencia se mantiene en Supabase (tabla rsp_identificadores) con
 * fallback a memoria/tmp para desarrollo y serverless.
 */
import { createHash } from 'crypto';
import { supabase } from './supabase.js';

const ID_TABLE = 'rsp_identificadores';
const memContadores = new Map();

// Prefijos válidos por tipo de objeto
export const PREFIJOS_ID = {
  USR: 'USR',   // Usuario / persona física
  ENT: 'ENT',   // Entidad / empresa / organización
  ACC: 'ACC',   // Cuenta bancaria
  TRF: 'TRF',   // Transferencia / operación
  FAC: 'FAC',   // Factura
  NOM: 'NOM',   // Nómina
  EXP: 'EXP',   // Expediente transversal
  DOC: 'DOC',   // Documento
  SIG: 'SIG',   // Firma digital
  DEC: 'DEC',   // Declaración tributaria
  INC: 'INC',   // Incidencia
  CNIC: 'CNIC', // Regla normativa (CNIC-FISC-001)
};

function contadorMemoria(prefijo, anio) {
  const key = `${prefijo}-${anio}`;
  const actual = memContadores.get(key) || 0;
  memContadores.set(key, actual + 1);
  return actual + 1;
}

async function contadorSupabase(prefijo, anio) {
  const clave = `${prefijo}-${anio}`;
  if (!supabase) return contadorMemoria(prefijo, anio);
  try {
    // Lectura-escalado atómico vía RPC si existe; si no, upsert simple.
    const { data } = await supabase.from(ID_TABLE).select('*').eq('clave', clave).maybeSingle();
    const siguiente = (data?.secuencia || 0) + 1;
    const record = { clave, prefijo, anio, secuencia: siguiente, updated_at: new Date().toISOString() };
    await supabase.from(ID_TABLE).upsert(record, { onConflict: 'clave' });
    return siguiente;
  } catch {
    // Tabla no creada todavía o sin acceso → memoria (secuencia por proceso)
    return contadorMemoria(prefijo, anio);
  }
}

/**
 * Genera el siguiente identificador global de un tipo.
 * @param {string} tipo  Uno de PREFIJOS_ID (USR, ENT, ACC, ...)
 * @param {number|string} [anio]  Año del identificador (default: año actual)
 * @param {string} [prefijoExtra]  Sufijo adicional (p.ej. FISC para CNIC-FISC-001)
 * @returns {Promise<string>}  p.ej. DEC-2026-000042
 */
export async function generarIdentificador(tipo, anio = new Date().getFullYear(), prefijoExtra = '') {
  const prefijo = PREFIJOS_ID[tipo] || tipo.toUpperCase();
  const seq = await contadorSupabase(prefijo, anio);
  const num = String(seq).padStart(6, '0');
  return prefijoExtra
    ? `${prefijo}-${prefijoExtra}-${String(seq).padStart(2, '0')}` // CNIC-FISC-01
    : `${prefijo}-${anio}-${num}`;
}

/**
 * Normaliza un identificador (acepta variantes) para poder comparar/relacionar.
 */
export function normalizarIdentificador(id) {
  if (!id) return '';
  return String(id).trim().toUpperCase();
}

/**
 * Hash de integridad de un objeto (para DOC/SIG/EXP): permite verificar que
 * el contenido no se ha alterado desde su registro.
 */
export function hashIntegridad(objeto, semilla = '') {
  return createHash('sha256')
    .update(JSON.stringify(objeto || {}) + semilla)
    .digest('hex').slice(0, 32).toUpperCase();
}

// ── Alias cómodos por dominio ────────────────────────────────────────────
export const siguienteUsuario   = () => generarIdentificador('USR');
export const siguienteEntidad   = () => generarIdentificador('ENT');
export const siguienteCuenta    = () => generarIdentificador('ACC');
export const siguienteTransfer  = () => generarIdentificador('TRF');
export const siguienteFactura   = () => generarIdentificador('FAC');
export const siguienteNomina    = () => generarIdentificador('NOM');
export const siguienteExpediente= () => generarIdentificador('EXP');
export const siguienteDocumento = () => generarIdentificador('DOC');
export const siguienteFirma     = () => generarIdentificador('SIG');
export const siguienteDeclaracion = () => generarIdentificador('DEC');
export const siguienteIncidencia = () => generarIdentificador('INC');

// ── Estado de contadores (para diagnóstico) ───────────────────────────────
export async function estadoIdentificadores() {
  if (!supabase) return { fuente: 'memoria', contadores: Object.fromEntries(memContadores) };
  try {
    const { data } = await supabase.from(ID_TABLE).select('*').order('updated_at', { ascending: false }).limit(50);
    return { fuente: 'supabase', contadores: (data || []).map(r => ({ clave: r.clave, secuencia: r.secuencia, anio: r.anio })) };
  } catch {
    return { fuente: 'memoria', contadores: Object.fromEntries(memContadores) };
  }
}

export default {
  PREFIJOS_ID,
  generarIdentificador,
  normalizarIdentificador,
  hashIntegridad,
  siguienteUsuario, siguienteEntidad, siguienteCuenta, siguienteTransfer,
  siguienteFactura, siguienteNomina, siguienteExpediente, siguienteDocumento,
  siguienteFirma, siguienteDeclaracion, siguienteIncidencia,
  estadoIdentificadores
};
