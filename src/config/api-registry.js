/**
 * API REGISTRY — Registro centralizado de APIs por entidad pública
 * 
 * Cada entidad (workspace) expone endpoints REST que:
 *   - Sirven datos específicos de su dominio
 *   - Tienen tarifas RSP (consulta: 0.001 Pz / modificación: 0.1 Pz)
 *   - Pueden restringirse por plataforma (android, apple, web)
 *   - Requieren API Key para autenticación
 * 
 * Las apps (Android, iOS, Web) se identifican vía:
 *   - Header X-Platform: android | ios | web
 *   - Header X-API-Key: clave asignada a la app
 *   - Header X-App-Version: versión de la app (para auditoría)
 */

// ── PLATAFORMAS SOPORTADAS ──────────────────────────────────────────────
export const PLATFORM = {
  ANDROID: 'android',
  IOS: 'ios',
  WEB: 'web',
  ALL: ['android', 'ios', 'web']
};

// ── TIPOS DE DATOS ──────────────────────────────────────────────────────
export const DATA_TYPE = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  OBJECT: 'object',
  ARRAY: 'array',
  DATE: 'date',
  DIP: 'dip',         // Identificador de ciudadano
  IBAN: 'iban',        // Cuenta bancaria
  EIP: 'eip',          // Identificador de empresa
  AMOUNT: 'amount',    // Cantidad en Placetas
  PERCENTAGE: 'percentage'
};

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO DE APIs POR ENTIDAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cada endpoint definido:
 *   path:        Ruta relativa (ej: /cuentas)
 *   method:      GET | POST | PUT | DELETE
 *   tipo:        'consulta' | 'modificacion' (determina tarifa RSP)
 *   descripcion: Qué hace este endpoint
 *   dataReturn:  Array de { campo, tipo, descripcion } — qué datos devuelve
 *   platforms:   Array de plataformas permitidas ['android','ios','web']
 *   params:      Array de parámetros de entrada (opcional)
 *   auth:        Tipo de autenticación requerida
 *   rateLimit:   Límite de peticiones por minuto (opcional)
 */

const API_REGISTRY = {

  // ── BANCO DE LA PLACETA ─────────────────────────────────────────────
  banco: {
    iban: 'GDLP-AP98-605',
    nombre: 'Banco de La Placeta',
    descripcion: 'API del sistema bancario: cuentas, operaciones, tarjetas, nóminas',
    contacto: 'banco@laplaceta.org',
    endpoints: [
      {
        path: '/cuentas',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener listado de cuentas bancarias',
        platforms: ['android', 'ios', 'web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID único de la cuenta' },
          { campo: 'displayName', tipo: DATA_TYPE.STRING, descripcion: 'Nombre mostrado de la cuenta' },
          { campo: 'type', tipo: DATA_TYPE.STRING, descripcion: 'Tipo de cuenta (ahorro, corriente, etc.)' },
          { campo: 'iban', tipo: DATA_TYPE.IBAN, descripcion: 'IBAN de la cuenta' },
          { campo: 'balancePz', tipo: DATA_TYPE.AMOUNT, descripcion: 'Saldo actual en Placetas' },
          { campo: 'placetaId', tipo: DATA_TYPE.DIP, descripcion: 'DIP del titular' },
          { campo: 'closedAt', tipo: [DATA_TYPE.DATE, DATA_TYPE.STRING], descripcion: 'Fecha de cierre (null si activa)' },
          { campo: 'tributosCensusDate', tipo: DATA_TYPE.DATE, descripcion: 'Fecha censo tributos' }
        ]
      },
      {
        path: '/cuentas/:id',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener detalle de una cuenta específica',
        platforms: ['android', 'ios', 'web'],
        params: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID de la cuenta', requerido: true }
        ],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID único' },
          { campo: 'displayName', tipo: DATA_TYPE.STRING, descripcion: 'Nombre' },
          { campo: 'iban', tipo: DATA_TYPE.IBAN, descripcion: 'IBAN' },
          { campo: 'balancePz', tipo: DATA_TYPE.AMOUNT, descripcion: 'Saldo' },
          { campo: 'placetaId', tipo: DATA_TYPE.DIP, descripcion: 'Titular DIP' },
          { campo: 'movements', tipo: DATA_TYPE.ARRAY, descripcion: 'Array de movimientos recientes' }
        ]
      },
      {
        path: '/cuentas/crear',
        method: 'POST',
        tipo: 'modificacion',
        descripcion: 'Crear una nueva cuenta bancaria',
        platforms: ['web'],
        params: [
          { campo: 'displayName', tipo: DATA_TYPE.STRING, descripcion: 'Nombre de la cuenta', requerido: true },
          { campo: 'type', tipo: DATA_TYPE.STRING, descripcion: 'Tipo de cuenta', requerido: true },
          { campo: 'placetaId', tipo: DATA_TYPE.DIP, descripcion: 'DIP del titular', requerido: true }
        ],
        dataReturn: [
          { campo: 'success', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Resultado de la operación' },
          { campo: 'cuenta', tipo: DATA_TYPE.OBJECT, descripcion: 'Datos de la cuenta creada' }
        ]
      },
      {
        path: '/operaciones',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener historial de operaciones',
        platforms: ['android', 'ios', 'web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID de la operación' },
          { campo: 'tipo', tipo: DATA_TYPE.STRING, descripcion: 'Tipo de operación' },
          { campo: 'monto', tipo: DATA_TYPE.AMOUNT, descripcion: 'Monto en Placetas' },
          { campo: 'fecha', tipo: DATA_TYPE.DATE, descripcion: 'Fecha de la operación' },
          { campo: 'estado', tipo: DATA_TYPE.STRING, descripcion: 'Estado (completada, pendiente, revertida)' }
        ]
      },
      {
        path: '/tarjetas',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener listado de tarjetas emitidas',
        platforms: ['android', 'web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID de la tarjeta' },
          { campo: 'tipo', tipo: DATA_TYPE.STRING, descripcion: 'Tipo (débito, crédito)' },
          { campo: 'titularDip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del titular' },
          { campo: 'activa', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Si está activa' },
          { campo: 'limite', tipo: DATA_TYPE.AMOUNT, descripcion: 'Límite de crédito (si aplica)' }
        ]
      },
      {
        path: '/nominas',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener lista de nóminas registradas',
        platforms: ['web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID de nómina' },
          { campo: 'empleadoDip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del empleado' },
          { campo: 'salario', tipo: DATA_TYPE.AMOUNT, descripcion: 'Salario en Placetas' },
          { campo: 'periodo', tipo: DATA_TYPE.STRING, descripcion: 'Periodo de la nómina' },
          { campo: 'pagada', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Si está pagada' }
        ]
      }
    ]
  },

  // ── TRIBUTOS DE LA PLACETA ───────────────────────────────────────────
  tributos: {
    iban: 'GDLP-TRBX-001',
    nombre: 'Tributos de La Placeta',
    descripcion: 'API del sistema tributario: declaraciones, contribuyentes, inspección',
    contacto: 'tributos@laplaceta.org',
    endpoints: [
      {
        path: '/contribuyentes',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener listado de contribuyentes',
        platforms: ['android', 'ios', 'web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID de la cuenta/contribuyente' },
          { campo: 'displayName', tipo: DATA_TYPE.STRING, descripcion: 'Nombre del contribuyente' },
          { campo: 'placetaId', tipo: DATA_TYPE.DIP, descripcion: 'DIP del contribuyente' },
          { campo: 'balancePz', tipo: DATA_TYPE.AMOUNT, descripcion: 'Saldo actual' },
          { campo: 'tributosCensusDate', tipo: DATA_TYPE.DATE, descripcion: 'Fecha de censo' }
        ]
      },
      {
        path: '/declaraciones',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener declaraciones de tributos',
        platforms: ['android', 'ios', 'web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID de la declaración' },
          { campo: 'dip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del declarante' },
          { campo: 'periodo', tipo: DATA_TYPE.STRING, descripcion: 'Periodo fiscal' },
          { campo: 'total', tipo: DATA_TYPE.AMOUNT, descripcion: 'Total declarado' },
          { campo: 'estado_pago', tipo: DATA_TYPE.STRING, descripcion: 'Estado de pago' },
          { campo: 'created_at', tipo: DATA_TYPE.DATE, descripcion: 'Fecha de creación' }
        ]
      },
      {
        path: '/declaraciones',
        method: 'POST',
        tipo: 'modificacion',
        descripcion: 'Crear una nueva declaración de tributos',
        platforms: ['web'],
        params: [
          { campo: 'dip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del declarante', requerido: true },
          { campo: 'periodo', tipo: DATA_TYPE.STRING, descripcion: 'Periodo fiscal (YYYY-MM)', requerido: true },
          { campo: 'tipo', tipo: DATA_TYPE.STRING, descripcion: 'Tipo de declaración', requerido: true },
          { campo: 'ingresos', tipo: DATA_TYPE.AMOUNT, descripcion: 'Ingresos declarados', requerido: true }
        ],
        dataReturn: [
          { campo: 'success', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Resultado' },
          { campo: 'declaracion', tipo: DATA_TYPE.OBJECT, descripcion: 'Datos de la declaración creada' }
        ]
      },
      {
        path: '/inspeccion/resumen',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Resumen de inspección automática',
        platforms: ['web'],
        dataReturn: [
          { campo: 'contribuyentesRevisados', tipo: DATA_TYPE.NUMBER, descripcion: 'Nº contribuyentes revisados' },
          { campo: 'incidencias', tipo: DATA_TYPE.NUMBER, descripcion: 'Nº de incidencias detectadas' },
          { campo: 'recaudacionPendiente', tipo: DATA_TYPE.AMOUNT, descripcion: 'Recaudación pendiente total' }
        ]
      },
      {
        path: '/regimenes',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener regímenes tributarios disponibles',
        platforms: ['web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID del régimen' },
          { campo: 'nombre', tipo: DATA_TYPE.STRING, descripcion: 'Nombre del régimen' },
          { campo: 'tipo_impositivo', tipo: DATA_TYPE.PERCENTAGE, descripcion: 'Tipo impositivo' },
          { campo: 'activo', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Si está activo' }
        ]
      }
    ]
  },

  // ── JUNTA DE LA PLACETA ──────────────────────────────────────────────
  junta: {
    iban: 'GDLP-AP00-001',
    nombre: 'Junta de La Placeta',
    descripcion: 'API de gobierno: ciudadanos, PlacetaID, votaciones, cargos',
    contacto: 'junta@laplaceta.org',
    endpoints: [
      {
        path: '/ciudadanos',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener listado de ciudadanos registrados',
        platforms: ['web'],
        dataReturn: [
          { campo: 'dip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del ciudadano' },
          { campo: 'nombre', tipo: DATA_TYPE.STRING, descripcion: 'Nombre completo' },
          { campo: 'email', tipo: DATA_TYPE.STRING, descripcion: 'Correo electrónico' },
          { campo: 'rol', tipo: DATA_TYPE.STRING, descripcion: 'Rol en el sistema' },
          { campo: 'activo', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Si está activo' },
          { campo: 'createdAt', tipo: DATA_TYPE.DATE, descripcion: 'Fecha de registro' }
        ]
      },
      {
        path: '/placetaid/registros',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener registros de PlacetaID',
        platforms: ['android', 'ios', 'web'],
        dataReturn: [
          { campo: 'dip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del ciudadano' },
          { campo: 'nombre', tipo: DATA_TYPE.STRING, descripcion: 'Nombre' },
          { campo: 'apellidos', tipo: DATA_TYPE.STRING, descripcion: 'Apellidos' },
          { campo: 'email', tipo: DATA_TYPE.STRING, descripcion: 'Email' },
          { campo: 'totpVerificado', tipo: DATA_TYPE.BOOLEAN, descripcion: '2FA verificado' },
          { campo: 'bloqueado', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Si está bloqueado' },
          { campo: 'rol', tipo: DATA_TYPE.STRING, descripcion: 'Rol' }
        ]
      },
      {
        path: '/votaciones',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener votaciones activas e históricas',
        platforms: ['android', 'ios', 'web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID de la votación' },
          { campo: 'titulo', tipo: DATA_TYPE.STRING, descripcion: 'Título' },
          { campo: 'descripcion', tipo: DATA_TYPE.STRING, descripcion: 'Descripción' },
          { campo: 'activa', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Si está activa' },
          { campo: 'fechaInicio', tipo: DATA_TYPE.DATE, descripcion: 'Fecha de inicio' },
          { campo: 'fechaFin', tipo: DATA_TYPE.DATE, descripcion: 'Fecha de fin' }
        ]
      },
      {
        path: '/cargos',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener cargos de la junta',
        platforms: ['web'],
        dataReturn: [
          { campo: 'dip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del cargo' },
          { campo: 'cargo', tipo: DATA_TYPE.STRING, descripcion: 'Nombre del cargo' },
          { campo: 'departamento', tipo: DATA_TYPE.STRING, descripcion: 'Departamento' },
          { campo: 'activo', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Si está activo' }
        ]
      },
      {
        path: '/reclamaciones',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener reclamaciones de ciudadanos',
        platforms: ['web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID de la reclamación' },
          { campo: 'ciudadano', tipo: DATA_TYPE.STRING, descripcion: 'Nombre del ciudadano' },
          { campo: 'asunto', tipo: DATA_TYPE.STRING, descripcion: 'Asunto' },
          { campo: 'prioridad', tipo: DATA_TYPE.STRING, descripcion: 'Prioridad' },
          { campo: 'estado', tipo: DATA_TYPE.STRING, descripcion: 'Estado' },
          { campo: 'fecha', tipo: DATA_TYPE.DATE, descripcion: 'Fecha de creación' }
        ]
      },
      {
        path: '/reclamaciones',
        method: 'POST',
        tipo: 'modificacion',
        descripcion: 'Crear una nueva reclamación',
        platforms: ['android', 'ios', 'web'],
        params: [
          { campo: 'dip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del ciudadano', requerido: true },
          { campo: 'asunto', tipo: DATA_TYPE.STRING, descripcion: 'Asunto de la reclamación', requerido: true },
          { campo: 'descripcion', tipo: DATA_TYPE.STRING, descripcion: 'Descripción detallada', requerido: true }
        ],
        dataReturn: [
          { campo: 'success', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Resultado' },
          { campo: 'reclamacion', tipo: DATA_TYPE.OBJECT, descripcion: 'Datos de la reclamación creada' }
        ]
      }
    ]
  },

  // ── ADMINISTRACIÓN DE LA PLACETA ─────────────────────────────────────
  administracion: {
    iban: 'GDLP-AP00-002',
    nombre: 'Administración de La Placeta',
    descripcion: 'API de administración: trámites, actas, gestión ciudadana',
    contacto: 'admin@laplaceta.org',
    endpoints: [
      {
        path: '/tramites',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener listado de trámites administrativos',
        platforms: ['web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID del trámite' },
          { campo: 'tipo', tipo: DATA_TYPE.STRING, descripcion: 'Tipo de trámite' },
          { campo: 'solicitanteDip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del solicitante' },
          { campo: 'estado', tipo: DATA_TYPE.STRING, descripcion: 'Estado del trámite' },
          { campo: 'fechaCreacion', tipo: DATA_TYPE.DATE, descripcion: 'Fecha de creación' }
        ]
      },
      {
        path: '/actas',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener actas y documentos oficiales',
        platforms: ['web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID del acta' },
          { campo: 'titulo', tipo: DATA_TYPE.STRING, descripcion: 'Título del acta' },
          { campo: 'fecha', tipo: DATA_TYPE.DATE, descripcion: 'Fecha del acta' },
          { campo: 'tipo', tipo: DATA_TYPE.STRING, descripcion: 'Tipo de documento' },
          { campo: 'estado', tipo: DATA_TYPE.STRING, descripcion: 'Estado (final, borrador, firmado)' }
        ]
      },
      {
        path: '/junior/menores/:dipTutor',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener menores a cargo de un tutor',
        platforms: ['android', 'ios'],
        dataReturn: [
          { campo: 'dip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del menor' },
          { campo: 'nombre', tipo: DATA_TYPE.STRING, descripcion: 'Nombre del menor' },
          { campo: 'tutorDip', tipo: DATA_TYPE.DIP, descripcion: 'DIP del tutor' },
          { campo: 'fechaNacimiento', tipo: DATA_TYPE.DATE, descripcion: 'Fecha de nacimiento' }
        ]
      }
    ]
  },

  // ── RED DE SERVICIOS DE LA PLACETA (RSP) ─────────────────────────────
  rsp: {
    iban: 'GDLP-AP99-001',
    nombre: 'Red de Servicios de La Placeta',
    descripcion: 'API central de servicios: conexiones, facturación, estado',
    contacto: 'rsp@laplaceta.org',
    endpoints: [
      {
        path: '/estadisticas',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener estadísticas globales del sistema RSP',
        platforms: ['web'],
        dataReturn: [
          { campo: 'totalConexiones', tipo: DATA_TYPE.NUMBER, descripcion: 'Total de conexiones registradas' },
          { campo: 'conexionesHoy', tipo: DATA_TYPE.NUMBER, descripcion: 'Conexiones de hoy' },
          { campo: 'conexionesEsteMes', tipo: DATA_TYPE.NUMBER, descripcion: 'Conexiones del mes' },
          { campo: 'facturasPendientes', tipo: DATA_TYPE.NUMBER, descripcion: 'Facturas pendientes' },
          { campo: 'saldoActual', tipo: DATA_TYPE.AMOUNT, descripcion: 'Saldo actual de fondos' }
        ]
      },
      {
        path: '/tarifas',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener tarifas vigentes del sistema RSP',
        platforms: ['android', 'ios', 'web'],
        dataReturn: [
          { campo: 'consulta', tipo: DATA_TYPE.OBJECT, descripcion: 'Tarifa de consulta {precio, iva, total}' },
          { campo: 'modificacion', tipo: DATA_TYPE.OBJECT, descripcion: 'Tarifa de modificación {precio, iva, total}' },
          { campo: 'iva', tipo: DATA_TYPE.PERCENTAGE, descripcion: 'Porcentaje de IVA aplicado' }
        ]
      },
      {
        path: '/conexiones',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener historial de conexiones',
        platforms: ['web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID de la conexión' },
          { campo: 'entidad', tipo: DATA_TYPE.STRING, descripcion: 'Entidad que realizó la conexión' },
          { campo: 'tipo', tipo: DATA_TYPE.STRING, descripcion: 'Tipo (consulta/modificacion)' },
          { campo: 'endpoint', tipo: DATA_TYPE.STRING, descripcion: 'Endpoint llamado' },
          { campo: 'total', tipo: DATA_TYPE.AMOUNT, descripcion: 'Coste total (tarifa+IVA)' },
          { campo: 'timestamp', tipo: DATA_TYPE.DATE, descripcion: 'Fecha y hora' }
        ]
      },
      {
        path: '/facturas',
        method: 'GET',
        tipo: 'consulta',
        descripcion: 'Obtener listado de facturas',
        platforms: ['web'],
        dataReturn: [
          { campo: 'id', tipo: DATA_TYPE.STRING, descripcion: 'ID de la factura' },
          { campo: 'entidad', tipo: DATA_TYPE.STRING, descripcion: 'Entidad facturada' },
          { campo: 'estado', tipo: DATA_TYPE.STRING, descripcion: 'Estado (pendiente/pagada)' },
          { campo: 'detalle', tipo: DATA_TYPE.OBJECT, descripcion: 'Detalle con desglose de costes' },
          { campo: 'emitida', tipo: DATA_TYPE.DATE, descripcion: 'Fecha de emisión' }
        ]
      },
      {
        path: '/conexiones/registrar',
        method: 'POST',
        tipo: 'modificacion',
        descripcion: 'Registrar una nueva conexión (uso interno entre entidades)',
        platforms: ['web'],
        params: [
          { campo: 'entidad', tipo: DATA_TYPE.STRING, descripcion: 'Entidad que realiza la conexión', requerido: true },
          { campo: 'tipo', tipo: DATA_TYPE.STRING, descripcion: 'consulta o modificacion', requerido: true },
          { campo: 'endpoint', tipo: DATA_TYPE.STRING, descripcion: 'Endpoint al que se conecta', requerido: true }
        ],
        dataReturn: [
          { campo: 'success', tipo: DATA_TYPE.BOOLEAN, descripcion: 'Resultado' },
          { campo: 'conexion', tipo: DATA_TYPE.OBJECT, descripcion: 'Datos de la conexión registrada' }
        ]
      }
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE ACCESO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Obtiene el registro de APIs de una entidad
 */
export function getEntityAPI(entidad) {
  return API_REGISTRY[entidad] || null;
}

/**
 * Obtiene un endpoint específico de una entidad
 */
export function getEntityEndpoint(entidad, path) {
  const entity = API_REGISTRY[entidad];
  if (!entity) return null;

  // Buscar coincidencia exacta o con parámetros
  return entity.endpoints.find(ep => {
    // Convertir patrones con :param a regex
    const pattern = '^' + ep.path.replace(/:[\w]+/g, '[^/]+') + '$';
    return new RegExp(pattern).test(path);
  }) || null;
}

/**
 * Verifica si una plataforma está permitida para un endpoint
 */
export function isPlatformAllowed(entidad, path, platform) {
  const endpoint = getEntityEndpoint(entidad, path);
  if (!endpoint) return false;
  return endpoint.platforms.includes(platform);
}

/**
 * Obtiene todas las entidades con sus IBANs
 */
export function getEntitiesIBAN() {
  const result = {};
  for (const [key, value] of Object.entries(API_REGISTRY)) {
    result[key] = {
      nombre: value.nombre,
      iban: value.iban,
      contacto: value.contacto
    };
  }
  return result;
}

/**
 * Obtiene el IBAN de una entidad específica
 */
export function getEntityIBAN(entidad) {
  const entity = API_REGISTRY[entidad];
  return entity ? entity.iban : null;
}

/**
 * Obtiene el coste RSP de un endpoint
 */
export function getEndpointCost(entidad, path) {
  const endpoint = getEntityEndpoint(entidad, path);
  if (!endpoint) return null;
  return {
    tipo: endpoint.tipo,
    precio: endpoint.tipo === 'consulta' ? 0.001 : 0.1,
    iva: 0.12,
    total: endpoint.tipo === 'consulta' ? 0.00112 : 0.112
  };
}

export default API_REGISTRY;
