/**
 * MOTOR NORMATIVO CNIC — Código Normativo Interno Complementario
 *
 * FASE 9 / 23 del plan maestro. Reglas configurables versionadas.
 *
 * Principios:
 *   - NUNCA se modifica una versión vigente: se crea una nueva versión.
 *   - Cada regla tiene código, nombre, tipo, valor, versión, estado,
 *     fechas de vigencia, sistemas afectados, autor, aprobadores.
 *   - Flujo de vida: borrador → validacion → aprobado → programado →
 *     vigente → historico.
 *   - Reglas críticas (impuestos, tipos, RBU, bonificaciones, límites,
 *     menores, contabilidad, declaraciones) requieren doble aprobación:
 *     Administrador 1 propone, Administrador 2 aprueba.
 *   - Cada operación debe almacenar la regla aplicada (CNIC-FISC-001 v4).
 *   - "Simular cambio": antes de publicar se calcula qué declaraciones,
 *     operaciones, usuarios y servicios se verían afectados.
 */

import { supabase } from './supabase.js';
import { generarIdentificador, hashIntegridad } from './identificadores.js';

const TABLA = 'rsp_cnic';
const memCNIC = new Map();

// ── Estados del ciclo de vida ────────────────────────────────────────────
export const ESTADOS_CNIC = [
  'borrador',      // creación / edición
  'validacion',    // se está validando
  'aprobado',      // aprobado (doble aprobación si crítica)
  'programado',    // con fecha de entrada en vigor futura
  'vigente',       // en vigor (único por código)
  'historico',     // sustituido por una versión posterior
];

// ── Tipos de regla ───────────────────────────────────────────────────────
export const TIPOS_CNIC = {
  impuesto: { label: 'Impuesto', critica: true, sistemas: ['tributos', 'banco', 'declaraciones'] },
  limite: { label: 'Límite de capital', critica: true, sistemas: ['banco'] },
  rbu: { label: 'RBU', critica: true, sistemas: ['fundacion', 'banco'] },
  bonificacion: { label: 'Bonificación fiscal', critica: true, sistemas: ['tributos', 'junior'] },
  contable: { label: 'Contabilidad', critica: true, sistemas: ['contabilidad', 'rsp'] },
  declaracion: { label: 'Declaración', critica: true, sistemas: ['declaraciones', 'tributos'] },
  menor: { label: 'Menores / Junior', critica: true, sistemas: ['junior', 'fundacion'] },
  desgravacion: { label: 'Desgravación fiscal', critica: false, sistemas: ['tributos', 'banco'] },
  retribucion: { label: 'Retribución', critica: false, sistemas: ['fundacion', 'tributos', 'banco'] },
  otro: { label: 'Otra', critica: false, sistemas: [] },
};

const memContador = { seq: 0 };

// ── Helpers de persistencia ──────────────────────────────────────────────
async function listarDB() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from(TABLA).select('*').order('codigo', { ascending: true });
    return data || [];
  } catch { return null; }
}

async function getDB(id) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle();
    return data;
  } catch { return null; }
}

async function getByCodigoDB(codigo) {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from(TABLA).select('*').eq('codigo', codigo).order('version', { ascending: false }).limit(1).maybeSingle();
    return data;
  } catch { return null; }
}

async function upsertDB(regla) {
  if (!supabase) return false;
  try {
    await supabase.from(TABLA).upsert(regla, { onConflict: 'id' });
    return true;
  } catch { return false; }
}

// ── API pública ──────────────────────────────────────────────────────────

/** Lista todas las reglas (de Supabase si hay, si no de memoria) */
export async function listarCNIC() {
  const db = await listarDB();
  if (db && db.length > 0) {
    db.forEach(r => memCNIC.set(r.id, r));
    return db;
  }
  return [...memCNIC.values()];
}

/** Obtiene una regla por id */
export async function getCNIC(id) {
  const db = await getDB(id);
  if (db) { memCNIC.set(id, db); return db; }
  return memCNIC.get(id) || null;
}

/** Obtiene la última versión de un código */
export async function getUltimaVersion(codigo) {
  const db = await getByCodigoDB(codigo);
  if (db) return db;
  const todas = [...memCNIC.values()].filter(r => r.codigo === codigo).sort((a, b) => b.version - a.version);
  return todas[0] || null;
}

/** Obtiene la versión VIGENTE de un código */
export async function getVigente(codigo) {
  const db = await listarDB();
  const todas = db && db.length > 0 ? db : [...memCNIC.values()];
  const vigente = todas.filter(r => r.codigo === codigo && r.estado === 'vigente')
    .sort((a, b) => b.version - a.version)[0];
  return vigente || null;
}

/** Obtiene todas las versiones de un código */
export async function getVersiones(codigo) {
  const db = await listarDB();
  const todas = db && db.length > 0 ? db : [...memCNIC.values()];
  return todas.filter(r => r.codigo === codigo).sort((a, b) => b.version - a.version);
}

/** Crea una regla nueva (borrador, versión 1) */
export async function crearCNIC(datos, autor = {}) {
  const codigo = String(datos.codigo || '').trim().toUpperCase();
  if (!codigo) throw new Error('El código CNIC es obligatorio (p.ej. CNIC-FISC-001)');
  if (!datos.nombre) throw new Error('El nombre es obligatorio');

  // Si ya existe una regla con ese código → crear nueva versión
  const existente = await getUltimaVersion(codigo);
  if (existente) {
    return nuevaVersionCNIC(codigo, datos, autor);
  }

  // Secuencia CNIC-FISC-001
  const tipo = datos.tipo || 'otro';
  const seq = ++memContador.seq;
  const extra = datos.prefijoExtra || 'FISC';
  const idFinal = `CNIC-${extra}-${String(seq).padStart(3, '0')}`;

  const regla = {
    id: idFinal,
    codigo,
    nombre: datos.nombre,
    descripcion: datos.descripcion || '',
    tipo,
    ambito: datos.ambito || 'general',
    valor: datos.valor || { tipo: 'texto', valor: '', unidad: '' },
    version: 1,
    estado: 'borrador',
    fecha_entrada_vigor: datos.fecha_entrada_vigor || null,
    fecha_fin_vigor: datos.fecha_fin_vigor || null,
    autor_dip: autor.dip || datos.autor_dip || null,
    autor_nombre: autor.nombre || datos.autor_nombre || null,
    proponente_dip: autor.dip || datos.proponente_dip || null,
    aprobador_dip: null,
    aprobador_nombre: null,
    critica: !!datos.critica || !!TIPOS_CNIC[tipo]?.critica,
    sistemas_afectados: datos.sistemas_afectados || TIPOS_CNIC[tipo]?.sistemas || [],
    version_anterior_id: null,
    historial: [{ estado: 'borrador', fecha: new Date().toISOString(), autor: autor.nombre || 'sistema', motivo: 'Creación' }],
    notas_cambio: datos.notas_cambio || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  memCNIC.set(regla.id, regla);
  await upsertDB(regla);
  return regla;
}

/** Crea una NUEVA VERSIÓN de una regla existente (nunca se modifica la vigente) */
export async function nuevaVersionCNIC(codigo, datos, autor = {}) {
  const actual = await getUltimaVersion(codigo);
  if (!actual) return crearCNIC({ ...datos, codigo }, autor);

  const tipo = datos.tipo || actual.tipo || 'otro';
  const nueva = {
    ...actual,
    id: `${actual.codigo}-v${actual.version + 1}-${Date.now().toString(36)}`,
    version: actual.version + 1,
    estado: 'borrador',
    nombre: datos.nombre || actual.nombre,
    descripcion: datos.descripcion ?? actual.descripcion,
    valor: datos.valor ?? actual.valor,
    ambito: datos.ambito || actual.ambito,
    fecha_entrada_vigor: datos.fecha_entrada_vigor ?? actual.fecha_entrada_vigor,
    fecha_fin_vigor: datos.fecha_fin_vigor ?? actual.fecha_fin_vigor,
    autor_dip: autor.dip || actual.autor_dip,
    autor_nombre: autor.nombre || actual.autor_nombre,
    proponente_dip: autor.dip || actual.proponente_dip,
    aprobador_dip: null,
    aprobador_nombre: null,
    critica: !!datos.critica || !!TIPOS_CNIC[tipo]?.critica,
    sistemas_afectados: datos.sistemas_afectados || actual.sistemas_afectados || [],
    version_anterior_id: actual.id,
    historial: [...(actual.historial || []), { version: actual.version + 1, estado: 'borrador', fecha: new Date().toISOString(), autor: autor.nombre || 'sistema', motivo: 'Nueva versión' }],
    notas_cambio: datos.notas_cambio || '',
    updated_at: new Date().toISOString(),
  };
  delete nueva.id_anterior;

  // La anterior deja de ser vigente si lo era
  if (actual.estado === 'vigente') {
    actual.estado = 'historico';
    actual.updated_at = new Date().toISOString();
    memCNIC.set(actual.id, actual);
    await upsertDB(actual);
  }

  memCNIC.set(nueva.id, nueva);
  await upsertDB(nueva);
  return nueva;
}

/** Transición de estado con validación */
export async function cambiarEstadoCNIC(id, nuevoEstado, actor = {}, motivo = '') {
  const regla = await getCNIC(id);
  if (!regla) throw new Error('Regla no encontrada');
  if (!ESTADOS_CNIC.includes(nuevoEstado)) throw new Error(`Estado inválido: ${nuevoEstado}`);

  const transiciones = {
    borrador: ['validacion'],
    validacion: ['aprobado', 'borrador'],
    aprobado: ['programado', 'borrador', 'vigente'],
    programado: ['vigente', 'borrador', 'aprobado'],
    vigente: ['historico', 'programado'],
    historico: [],
  };
  if (!transiciones[regla.estado]?.includes(nuevoEstado)) {
    throw new Error(`Transición no permitida: ${regla.estado} → ${nuevoEstado}`);
  }

  // Doble aprobación para reglas críticas: aprobador debe ser distinto del proponente
  if (nuevoEstado === 'aprobado' && regla.critica) {
    if (!actor.dip) throw new Error('Regla crítica: se requiere un aprobador (Administrador 2)');
    if (actor.dip === regla.proponente_dip) throw new Error('Regla crítica: el aprobador no puede ser el mismo que propuso (Administrador 1 ≠ Administrador 2)');
    regla.aprobador_dip = actor.dip;
    regla.aprobador_nombre = actor.nombre || actor.dip;
  }

  // Al pasar a vigente, si hay otra vigente del mismo código → se archiva
  if (nuevoEstado === 'vigente') {
    const otras = await getVersiones(regla.codigo);
    for (const otra of otras) {
      if (otra.id !== regla.id && otra.estado === 'vigente') {
        otra.estado = 'historico';
        otra.updated_at = new Date().toISOString();
        memCNIC.set(otra.id, otra);
        await upsertDB(otra);
      }
    }
  }

  regla.estado = nuevoEstado;
  regla.historial = [...(regla.historial || []), { estado: nuevoEstado, fecha: new Date().toISOString(), autor: actor.nombre || 'sistema', dip: actor.dip || '', motivo }];
  regla.updated_at = new Date().toISOString();
  memCNIC.set(regla.id, regla);
  await upsertDB(regla);
  return regla;
}

/** Edita campos de una regla (solo en borrador/validacion) */
export async function editarCNIC(id, cambios, actor = {}) {
  const regla = await getCNIC(id);
  if (!regla) throw new Error('Regla no encontrada');
  if (!['borrador', 'validacion'].includes(regla.estado)) {
    throw new Error('Solo se puede editar una regla en estado borrador o validación. Crea una nueva versión.');
  }
  const permitidos = ['nombre', 'descripcion', 'tipo', 'ambito', 'valor', 'fecha_entrada_vigor', 'fecha_fin_vigor', 'sistemas_afectados', 'notas_cambio', 'critica'];
  for (const k of permitidos) {
    if (cambios[k] !== undefined) regla[k] = cambios[k];
  }
  regla.updated_at = new Date().toISOString();
  memCNIC.set(regla.id, regla);
  await upsertDB(regla);
  return regla;
}

/**
 * SIMULAR CAMBIO — calcula el impacto de una regla sin publicarla.
 * Devuelve qué declaraciones, operaciones, usuarios y servicios se verían
 * afectados, y qué importes cambiarían.
 */
export async function simularCambioCNIC(id, ctx = {}) {
  const regla = await getCNIC(id);
  if (!regla) throw new Error('Regla no encontrada');

  // ctx.operaciones / ctx.declaraciones: datos de muestra o reales
  const operaciones = ctx.operaciones || [];
  const declaraciones = ctx.declaraciones || [];
  const usuariosAfectados = new Set();
  const serviciosAfectados = new Set([...(regla.sistemas_afectados || [])]);
  let importeCambiaria = 0;

  // Estimar impacto en operaciones cuyo concepto/importe coincida con el ámbito
  for (const op of operaciones) {
    const afecta = op.servicio && serviciosAfectados.has(op.servicio);
    if (afecta) {
      usuariosAfectados.add(op.usuario_dip || '');
      importeCambiaria += op.importe || 0;
    }
  }
  // Estimar impacto en declaraciones
  for (const d of declaraciones) {
    const afecta = d.servicio && serviciosAfectados.has(d.servicio);
    if (afecta) {
      usuariosAfectados.add(d.dip || '');
      importeCambiaria += d.cuota || 0;
    }
  }

  return {
    regla: { codigo: regla.codigo, nombre: regla.nombre, version: regla.version, estado: regla.estado, valor: regla.valor },
    serviciosAfectados: [...serviciosAfectados],
    usuariosAfectados: [...usuariosAfectados].filter(Boolean),
    numOperacionesAfectadas: operaciones.length,
    numDeclaracionesAfectadas: declaraciones.length,
    importeEstimadoCambio: Math.round(importeCambiaria * 100) / 100,
    reglaAnterior: regla.version_anterior_id ? await getCNIC(regla.version_anterior_id) : null,
  };
}

/**
 * Aplica el motor normativo: devuelve la regla vigente para un código en una fecha.
 * Conecta con normativa.js para que los cálculos usen CNIC.
 */
export async function getReglaVigente(codigo, fecha = new Date().toISOString()) {
  const vigente = await getVigente(codigo);
  if (!vigente) return null;
  const f = fecha.slice(0, 10);
  if (vigente.fecha_entrada_vigor && f < vigente.fecha_entrada_vigor.slice(0, 10)) return null;
  if (vigente.fecha_fin_vigor && f > vigente.fecha_fin_vigor.slice(0, 10)) return null;
  return vigente;
}

/** Resuelve el valor numérico de una regla (porcentaje o importe) */
export function valorCNIC(regla) {
  if (!regla?.valor) return null;
  const v = regla.valor;
  if (v.tipo === 'porcentaje') return Number(v.valor) / 100;
  if (v.tipo === 'importe') return Number(v.valor);
  return v.valor;
}

/** Hash de integridad de una regla */
export function hashCNIC(regla) {
  return hashIntegridad({ codigo: regla.codigo, version: regla.version, valor: regla.valor, estado: regla.estado }, 'CNIC');
}

/** Estado y diagnóstico */
export async function estadoCNIC() {
  const db = await listarDB();
  const todas = db && db.length > 0 ? db : [...memCNIC.values()];
  return {
    total: todas.length,
    porEstado: Object.fromEntries(ESTADOS_CNIC.map(e => [e, todas.filter(r => r.estado === e).length])),
    vigentes: todas.filter(r => r.estado === 'vigente').map(r => ({ codigo: r.codigo, version: r.version, nombre: r.nombre })),
    fuente: db && db.length > 0 ? 'supabase' : 'memoria',
  };
}

export default {
  ESTADOS_CNIC, TIPOS_CNIC,
  listarCNIC, getCNIC, getUltimaVersion, getVigente, getVersiones,
  crearCNIC, nuevaVersionCNIC, cambiarEstadoCNIC, editarCNIC,
  simularCambioCNIC, getReglaVigente, valorCNIC, hashCNIC, estadoCNIC,
};
