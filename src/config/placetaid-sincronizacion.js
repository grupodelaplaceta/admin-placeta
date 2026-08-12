/**
 * Sincronización PlacetaID ← Banco
 * ────────────────────────────────────────────────────────────────────────────
 * Alta automática como PlacetaID y como ciudadano (censo tributario) de todos
 * los DIPs con cuenta bancaria activa, usando el nombre de cada uno.
 *
 * Flujo:
 *  1. Leer el estado del banco (users + accounts) → padrón de DIPs con cuenta.
 *  2. Cruzar con los registros PlacetaID existentes → DIPs pendientes.
 *  3. Para cada pendiente: crear registro PlacetaID (POST /admin/registros/crear)
 *     con contraseña temporal que queda cifrada y recuperable por el admin.
 *  4. Para cada DIP no presente en el censo tributario: alta como ciudadano
 *     (acción 'alta-tributos' del banco).
 */
import { apiBancoGetState, apiBancoPost } from './db.js';

const PLACETAID_API = (process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api').replace(/\/+$/, '');
const PLACETAID_ADMIN_KEY = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';
const TRIBUTOS_CONTRIBUYENTES_URL = process.env.BANCO_API_URL
  ? `${String(process.env.BANCO_API_URL).replace(/\/+$/, '')}/api/v1/tributos/contribuyentes?limit=1000`
  : 'https://api.banco.laplaceta.org/api/v1/tributos/contribuyentes?limit=1000';

// Cuentas del sistema que nunca se tratan como ciudadanos.
const SISTEMA_ACCOUNTS = new Set([
  'TGLP', 'AGLDP', 'VAULT_EMISION', 'CAPITALIA_BANK', 'FOUNDATION_RBU', 'FUND-BLP',
  'sys-bank', 'sys-state', 'DIP-ADMIN', 'DIP-DIGITAL'
]);

// DIP válido: DNI (8 dígitos + letra) o NIE (X/Y/Z + dígitos + letra).
const ES_DIP = (d) => /^[XYZ0-9][0-9]{7,8}[A-Z]$/.test(String(d || '').toUpperCase().trim());

/** Llama a un endpoint admin de PlacetaID. */
export async function apiPlacetaidAdmin(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(`${PLACETAID_API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': PLACETAID_ADMIN_KEY
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* no-op */ }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: `Error de red: ${err.message}` } };
  }
}

/** Divide un nombre completo en nombre + apellidos. */
export function dividirNombre(full) {
  const partes = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { nombre: '', apellidos: '' };
  if (partes.length === 1) return { nombre: partes[0], apellidos: '' };
  return { nombre: partes[0], apellidos: partes.slice(1).join(' ') };
}

/** Limpia sufijos de "nombre de cuenta" para quedarnos con el nombre de la persona. */
function limpiarNombreCuenta(raw) {
  let n = String(raw || '').trim();
  n = n
    .replace(/\s*[-–—]+\s*Personal\s*\([^)]*\)\s*$/i, '')
    .replace(/\s*[-–—]+\s*\([^)]*\)\s*$/i, '')
    .replace(/\s*[-–—]+\s*Personal\s*$/i, '')
    .replace(/\s*\(\s*Empresa\s*\)\s*$/i, '')
    .replace(/\s*\(\s*Banco del Grupo de La Placeta\s*\)\s*$/i, '');
  return n.replace(/\s{2,}/g, ' ').trim();
}

// Nombres genéricos que NO identifican a una persona (no usar como nombre legal).
const NOMBRE_GENERICO = /^(cuenta principal|cuenta personal|personal|ahorro|hucha|fondos|inversiones?|vault|—|-)$|fundación|fundacion|banco de la placeta|banco del grupo/i;

/** Lee el censo tributario actual (contribuyentes dados de alta). */
export async function leerCensoTributario() {
  try {
    const r = await fetch(TRIBUTOS_CONTRIBUYENTES_URL, { signal: AbortSignal.timeout(10000) });
    const body = await r.json();
    const lista = Array.isArray(body) ? body : (body?.contribuyentes || []);
    const set = new Set();
    for (const c of lista) {
      const d = String(c?.dip || '').toUpperCase().trim();
      if (d) set.add(d);
    }
    return { lista, set };
  } catch {
    return { lista: [], set: new Set() };
  }
}

/** Construye el padrón de DIPs con cuenta bancaria activa + nombre. */
export async function construirPadron() {
  const state = await apiBancoGetState();
  if (!state) throw new Error('No se pudo leer el estado del banco');

  const users = state.users || [];
  const accounts = state.accounts || [];
  const userPorPlaceta = new Map(users.map(u => [u.placetaId, u]));
  const userPorDip = new Map(users.map(u => [String(u.dip || '').toUpperCase().trim(), u]));

  // Registros PlacetaID existentes.
  const registradosSet = new Set();
  const registradosRes = await apiPlacetaidAdmin('/admin/registros');
  const registros = Array.isArray(registradosRes.data) ? registradosRes.data : [];
  for (const r of registros) {
    const d = String(r?.dip || '').toUpperCase().trim();
    if (d) registradosSet.add(d);
  }

  const porDip = new Map();
  for (const c of accounts) {
    if (!c.placetaId && !c.eip) continue;
    if (SISTEMA_ACCOUNTS.has(c.id) || SISTEMA_ACCOUNTS.has(c.placetaId)) continue;
    if (c.kind === 'OperationalFee') continue;
    if (c.kind === 'TGLP' || c.kind === 'AGLDP') continue; // fondos del sistema
    const u = userPorPlaceta.get(c.placetaId);
    // El DIP del titular es el placetaId de la cuenta (DNI/NIE) o el del user si existe.
    const dip = String(u?.dip || c.placetaId || '').toUpperCase().trim();
    if (!ES_DIP(dip)) continue; // Solo DIPs reales con formato DNI/NIE.
    const tieneUsuario = Boolean(u) || userPorDip.has(dip);
    const rawNombre = u?.displayName || limpiarNombreCuenta(c.displayName) || dip;
    const nombre = NOMBRE_GENERICO.test(rawNombre) ? dip : rawNombre;
    if (!porDip.has(dip)) {
      porDip.set(dip, {
        dip,
        placetaId: u?.placetaId || c.placetaId,
        nombre,
        cuentas: 0,
        esEmpresa: c.type === 'Business' || c.type === 'State',
        tieneUsuario
      });
    }
    const entry = porDip.get(dip);
    entry.cuentas += 1;
    if (c.type === 'Business' || c.type === 'State') entry.esEmpresa = true;
    if (tieneUsuario) entry.tieneUsuario = true;
    // Preferir el nombre más completo.
    if (!NOMBRE_GENERICO.test(rawNombre) && rawNombre.length > entry.nombre.length) {
      entry.nombre = rawNombre;
    }
  }

  const padron = [...porDip.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return {
    totalDip: padron.length,
    yaRegistrados: padron.filter(p => registradosSet.has(p.dip)),
    pendientes: padron.filter(p => !registradosSet.has(p.dip)),
    padron,
    registrosPlacetaid: registros.length
  };
}

/**
 * Ejecuta la sincronización completa:
 *  - Alta como PlacetaID (contraseña temporal recuperable) de los pendientes.
 *  - Alta como ciudadano (censo tributario) de los que falten.
 */
export async function sincronizar() {
  const padron = await construirPadron();
  const creados = [];
  const errores = [];
  const ciudadanosAltas = [];
  const ciudadanosErrores = [];

  // 1) Alta como PlacetaID de los pendientes.
  for (const p of padron.pendientes) {
    const { nombre, apellidos } = dividirNombre(p.nombre);
    const res = await apiPlacetaidAdmin('/admin/registros/crear', {
      method: 'POST',
      body: {
        dip: p.dip,
        nombre: nombre || p.dip,
        apellidos: apellidos || 'GDLP',
        placeid: `PLID-${p.dip}`,
        automatico: true
      }
    });
    if (res.ok && res.data?.ok) {
      creados.push({
        dip: p.dip,
        nombre: p.nombre,
        placeid: res.data.placeid,
        passwordTemporal: res.data.passwordTemporal || ''
      });
    } else {
      errores.push({ dip: p.dip, nombre: p.nombre, error: res.data?.error || `HTTP ${res.status}` });
    }
  }

  // 2) Alta como ciudadano en el censo tributario de los que falten.
  const censo = await leerCensoTributario();
  const objetivosCiudadanos = padron.padron.filter(p => !censo.set.has(p.dip));
  const sinUsuarioBanco = [];
  for (const p of objetivosCiudadanos) {
    // alta-tributos necesita un bank_user; si no existe, no se puede censar aún.
    if (!p.tieneUsuario) {
      sinUsuarioBanco.push({ dip: p.dip, nombre: p.nombre });
      continue;
    }
    const res = await apiBancoPost('alta-tributos', { placetaId: p.placetaId });
    if (res && (res.eip || res.tributosCensusDate || res.message)) {
      ciudadanosAltas.push({ dip: p.dip, nombre: p.nombre, eip: res.eip || null });
    } else {
      ciudadanosErrores.push({ dip: p.dip, nombre: p.nombre, error: (res && res.error) || 'Sin respuesta del banco' });
    }
  }

  return {
    totalDip: padron.totalDip,
    yaRegistradosPlacetaid: padron.yaRegistrados.length,
    creadosPlacetaid: creados.length,
    creados,
    erroresPlacetaid: errores.length,
    errores,
    yaEnCenso: censo.set.size,
    altasCiudadano: ciudadanosAltas.length,
    ciudadanosAltas,
    erroresCiudadano: ciudadanosErrores.length,
    ciudadanosErrores,
    sinUsuarioBanco,
    sinUsuarioBancoCount: sinUsuarioBanco.length
  };
}

/** Recupera la contraseña temporal de un ciudadano (para enviársela). */
export async function recuperarPasswordTemporal(dip) {
  const res = await apiPlacetaidAdmin('/admin/registros/password', {
    method: 'POST',
    body: { dip }
  });
  return { ok: res.ok && res.data?.ok, data: res.data };
}
