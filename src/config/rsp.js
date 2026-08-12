/**
 * RED DE SERVICIOS DE LA PLACETA (RSP)
 * 
 * Sistema centralizado de servicios de datos para todas las entidades públicas de GDLP.
 * Proporciona acceso a datos, almacenamiento y modificación con facturación por conexión.
 * 
 * Tarifas (Art. RSP-1):
 *   - Consulta: 0.001 Pz/conexión (INC IVA)
 *   - Modificación: 0.1 Pz/conexión (INC IVA)
 *   - IVA: 12%
 * 
 * Fondos iniciales transferidos desde "Red del Grupo de La Placeta": 18,309.83 Pz
 * Sanción por IVA no abonado: 2,461.77 Pz
 * 
 * Pagos: Se procesan a través del Banco de La Placeta real.
 *   - Base del servicio → Cuenta RSP (GDLP-AP99-001)
 *   - IVA → Tributos TGLP (GDLP-AP98-605)
 *   - Sanciones → Administración (AGLDP)
 */

import { supabase } from './supabase.js';
import { pagarFacturaBanco, pagarSancionBanco } from './pagos.js';
import { getSnapshot } from './normativa-dinamica.js';

// ── CONSTANTES ────────────────────────────────────────────────────────────
// IVA dinámico desde el BOP (FASE 5): CNIC-4.4, fallback 0.12 si aún no se carga
function ivaActual() { return getSnapshot('IVA'); }
const TARIFA_CONSULTA = 0.001;   // Pz por conexión de consulta
const TARIFA_MODIFICACION = 0.1;  // Pz por conexión de modificación
const FONDOS_INICIALES = 18309.83;
const SANCION_IVA = 2461.77;
const CUENTA_RSP = 'GDLP-AP64-583';
const CUENTA_ADMINISTRACION = 'GDLP-AP27-062';

// ── ESTADO EN MEMORIA ─────────────────────────────────────────────────────
const memConexiones = [];
const memFacturas = [];
const memFondos = {
  saldo: FONDOS_INICIALES,
  sancionPagada: false,
  sancionPendiente: SANCION_IVA,
  historial: [
    { tipo: 'TRANSFERENCIA_INICIAL', concepto: 'Transferencia desde Red del Grupo de La Placeta', importe: FONDOS_INICIALES, fecha: new Date().toISOString(), saldo: FONDOS_INICIALES }
  ]
};

let contadorConexiones = 0;
let contadorFacturas = 0;

function nextConexionId() { return `RSP-CON-${String(++contadorConexiones).padStart(6, '0')}`; }
function nextFacturaId() { return `RSP-FAC-${String(++contadorFacturas).padStart(5, '0')}`; }

// ── TIPOS DE CONEXIÓN ────────────────────────────────────────────────────
export const TIPO_CONEXION = {
  CONSULTA: 'consulta',
  MODIFICACION: 'modificacion'
};

// ── REGISTRAR CONEXIÓN ───────────────────────────────────────────────────
export function registrarConexion({ entidad, tipo, endpoint, usuario, dip, detalle = '' }) {
  const tarifa = tipo === TIPO_CONEXION.MODIFICACION ? TARIFA_MODIFICACION : TARIFA_CONSULTA;
  const iva = tarifa * ivaActual();
  const total = tarifa + iva;

  const conexion = {
    id: nextConexionId(),
    entidad,
    tipo,
    endpoint,
    usuario: usuario || 'sistema',
    dip: dip || '',
    tarifa,
    iva,
    total,
    detalle,
    timestamp: new Date().toISOString()
  };

  memConexiones.push(conexion);

  // Acumular fondos
  memFondos.saldo += total;
  memFondos.historial.push({
    tipo: 'CONEXION',
    concepto: `${tipo === TIPO_CONEXION.MODIFICACION ? 'Modificación' : 'Consulta'} - ${entidad}:${endpoint}`,
    importe: total,
    fecha: conexion.timestamp,
    saldo: memFondos.saldo,
    conexionId: conexion.id
  });

  // Persistir en Supabase si está disponible
  persistirConexion(conexion).catch(e => console.warn('[RSP] Error persistente:', e.message));

  return conexion;
}

// ── GENERAR FACTURA ───────────────────────────────────────────────────────
export function generarFactura({ entidad, periodoInicio, periodoFin, conexiones = [] }) {
  const conexionesEntidad = conexiones.length > 0
    ? conexiones
    : memConexiones.filter(c => c.entidad === entidad);

  if (conexionesEntidad.length === 0) return null;

  const consultas = conexionesEntidad.filter(c => c.tipo === TIPO_CONEXION.CONSULTA);
  const modificaciones = conexionesEntidad.filter(c => c.tipo === TIPO_CONEXION.MODIFICACION);

  const baseConsultas = consultas.reduce((s, c) => s + c.tarifa, 0);
  const baseModificaciones = modificaciones.reduce((s, c) => s + c.tarifa, 0);
  const baseTotal = baseConsultas + baseModificaciones;
  const ivaTotal = baseTotal * ivaActual();
  const totalFactura = baseTotal + ivaTotal;

  const factura = {
    id: nextFacturaId(),
    entidad,
    periodoInicio: periodoInicio || conexionesEntidad[0]?.timestamp,
    periodoFin: periodoFin || conexionesEntidad[conexionesEntidad.length - 1]?.timestamp,
    emitida: new Date().toISOString(),
    estado: 'pendiente',
    conexiones: conexionesEntidad.length,
    detalle: {
      consultas: consultas.length,
      modificaciones: modificaciones.length,
      baseConsultas,
      baseModificaciones,
      baseTotal,
      iva: ivaTotal,
      total: totalFactura
    }
  };

  memFacturas.push(factura);

  return factura;
}

// ── GENERAR FACTURA POR IDs DE CONEXIÓN ──────────────────────────────────
export function generarFacturaPorIds({ entidad, conexionIds = [] }) {
  if (!entidad || conexionIds.length === 0) return null;

  // Buscar conexiones por IDs (de memoria o Supabase)
  const conexionesEntidad = memConexiones.filter(c =>
    c.entidad === entidad && conexionIds.includes(c.id)
  );

  if (conexionesEntidad.length === 0) return null;

  const consultas = conexionesEntidad.filter(c => c.tipo === TIPO_CONEXION.CONSULTA);
  const modificaciones = conexionesEntidad.filter(c => c.tipo === TIPO_CONEXION.MODIFICACION);

  const baseConsultas = consultas.reduce((s, c) => s + c.tarifa, 0);
  const baseModificaciones = modificaciones.reduce((s, c) => s + c.tarifa, 0);
  const baseTotal = baseConsultas + baseModificaciones;
  const ivaTotal = baseTotal * ivaActual();
  const totalFactura = baseTotal + ivaTotal;

  const factura = {
    id: nextFacturaId(),
    entidad,
    periodoInicio: conexionesEntidad[0]?.timestamp,
    periodoFin: conexionesEntidad[conexionesEntidad.length - 1]?.timestamp,
    emitida: new Date().toISOString(),
    estado: 'pendiente',
    conexiones: conexionesEntidad.length,
    conexionIds: conexionIds, // IDs de las conexiones facturadas
    detalle: {
      consultas: consultas.length,
      modificaciones: modificaciones.length,
      baseConsultas,
      baseModificaciones,
      baseTotal,
      iva: ivaTotal,
      total: totalFactura
    }
  };

  memFacturas.push(factura);

  return factura;
}

// ── ELIMINAR CONEXIONES POR IDs (tras facturar) ──────────────────────────
export function eliminarConexionesPorIds(ids = []) {
  if (ids.length === 0) return 0;
  const antes = memConexiones.length;
  for (const id of ids) {
    const idx = memConexiones.findIndex(c => c.id === id);
    if (idx !== -1) memConexiones.splice(idx, 1);
  }
  const eliminadas = antes - memConexiones.length;

  // También eliminar de Supabase si es posible
  if (supabase && ids.length > 0) {
    setImmediate(async () => {
      try {
        await supabase.from('rsp_conexiones').delete().in('id', ids);
      } catch (e) { console.warn('[RSP] No se pudo eliminar de Supabase:', e.message); }
    });
  }

  return eliminadas;
}

// ── PAGAR FACTURA (vía Banco de La Placeta real + IVA a Tributos) ────────
export async function pagarFactura(facturaId) {
  const factura = memFacturas.find(f => f.id === facturaId);
  if (!factura) return { success: false, error: 'Factura no encontrada' };
  if (factura.estado === 'pagada') return { success: false, error: 'Factura ya pagada' };

  const total = factura.detalle.total;
  const base = factura.detalle.baseTotal;
  const ivaTotal = factura.detalle.iva;

  if (memFondos.saldo < total) {
    return { success: false, error: `Fondos insuficientes: ${memFondos.saldo.toFixed(2)} Pz disponibles, ${total.toFixed(2)} Pz requeridos` };
  }

  // Procesar pago vía Banco de La Placeta real (base→RSP, IVA→TGLP)
  const pagoBanco = await pagarFacturaBanco({
    entidad: factura.entidad,
    base,
    iva: ivaTotal,
    total,
    concepto: `Servicios RSP - ${factura.entidad} (${factura.conexiones} conexiones)`,
    facturaId
  });

  if (!pagoBanco.success) {
    return { success: false, error: `Error en pago bancario: ${pagoBanco.errores?.[0]?.error || 'desconocido'}`, detalle: pagoBanco };
  }

  // Actualizar estado local
  memFondos.saldo -= total;
  factura.estado = 'pagada';
  factura.pagadaEn = new Date().toISOString();
  factura.pagoBanco = pagoBanco;

  memFondos.historial.push({
    tipo: 'PAGO_FACTURA',
    concepto: `Pago factura ${facturaId} - ${factura.entidad}. Base: ${base} Pz, IVA: ${ivaTotal} Pz a TGLP`,
    importe: -total,
    fecha: factura.pagadaEn,
    saldo: memFondos.saldo,
    facturaId,
    desglose: { base, iva: ivaTotal }
  });

  return {
    success: true,
    factura,
    nuevoSaldo: memFondos.saldo,
    pagoBanco: true,
    desglose: `Base ${base.toFixed(3)} Pz → RSP (GDLP-AP99-001) · IVA ${ivaTotal.toFixed(3)} Pz → Tributos TGLP (GDLP-AP98-605)`
  };
}

// ── PAGAR SANCIÓN IVA (vía Banco de La Placeta real) ─────────────────────
export async function pagarSancionIVA() {
  if (memFondos.sancionPagada) {
    return { success: false, error: 'Sanción ya pagada' };
  }
  if (memFondos.saldo < SANCION_IVA) {
    return { success: false, error: `Fondos insuficientes: ${memFondos.saldo.toFixed(2)} Pz disponibles, ${SANCION_IVA.toFixed(2)} Pz requeridos` };
  }

  // Procesar pago vía Banco de La Placeta real
  const pagoBanco = await pagarSancionBanco(SANCION_IVA, 'IVA no abonado — Red del Grupo de La Placeta');

  if (!pagoBanco.success) {
    return { success: false, error: `Error procesando pago en Banco: ${pagoBanco.errores?.[0]?.error || 'desconocido'}` };
  }

  // Actualizar estado local
  memFondos.saldo -= SANCION_IVA;
  memFondos.sancionPagada = true;
  memFondos.sancionPendiente = 0;

  memFondos.historial.push({
    tipo: 'SANCION_IVA',
    concepto: 'Sanción por IVA no abonado — Red del Grupo de La Placeta (Art. Constitución GDLP). Cobrado vía Banco de La Placeta.',
    importe: -SANCION_IVA,
    fecha: new Date().toISOString(),
    saldo: memFondos.saldo,
    referenciaBanco: pagoBanco
  });

  return {
    success: true,
    importe: SANCION_IVA,
    nuevoSaldo: memFondos.saldo,
    pagoBanco: true,
    detalle: `Sanción de ${SANCION_IVA} Pz pagada. ` +
             `Desglose: RSP (GDLP-AP99-001) → Administración (AGLDP). ` +
             `Operación registrada en Banco de La Placeta.`
  };
}

// ── CONSULTAR FONDOS ──────────────────────────────────────────────────────
export function getEstadoFondos() {
  return {
    saldo: memFondos.saldo,
    sancionPagada: memFondos.sancionPagada,
    sancionPendiente: memFondos.sancionPendiente,
    fondosIniciales: FONDOS_INICIALES,
    totalIngresos: memFondos.historial
      .filter(h => h.importe > 0)
      .reduce((s, h) => s + h.importe, 0),
    totalEgresos: memFondos.historial
      .filter(h => h.importe < 0)
      .reduce((s, h) => s + Math.abs(h.importe), 0),
    historial: memFondos.historial
  };
}

// ── CONSULTAR CONEXIONES (memoria + Supabase) ────────────────────────────
export async function getConexionesFromSupabase(filtros = {}) {
  if (!supabase) return null;
  try {
    let query = supabase.from('rsp_conexiones').select('*');
    if (filtros.entidad) query = query.eq('entidad', filtros.entidad);
    if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
    if (filtros.desde) query = query.gte('created_at', filtros.desde);
    if (filtros.hasta) query = query.lte('created_at', filtros.hasta);
    query = query.order('created_at', { ascending: false });
    if (filtros.limit) query = query.limit(filtros.limit);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[RSP] Error leyendo de Supabase:', err.message);
    return null;
  }
}

export function getConexiones(filtros = {}) {
  let resultado = [...memConexiones];
  if (filtros.entidad) resultado = resultado.filter(c => c.entidad === filtros.entidad);
  if (filtros.tipo) resultado = resultado.filter(c => c.tipo === filtros.tipo);
  if (filtros.desde) resultado = resultado.filter(c => c.timestamp >= filtros.desde);
  if (filtros.hasta) resultado = resultado.filter(c => c.timestamp <= filtros.hasta);
  if (filtros.limit) resultado = resultado.slice(-filtros.limit);
  return resultado;
}

// ── CONSULTAR FACTURAS ────────────────────────────────────────────────────
export function getFacturas(filtros = {}) {
  let resultado = [...memFacturas];
  if (filtros.entidad) resultado = resultado.filter(f => f.entidad === filtros.entidad);
  if (filtros.estado) resultado = resultado.filter(f => f.estado === filtros.estado);
  return resultado;
}

// ── TARIFAS ────────────────────────────────────────────────────────────────
export function getTarifas() {
  const iva = ivaActual();
  return {
    consulta: { precio: TARIFA_CONSULTA, iva: TARIFA_CONSULTA * iva, total: TARIFA_CONSULTA * (1 + iva), descripcion: 'Conexión para consulta de datos' },
    modificacion: { precio: TARIFA_MODIFICACION, iva: TARIFA_MODIFICACION * iva, total: TARIFA_MODIFICACION * (1 + iva), descripcion: 'Conexión para modificación de datos' },
    iva: iva * 100 + '%',
    nota: 'Tarifas según normativa RSP aprobada. IVA dinámico desde el BOP (CNIC-4.4).'
  };
}

// ── ESTADÍSTICAS ──────────────────────────────────────────────────────────
export function getEstadisticas() {
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const esteMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const conexionesHoy = memConexiones.filter(c => new Date(c.timestamp) >= hoy);
  const conexionesMes = memConexiones.filter(c => new Date(c.timestamp) >= esteMes);

  const ingresosHoy = conexionesHoy.reduce((s, c) => s + c.total, 0);
  const ingresosMes = conexionesMes.reduce((s, c) => s + c.total, 0);

  return {
    totalConexiones: memConexiones.length,
    conexionesHoy: conexionesHoy.length,
    conexionesEsteMes: conexionesMes.length,
    facturasEmitidas: memFacturas.length,
    facturasPendientes: memFacturas.filter(f => f.estado === 'pendiente').length,
    ingresosHoy,
    ingresosEsteMes: ingresosMes,
    saldoActual: memFondos.saldo,
    fondosIniciales: FONDOS_INICIALES,
    sancionPendiente: memFondos.sancionPendiente
  };
}

// ── PERSISTENCIA SUPABASE + FALLBACK A MEMORIA PERSISTENTE ────────────────
async function persistirConexion(conexion) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('rsp_conexiones').insert({
      id: conexion.id,
      entidad: conexion.entidad,
      tipo: conexion.tipo,
      endpoint: conexion.endpoint,
      usuario: conexion.usuario,
      dip: conexion.dip,
      tarifa: conexion.tarifa,
      iva: conexion.iva,
      total: conexion.total,
      detalle: conexion.detalle,
      created_at: conexion.timestamp
    });
    if (error && error.code === '42P01') {
      console.warn('[RSP] Tabla rsp_conexiones no existe, intentando crearla...');
      // Intentar crear la tabla via SQL directo
      try {
        await supabase.rpc('exec_sql', {
          sql: `CREATE TABLE IF NOT EXISTS rsp_conexiones (
            id TEXT PRIMARY KEY, entidad TEXT NOT NULL, tipo TEXT NOT NULL,
            endpoint TEXT DEFAULT '', usuario TEXT DEFAULT '', dip TEXT DEFAULT '',
            tarifa REAL DEFAULT 0, iva REAL DEFAULT 0, total REAL DEFAULT 0,
            detalle TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
          );`
        });
        // Reintentar insert
        const { error: retryError } = await supabase.from('rsp_conexiones').insert({
          id: conexion.id, entidad: conexion.entidad, tipo: conexion.tipo,
          endpoint: conexion.endpoint, usuario: conexion.usuario, dip: conexion.dip,
          tarifa: conexion.tarifa, iva: conexion.iva, total: conexion.total,
          detalle: conexion.detalle, created_at: conexion.timestamp
        });
        if (retryError) throw retryError;
        console.log('[RSP] ✅ Tabla creada y conexión persistida');
      } catch (sqlErr) {
        console.warn('[RSP] No se pudo crear tabla automáticamente:', sqlErr.message);
        console.warn('[RSP] Ejecuta el script en docs/migrar-rsp-conexiones.sql en Supabase');
      }
    } else if (error) {
      console.warn('[RSP] Error persistente:', error.message);
    }
  } catch (err) {
    console.warn('[RSP] No se pudo persistir conexión:', err.message);
  }
}

export async function initRSPTable() {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('rsp_conexiones').select('id').limit(1);
    if (error && error.code === '42P01') {
      console.warn('[RSP] Tabla rsp_conexiones no existe. Intentando crearla...');
      try {
        // Crear tabla via SQL directo (si hay permiso)
        const { error: createError } = await supabase.rpc('exec_sql', {
          sql: `CREATE TABLE IF NOT EXISTS rsp_conexiones (
            id TEXT PRIMARY KEY,
            entidad TEXT NOT NULL,
            tipo TEXT NOT NULL,
            endpoint TEXT DEFAULT '',
            usuario TEXT DEFAULT '',
            dip TEXT DEFAULT '',
            tarifa REAL DEFAULT 0,
            iva REAL DEFAULT 0,
            total REAL DEFAULT 0,
            detalle TEXT DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_rsp_conexiones_entidad ON rsp_conexiones(entidad);
          CREATE INDEX IF NOT EXISTS idx_rsp_conexiones_creado ON rsp_conexiones(created_at);`
        });
        if (createError) throw createError;
        console.log('[RSP] ✅ Tabla rsp_conexiones creada en Supabase');
        return true;
      } catch (sqlErr) {
        console.warn('[RSP] No se pudo crear la tabla automáticamente.');
        console.warn('[RSP] Ejecuta manualmente el script en docs/migrar-rsp-conexiones.sql');
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export default {
  registrarConexion,
  generarFactura,
  pagarFactura,
  pagarSancionIVA,
  getEstadoFondos,
  getConexiones,
  getFacturas,
  getTarifas,
  getEstadisticas,
  initRSPTable,
  TIPO_CONEXION,
  CUENTA_RSP
};
