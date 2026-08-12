/**
 * FISCALIDAD AMPLIADA — Puntos 1, 8, 9, 10-12, 17-21 del plan maestro
 *
 * 1. Límite de capital personal 500.000 Pz con BLOQUEO PREVENTIVO:
 *    - Superar el límite no es infracción automática.
 *    - Se produce bloqueo preventivo de la cuenta.
 *    - El titular tiene 15 días naturales para justificar el exceso.
 *    - Si justifica → desbloqueo. Si no → se retira SOLO el excedente,
 *      dejando la cuenta en 500.000 Pz (regularización, no multa).
 *    - Se eliminan las antiguas multas de 10.000.000 / 225.000 Pz.
 *
 * 8. Desgravación del IVA: 6% del IVA efectivamente abonado genera una
 *    desgravación fiscal. Ej: 1.000 + 120 IVA → desgravación 7,20 Pz.
 *    NO se devuelve el IVA; es crédito/desgravación fiscal.
 *
 * 9. Desgravaciones por donaciones a entidades reconocidas (Fundación,
 *    proyectos sociales, educación...). El crédito nunca produce cuota
 *    tributaria negativa ni devolución superior a los impuestos.
 *
 * 10-12. Retribución hasta 250 Pz/mes para propietarios sin remuneración:
 *    - 250 × % participación. Máx personal 250 Pz/mes aunque participe en
 *      varias entidades.
 *    - No es dividendo ni salario: retribución/ayuda social de Tributos.
 *    - Coste económico: Fundación (Fondo de Apoyo a la Participación
 *      Económica y Social). Pago: Tributos → Banco → usuario.
 *
 * 17-21. Bajas/altas, DIP, PlacetaID, herencias, fondos sin heredero,
 *    participaciones sin heredero.
 *
 * Persistencia: rsp_limite_bloqueos, rsp_retribuciones, rsp_desgravaciones.
 */

import { supabase } from './supabase.js';
import { generarIdentificador } from './identificadores.js';

const T_BLOQUEOS = 'rsp_limite_bloqueos';
const T_RETRIBUCIONES = 'rsp_retribuciones';
const T_DESGRAVACIONES = 'rsp_desgravaciones';
const T_PATRIMONIO_AFECTO = 'rsp_patrimonio_afecto';

const memBloqueos = [];
const memRetribuciones = [];
const memDesgravaciones = [];
const memPatrimonioAfecto = [];

export const LIMITE_PERSONAL = 500000;
export const DIAS_JUSTIFICACION = 15;
export const PORCENTAJE_DESGRAVACION_IVA = 6;       // 6% del IVA abonado
export const MAX_RETRIBUCION_MENSUAL = 250;          // Pz/mes máx por persona
export const IVA_TIPO = 0.12;

// ── 1. LÍMITE DE CAPITAL 500K / BLOQUEO PREVENTIVO ───────────────────────
export async function listarBloqueos(filtros = {}) {
  if (supabase) {
    try {
      let q = supabase.from(T_BLOQUEOS).select('*').order('created_at', { ascending: false }).limit(300);
      if (filtros.estado) q = q.eq('estado', filtros.estado);
      if (filtros.cuenta_id) q = q.eq('cuenta_id', filtros.cuenta_id);
      const { data } = await q;
      if (data) return data;
    } catch { /* memoria */ }
  }
  let lista = [...memBloqueos].reverse();
  if (filtros.estado) lista = lista.filter(b => b.estado === filtros.estado);
  return lista;
}

/**
 * Comprueba el límite de capital de una cuenta personal.
 * Devuelve null si ok, o un bloqueo preventivo si se supera el límite.
 * NO es una sanción: es un bloqueo preventivo con 15 días para justificar.
 */
export async function comprobarLimiteCapital(cuenta, autor = {}) {
  const saldo = cuenta.balancePz || 0;
  const tipo = cuenta.type || 'Personal';
  // Solo aplica a cuentas personales (no Business/State/Empresa)
  if (['Business', 'State', 'Child'].includes(tipo)) return null;
  if (saldo <= LIMITE_PERSONAL) return null;

  // ¿Ya existe un bloqueo abierto para esta cuenta?
  const existentes = await listarBloqueos({ cuenta_id: cuenta.id });
  const abierto = existentes.find(b => ['bloqueada', 'justificada'].includes(b.estado));
  if (abierto) return abierto;

  const fechaBloqueo = new Date();
  const fechaLimite = new Date(fechaBloqueo.getTime() + DIAS_JUSTIFICACION * 86400000);
  const bloqueo = {
    id: `BLQ-${Date.now().toString(36).toUpperCase()}`,
    cuenta_id: cuenta.id,
    titular_dip: cuenta.titular_dip || autor.dip || null,
    tipo_cuenta: tipo,
    saldo,
    limite: LIMITE_PERSONAL,
    exceso: saldo - LIMITE_PERSONAL,
    estado: 'bloqueada',
    fecha_bloqueo: fechaBloqueo.toISOString(),
    fecha_limite_justificacion: fechaLimite.toISOString(),
    justificacion: null,
    excedente_retirado: 0,
    regularizado_por: null,
    historial: [{ estado: 'bloqueada', fecha: fechaBloqueo.toISOString(), motivo: `Supera el límite de ${LIMITE_PERSONAL.toLocaleString()} Pz (bloqueo preventivo, no sanción)` }],
    created_at: fechaBloqueo.toISOString(),
    updated_at: fechaBloqueo.toISOString(),
  };
  memBloqueos.push(bloqueo);
  if (supabase) { try { await supabase.from(T_BLOQUEOS).insert(bloqueo); } catch { /* memoria */ } }
  return bloqueo;
}

/** Justifica el exceso (desbloqueo) */
export async function justificarBloqueo(id, justificacion, autor = {}) {
  const b = await getBloqueo(id);
  if (!b) throw new Error('Bloqueo no encontrado');
  b.justificacion = justificacion;
  b.estado = 'justificada';
  b.historial = [...(b.historial || []), { estado: 'justificada', fecha: new Date().toISOString(), motivo: 'Exceso justificado por el titular', autor: autor.nombre || '' }];
  b.updated_at = new Date().toISOString();
  await upsertBloqueo(b);
  return b;
}

/** Desbloquea tras justificación */
export async function desbloquearCuenta(id, autor = {}) {
  const b = await getBloqueo(id);
  if (!b) throw new Error('Bloqueo no encontrado');
  b.estado = 'desbloqueada';
  b.historial = [...(b.historial || []), { estado: 'desbloqueada', fecha: new Date().toISOString(), motivo: 'Desbloqueo por justificación válida', autor: autor.nombre || '' }];
  b.updated_at = new Date().toISOString();
  await upsertBloqueo(b);
  return b;
}

/**
 * Regulariza el excedente: retira SOLO el exceso dejando la cuenta en 500k.
 * Devuelve el importe a retirar (el que se retirará del excedente).
 */
export async function regularizarExcedente(id, autor = {}) {
  const b = await getBloqueo(id);
  if (!b) throw new Error('Bloqueo no encontrado');
  b.excedente_retirado = b.exceso;
  b.estado = 'regularizada';
  b.regularizado_por = autor.nombre || autor.dip || '';
  b.historial = [...(b.historial || []), { estado: 'regularizada', fecha: new Date().toISOString(), motivo: `Regularización del límite: retirada del excedente de ${b.exceso.toLocaleString()} Pz (no es multa)`, autor: autor.nombre || '' }];
  b.updated_at = new Date().toISOString();
  await upsertBloqueo(b);
  return b;
}

async function getBloqueo(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(T_BLOQUEOS).select('*').eq('id', id).maybeSingle();
      if (data) return data;
    } catch { /* memoria */ }
  }
  return memBloqueos.find(b => b.id === id) || null;
}

async function upsertBloqueo(b) {
  if (supabase) { try { await supabase.from(T_BLOQUEOS).upsert(b, { onConflict: 'id' }); } catch { /* memoria */ } }
}

// ── 8. DESGRAVACIÓN 6% IVA + 9. DONACIONES ───────────────────────────────
export async function listarDesgravaciones(filtros = {}) {
  if (supabase) {
    try {
      let q = supabase.from(T_DESGRAVACIONES).select('*').order('created_at', { ascending: false }).limit(300);
      if (filtros.titular_dip) q = q.eq('titular_dip', filtros.titular_dip);
      if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
      const { data } = await q;
      if (data) return data;
    } catch { /* memoria */ }
  }
  let lista = [...memDesgravaciones].reverse();
  if (filtros.titular_dip) lista = lista.filter(d => d.titular_dip === filtros.titular_dip);
  return lista;
}

/**
 * Registra una desgravación por IVA abonado.
 * cuantia = base × (iva_pagado/base) × 6% = iva_pagado × 6%
 * Ej: 1.000 + 120 IVA → 120 × 6% = 7,20 Pz
 */
export async function registrarDesgravacionIVA({ titular_dip, titular_eip, base, iva_pagado, origen_tipo = 'operacion', origen_id, ejercicio = new Date().getFullYear() }) {
  if (!titular_dip && !titular_eip) throw new Error('El titular (DIP o EIP) es obligatorio');
  const cuantia = Math.round((iva_pagado || 0) * (PORCENTAJE_DESGRAVACION_IVA / 100) * 100) / 100;
  const d = {
    id: `DES-${Date.now().toString(36).toUpperCase()}`,
    titular_dip: titular_dip || null,
    titular_eip: titular_eip || null,
    tipo: 'iva_6',
    base: base || 0,
    iva_pagado: iva_pagado || 0,
    porcentaje: PORCENTAJE_DESGRAVACION_IVA,
    cuantia,
    origen_tipo,
    origen_id,
    ejercicio: String(ejercicio),
    estado: 'registrada',
    created_at: new Date().toISOString(),
  };
  memDesgravaciones.push(d);
  if (supabase) { try { await supabase.from(T_DESGRAVACIONES).insert(d); } catch { /* memoria */ } }
  return d;
}

/**
 * Registra una desgravación por donación a entidad reconocida.
 * El crédito no puede superar la cuota tributaria (lo verifica quien aplica).
 */
export async function registrarDesgravacionDonacion({ titular_dip, donacion, entidad_donataria, tipo = 'donacion', porcentaje = 0, ejercicio = new Date().getFullYear() }) {
  if (!titular_dip) throw new Error('El donante (DIP) es obligatorio');
  const cuantia = Math.round((donacion || 0) * (porcentaje / 100) * 100) / 100;
  const d = {
    id: `DES-${Date.now().toString(36).toUpperCase()}`,
    titular_dip,
    titular_eip: null,
    tipo,
    base: donacion || 0,
    iva_pagado: 0,
    porcentaje,
    cuantia,
    origen_tipo: 'donacion',
    origen_id: `DON-${Date.now().toString(36).toUpperCase()}`,
    detalle_entidad: entidad_donataria || '',
    ejercicio: String(ejercicio),
    estado: 'registrada',
    created_at: new Date().toISOString(),
  };
  memDesgravaciones.push(d);
  if (supabase) { try { await supabase.from(T_DESGRAVACIONES).insert(d); } catch { /* memoria */ } }
  return d;
}

/** Desgravaciones acumuladas de una persona (con tope = cuota del ejercicio) */
export async function desgravacionesAcumuladas(dip, cuotaTributaria = 0) {
  const lista = await listarDesgravaciones({ titular_dip: dip });
  const total = lista.filter(d => d.estado === 'registrada').reduce((s, d) => s + (d.cuantia || 0), 0);
  // El crédito nunca produce cuota negativa ni devolución superior a los impuestos
  return {
    totalRegistrado: Math.round(total * 100) / 100,
    cuotaTributaria,
    aplicable: Math.min(total, Math.max(cuotaTributaria, 0)),
    cuotaFinal: Math.max(cuotaTributaria - Math.min(total, Math.max(cuotaTributaria, 0)), 0),
  };
}

// ── 10-12. RETRIBUCIÓN 250 Pz PROPIETARIOS SIN REMUNERACIÓN ───────────────
export async function listarRetribuciones(filtros = {}) {
  if (supabase) {
    try {
      let q = supabase.from(T_RETRIBUCIONES).select('*').order('created_at', { ascending: false }).limit(300);
      if (filtros.beneficiario_dip) q = q.eq('beneficiario_dip', filtros.beneficiario_dip);
      if (filtros.mes) q = q.eq('mes', filtros.mes);
      if (filtros.estado) q = q.eq('estado', filtros.estado);
      const { data } = await q;
      if (data) return data;
    } catch { /* memoria */ }
  }
  let lista = [...memRetribuciones].reverse();
  if (filtros.beneficiario_dip) lista = lista.filter(r => r.beneficiario_dip === filtros.beneficiario_dip);
  if (filtros.mes) lista = lista.filter(r => r.mes === filtros.mes);
  return lista;
}

/**
 * Crea/actualiza la retribución mensual de un propietario.
 * cuantia_mensual = 250 × % participación (máx 250 Pz/persona/mes).
 * Requiere: persona física, participación registrada, entidad activa,
 * no recibir sueldo/dividendos/honorarios/dietas (declaración).
 */
export async function registrarRetribucion({ beneficiario_dip, beneficiario_nombre, entidad_eip, entidad_nombre, porcentaje_participacion, mes = new Date().toISOString().slice(0, 7), declaracion_ok = true, cuantia_forzada = null }, autor = {}) {
  if (!beneficiario_dip || !entidad_eip) throw new Error('Beneficiario (DIP) y entidad (EIP) son obligatorios');
  if (porcentaje_participacion <= 0 || porcentaje_participacion > 100) throw new Error('El % de participación debe estar entre 0 y 100');
  if (!declaracion_ok) throw new Error('Es obligatoria la declaración de no recibir otras remuneraciones (controles antifraude)');

  const cuantia = cuantia_forzada ?? Math.min(Math.round(250 * (porcentaje_participacion / 100) * 100) / 100, MAX_RETRIBUCION_MENSUAL);

  // Máximo personal de 250 Pz/mes aunque participe en varias entidades
  if (cuantia_forzada === null || cuantia_forzada === undefined) {
    const delMes = await listarRetribuciones({ beneficiario_dip, mes });
    const yaAsignado = delMes.reduce((s, r) => s + (r.cuantia_mensual || 0), 0);
    if (yaAsignado + cuantia > MAX_RETRIBUCION_MENSUAL) {
      throw new Error(`Máximo personal de ${MAX_RETRIBUCION_MENSUAL} Pz/mes superado (ya tiene ${yaAsignado} Pz asignados este mes)`);
    }
  }

  const r = {
    id: `RET-${Date.now().toString(36).toUpperCase()}`,
    beneficiario_dip,
    beneficiario_nombre: beneficiario_nombre || '',
    entidad_eip,
    entidad_nombre: entidad_nombre || '',
    porcentaje_participacion,
    cuantia_mensual: cuantia,
    mes,
    estado: 'pendiente',
    fondo: 'fondo_apoyo',
    declaracion_obligatoria: true,
    controles_antifraude: ['sin_sueldo', 'sin_dividendos', 'sin_honorarios', 'sin_dietas'],
    pagos: [],
    origen: 'manual',
    ordenada_por: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await persistirRetribucion(r);
  return r;
}

/** Persistencia baja de una retribución (sin comprobar el tope: lo calcula el llamante) */
export async function persistirRetribucion(r) {
  memRetribuciones.push(r);
  await insertConCompat(T_RETRIBUCIONES, r, ['origen', 'fuente']);
  return r;
}

/**
 * Inserta en Supabase con compatibilidad de columnas nuevas: si la migración
 * aún no ha añadido la columna (origen/fuente/ejercicio...), reintenta sin
 * ella para no perder el registro. Si no hay Supabase, queda en memoria.
 */
async function insertConCompat(tabla, fila, camposExtra = []) {
  if (!supabase) return;
  try { await supabase.from(tabla).insert(fila); return; } catch { /* columna nueva aún no migrada */ }
  const limpia = { ...fila };
  for (const k of camposExtra) delete limpia[k];
  try { await supabase.from(tabla).insert(limpia); } catch { /* memoria */ }
}

// ═════════════════════════════════════════════════════════════════════════
// ⚙️ CÁLCULO AUTOMÁTICO DE TRIBUTOS Y RETRIBUCIONES
// ═════════════════════════════════════════════════════════════════════════
import { listarParticipaciones } from './patrimonio.js';
import { listarNominas } from './nominas.js';
import { apiBancoGetState, apiBancoPost } from './db.js';
import { crearNotificacion } from './notificaciones.js';
import { clasificarOperacion } from './operation-engine.js';

/**
 * Obtiene las participaciones reales para el cálculo de retribuciones.
 * Fuente 1: rsp_participaciones (registro RSP).
 * Fuente 2 (si no hay): propiedad REAL en el banco — cada cuenta Business
 * con EIP pertenece a su titular (placetaId → dip). Nada simulado.
 */
export async function obtenerParticipacionesReales() {
  const participaciones = await listarParticipaciones();
  const registradas = participaciones.filter(p => p.vigente !== false && (p.porcentaje || 0) > 0);
  if (registradas.length > 0) return registradas;
  const state = await apiBancoGetState();
  if (!state) return [];
  const usuarios = state.users || [];
  const dipDePlaceta = new Map(usuarios.map(u => [u.placetaId, u.dip]));
  const nombreDePlaceta = new Map(usuarios.map(u => [u.placetaId, u.displayName]));
  const derivadas = [];
  for (const b of (state.accounts || [])) {
    if (b.type !== 'Business' || !b.eip) continue;
    const dip = dipDePlaceta.get(b.placetaId) ||
      (typeof b.placetaId === 'string' && /^\d{8}[A-Z]$/i.test(b.placetaId) ? b.placetaId : null);
    if (!dip) continue;
    derivadas.push({
      titular_dip: dip,
      titular_nombre: nombreDePlaceta.get(b.placetaId) || dip,
      entidad_eip: b.eip,
      entidad_nombre: b.displayName || b.eip,
      porcentaje: 100,
      vigente: true,
      origen: 'banco',
    });
  }
  return derivadas;
}

/**
 * Calcula AUTOMÁTICAMENTE las retribuciones de 250 Pz/mes de todos los
 * propietarios sin remuneración, a partir de las participaciones reales.
 *
 * Reglas:
 *  - Fuente: rsp_participaciones + propiedad real del banco (empresas con EIP).
 *  - Se EXCLUYE a quien ya recibe nómina de esa entidad en el mes.
 *  - cuantía por entidad = 250 × % participación, con MÁXIMO PERSONAL 250 Pz/mes
 *    repartido proporcionalmente entre las entidades del propietario.
 *  - No se duplica: se respeta lo ya generado para el mes.
 *  - Origen: 'automatico'. Estado: 'pendiente' (se revisa/ordena después).
 */
export async function calcularRetribucionesMes(mes = new Date().toISOString().slice(0, 7), autor = {}) {
  const participaciones = await obtenerParticipacionesReales();
  const activas = participaciones.filter(p => p.vigente !== false && (p.porcentaje || 0) > 0);

  // Quienes ya cobran nómina este mes (excluir del cálculo)
  const nominasMes = await listarNominas({ periodo: mes });
  const empleosPorPersona = {};
  for (const n of nominasMes) {
    if (!empleosPorPersona[n.trabajador_dip]) empleosPorPersona[n.trabajador_dip] = new Set();
    empleosPorPersona[n.trabajador_dip].add(n.entidad_eip);
  }

  // Ya generadas este mes
  const yaGeneradas = await listarRetribuciones({ mes });
  const generadoPorPersona = {};
  for (const r of yaGeneradas) {
    if (!generadoPorPersona[r.beneficiario_dip]) generadoPorPersona[r.beneficiario_dip] = 0;
    generadoPorPersona[r.beneficiario_dip] += r.cuantia_mensual || 0;
  }

  // Agrupar participaciones por propietario
  const porTitular = {};
  for (const p of activas) {
    if (!porTitular[p.titular_dip]) porTitular[p.titular_dip] = [];
    porTitular[p.titular_dip].push(p);
  }

  const creadas = [];
  const excluidos = [];
  const saltados = [];

  for (const [dip, parts] of Object.entries(porTitular)) {
    // Excluir si el propietario recibe sueldo de TODAS sus entidades (recibe remuneración)
    const todasConSueldo = parts.every(p => (empleosPorPersona[dip] || new Set()).has(p.entidad_eip));
    if (todasConSueldo && parts.length > 0) {
      excluidos.push({ dip, motivo: 'recibe nómina de sus entidades' });
      continue;
    }

    // % total (máx 100 para el tope personal de 250 Pz)
    const sumaPctRaw = parts.reduce((s, p) => s + (p.porcentaje || 0), 0) || 1;
    const sumaPct = Math.min(sumaPctRaw, 100);
    const cuantiaTotal = Math.round((MAX_RETRIBUCION_MENSUAL * sumaPct / 100) * 100) / 100;

    // Respetar lo ya generado este mes (no duplicar)
    const yaAsignado = generadoPorPersona[dip] || 0;
    const restante = Math.max(0, cuantiaTotal - yaAsignado);
    if (restante <= 0) {
      saltados.push({ dip, motivo: 'ya tiene retribución completa este mes' });
      continue;
    }

    // Reparto proporcional entre entidades (respetando el tope de 250/persona)
    let repartido = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (repartido >= restante) break;
      const parteBruta = (restante * (p.porcentaje || 0)) / sumaPctRaw;
      if (parteBruta <= 0) continue;
      // El último registro absorbe el residuo para que la suma sea exacta (250,00)
      const esUltimo = i === parts.length - 1 || repartido + parteBruta >= restante;
      const parte = esUltimo
        ? Math.round((restante - repartido) * 100) / 100
        : Math.round(parteBruta * 100) / 100;
      if (parte <= 0) continue;
      await persistirRetribucion({
        id: `RET-AUTO-${Date.now().toString(36).toUpperCase()}`,
        beneficiario_dip: dip,
        beneficiario_nombre: p.titular_nombre || '',
        entidad_eip: p.entidad_eip,
        entidad_nombre: p.entidad_nombre || '',
        porcentaje_participacion: p.porcentaje || 0,
        cuantia_mensual: parte,
        mes, estado: 'pendiente', fondo: 'fondo_apoyo', origen: 'automatico',
        fuente: p.origen || null,
        controles_antifraude: ['sin_sueldo', 'sin_dividendos', 'sin_honorarios', 'sin_dietas'],
        pagos: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      repartido = Math.round((repartido + parte) * 100) / 100;
    }
    creadas.push({ dip, cuantiaTotal: Math.round(cuantiaTotal * 100) / 100, entidades: parts.length });
  }

  if (creadas.length > 0) {
    try {
      await crearNotificacion({
        nivel: 'pendiente', titulo: `Retribuciones ${mes} calculadas automáticamente`,
        mensaje: `${creadas.length} propietario(s) sin remuneración con retribución de hasta 250 Pz/mes. Revisa y ordena el pago.`,
        servicio: 'tributos', enlace: '/rsp/fiscalidad',
      });
    } catch { /* opcional */ }
  }

  return {
    mes,
    totalCalculadas: creadas.reduce((s, c) => s + c.cuantiaTotal, 0),
    propietarios: creadas,
    excluidos,
    saltados,
  };
}

/**
 * Registra AUTOMÁTICAMENTE las desgravaciones del 6% del IVA de las
 * operaciones bancarias REALES (punto 8).
 * Fuente: estado real del banco (apiBancoGetState).
 *  - Transacciones kind 'Tax' (IVA pagado por el comprador → TGLP).
 *  - Transacciones con ivaPz > 0 sin Tax asociada.
 * Evita duplicados: comprueba si ya existe desgravación para ese origen_id.
 */
export async function calcularDesgravacionesIvaAutomaticas(autor = {}) {
  const state = await apiBancoGetState();
  if (!state || !Array.isArray(state.transactions)) return { totalRegistradas: 0, totalIva: 0, registradas: [], sinConexion: true };

  const cuentas = state.accounts || [];
  const usuarios = state.users || [];
  const dipDePlaceta = new Map(usuarios.map(u => [u.placetaId, u.dip]));
  const cuentaPorId = new Map(cuentas.map(a => [a.id, a]));

  // Resolver DIP/EIP del titular de una cuenta
  const titularDe = (cuentaId) => {
    const acc = cuentaPorId.get(cuentaId);
    if (!acc) return { titular_dip: null, titular_eip: null };
    if (acc.type === 'Business' && acc.eip) return { titular_dip: null, titular_eip: acc.eip };
    const dip = dipDePlaceta.get(acc.placetaId) || (acc.dip || null);
    if (acc.eip) return { titular_dip: dip, titular_eip: acc.eip };
    return { titular_dip: dip, titular_eip: null };
  };

  const transacciones = (state.transactions || []).filter(t => t.status !== 'Reversed');

  // 1) IVA pagado (kind 'Tax'): el pagador es la cuenta origen
  const taxTxs = transacciones.filter(t => t.kind === 'Tax' && (t.amountPz || 0) > 0);
  const originalesConTax = new Set(taxTxs.map(t => t.originalTransactionId));
  const candidatos = [];
  for (const t of taxTxs) {
    const { titular_dip, titular_eip } = titularDe(t.fromAccountId);
    candidatos.push({ iva: Number(t.amountPz), titular_dip, titular_eip, origenId: t.id });
  }
  // 2) Transacciones con ivaPz > 0 sin Tax asociada (comprador = destino)
  for (const t of transacciones) {
    if (t.kind === 'Tax') continue;
    const iva = Number(t.ivaPz || 0);
    if (iva <= 0) continue;
    if (originalesConTax.has(t.id)) continue;
    const { titular_dip, titular_eip } = titularDe(t.toAccountId);
    candidatos.push({ iva, titular_dip, titular_eip, origenId: t.id });
  }

  const yaRegistradas = await listarDesgravaciones({ tipo: 'iva_6' });
  const origenesYa = new Set(yaRegistradas.map(d => d.origen_id));

  const registradas = [];
  for (const c of candidatos) {
    if (!c.titular_dip && !c.titular_eip) continue;
    if (origenesYa.has(c.origenId)) continue;
    try {
      const d = await registrarDesgravacionIVA({
        titular_dip: c.titular_dip, titular_eip: c.titular_eip,
        base: 0, iva_pagado: c.iva,
        origen_tipo: 'operacion', origen_id: c.origenId,
      });
      registradas.push(d);
      origenesYa.add(c.origenId);
    } catch { /* continuar */ }
  }
  return { totalRegistradas: registradas.length, totalIva: Math.round(registradas.reduce((s, d) => s + (d.iva_pagado || 0), 0) * 100) / 100, registradas: registradas.slice(0, 20) };
}

/**
 * Patrimonio empresarial afecto a actividad — CÁLCULO AUTOMÁTICO (punto 7).
 * Fuente: datos REALES del banco. Cada empresa (cuenta Business con EIP)
 * necesita su saldo y sus gastos reales para salarios, servidores, material,
 * inversiones, proyectos y funcionamiento ordinario → NO es acumulación
 * improductiva. Se registra automáticamente con documento DOC-AUTO y se
 * evita duplicar (entidad + tipo + ejercicio).
 */
export async function calcularPatrimonioAfectoAutomatico(autor = {}) {
  const state = await apiBancoGetState();
  if (!state) return { sinConexion: true, totalRegistrados: 0, registros: [] };
  const cuentas = state.accounts || [];
  const transacciones = (state.transactions || []).filter(t => t.status !== 'Reversed');
  const sist = new Set(['TGLP', 'AGLDP', 'FOUNDATION_RBU', 'CAPITALIA_BANK', 'FUND-BLP', 'VAULT_EMISION']);
  const ejercicio = String(new Date().getFullYear());
  const existentes = await listarPatrimonioAfecto();
  const yaPor = new Set(existentes.filter(p => p.origen === 'automatico').map(p => `${p.entidad_eip}:${p.tipo}:${p.ejercicio}`));
  const registros = [];

  for (const b of cuentas) {
    if (b.type !== 'Business' || !b.eip) continue;
    const saldo = b.balancePz || 0;
    const salidas = transacciones.filter(t => t.fromAccountId === b.id && (t.amountPz || 0) > 0);
    const salarios = salidas
      .filter(t => clasificarOperacion({ concepto: t.concept || '', origen: t.fromAccountId, destino: t.toAccountId }).clasificacion === 'nomina')
      .reduce((s, t) => s + (t.amountPz || 0), 0);
    const funcionamiento = salidas
      .filter(t => !sist.has(t.toAccountId) && !['SavingsInterest', 'Tax', 'IrmCharge', 'InvestmentBuy', 'Reversal'].includes(t.kind))
      .reduce((s, t) => s + (t.amountPz || 0), 0);

    // Salarios reales (si los hay)
    if (salarios > 0 && !yaPor.has(`${b.eip}:salarios:${ejercicio}`)) {
      registros.push(await registrarPatrimonioAfecto({
        entidad_eip: b.eip, entidad_nombre: b.displayName || '', importe: Math.round(salarios * 100) / 100,
        concepto: 'Salarios reales de la empresa (cálculo automático desde operaciones del banco)',
        documento_id: `DOC-AUTO-${Date.now().toString(36).toUpperCase()}`, tipo: 'salarios', origen: 'automatico', ejercicio,
      }, autor));
    }

    // Funcionamiento ordinario + capital de trabajo de la empresa
    const importeOrdinario = Math.round((saldo + funcionamiento) * 100) / 100;
    if (importeOrdinario > 0 && !yaPor.has(`${b.eip}:ordinario:${ejercicio}`)) {
      registros.push(await registrarPatrimonioAfecto({
        entidad_eip: b.eip, entidad_nombre: b.displayName || '', importe: importeOrdinario,
        concepto: 'Fondos y gastos reales de la empresa para su actividad (salarios, servidores, material, inversiones y funcionamiento ordinario) — cálculo automático desde el banco',
        documento_id: `DOC-AUTO-${Date.now().toString(36).toUpperCase()}`, tipo: 'ordinario', origen: 'automatico', ejercicio,
      }, autor));
    }
  }
  return { totalRegistrados: registros.length, registros };
}

/**
 * ORQUESTADOR: procesa automáticamente todo lo relacionado con tributos del mes:
 * retribuciones 250 + desgravaciones 6% IVA + patrimonio empresarial afecto.
 * Se puede invocar manualmente o programar su ejecución periódica.
 */
export async function procesarTributosAutomaticos(mes = new Date().toISOString().slice(0, 7), autor = {}) {
  const retribuciones = await calcularRetribucionesMes(mes, autor);
  const desgravaciones = await calcularDesgravacionesIvaAutomaticas(autor);
  const patrimonioAfecto = await calcularPatrimonioAfectoAutomatico(autor);
  return {
    mes,
    fecha: new Date().toISOString(),
    retribuciones,
    desgravaciones,
    patrimonioAfecto,
    resumen: {
      retribucionesGeneradas: retribuciones.propietarios.length,
      totalRetribucionesPz: retribuciones.totalCalculadas,
      desgravacionesRegistradas: desgravaciones.totalRegistradas,
      totalIvaDesgravadoPz: desgravaciones.totalIva,
      patrimonioAfectoRegistrado: patrimonioAfecto.totalRegistrados,
    },
  };
}

/** Reconoce la retribución (derecho reconocido) y la ordena (Tributos → Banco → usuario) */
export async function ordenarRetribucion(id, autor = {}) {
  const r = await getRetribucion(id);
  if (!r) throw new Error('Retribución no encontrada');
  if (r.estado !== 'pendiente' && r.estado !== 'reconocida') throw new Error('Solo se puede ordenar una retribución pendiente/reconocida');

  // Pago REAL: ordena la transferencia desde el Fondo de Apoyo (FUND-BLP) vía el banco
  let bankTxId = null;
  try {
    const resp = await apiBancoPost('retribuir', {
      dip: r.beneficiario_dip, retribucionId: r.id, cuantia: r.cuantia_mensual,
      mes: r.mes, entidadEip: r.entidad_eip, entidadNombre: r.entidad_nombre,
      concepto: `Retribución propietario sin remuneración (${r.mes})`,
    });
    if (resp && resp.success) bankTxId = resp.transactionId;
  } catch { /* si el banco no responde, se registra igualmente la orden, marcada como pendiente de banco */ }

  const pago = {
    importe: r.cuantia_mensual, fecha: new Date().toISOString(),
    orden: `ORD-RET-${Date.now().toString(36).toUpperCase()}`,
    cuenta_origen: 'FUND-BLP (Fondo de Apoyo)',
    vía: 'Tributos → Banco → usuario',
    transactionIdBanco: bankTxId,
    confirmadoEnBanco: !!bankTxId,
  };
  r.pagos = [...(r.pagos || []), pago];
  r.estado = bankTxId ? 'pagada' : 'pendiente_banco';
  r.ordenada_por = autor.nombre || autor.dip || '';
  r.updated_at = new Date().toISOString();
  await upsertRetribucion(r);
  return r;
}

async function getRetribucion(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(T_RETRIBUCIONES).select('*').eq('id', id).maybeSingle();
      if (data) return data;
    } catch { /* memoria */ }
  }
  return memRetribuciones.find(r => r.id === id) || null;
}

async function upsertRetribucion(r) {
  if (supabase) { try { await supabase.from(T_RETRIBUCIONES).upsert(r, { onConflict: 'id' }); } catch { /* memoria */ } }
}

// ── 7. PATRIMONIO EMPRESARIAL AFECTO A ACTIVIDAD ─────────────────────────
// Dinero que una empresa necesita realmente para salarios, servidores,
// material, inversiones, proyectos y funcionamiento ordinario NO debe
// tratarse automáticamente como acumulación patrimonial improductiva.
// Requiere documentación y justificación (documento_id).
export async function listarPatrimonioAfecto(filtros = {}) {
  if (supabase) {
    try {
      let q = supabase.from(T_PATRIMONIO_AFECTO).select('*').order('created_at', { ascending: false }).limit(300);
      if (filtros.entidad_eip) q = q.eq('entidad_eip', filtros.entidad_eip);
      if (filtros.estado) q = q.eq('estado', filtros.estado);
      const { data } = await q;
      if (data) return data;
    } catch { /* memoria */ }
  }
  let lista = [...memPatrimonioAfecto].reverse();
  if (filtros.entidad_eip) lista = lista.filter(p => p.entidad_eip === filtros.entidad_eip);
  return lista;
}

/**
 * Registra patrimonio afecto a la actividad de una entidad.
 * @param {object} datos { entidad_eip, entidad_nombre, importe, concepto,
 *   documento_id (obligatorio: justificación), tipo (salarios|servidores|material|inversiones|proyectos|ordinario) }
 */
export async function registrarPatrimonioAfecto({ entidad_eip, entidad_nombre, importe, concepto, documento_id, tipo = 'ordinario', origen = 'manual', ejercicio }, autor = {}) {
  if (!entidad_eip) throw new Error('La entidad (EIP) es obligatoria');
  if (!importe || importe <= 0) throw new Error('El importe debe ser mayor que 0');
  if (!documento_id) throw new Error('Es obligatorio aportar el documento justificativo (DOC-...) del patrimonio afecto');

  const p = {
    id: `AFECTO-${Date.now().toString(36).toUpperCase()}`,
    entidad_eip,
    entidad_nombre: entidad_nombre || '',
    importe: Number(importe),
    concepto: concepto || '',
    tipo,
    documento_id,
    origen: origen || 'manual',
    ejercicio: ejercicio || String(new Date().getFullYear()),
    estado: 'registrado',
    registrado_por: autor.nombre || autor.dip || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memPatrimonioAfecto.push(p);
  await insertConCompat(T_PATRIMONIO_AFECTO, p, ['origen', 'ejercicio']);
  return p;
}

/** Total de patrimonio afecto a actividad de una entidad (resta de la base IGF) */
export async function totalPatrimonioAfecto(entidad_eip) {
  const lista = await listarPatrimonioAfecto({ entidad_eip });
  return lista.filter(p => p.estado === 'registrado').reduce((s, p) => s + (p.importe || 0), 0);
}

// ── ESTADO GLOBAL ────────────────────────────────────────────────────────
export async function estadoFiscalidadAmpliada() {
  const [bloqueos, retribuciones, desgravaciones, patrimonioAfecto] = await Promise.all([
    listarBloqueos(), listarRetribuciones(), listarDesgravaciones(), listarPatrimonioAfecto(),
  ]);
  return {
    limite500k: {
      total: bloqueos.length,
      bloqueadas: bloqueos.filter(b => b.estado === 'bloqueada').length,
      justificadas: bloqueos.filter(b => b.estado === 'justificada').length,
      regularizadas: bloqueos.filter(b => b.estado === 'regularizada').length,
      desbloqueadas: bloqueos.filter(b => b.estado === 'desbloqueada').length,
    },
    retribuciones: {
      total: retribuciones.length,
      pendientes: retribuciones.filter(r => r.estado === 'pendiente').length,
      pagadas: retribuciones.filter(r => r.estado === 'pagada').length,
      totalMensual: retribuciones.reduce((s, r) => s + (r.cuantia_mensual || 0), 0),
    },
    desgravaciones: {
      total: desgravaciones.length,
      iva: desgravaciones.filter(d => d.tipo === 'iva_6').length,
      donaciones: desgravaciones.filter(d => d.tipo !== 'iva_6').length,
      totalCuantia: desgravaciones.reduce((s, d) => s + (d.cuantia || 0), 0),
    },
    patrimonioAfecto: {
      total: patrimonioAfecto.length,
      registros: patrimonioAfecto.length,
      totalImporte: patrimonioAfecto.filter(p => p.estado === 'registrado').reduce((s, p) => s + (p.importe || 0), 0),
    },
  };
}

export default {
  LIMITE_PERSONAL, DIAS_JUSTIFICACION, PORCENTAJE_DESGRAVACION_IVA, MAX_RETRIBUCION_MENSUAL,
  listarBloqueos, comprobarLimiteCapital, justificarBloqueo, desbloquearCuenta, regularizarExcedente,
  listarDesgravaciones, registrarDesgravacionIVA, registrarDesgravacionDonacion, desgravacionesAcumuladas,
  listarRetribuciones, registrarRetribucion, persistirRetribucion, ordenarRetribucion,
  listarPatrimonioAfecto, registrarPatrimonioAfecto, totalPatrimonioAfecto,
  obtenerParticipacionesReales, calcularRetribucionesMes, calcularDesgravacionesIvaAutomaticas,
  calcularPatrimonioAfectoAutomatico, procesarTributosAutomaticos,
  estadoFiscalidadAmpliada,
};
