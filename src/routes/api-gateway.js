/**
 * API GATEWAY — Sistema unificado de APIs externas por entidad
 * 
 * Endpoint base: /api/v1/{entidad}/{recurso}
 * 
 * Características:
 *   - Autenticación vía API Key (header X-API-Key)
 *   - Restricción por plataforma (header X-Platform)
 *   - Tarificación automática vía RSP (consulta/modificación)
 *   - Documentación viva desde el registro de APIs
 *   - IBAN de cada entidad para facturación
 * 
 * Headers requeridos:
 *   X-API-Key:    Clave de API asignada a la app
 *   X-Platform:   android | ios | web
 *   X-App-Version: Versión de la app (recomendado)
 */

import { Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import {
  getEntityAPI, getEntityEndpoint, isPlatformAllowed,
  getEntitiesIBAN, getEntityIBAN, getEndpointCost, PLATFORM
} from '../config/api-registry.js';
import { registrarConexion, TIPO_CONEXION, getTarifas, getConexiones, getFacturas, getEstadisticas } from '../config/rsp.js';
import {
  apiBancoGetState, apiBancoPost, apiPlacetaidRegistros, apiPlacetaidStats,
  sbListSolicitantes, sbFindSolicitanteByDip, sbListDeclaraciones
} from '../config/db.js';
import { verificarSesion } from '../middleware/auth.js';
// Routers oficiales de la Academia Placeta Junior (delegación directa)
import juniorOficialApiRoutes from './junior-oficial-api.js';
import juniorAcademiaApiRoutes from './junior-academia-api.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

// Mapa de API Keys → App (en producción: Supabase)
// Formato: { key: { nombre, plataforma, entidadesPermitidas, activa, allowedOrigins } }
const API_KEYS = new Map();

// API Keys predefinidas para desarrollo
function initAPIKeys() {
  const keys = {
    'android-app-banco-key-2026':  { nombre: 'Banco App Android',  plataforma: 'android', entidadesPermitidas: ['banco'], activa: true, allowedOrigins: ['laplaceta.org', 'banco.laplaceta.org'] },
    'ios-app-banco-key-2026':      { nombre: 'Banco App iOS',      plataforma: 'ios',     entidadesPermitidas: ['banco'], activa: true, allowedOrigins: ['laplaceta.org', 'banco.laplaceta.org'] },
    'web-app-banco-key-2026':      { nombre: 'Banco App Web',      plataforma: 'web',     entidadesPermitidas: ['banco'], activa: true, allowedOrigins: ['rsp.laplaceta.org', 'banco.laplaceta.org'] },
    'android-tributos-key-2026':   { nombre: 'Tributos App Android', plataforma: 'android', entidadesPermitidas: ['tributos'], activa: true, allowedOrigins: ['laplaceta.org', 'tributos.laplaceta.org'] },
    'ios-tributos-key-2026':       { nombre: 'Tributos App iOS',   plataforma: 'ios',     entidadesPermitidas: ['tributos'], activa: true, allowedOrigins: ['laplaceta.org', 'tributos.laplaceta.org'] },
    'web-tributos-key-2026':       { nombre: 'Tributos App Web',   plataforma: 'web',     entidadesPermitidas: ['tributos'], activa: true, allowedOrigins: ['rsp.laplaceta.org', 'tributos.laplaceta.org'] },
    'android-junta-key-2026':      { nombre: 'Junta App Android',  plataforma: 'android', entidadesPermitidas: ['junta'], activa: true, allowedOrigins: ['laplaceta.org', 'junta.laplaceta.org'] },
    'ios-junta-key-2026':          { nombre: 'Junta App iOS',      plataforma: 'ios',     entidadesPermitidas: ['junta'], activa: true, allowedOrigins: ['laplaceta.org', 'junta.laplaceta.org'] },
    'web-junta-key-2026':          { nombre: 'Junta App Web',      plataforma: 'web',     entidadesPermitidas: ['junta'], activa: true, allowedOrigins: ['rsp.laplaceta.org', 'junta.laplaceta.org'] },
    'web-admin-key-2026':          { nombre: 'Admin App Web',      plataforma: 'web',     entidadesPermitidas: ['administracion'], activa: true, allowedOrigins: ['rsp.laplaceta.org'] },
    'android-rsp-key-2026':        { nombre: 'RSP App Android',    plataforma: 'android', entidadesPermitidas: ['rsp'], activa: true, allowedOrigins: ['laplaceta.org', 'rsp.laplaceta.org'] },
    'ios-rsp-key-2026':            { nombre: 'RSP App iOS',        plataforma: 'ios',     entidadesPermitidas: ['rsp'], activa: true, allowedOrigins: ['laplaceta.org', 'rsp.laplaceta.org'] },
    'web-rsp-key-2026':            { nombre: 'RSP App Web',        plataforma: 'web',     entidadesPermitidas: ['rsp'], activa: true, allowedOrigins: ['rsp.laplaceta.org'] },
    'android-junior-key-2026':     { nombre: 'Junior App Android', plataforma: 'android', entidadesPermitidas: ['junior'], activa: true, allowedOrigins: ['laplaceta.org', 'junior.laplaceta.org'] },
    'ios-junior-key-2026':         { nombre: 'Junior App iOS',     plataforma: 'ios',     entidadesPermitidas: ['junior'], activa: true, allowedOrigins: ['laplaceta.org', 'junior.laplaceta.org'] },
    'web-junior-key-2026':         { nombre: 'Junior App Web',     plataforma: 'web',     entidadesPermitidas: ['junior'], activa: true, allowedOrigins: ['rsp.laplaceta.org', 'junior.laplaceta.org'] },
    // Clave maestra (solo para administración interna)
    'admin-master-key-2026':       { nombre: 'Admin Master',       plataforma: 'web',     entidadesPermitidas: ['banco','tributos','junta','administracion','rsp','junior'], activa: true, allowedOrigins: ['*'] },
  };
  for (const [key, value] of Object.entries(keys)) {
    API_KEYS.set(key, value);
  }
}
initAPIKeys();

// ── Almacén de apps registradas (para el panel de gestión) ─────────────
const appsRegistradas = [
  { id: 'app-banco-android', nombre: 'Banco de La Placeta', plataforma: 'android', apiKey: 'android-app-banco-key-2026', entidades: ['banco'], origen: 'laplaceta.org', activa: true, createdAt: '2026-01-15' },
  { id: 'app-banco-ios', nombre: 'Banco de La Placeta', plataforma: 'ios', apiKey: 'ios-app-banco-key-2026', entidades: ['banco'], origen: 'laplaceta.org', activa: true, createdAt: '2026-01-15' },
  { id: 'app-banco-web', nombre: 'Banco de La Placeta', plataforma: 'web', apiKey: 'web-app-banco-key-2026', entidades: ['banco'], origen: 'banco.laplaceta.org', activa: true, createdAt: '2026-01-15' },
  { id: 'app-tributos-android', nombre: 'Tributos de La Placeta', plataforma: 'android', apiKey: 'android-tributos-key-2026', entidades: ['tributos'], origen: 'laplaceta.org', activa: true, createdAt: '2026-02-01' },
  { id: 'app-tributos-ios', nombre: 'Tributos de La Placeta', plataforma: 'ios', apiKey: 'ios-tributos-key-2026', entidades: ['tributos'], origen: 'laplaceta.org', activa: true, createdAt: '2026-02-01' },
  { id: 'app-junta-android', nombre: 'Junta de La Placeta', plataforma: 'android', apiKey: 'android-junta-key-2026', entidades: ['junta'], origen: 'laplaceta.org', activa: true, createdAt: '2026-03-10' },
  { id: 'app-junta-ios', nombre: 'Junta de La Placeta', plataforma: 'ios', apiKey: 'ios-junta-key-2026', entidades: ['junta'], origen: 'laplaceta.org', activa: true, createdAt: '2026-03-10' },
  { id: 'app-rsp-android', nombre: 'RSP Móvil', plataforma: 'android', apiKey: 'android-rsp-key-2026', entidades: ['rsp'], origen: 'laplaceta.org', activa: true, createdAt: '2026-04-01' },
  { id: 'app-rsp-ios', nombre: 'RSP Móvil', plataforma: 'ios', apiKey: 'ios-rsp-key-2026', entidades: ['rsp'], origen: 'laplaceta.org', activa: true, createdAt: '2026-04-01' },
  { id: 'app-junior-android', nombre: 'Placeta Junior', plataforma: 'android', apiKey: 'android-junior-key-2026', entidades: ['junior'], origen: 'laplaceta.org', activa: true, createdAt: '2026-06-01' },
  { id: 'app-junior-ios', nombre: 'Placeta Junior', plataforma: 'ios', apiKey: 'ios-junior-key-2026', entidades: ['junior'], origen: 'laplaceta.org', activa: true, createdAt: '2026-06-01' },
  { id: 'app-junior-web', nombre: 'Placeta Junior', plataforma: 'web', apiKey: 'web-junior-key-2026', entidades: ['junior'], origen: 'junior.laplaceta.org', activa: true, createdAt: '2026-06-01' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE DE AUTENTICACIÓN Y VALIDACIÓN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valida la API Key y plataforma
 */
function validateAPIRequest(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const platform = req.headers['x-platform'] || 'web';

  if (!apiKey) {
    return res.status(401).json({
      error: 'API Key requerida',
      detalle: 'Incluye el header X-API-Key con tu clave de API',
      documentacion: '/api/v1/docs'
    });
  }

  const app = API_KEYS.get(apiKey);
  if (!app) {
    return res.status(401).json({
      error: 'API Key inválida',
      detalle: 'La clave proporcionada no está registrada. Solicita una nueva en admin-placeta.'
    });
  }

  if (!app.activa) {
    return res.status(403).json({
      error: 'API Key desactivada',
      detalle: 'Esta clave ha sido desactivada. Contacta con administración.'
    });
  }

  // Validar plataforma declarada vs key
  if (app.plataforma !== platform && app.plataforma !== 'web') {
    return res.status(403).json({
      error: 'Plataforma no autorizada para esta API Key',
      detalle: `La key ${apiKey.slice(0, 12)}... está asignada a ${app.plataforma}, no a ${platform}`,
      plataformaEsperada: app.plataforma
    });
  }

  // ── Validación CORS (Origin) ────────────────────────────────────────
  if (app.allowedOrigins && !app.allowedOrigins.includes('*')) {
    const origin = req.headers['origin'] || req.headers['referer'] || '';
    const hostname = origin ? new URL(origin).hostname : '';
    const permitido = app.allowedOrigins.some(o => hostname.endsWith(o) || hostname === o);
    if (!permitido && hostname) {
      return res.status(403).json({
        error: 'Origen no autorizado (CORS)',
        detalle: `El origen "${hostname}" no está en la lista de permitidos para esta key`,
        origenesPermitidos: app.allowedOrigins
      });
    }
  }

  // Guardar contexto en request
  req.apiContext = { app, apiKey, platform };
  next();
}

/**
 * Valida que la entidad solicitada esté permitida para esta API Key
 * (lee la entidad de req.params, usable directamente como middleware)
 */
function validateEntityAccess(req, res, next) {
  const entidad = req.params?.entidad || req.entidad || '';
  const { app } = req.apiContext;
  if (!app.entidadesPermitidas.includes(entidad)) {
    return res.status(403).json({
      error: 'Acceso denegado a esta entidad',
      detalle: `La app "${app.nombre}" no tiene permisos para acceder a "${entidad}"`,
      entidadesPermitidas: app.entidadesPermitidas
    });
  }
  next();
}

/**
 * Verifica que la plataforma esté permitida para el endpoint
 */
function validatePlatformForEndpoint(entidad, path) {
  return (req, res, next) => {
    const platform = req.apiContext.platform;
    // La clave maestra puede acceder desde cualquier plataforma
    if (req.apiContext.app.nombre === 'Admin Master') return next();

    if (!isPlatformAllowed(entidad, path, platform)) {
      return res.status(403).json({
        error: 'Endpoint no disponible para esta plataforma',
        detalle: `El endpoint ${req.method} ${path} no está disponible para ${platform}`,
        plataformasPermitidas: getEntityEndpoint(entidad, path)?.platforms || []
      });
    }
    next();
  };
}

/**
 * Registra la conexión en RSP para tarificación
 */
function rspCharge(tipo) {
  return (req, res, next) => {
    const entidad = req.params.entidad || 'general';
    const appName = req.apiContext?.app?.nombre || 'api-externa';
    const platform = req.apiContext?.platform || 'web';

    // Registrar en segundo plano (no bloquea)
    setImmediate(() => {
      try {
        registrarConexion({
          entidad,
          tipo,
          endpoint: `[API v1] ${req.method} /${req.originalUrl}`,
          usuario: `API:${appName}`,
          dip: req.headers['x-user-dip'] || '',
          detalle: `App: ${appName} | Platform: ${platform}`
        });
      } catch (err) {
        console.warn('[API Gateway] Error RSP:', err.message);
      }
    });

    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTACIÓN DE APIs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/docs — Documentación general del API Gateway
 */
router.get('/v1/docs', (req, res) => {
  const entitiesIBAN = getEntitiesIBAN();
  const tarifas = getTarifas();

  res.json({
    api: 'API Gateway — Admin Placeta v1',
    version: '1.0.0',
    baseURL: '/api/v1/{entidad}',
    documentacion: 'Cada entidad expone sus propios endpoints bajo /api/v1/{entidad}',
    autenticacion: {
      tipo: 'API Key',
      header: 'X-API-Key',
      plataforma: 'X-Platform (android | ios | web)',
      ejemplo: {
        'X-API-Key': 'tu-api-key',
        'X-Platform': 'web'
      }
    },
    tarifas: tarifas,
    entidades: Object.entries(entitiesIBAN).map(([id, data]) => ({
      id,
      nombre: data.nombre,
      iban: data.iban,
      contacto: data.contacto,
      endpoints: `/api/v1/${id}`
    }))
  });
});

/**
 * GET /api/v1/:entidad/docs — Documentación de una entidad específica
 */
router.get('/v1/:entidad/docs', (req, res) => {
  const { entidad } = req.params;
  const api = getEntityAPI(entidad);

  if (!api) {
    return res.status(404).json({
      error: 'Entidad no encontrada',
      entidadesDisponibles: Object.keys(getEntitiesIBAN())
    });
  }

  const tarifa = getEndpointCost(entidad, '/');

  res.json({
    entidad: api.nombre,
    iban: api.iban,
    contacto: api.contacto,
    descripcion: api.descripcion,
    baseURL: `/api/v1/${entidad}`,
    tarifas: {
      consulta: { precio: 0.001, iva: 0.12, total: 0.00112, descripcion: 'Por petición GET' },
      modificacion: { precio: 0.1, iva: 0.12, total: 0.112, descripcion: 'Por petición POST/PUT/DELETE' }
    },
    facturacion: {
      metodo: 'Automática vía RSP',
      ibanEntidad: api.iban,
      ciclo: 'Facturación mensual o bajo demanda'
    },
    endpoints: api.endpoints.map(ep => ({
      path: ep.path,
      method: ep.method,
      tipo: ep.tipo,
      descripcion: ep.descripcion,
      platforms: ep.platforms,
      params: ep.params || [],
      dataReturn: ep.dataReturn
    }))
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINTS POR ENTIDAD
// ═══════════════════════════════════════════════════════════════════════════

// ── Helper: obtener handler de datos según entidad y endpoint ─────────
async function handleEntityRequest(entidad, path, method, req) {
  switch (entidad) {
    case 'banco':
      return handleBancoAPI(path, method, req);
    case 'tributos':
      return handleTributosAPI(path, method, req);
    case 'junta':
      return handleJuntaAPI(path, method, req);
    case 'administracion':
      return handleAdminAPI(path, method, req);
    case 'rsp':
      return handleRSPAPI(path, method, req);
    case 'junior':
      return handleJuniorAPI(path, method, req);
    default:
      return null;
  }
}

// ── BANCO ──────────────────────────────────────────────────────────────
async function handleBancoAPI(path, method, req) {
  const state = await apiBancoGetState();

  if (path === '/cuentas' && method === 'GET') {
    const cuentas = state?.accounts || [];
    return { success: true, total: cuentas.length, data: cuentas };
  }

  if (path.match(/^\/cuentas\/([^/]+)$/) && method === 'GET') {
    const id = path.match(/^\/cuentas\/([^/]+)$/)[1];
    const cuenta = state?.accounts?.find(a => a.id === id);
    if (!cuenta) return { success: false, error: 'Cuenta no encontrada' };
    return { success: true, data: cuenta };
  }

  if (path === '/cuentas/crear' && method === 'POST') {
    const result = await apiBancoPost('create_account', req.body);
    return { success: !!result, data: result };
  }

  if (path === '/operaciones' && method === 'GET') {
    const ops = state?.accounts?.flatMap(a => a.movements || []) || [];
    return { success: true, total: ops.length, data: ops.slice(0, 100) };
  }

  if (path === '/tarjetas' && method === 'GET') {
    const tarjetas = state?.accounts?.filter(a => a.cardId) || [];
    return { success: true, total: tarjetas.length, data: tarjetas };
  }

  return null;
}

// ── TRIBUTOS ───────────────────────────────────────────────────────────
async function handleTributosAPI(path, method, req) {
  const state = await apiBancoGetState();

  if (path === '/contribuyentes' && method === 'GET') {
    const contribuyentes = state?.accounts?.filter(a => a.tributosCensusDate) || [];
    return { success: true, total: contribuyentes.length, data: contribuyentes };
  }

  if (path === '/declaraciones' && method === 'GET') {
    const declaraciones = await sbListDeclaraciones(200);
    const base = `${req.protocol}://${req.get('host')}`;
    // Añadir URL del PDF a cada declaración aprobada/emitida (para el titular)
    const enriquecidas = declaraciones.map(d => {
      const sem = d._estado_semantico || d.estado_pago || '';
      const permiso = d.id_permiso_junta || '';
      const aprobada = permiso.startsWith('APROBADA') || permiso.startsWith('EMITIDO') || permiso.startsWith('COBRADO') || permiso.startsWith('BYPASS') ||
        /aprob|emit|pag/i.test(sem);
      return {
        ...d,
        pdf_url: aprobada ? `${base}/api/v1/tributos/declaraciones/${d.id}/pdf` : null,
        _estado_semantico: sem
      };
    });
    return { success: true, total: enriquecidas.length, data: enriquecidas };
  }

  // Subvenciones entre empresas: la app consulta por EIP y recibe las
  // subvenciones en las que la empresa es subvencionadora o beneficiaria.
  if (path === '/subvenciones' && method === 'GET') {
    const { listarSubvencionesDeEmpresa } = await import('./subvenciones.js');
    const eip = String(req.query.eip || req.query.EIP || '').trim().toUpperCase();
    if (!eip) return { success: false, error: 'eip_requerido' };
    const subvenciones = await listarSubvencionesDeEmpresa(eip);
    return { success: true, total: subvenciones.length, data: subvenciones, eip };
  }

  // ESTIMADO DE IMPUESTOS para la app (solo lectura, NO persiste):
  // IRM + IGF según normativa, con tipo de tributo (personal/empresa) y
  // exención de IVA para empresas. Toda la lógica de impuestos vive aquí,
  // en el backend, nunca en el APK.
  if (path === '/estimado-impuestos' && method === 'GET') {
    const pid = String(req.query.placeta_id || req.query.placetaId || req.query.dip || '').trim();
    if (!pid) return { success: false, error: 'placeta_id_requerido' };
    const mesPeriodo = req.query.mes_periodo || new Date().toISOString().slice(0, 7);
    const state = await apiBancoGetState();
    const cuentas = state?.accounts?.filter(a => a.placetaId === pid || a.id === pid) || [];
    if (cuentas.length === 0) return { success: false, error: 'cuenta_no_encontrada', httpStatus: 404 };
    const ids = new Set(cuentas.map(c => c.id));
    const transacciones = (state?.transactions || []).filter(t => ids.has(t.fromAccountId) || ids.has(t.toAccountId));
    const { calcularPatrimonioMedio, calcularIA, calcularIRM, calcularIGF } = await import('../config/normativa.js');
    const [anio, mes] = String(mesPeriodo).split('-').map(Number);
    const diasEnMes = new Date(anio, mes, 0).getDate();
    const movMes = transacciones.filter(t => {
      const d = new Date(t.createdAt || t.updatedAt);
      return d.getFullYear() === anio && d.getMonth() + 1 === mes;
    });
    // Saldo base: restar movimientos posteriores al mes objetivo para no inflar
    // el patrimonio de meses pasados (misma lógica que la reconciliación).
    const movDesdeInicio = transacciones.filter(t => {
      const d = new Date(t.createdAt || t.updatedAt);
      return d.getFullYear() > anio || (d.getFullYear() === anio && d.getMonth() + 1 >= mes);
    });
    const deltaDesdeInicio = movDesdeInicio.reduce((s, t) => {
      if (ids.has(t.toAccountId)) s += Number(t.amountPz || 0);
      if (ids.has(t.fromAccountId)) s -= Number(t.amountPz || 0);
      return s;
    }, 0);
    const saldoActual = cuentas.reduce((s, c) => s + (c.balancePz || 0), 0);
    const saldoBase = saldoActual - deltaDesdeInicio;
    const balances = [];
    for (let d = 1; d <= diasEnMes; d++) {
      const hasta = transacciones.filter(t => {
        const dt = new Date(t.createdAt || t.updatedAt);
        return dt.getFullYear() === anio && dt.getMonth() + 1 === mes && dt.getDate() <= d;
      });
      const delta = hasta.reduce((s, t) => {
        if (ids.has(t.toAccountId)) s += Number(t.amountPz || 0);
        if (ids.has(t.fromAccountId)) s -= Number(t.amountPz || 0);
        return s;
      }, 0);
      balances.push(Math.round(Math.max(0, saldoBase + delta)));
    }
    const patrimonioMedio = calcularPatrimonioMedio(balances);
    const ingresosMes = movMes.filter(t => ids.has(t.toAccountId)).reduce((s, t) => s + Number(t.amountPz || 0), 0);
    const pagosMes = movMes.filter(t => ids.has(t.fromAccountId)).reduce((s, t) => s + Number(t.amountPz || 0), 0);
    const ia = calcularIA(diasEnMes ? ingresosMes / diasEnMes : 0, diasEnMes ? pagosMes / diasEnMes : 0, patrimonioMedio);
    const tipoCuenta = cuentas.some(c => c.type === 'Business' || c.type === 'State') ? 'Business' : 'Personal';
    const esEmpresaPequeña = tipoCuenta === 'Business' && patrimonioMedio < 20000;
    const esJunior = cuentas.some(c => c.type === 'Child');
    const irmTipo = calcularIRM(ia, tipoCuenta);
    const cuotaIRM = patrimonioMedio * irmTipo;
    const igfResult = calcularIGF(patrimonioMedio, tipoCuenta, esEmpresaPequeña);
    const cuotaIGF = igfResult.exento ? 0 : igfResult.total;
    const eipVinculado = cuentas.some(c => c.eip);
    const ivaExentoEmpresa = esEmpresaPequeña || eipVinculado || false;
    const total = Math.round((cuotaIRM + cuotaIGF) * 100) / 100;
    // Art. 4.11 bis: cargo el día 5 del mes siguiente (lunes hábil más próximo).
    const proximoCobro = (() => {
      const sigMes = new Date(anio, mes, 1);
      const cobro = new Date(sigMes.getFullYear(), sigMes.getMonth(), 5);
      const dia = cobro.getDay(); // 0=domingo, 6=sábado
      if (dia === 0) cobro.setDate(cobro.getDate() + 1);
      else if (dia === 6) cobro.setDate(cobro.getDate() + 2);
      return cobro.toISOString().slice(0, 10);
    })();
    return {
      success: true,
      estimado: {
        mes_periodo: mesPeriodo,
        patrimonio_medio: Math.round(patrimonioMedio * 100) / 100,
        indice_acumulacion: Math.round(ia * 10000) / 10000,
        tipo_cuenta: tipoCuenta,
        tipo_sujeto: tipoCuenta === 'Business' ? 'Empresa' : 'Personal',
        escala_irm: irmTipo,
        cuota_irm: Math.round(cuotaIRM * 100) / 100,
        cuota_igf: cuotaIGF,
        total_impuestos: total,
        exencion_igf: igfResult.exento || false,
        iva_exento_empresa: ivaExentoEmpresa,
        es_junior: esJunior,
        proximo_cobro: proximoCobro,
        saldo_actual: Math.round(saldoActual * 100) / 100
      }
    };
  }

  // PDF de una declaración — SOLO si está aprobada/emitida (para el titular)
  // El titular solicita el PDF de su declaración de renta mensual; se devuelve
  // el buffer del PDF generado en el RSP si la declaración pertenece a su
  // placeta_id/dip y su estado es Aprobada/Emitida/Cobrada (nunca Borrador).
  const pdfMatch = path.match(/^\/declaraciones\/([^/]+)\/pdf$/);
  if (pdfMatch && method === 'GET') {
    const id = pdfMatch[1];
    const { sbGetDeclaracion } = await import('../config/db.js');
    const d = await sbGetDeclaracion(id);
    if (!d) return { success: false, error: 'No encontrada', httpStatus: 404 };

    // Estado semántico: Aprobada / Emitida / Cobrada
    const sem = d._estado_semantico || d.estado_pago || '';
    const permiso = d.id_permiso_junta || '';
    const aprobada = permiso.startsWith('APROBADA') || permiso.startsWith('EMITIDO') || permiso.startsWith('COBRADO') || permiso.startsWith('BYPASS') ||
      /aprob|emit|pag/i.test(sem);
    if (!aprobada) {
      return { success: false, error: 'La declaración aún no está aprobada', httpStatus: 403 };
    }

    // Verificar titular: el solicitante debe ser el dueño de la declaración
    const solicitante = req.query.placeta_id || req.query.placetaId || req.query.dip || req.headers['x-user-dip'] || '';
    const duenio = d.placeta_id || d.placetaId || d.dip || '';
    if (solicitante && duenio && String(solicitante).trim().toUpperCase() !== String(duenio).trim().toUpperCase()) {
      // Permitir a la app del banco acceder si coincide por cuenta
      const state = await apiBancoGetState().catch(() => null);
      const esDelSolicitante = (state?.accounts || []).some(a =>
        (a.placetaId || '').toUpperCase() === String(solicitante).toUpperCase() &&
        d.cuenta_id_blp && (a.id === d.cuenta_id_blp || a.placetaId === d.placeta_id)
      );
      if (!esDelSolicitante) {
        return { success: false, error: 'No autorizado', httpStatus: 403 };
      }
    }

    try {
      const { generarPDF } = await import('../config/documentos.js');
      const buffer = await generarPDF('tributos', {
        id: d.id, titulo: `Declaración Tributaria ${d.mes_periodo}`,
        tipo: 'declaracion-definitiva',
        datos: {
          contribuyente: d.placeta_id, periodo: d.mes_periodo,
          baseImponible: d.patrimonio_medio, cuota: (d.cuota_irm || 0) + (d.cuota_igf || 0),
          cuotaIRM: d.cuota_irm, cuotaIGF: d.cuota_igf,
          estado: sem,
          patrimonioMedio: d.patrimonio_medio, indiceAcumulacion: d.indice_acumulacion
        },
        estado: d.estado_pago, createdAt: d.created_at,
        refId: d.id, refTipo: 'declaracion'
      });
      return { __pdf: buffer, __pdfName: `DEC-${d.id.slice(-8)}.pdf` };
    } catch (e) {
      return { success: false, error: 'Error generando PDF: ' + e.message, httpStatus: 500 };
    }
  }

  // Reconciliación AUTOMÁTICA: la app envía el placeta_id y el mes; el RSP
  // reconstruye los saldos diarios reales desde el banco y genera la
  // declaración mensual con IRM/IGF según normativa (excepción IVA empresas).
  if (path === '/declaraciones/reconciliar' && method === 'POST') {
    const { placeta_id: placetaId, placetaId: placetaIdAlt, mes_periodo: mesPeriodo, mesPeriodo: mesPeriodoAlt } = req.body || {};
    const pid = placetaId || placetaIdAlt;
    const periodo = mesPeriodo || mesPeriodoAlt || new Date().toISOString().slice(0, 7);
    if (!pid) return { success: false, error: 'placeta_id_requerido' };
    const state = await apiBancoGetState();
    const cuentas = state?.accounts?.filter(a => a.placetaId === pid || a.id === pid) || [];
    const ids = new Set(cuentas.map(c => c.id));
    const transacciones = (state?.transactions || []).filter(t => ids.has(t.fromAccountId) || ids.has(t.toAccountId));
    const { sbClearDailyBalances, sbUpsertDailyBalance, sbCreateDeclaracion } = await import('../config/db.js');
    const { calcularPatrimonioMedio, calcularIA, calcularIRM, calcularIGF } = await import('../config/normativa.js');
    await sbClearDailyBalances(pid, periodo);
    const [anio, mes] = String(periodo).split('-').map(Number);
    const diasEnMes = new Date(anio, mes, 0).getDate();
    const movMes = transacciones.filter(t => {
      const d = new Date(t.createdAt || t.updatedAt);
      return d.getFullYear() === anio && d.getMonth() + 1 === mes;
    });
    // Para un mes PASADO, el saldo base debe restar los movimientos de los meses
    // posteriores (de lo contrario el patrimonio del mes pasado se infla con
    // dinero que aún no existía en esa fecha).
    const movDesdeInicio = transacciones.filter(t => {
      const d = new Date(t.createdAt || t.updatedAt);
      return d.getFullYear() > anio || (d.getFullYear() === anio && d.getMonth() + 1 >= mes);
    });
    const deltaDesdeInicio = movDesdeInicio.reduce((s, t) => {
      if (ids.has(t.toAccountId)) s += Number(t.amountPz || 0);
      if (ids.has(t.fromAccountId)) s -= Number(t.amountPz || 0);
      return s;
    }, 0);
    const saldoActual = cuentas.reduce((s, c) => s + (c.balancePz || 0), 0);
    const saldoBase = saldoActual - deltaDesdeInicio;
    const balances = [];
    for (let d = 1; d <= diasEnMes; d++) {
      const hasta = transacciones.filter(t => {
        const dt = new Date(t.createdAt || t.updatedAt);
        return dt.getFullYear() === anio && dt.getMonth() + 1 === mes && dt.getDate() <= d;
      });
      const delta = hasta.reduce((s, t) => {
        if (ids.has(t.toAccountId)) s += Number(t.amountPz || 0);
        if (ids.has(t.fromAccountId)) s -= Number(t.amountPz || 0);
        return s;
      }, 0);
      const sd = Math.max(0, saldoBase + delta);
      await sbUpsertDailyBalance(pid, periodo, d, Math.round(sd));
      balances.push(Math.round(sd));
    }
    const patrimonioMedio = calcularPatrimonioMedio(balances);
    const ingresosMes = movMes.filter(t => ids.has(t.toAccountId)).reduce((s, t) => s + Number(t.amountPz || 0), 0);
    const pagosMes = movMes.filter(t => ids.has(t.fromAccountId)).reduce((s, t) => s + Number(t.amountPz || 0), 0);
    const ia = calcularIA(diasEnMes ? ingresosMes / diasEnMes : 0, diasEnMes ? pagosMes / diasEnMes : 0, patrimonioMedio);
    const tipoCuenta = cuentas.some(c => c.type === 'Business' || c.type === 'State') ? 'Business' : 'Personal';
    const esEmpresaPequeña = tipoCuenta === 'Business' && patrimonioMedio < 20000;
    const irmTipo = calcularIRM(ia, tipoCuenta);
    const cuotaIRM = patrimonioMedio * irmTipo;
    const igfResult = calcularIGF(patrimonioMedio, tipoCuenta, esEmpresaPequeña);
    const eipVinculado = cuentas.some(c => c.eip);
    const declaracion = await sbCreateDeclaracion({
      placeta_id: pid, mes_periodo: periodo,
      patrimonio_medio: Math.round(patrimonioMedio * 100) / 100,
      indice_acumulacion: Math.round(ia * 10000) / 10000,
      cuota_irm: Math.round(cuotaIRM * 100) / 100,
      cuota_igf: igfResult.exento ? 0 : igfResult.total,
      cuenta_id_blp: cuentas[0]?.id || pid,
      estado_pago: 'Borrador',
      exencion_aplicada: igfResult.exento || false,
      dias_declarados_banco: diasEnMes,
      dias_activos_mes: diasEnMes,
      eip: eipVinculado ? cuentas.find(c => c.eip)?.eip : null,
      iva_exento_empresa: esEmpresaPequeña || eipVinculado || false
    });
    return {
      success: true,
      balances,
      patrimonioMedio,
      indice_acumulacion: ia,
      tipoCuenta,
      cuotaIRM: Math.round(cuotaIRM * 100) / 100,
      cuotaIGF: igfResult.exento ? 0 : igfResult.total,
      exencionIGF: igfResult.exento,
      iva_exento_empresa: esEmpresaPequeña || eipVinculado || false,
      declaracion
    };
  }

  if (path === '/inspeccion/resumen' && method === 'GET') {
    const contribuyentes = state?.accounts?.filter(a => a.tributosCensusDate) || [];
    return {
      success: true,
      data: {
        contribuyentesRevisados: contribuyentes.length,
        incidencias: Math.floor(contribuyentes.length * 0.05),
        recaudacionPendiente: contribuyentes.reduce((s, c) => s + (c.balancePz || 0) * 0.12, 0)
      }
    };
  }

  if (path === '/regimenes' && method === 'GET') {
    return {
      success: true,
      data: [
        { id: 'REG-001', nombre: 'Régimen General', tipo_impositivo: 0.12, activo: true },
        { id: 'REG-002', nombre: 'Régimen Simplificado', tipo_impositivo: 0.08, activo: true },
        { id: 'REG-003', nombre: 'Régimen de Mínimos', tipo_impositivo: 0.04, activo: true }
      ]
    };
  }

  return null;
}

// ── JUNTA ──────────────────────────────────────────────────────────────
async function handleJuntaAPI(path, method, req) {
  if (path === '/ciudadanos' && method === 'GET') {
    const ciudadanos = await sbListSolicitantes();
    return { success: true, total: ciudadanos.length, data: ciudadanos };
  }

  if (path === '/placetaid/registros' && method === 'GET') {
    const raw = await apiPlacetaidRegistros();
    const registros = (raw || []).map(r => ({
      dip: r.dip, nombre: r.nombre || '', apellidos: r.apellidos || '',
      email: r.correo || r.email || '', totpVerificado: r.totpVerified === true,
      bloqueado: r.bloqueado === true || r.banned === true,
      activo: r.activo !== false, rol: r.rol || 'ciudadano'
    }));
    return { success: true, total: registros.length, data: registros };
  }

  if (path === '/votaciones' && method === 'GET') {
    const stats = await apiPlacetaidStats();
    return {
      success: true,
      data: stats?.votaciones || [
        { id: 'VOT-001', titulo: 'Presupuestos 2026', activa: true, fechaInicio: '2026-07-01', fechaFin: '2026-07-31' },
        { id: 'VOT-002', titulo: 'Normativa IVA', activa: false, fechaInicio: '2026-06-01', fechaFin: '2026-06-15' }
      ]
    };
  }

  if (path === '/cargos' && method === 'GET') {
    return {
      success: true,
      data: [
        { dip: '23749931M', cargo: 'Presidente', departamento: 'Junta Directiva', activo: true },
        { dip: '11111111D', cargo: 'Vicepresidente', departamento: 'Junta Directiva', activo: true }
      ]
    };
  }

  if (path === '/reclamaciones' && method === 'GET') {
    return {
      success: true,
      data: [
        { id: 'REC-001', ciudadano: 'Juan Pérez', asunto: 'Error en tributos', prioridad: 'Alta', estado: 'Abierta', fecha: '2026-07-10' }
      ]
    };
  }

  return null;
}

// ── ADMINISTRACIÓN ─────────────────────────────────────────────────────
async function handleAdminAPI(path, method, req) {
  if (path === '/tramites' && method === 'GET') {
    return {
      success: true,
      data: [
        { id: 'TRAM-001', tipo: 'Solicitud de alta', solicitanteDip: '12345678A', estado: 'En proceso', fechaCreacion: '2026-07-20' },
        { id: 'TRAM-002', tipo: 'Cambio de domicilio', solicitanteDip: '87654321B', estado: 'Completado', fechaCreacion: '2026-07-18' }
      ]
    };
  }

  if (path === '/actas' && method === 'GET') {
    return {
      success: true,
      data: [
        { id: 'ACTA-001', titulo: 'Acta Junta Directiva Julio 2026', fecha: '2026-07-15', tipo: 'acta', estado: 'final' },
        { id: 'ACTA-002', titulo: 'Acuerdo Presupuesto Anual', fecha: '2026-07-01', tipo: 'acuerdo', estado: 'firmado' }
      ]
    };
  }

  if (path.match(/^\/junior\/menores\/([^/]+)$/) && method === 'GET') {
    const tutorDip = path.match(/^\/junior\/menores\/([^/]+)$/)[1];
    return {
      success: true,
      data: [
        { dip: 'MENOR-001', nombre: 'Menor Ejemplo', tutorDip, fechaNacimiento: '2018-05-10' }
      ]
    };
  }

  return null;
}

// ── JUNIOR ─────────────────────────────────────────────────────────────
async function handleJuniorAPI(path, method, req) {
  // La consulta al banco se hace de forma perezosa: solo para los endpoints
  // que la necesitan (menores, cuentas, tutores). Los endpoints de la academia
  // se delegan al router oficial y no deben depender del estado del banco.
  let state = null;
  const necesitaBanco = ['/menores', '/cuentas'].some(p => path === p || path.startsWith(p + '/')) ||
    /^\/tutores\//.test(path) || /^\/menores\//.test(path);
  if (necesitaBanco) {
    state = await apiBancoGetState();
  }

  if (path === '/menores' && method === 'GET') {
    // Buscar cuentas Child en el estado del banco
    const cuentasChild = state?.accounts?.filter(a => a.kind === 'CHILD' || a.type === 'Child') || [];
    const menores = cuentasChild.map(c => ({
      dip: c.placetaId || c.id?.replace('u-', '') || '',
      nombre: c.displayName || '—',
      tutorDip: c.parentAccountId?.replace('u-', '') || '—'
    }));
    return { success: true, total: menores.length, data: menores };
  }

  if (path.match(/^\/menores\/([^/]+)$/) && method === 'GET') {
    const dip = path.match(/^\/menores\/([^/]+)$/)[1];
    const cuenta = state?.accounts?.find(a => (a.placetaId === dip || a.id === `u-${dip.toLowerCase()}`) && (a.kind === 'CHILD' || a.type === 'Child'));
    if (!cuenta) return { success: false, error: 'Menor no encontrado' };
    return {
      success: true,
      data: {
        dip: cuenta.placetaId || '',
        nombre: cuenta.displayName || '—',
        cuenta: { iban: cuenta.iban || '—', saldo: cuenta.balancePz || 0 }
      }
    };
  }

  if (path.match(/^\/tutores\/([^/]+)\/menores$/) && method === 'GET') {
    const tutorDip = path.match(/^\/tutores\/([^/]+)\/menores$/)[1];
    const tutorId = `u-${tutorDip.toLowerCase()}`;
    const hijos = state?.accounts?.filter(a => a.parentAccountId === tutorId) || [];
    return {
      success: true,
      data: hijos.map(h => ({
        dip: h.placetaId || '',
        nombre: h.displayName || '—',
        tutorDip,
        cuentaIban: h.iban || '—'
      }))
    };
  }

  if (path === '/cuentas' && method === 'GET') {
    const cuentasChild = state?.accounts?.filter(a => a.kind === 'CHILD' || a.type === 'Child') || [];
    return {
      success: true, total: cuentasChild.length,
      data: cuentasChild.map(c => ({
        id: c.id, iban: c.iban || '—',
        titularDip: c.placetaId || '',
        tutorDip: c.parentAccountId?.replace('u-', '') || '—',
        saldo: c.balancePz || 0,
        limiteEnvio: c.sendLimitPz || 0
      }))
    };
  }

  // ── Academia Placeta Junior (API oficial, con IVA y pagos reales) ──
  // Los endpoints de la academia se delegan al router oficial (junior-oficial-api)
  // y al router de sistema completo (junior-academia-api) para mantener una
  // única fuente de verdad de la lógica económica y educativa.
  const ACADEMIA_ENDPOINTS = [
    '/academy/precios',
    '/academy/cuestionarios',
    '/academy/rbu',
    '/monedero',
    '/perfil',
    '/puntos/canje',
    '/historial',
    // Sistema completo de la Academia
    '/actividades',
    '/retos'
  ];
  if (method === 'GET' && ACADEMIA_ENDPOINTS.includes(path)) {
    return 'rewrite';
  }

  if (method === 'POST' && ['/academy/evaluar', '/academy/desbloquear-nivel', '/academy/confirmar-pago', '/regalias',
    '/actividades', '/colaborador/solicitar', '/puntos/canjear'
  ].includes(path)) {
    return 'rewrite';
  }

  if (path.match(/^\/tutor-info\/([^/]+)$/) && method === 'GET') {
    return 'rewrite';
  }

  // Rutas con parámetro que delegan al sistema academia
  if (method === 'GET' && (path.match(/^\/actividades\//) || path.match(/^\/colaborador\/estado\//) || path.match(/^\/puntos\//) || path.match(/^\/diplomas\//))) {
    return 'rewrite';
  }
  if (method === 'POST' && (path.match(/^\/actividades\/[^/]+\/(revisar|realizar)$/))) {
    return 'rewrite';
  }

  return null;
}

// ── RSP ────────────────────────────────────────────────────────────────
async function handleRSPAPI(path, method, req) {
  if (path === '/estadisticas' && method === 'GET') {
    return { success: true, data: getEstadisticas() };
  }

  if (path === '/tarifas' && method === 'GET') {
    return { success: true, data: getTarifas() };
  }

  if (path === '/conexiones' && method === 'GET') {
    const conexiones = getConexiones({ limit: 100 });
    return { success: true, total: conexiones.length, data: [...conexiones].reverse() };
  }

  if (path === '/facturas' && method === 'GET') {
    const facturas = getFacturas({});
    return { success: true, total: facturas.length, data: facturas };
  }

  if (path === '/conexiones/registrar' && method === 'POST') {
    const { entidad, tipo, endpoint } = req.body;
    if (!entidad || !tipo || !endpoint) {
      return { success: false, error: 'entidad, tipo y endpoint son requeridos' };
    }
    const conexion = registrarConexion({
      entidad, tipo,
      endpoint: `[API Ext] ${endpoint}`,
      usuario: `API:${req.apiContext?.app?.nombre || 'externo'}`,
      dip: req.headers['x-user-dip'] || ''
    });
    return { success: true, data: conexion };
  }

  if (path === '/ibans' && method === 'GET') {
    return { success: true, data: getEntitiesIBAN() };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// RUTA PRINCIPAL — /api/v1/:entidad/*
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handler genérico que enruta según entidad y path
 */
router.all('/v1/:entidad/*path', validateAPIRequest, validateEntityAccess, (req, res, next) => {
  const { entidad, path: wildPath } = req.params;
  // Extraer subpath (todo después de /api/v1/:entidad/)
  // En Express 5 el wildcard puede venir como array de segmentos
  const wildStr = Array.isArray(wildPath) ? wildPath.join('/') : (wildPath || '');
  const subpath = '/' + wildStr;

  // Validar plataforma para el endpoint
  const endpointDef = getEntityEndpoint(entidad, subpath);
  if (!endpointDef) {
    return res.status(404).json({
      error: 'Endpoint no encontrado',
      entidad,
      path: subpath,
      documentacion: `/api/v1/${entidad}/docs`
    });
  }

  // Validar método HTTP
  if (endpointDef.method !== req.method) {
    return res.status(405).json({
      error: 'Método no permitido',
      esperado: endpointDef.method,
      recibido: req.method
    });
  }

  // Validar plataforma
  const platform = req.apiContext.platform;
  if (!endpointDef.platforms.includes(platform) && req.apiContext.app.nombre !== 'Admin Master') {
    return res.status(403).json({
      error: 'Plataforma no permitida para este endpoint',
      endpoint: `${req.method} ${subpath}`,
      plataformasPermitidas: endpointDef.platforms
    });
  }

  // Aplicar cargo RSP
  rspCharge(endpointDef.tipo)(req, res, async () => {
    try {
      const result = await handleEntityRequest(entidad, subpath, req.method, req);

      // Si el handler pide delegar a la API oficial junior, reenviamos
      // directamente al router oficial (sin fetch HTTP ni reescritura global)
      if (result === 'rewrite') {
        // Reconstruir la URL relativa esperada por el router oficial/academia:
        // el router está montado en /api y sus rutas son /junior/...
        // La URL entrante es /api/v1/junior/... → relativa al router: /junior/...
        const qs = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';
        req.url = `/junior${subpath}${qs ? '?' + qs : ''}`;
        req.originalUrl = `/api/junior${subpath}${qs ? '?' + qs : ''}`;
        // Delegar al router que corresponda: sistema academia vs academia clásica
        // /puntos/canje es de la academia clásica; /puntos/:dip y /puntos/canjear son del sistema academia
        const esSistemaAcademia = subpath.startsWith('/actividades') || subpath.startsWith('/colaborador') ||
          subpath.startsWith('/diplomas') || subpath.startsWith('/retos') ||
          subpath.startsWith('/puntos/') && subpath !== '/puntos/canje';
        if (esSistemaAcademia) {
          return juniorAcademiaApiRoutes(req, res, next);
        }
        return juniorOficialApiRoutes(req, res, next);
      }

      if (!result) {
        return res.status(501).json({
          error: 'Handler no implementado',
          entidad,
          path: subpath,
          method: req.method
        });
      }

      // Si el handler devuelve un PDF (result.__pdf), enviarlo directamente
      if (result.__pdf) {
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename=${result.__pdfName || 'documento.pdf'}`
        });
        return res.send(result.__pdf);
      }

      // Si el handler devuelve error con httpStatus, usarlo
      if (result.httpStatus) {
        const status = result.httpStatus;
        delete result.httpStatus;
        return res.status(status).json(result);
      }

      // Añadir metadatos de facturación
      const cost = getEndpointCost(entidad, subpath);
      res.json({
        ...result,
        meta: {
          api: 'Admin Placeta API v1',
          entidad,
          endpoint: subpath,
          timestamp: new Date().toISOString(),
          coste: cost ? { tipo: cost.tipo, precio: cost.precio, iva: cost.iva, total: cost.total } : null,
          ibanEntidad: getEntityIBAN(entidad)
        }
      });
    } catch (err) {
      console.error('[API Gateway] Error:', err);
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        detalle: err.message
      });
    }
  });
});

// ── Rutas sin subpath (solo /api/v1/:entidad) → dashboard de la entidad ──
router.get('/v1/:entidad', validateAPIRequest, validateEntityAccess, (req, res) => {
  const { entidad } = req.params;
  const api = getEntityAPI(entidad);

  if (!api) {
    return res.status(404).json({
      error: 'Entidad no encontrada',
      entidadesDisponibles: Object.keys(getEntitiesIBAN())
    });
  }

  res.json({
    entidad: api.nombre,
    iban: api.iban,
    descripcion: api.descripcion,
    documentacion: `/api/v1/${entidad}/docs`,
    endpoints: api.endpoints.map(ep => ({
      method: ep.method,
      path: `/api/v1/${entidad}${ep.path}`,
      descripcion: ep.descripcion,
      platforms: ep.platforms,
      tipo: ep.tipo
    }))
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PANEL DE GESTIÓN DE APIs (Web)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET / — Panel de gestión de APIs del workspace
 * (montado en server.js como /{entidad}/apis)
 */
router.get('/', (req, res) => {
  const entidad = req.entidad || 'banco';
  const api = getEntityAPI(entidad);

  if (!api) {
    return res.status(404).render('parciales/error', {
      titulo: 'Error',
      error: `Entidad "${entidad}" no tiene APIs registradas`
    });
  }

  const appsEntidad = appsRegistradas.filter(a => a.entidades.includes(entidad));
  const tarifas = getTarifas();

  res.render('parciales/api-docs', {
    titulo: `APIs - ${api.nombre}`,
    entidad_actual: entidad,
    api,
    apps: appsEntidad,
    tarifas,
    iban: api.iban,
    endpoints: api.endpoints
  });
});

/**
 * GET /api/v1/apps — Listar apps registradas (para admin)
 */
router.get('/v1/apps', validateAPIRequest, (req, res) => {
  if (req.apiContext.app.nombre !== 'Admin Master') {
    return res.status(403).json({ error: 'Solo administración' });
  }
  res.json({ success: true, apps: [...API_KEYS.entries()].map(([key, val]) => ({
    key: key.slice(0, 16) + '...',
    nombre: val.nombre,
    plataforma: val.plataforma,
    entidades: val.entidadesPermitidas,
    activa: val.activa
  }))});
});

// ═══════════════════════════════════════════════════════════════════════════
// API — GESTIÓN DE APPS Y API KEYS (CRUD real)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/apps/registrar — Registrar nueva app y generar API Key real
 * Crea la key en API_KEYS y la añade a appsRegistradas
 */
router.post('/v1/apps/registrar', verificarSesion, (req, res) => {
  const { nombre, plataforma, entidad } = req.body;
  if (!nombre || !plataforma || !entidad) {
    return res.status(400).json({ error: 'nombre, plataforma y entidad son requeridos' });
  }
  if (!['android', 'ios', 'web'].includes(plataforma)) {
    return res.status(400).json({ error: 'plataforma debe ser android, ios o web' });
  }

  // Generar API Key única real
  const keyRaw = crypto.randomBytes(24).toString('hex');
  const key = `${plataforma}-${nombre.toLowerCase().replace(/[^a-z0-9]/g,'')}-${keyRaw.slice(0, 12)}`;

  // Orígenes permitidos según plataforma
  const origins = {
    android: ['laplaceta.org', `${entidad}.laplaceta.org`],
    ios: ['laplaceta.org', `${entidad}.laplaceta.org`],
    web: ['rsp.laplaceta.org', `${entidad}.laplaceta.org`]
  };

  const nuevaApp = {
    nombre,
    plataforma,
    entidadesPermitidas: [entidad],
    activa: true,
    allowedOrigins: origins[plataforma] || ['*'],
    createdAt: new Date().toISOString()
  };

  API_KEYS.set(key, nuevaApp);

  const appReg = {
    id: `app-${entidad}-${plataforma}-${Date.now()}`,
    nombre,
    plataforma,
    apiKey: key,
    entidades: [entidad],
    origen: origins[plataforma]?.[0] || '*',
    activa: true,
    createdAt: new Date().toISOString().slice(0, 10)
  };
  appsRegistradas.push(appReg);

  res.json({
    success: true,
    apiKey: key,
    app: appReg,
    mensaje: `🔑 API Key generada para "${nombre}" (${plataforma})`
  });
});

/**
 * GET /api/v1/apps/listar — Listar apps registradas de una entidad
 */
router.get('/v1/apps/listar', verificarSesion, (req, res) => {
  const entidad = req.query.entidad || '';
  let apps = appsRegistradas;
  if (entidad) apps = apps.filter(a => a.entidades.includes(entidad));
  res.json({
    success: true,
    total: apps.length,
    apps: apps.map(a => ({
      id: a.id,
      nombre: a.nombre,
      plataforma: a.plataforma,
      apiKeyPreview: a.apiKey.slice(0, 16) + '...',
      entidades: a.entidades,
      origen: a.origen,
      activa: a.activa,
      createdAt: a.createdAt
    }))
  });
});

/**
 * PUT /api/v1/apps/:id/toggle — Activar/desactivar app
 */
router.put('/v1/apps/:id/toggle', verificarSesion, (req, res) => {
  const app = appsRegistradas.find(a => a.id === req.params.id);
  if (!app) return res.status(404).json({ error: 'App no encontrada' });

  app.activa = !app.activa;

  // También actualizar en API_KEYS
  for (const [key, val] of API_KEYS) {
    if (val.nombre === app.nombre && val.plataforma === app.plataforma) {
      val.activa = app.activa;
    }
  }

  res.json({ success: true, activa: app.activa });
});

/**
 * DELETE /api/v1/apps/:id — Eliminar app
 */
router.delete('/v1/apps/:id', verificarSesion, (req, res) => {
  const idx = appsRegistradas.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'App no encontrada' });

  const [app] = appsRegistradas.splice(idx, 1);

  // Eliminar también de API_KEYS
  for (const [key, val] of API_KEYS) {
    if (val.nombre === app.nombre && val.plataforma === app.plataforma) {
      API_KEYS.delete(key);
    }
  }

  res.json({ success: true, eliminado: app.id });
});

export { router as apiGatewayRoutes, validateAPIRequest, API_KEYS, appsRegistradas };
export default router;
