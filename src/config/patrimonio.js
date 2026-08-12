/**
 * PATRIMONIO Y ACTIVOS — FASE 21 + puntos 2/3/4 del to-do
 *
 * - Titularidades de cuentas compartidas: % por titular. Nunca el 100%
 *   para todos. Ej: 30.000 Pz → A 60% = 18.000, B 40% = 12.000.
 * - Participaciones empresariales: % de patrimonio neto de la entidad
 *   atribuible al usuario (nunca el 100% de la empresa).
 * - Patrimonio neto = activos y derechos − obligaciones y deudas reconocidas.
 * - Activos (para IGF y contabilidad): valor × % titularidad = valor fiscal.
 *
 * Persistencia Supabase (rsp_titularidades, rsp_participaciones, rsp_activos).
 */

import { supabase } from './supabase.js';
import { generarIdentificador, hashIntegridad } from './identificadores.js';
import { apiBancoGetState } from './db.js';

const T_TITULARIDADES = 'rsp_titularidades';
const T_PARTICIPACIONES = 'rsp_participaciones';
const T_ACTIVOS = 'rsp_activos';

const memTitularidades = [];
const memParticipaciones = [];
const memActivos = [];

// ── TITULARIDADES DE CUENTAS COMPARTIDAS ─────────────────────────────────
export async function listarTitularidades(filtros = {}) {
  if (supabase) {
    try {
      let q = supabase.from(T_TITULARIDADES).select('*').order('cuenta_id');
      if (filtros.cuenta_id) q = q.eq('cuenta_id', filtros.cuenta_id);
      if (filtros.titular_dip) q = q.eq('titular_dip', filtros.titular_dip);
      const { data } = await q;
      if (data) return data;
    } catch { /* memoria */ }
  }
  let lista = [...memTitularidades];
  if (filtros.cuenta_id) lista = lista.filter(t => t.cuenta_id === filtros.cuenta_id);
  if (filtros.titular_dip) lista = lista.filter(t => t.titular_dip === filtros.titular_dip);
  return lista;
}

/** Registra/actualiza el % de titularidad de una cuenta compartida */
export async function setTitularidad({ cuenta_id, titular_dip, titular_eip, porcentaje, tipo = 'compartida' }, autor = {}) {
  if (!cuenta_id) throw new Error('La cuenta es obligatoria');
  if (!titular_dip && !titular_eip) throw new Error('El titular (DIP o EIP) es obligatorio');
  if (porcentaje < 0 || porcentaje > 100) throw new Error('El porcentaje debe estar entre 0 y 100');

  // Buscar vigente existente
  const existentes = await listarTitularidades({ cuenta_id });
  const existente = existentes.find(t => t.titular_dip === (titular_dip || null) && t.titular_eip === (titular_eip || null) && t.vigente !== false);

  // Verificar que la suma de % de titulares vigentes no supere 100
  const sumaOtros = existentes.filter(t => t.vigente !== false && t.id !== existente?.id).reduce((s, t) => s + (t.porcentaje || 0), 0);
  if (sumaOtros + porcentaje > 100) {
    throw new Error(`La suma de titularidades superaría el 100% (actual: ${sumaOtros}%, nuevo: ${porcentaje}%)`);
  }

  const historial = existente?.historial || [];
  const datos = {
    id: existente?.id || `TIT-${Date.now().toString(36)}`,
    cuenta_id,
    titular_dip: titular_dip || null,
    titular_eip: titular_eip || null,
    porcentaje,
    tipo: existente?.tipo || tipo,
    fuente: autor.nombre || 'registro',
    vigente: true,
    historial: [...historial, { porcentaje, fecha: new Date().toISOString(), motivo: autor.motivo || 'Registro', autorizado_por: autor.nombre || '' }],
    created_at: existente?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (existente) {
    const idx = memTitularidades.findIndex(t => t.id === existente.id);
    if (idx >= 0) memTitularidades[idx] = datos; else memTitularidades.push(datos);
  } else {
    memTitularidades.push(datos);
  }
  if (supabase) { try { await supabase.from(T_TITULARIDADES).upsert(datos, { onConflict: 'id' }); } catch { /* memoria */ } }
  return datos;
}

/** Patrimonio atribuible de una cuenta compartida a un titular */
export async function patrimonioCuentaParaTitular(cuenta_id, titular_dip, saldoCuenta = 0) {
  const tits = await listarTitularidades({ cuenta_id });
  const tit = tits.find(t => t.titular_dip === titular_dip && t.vigente !== false);
  if (tit) return Math.round((saldoCuenta * (tit.porcentaje || 0)) / 100 * 100) / 100;
  // Si no hay % registrado → no se puede atribuir (titularidad indeterminada)
  return null;
}

/** Suma total atribuida de una cuenta (para detectar doble atribución) */
export async function totalAtribuidoCuenta(cuenta_id, saldoCuenta = 0) {
  const tits = await listarTitularidades({ cuenta_id });
  const suma = tits.filter(t => t.vigente !== false).reduce((s, t) => s + (t.porcentaje || 0), 0);
  if (suma === 0) return null;
  return Math.round(saldoCuenta * (Math.min(suma, 100) / 100) * 100) / 100;
}

// ── PARTICIPACIONES EMPRESARIALES ────────────────────────────────────────
export async function listarParticipaciones(filtros = {}) {
  if (supabase) {
    try {
      let q = supabase.from(T_PARTICIPACIONES).select('*').order('entidad_nombre');
      if (filtros.titular_dip) q = q.eq('titular_dip', filtros.titular_dip);
      if (filtros.entidad_eip) q = q.eq('entidad_eip', filtros.entidad_eip);
      const { data } = await q;
      if (data) return data;
    } catch { /* memoria */ }
  }
  let lista = [...memParticipaciones];
  if (filtros.titular_dip) lista = lista.filter(p => p.titular_dip === filtros.titular_dip);
  return lista;
}

/** Registra/actualiza una participación empresarial (deduplicada por titular+entidad) */
export async function setParticipacion({ titular_dip, titular_nombre, entidad_eip, entidad_nombre, porcentaje, patrimonio_neto_entidad, deudas_reconocidas = 0, valoracion = 'patrimonio_neto' }, autor = {}) {
  if (!titular_dip || !entidad_eip) throw new Error('Titular (DIP) y entidad (EIP) son obligatorios');
  if (porcentaje < 0 || porcentaje > 100) throw new Error('El porcentaje debe estar entre 0 y 100');
  // Una participación por (titular, entidad): si ya existe se actualiza (no se duplica).
  const existentes = await listarParticipaciones({ titular_dip, entidad_eip });
  const existente = existentes.find(p => p.vigente !== false);
  const patrimonioAtribuible = Math.round(patrimonio_neto_entidad * (porcentaje / 100) * 100) / 100;
  const historial = existente?.historial || [];
  const datos = {
    id: existente?.id || `PART-${Date.now().toString(36)}`,
    titular_dip,
    titular_nombre: titular_nombre || existente?.titular_nombre || '',
    entidad_eip,
    entidad_nombre: entidad_nombre || existente?.entidad_nombre || '',
    porcentaje,
    patrimonio_neto_entidad: patrimonio_neto_entidad || 0,
    patrimonio_atribuible: patrimonioAtribuible,
    deudas_reconocidas: deudas_reconocidas || 0,
    valoracion,
    vigente: true,
    historial: [...historial, { porcentaje, patrimonio_neto: patrimonio_neto_entidad, fecha: new Date().toISOString(), motivo: autor.motivo || 'Registro', autorizado_por: autor.nombre || '' }],
    created_at: existente?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (existente) {
    const idx = memParticipaciones.findIndex(p => p.id === existente.id);
    if (idx >= 0) memParticipaciones[idx] = datos; else memParticipaciones.push(datos);
  } else {
    memParticipaciones.push(datos);
  }
  if (supabase) { try { await supabase.from(T_PARTICIPACIONES).upsert(datos, { onConflict: 'id' }); } catch { /* memoria */ } }
  return datos;
}

/** Patrimonio atribuible total por participaciones de una persona */
export async function patrimonioParticipaciones(dip) {
  const parts = await listarParticipaciones({ titular_dip: dip });
  return parts.filter(p => p.vigente !== false).reduce((s, p) => s + (p.patrimonio_atribuible || 0), 0);
}

// ── ACTIVOS ──────────────────────────────────────────────────────────────
export async function listarActivos(filtros = {}) {
  if (supabase) {
    try {
      let q = supabase.from(T_ACTIVOS).select('*').order('created_at', { ascending: false });
      if (filtros.propietario_dip) q = q.eq('propietario_dip', filtros.propietario_dip);
      if (filtros.propietario_eip) q = q.eq('propietario_eip', filtros.propietario_eip);
      const { data } = await q;
      if (data) return data;
    } catch { /* memoria */ }
  }
  let lista = [...memActivos];
  if (filtros.propietario_dip) lista = lista.filter(a => a.propietario_dip === filtros.propietario_dip);
  return lista;
}

/** Registra un activo (valor fiscal = valor × % titularidad) */
export async function crearActivo({ propietario_dip, propietario_eip, tipo, nombre, descripcion, valor, porcentaje_titularidad = 100, deuda_asociada = 0, fecha_adquisicion }, autor = {}) {
  if (!nombre) throw new Error('El nombre del activo es obligatorio');
  if (!propietario_dip && !propietario_eip) throw new Error('El propietario (DIP o EIP) es obligatorio');
  const valorFiscal = Math.round((valor || 0) * (porcentaje_titularidad / 100) * 100) / 100;
  const datos = {
    id: `ACT-${Date.now().toString(36)}`,
    propietario_dip: propietario_dip || null,
    propietario_eip: propietario_eip || null,
    tipo: tipo || 'otro',
    nombre,
    descripcion: descripcion || '',
    valor: valor || 0,
    porcentaje_titularidad,
    valor_fiscal: valorFiscal,
    deuda_asociada: deuda_asociada || 0,
    fecha_adquisicion: fecha_adquisicion || null,
    vigente: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memActivos.push(datos);
  if (supabase) { try { await supabase.from(T_ACTIVOS).insert(datos); } catch { /* memoria */ } }
  return datos;
}

/**
 * PATRIMONIO NETO de una persona:
 * = activos y derechos − obligaciones y deudas reconocidas.
 * = cuentas (individuales 100% + compartidas por %) + participaciones + otros activos − deudas.
 */
export async function patrimonioNetoPersona(dip, cuentas = []) {
  // Cuentas individuales (sin titularidades) → 100%
  // Cuentas compartidas → % registrado
  let patrimonioCuentas = 0;
  let titularidadIndeterminada = [];
  for (const cta of cuentas) {
    const atribuido = await patrimonioCuentaParaTitular(cta.id, dip, cta.balancePz || 0);
    if (atribuido === null) {
      // Sin % registrado → si es compartida, titularidad indeterminada
      if (cta.shared) titularidadIndeterminada.push(cta.id);
      else patrimonioCuentas += cta.balancePz || 0;
    } else {
      patrimonioCuentas += atribuido;
    }
  }
  const participaciones = await patrimonioParticipaciones(dip);
  const activos = await listarActivos({ propietario_dip: dip });
  const valorActivos = activos.filter(a => a.vigente !== false).reduce((s, a) => s + (a.valor_fiscal || 0), 0);
  const deudasActivos = activos.filter(a => a.vigente !== false).reduce((s, a) => s + (a.deuda_asociada || 0), 0);

  return {
    dip,
    patrimonioCuentas: Math.round(patrimonioCuentas * 100) / 100,
    patrimonioParticipaciones: participaciones,
    valorActivos: valorActivos,
    deudasReconocidas: Math.round(deudasActivos * 100) / 100,
    patrimonioNeto: Math.round((patrimonioCuentas + participaciones + valorActivos - deudasActivos) * 100) / 100,
    cuentasTitularidadIndeterminada: titularidadIndeterminada,
  };
}

// Cuentas del sistema que nunca se tratan como patrimonio de una persona.
const SISTEMA_PATRIMONIO = new Set([
  'TGLP', 'AGLDP', 'VAULT_EMISION', 'CAPITALIA_BANK', 'FOUNDATION_RBU', 'FUND-BLP',
  'sys-bank', 'sys-state', 'DIP-ADMIN', 'DIP-DIGITAL'
]);
const ES_DIP_AUTOMATICO = (d) => /^(\d{8}[A-Z]|[XYZ]\d{7,8}[A-Z])$/.test(String(d || '').toUpperCase().trim());

/**
 * REGISTRO AUTOMÁTICO DE PATRIMONIO desde los datos reales del banco:
 *  - PARTICIPACIONES: cada cuenta Business con EIP → su titular (100%), patrimonio_neto = saldo.
 *  - TITULARIDADES: cuentas compartidas con cotitulares (accountHolders del banco) → % por titular.
 *  - ACTIVOS: cuentas personales (no sistema/empresa) registradas como activo 'cuenta' con su saldo.
 * Deduplicado: re-ejecutar no duplica (participaciones upsert por titular+eip; activos por propietario+nombre).
 */
export async function calcularPatrimonioAutomatico(autor = {}) {
  const state = await apiBancoGetState();
  if (!state) throw new Error('No se pudo leer el estado del banco');
  const users = state.users || [];
  const accounts = state.accounts || [];
  const accountHolders = state.accountHolders || [];
  const userPorPlaceta = new Map(users.map(u => [String(u.placetaId || '').toUpperCase().trim(), u]));
  const dipDePlaceta = (pid) => {
    const p = String(pid || '').trim().toUpperCase();
    if (userPorPlaceta.get(p)?.dip) return String(userPorPlaceta.get(p).dip).toUpperCase();
    return ES_DIP_AUTOMATICO(p) ? p : null;
  };

  const participaciones = [];
  const titularidades = [];
  const activos = [];
  const errores = [];

  // 1) Participaciones empresariales (empresas con EIP → titular 100%)
  for (const b of accounts) {
    if (b.type !== 'Business' || !b.eip) continue;
    if (SISTEMA_PATRIMONIO.has(b.id) || SISTEMA_PATRIMONIO.has(b.placetaId)) continue;
    const dip = dipDePlaceta(b.placetaId);
    if (!dip) continue;
    const nombre = userPorPlaceta.get(String(b.placetaId || '').toUpperCase())?.displayName || dip;
    try {
      const creada = await setParticipacion({
        titular_dip: dip, titular_nombre: nombre,
        entidad_eip: String(b.eip).toUpperCase(), entidad_nombre: b.displayName || b.eip,
        porcentaje: 100, patrimonio_neto_entidad: b.balancePz || 0,
      }, { ...autor, motivo: 'Registro automático desde el banco (empresa con EIP)' });
      participaciones.push({ dip, eip: b.eip, nombre: b.displayName, porcentaje: 100, patrimonio: b.balancePz || 0, actualizada: (creada.historial || []).length > 1 });
    } catch (e) { errores.push({ tipo: 'participacion', eip: b.eip, error: e.message }); }
  }

  // 2) Titularidades de cuentas compartidas (cotitulares reales del banco)
  for (const h of accountHolders) {
    if (!h.accountId || !h.placetaId) continue;
    const dip = dipDePlaceta(h.placetaId);
    if (!dip) continue;
    const pct = Number(h.ownershipPercent) || 0;
    if (pct <= 0) continue;
    try {
      await setTitularidad({ cuenta_id: h.accountId, titular_dip: dip, porcentaje: pct, tipo: 'compartida' }, { ...autor, motivo: 'Registro automático desde el banco (cotitular)' });
      titularidades.push({ cuenta: h.accountId, dip, pct });
    } catch (e) { errores.push({ tipo: 'titularidad', cuenta: h.accountId, error: e.message }); }
  }

  // 3) Activos: cuentas personales (no sistema/empresa) → activo tipo 'cuenta' con su saldo
  for (const c of accounts) {
    if (c.type === 'Business' || c.type === 'State') continue;
    if (!c.placetaId) continue;
    if (SISTEMA_PATRIMONIO.has(c.id) || SISTEMA_PATRIMONIO.has(c.placetaId)) continue;
    if (c.kind === 'TGLP' || c.kind === 'AGLDP' || c.kind === 'OperationalFee') continue;
    const dip = dipDePlaceta(c.placetaId);
    if (!dip) continue;
    const nombre = c.displayName || c.id;
    try {
      const existentes = await listarActivos({ propietario_dip: dip });
      const existente = existentes.find(a => a.vigente !== false && a.tipo === 'cuenta' && a.nombre === nombre);
      if (existente) {
        const datos = { ...existente, valor: c.balancePz || 0, valor_fiscal: c.balancePz || 0, updated_at: new Date().toISOString() };
        const idx = memActivos.findIndex(a => a.id === existente.id);
        if (idx >= 0) memActivos[idx] = datos; else memActivos.push(datos);
        if (supabase) { try { await supabase.from(T_ACTIVOS).upsert(datos, { onConflict: 'id' }); } catch { /* memoria */ } }
        activos.push({ dip, nombre, valor: c.balancePz || 0, actualizado: true });
      } else {
        await crearActivo({
          propietario_dip: dip, tipo: 'cuenta', nombre,
          descripcion: `Cuenta bancaria (${c.type}) · ${c.iban || c.id}`,
          valor: c.balancePz || 0, porcentaje_titularidad: 100,
        }, { ...autor, motivo: 'Registro automático desde el banco' });
        activos.push({ dip, nombre, valor: c.balancePz || 0, actualizado: false });
      }
    } catch (e) { errores.push({ tipo: 'activo', cuenta: c.id, error: e.message }); }
  }

  return {
    fecha: new Date().toISOString(),
    participaciones, titularidades, activos, errores,
    totalParticipaciones: participaciones.length,
    totalTitularidades: titularidades.length,
    totalActivos: activos.length,
    totalErrores: errores.length,
  };
}

export default {
  listarTitularidades, setTitularidad, patrimonioCuentaParaTitular, totalAtribuidoCuenta,
  listarParticipaciones, setParticipacion, patrimonioParticipaciones,
  listarActivos, crearActivo, patrimonioNetoPersona, calcularPatrimonioAutomatico,
};
