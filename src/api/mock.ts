/* ═══════════════════════════════════════════════════════════════════════
   RSP Web · Proveedor mock (demo sin backend)
   Datos de demostración coherentes con el modelo real. Se usa cuando
   VITE_USE_MOCK=true (por defecto en local).
   ═══════════════════════════════════════════════════════════════════════ */

import type {
  Session, DashboardStats, Tramite, Expediente, ContextoCiudadano,
  CiudadanoResumen, Notificacion, EventoAuditoria, CNICRegla, Operacion,
  EntidadRegistral, Filtros, Actuacion, Requisito, DocumentoVinculado,
  NuevoTramite, EstadoTramite, Contribuyente,
  DeclaracionResumen, DeclaracionDetalle, DocumentoCiudadano, FirmaCiudadano,
  Obligacion, SubvencionResumen, SubvencionDetalle, Solicitud2FA,
  DesgloseFiscal, CuentaSugerencia, RegimenBono, BonoDetalle, CuentaBancaria, TarjetaDigital,
  ActividadJunior, ColaboradorJunior, DiplomaJunior,
  Votacion, VotoRegistro, Junta, Encuesta, FacturaEmitida, ParticipacionEmpresa, RequisitoBono,
} from '../types';
import { TIPOS_TRAMITE, ANONIMATO_DIAS } from '../types';
import type { Provider } from './provider';

const AHORA = new Date().toISOString();

const SESSION: Session = {
  usuario: { dip: '23749931M', nombre: 'Mikel Alegre Marcos', email: 'mikel@laplaceta.org', nivel: 'N3' },
  roles: ['superadmin', 'rsp_admin'],
  entidades: ['banco', 'tributos', 'junta', 'administracion', 'rsp', 'junior'],
  permisos: { rsp: [] },
};

const TRAMITES: (Tramite & { actuaciones?: Actuacion[] })[] = [
  {
    id: 'TR-2026-000184', tipo: 'subvencion', titulo: 'Solicitud de subvención — Material escolar',
    dip: '84866700A', nombreCiudadano: 'Pablo Ruiz', estado: 'revision', plazo: 15,
    plazoDesde: AHORA, vencido: false, asignadoA: 'Mikel Alegre Marcos', expedienteId: 'EXP-2026-000184',
    servicio: 'Subvenciones', firmasCompletas: 0, firmasRequeridas: 1, actualizadoEn: AHORA,
    actuaciones: [
      { id: 'ACT-1', tipo: 'presentacion', descripcion: 'Presentada la solicitud', autor: 'Pablo Ruiz', fecha: AHORA },
      { id: 'ACT-2', tipo: 'validacion', descripcion: 'Validación automática superada', autor: 'Sistema', fecha: AHORA },
    ],
  },
  {
    id: 'TR-2026-000121', tipo: 'cambio_titularidad', titulo: 'Cambio de titularidad — Cuenta compartida',
    dip: '23749931M', nombreCiudadano: 'Mikel Alegre Marcos', estado: 'firma', plazo: 7,
    plazoDesde: AHORA, vencido: true, asignadoA: 'Unai García', expedienteId: 'EXP-2026-000121',
    servicio: 'Patrimonio', firmasCompletas: 1, firmasRequeridas: 2, actualizadoEn: AHORA,
    actuaciones: [],
  },
  {
    id: 'TR-2026-000099', tipo: 'baja', titulo: 'Baja de persona — Traslado fuera del ecosistema',
    dip: '11111111D', nombreCiudadano: 'Salma El Harrak', estado: 'subsanacion', plazo: 10,
    plazoDesde: AHORA, vencido: false, asignadoA: null, expedienteId: 'EXP-2026-000099',
    servicio: 'Registro', firmasCompletas: 0, firmasRequeridas: 1, actualizadoEn: AHORA,
    actuaciones: [],
  },
  {
    id: 'TR-2026-000088', tipo: 'herencia', titulo: 'Sucesión — Reparto de participaciones',
    dip: 'EIP-XJETNL', nombreCiudadano: 'Unhiro Inversiones S.P.', estado: 'resolucion', plazo: 20,
    plazoDesde: AHORA, vencido: false, asignadoA: null, expedienteId: 'EXP-2026-000088',
    servicio: 'Sucesiones', firmasCompletas: 2, firmasRequeridas: 3, actualizadoEn: AHORA,
    actuaciones: [],
  },
];

const ACTUACIONES: Record<string, Actuacion[]> = {
  'TR-2026-000184': [
    { id: 'ACT-1', tipo: 'presentacion', descripcion: 'Presentada la solicitud', autor: 'Pablo Ruiz', fecha: AHORA },
    { id: 'ACT-2', tipo: 'validacion', descripcion: 'Validación automática superada', autor: 'Sistema', fecha: AHORA },
  ],
};

const DETALLES: Record<string, { requisitos: Requisito[]; documentos: DocumentoVinculado[] }> = {
  'TR-2026-000184': {
    requisitos: [
      { id: 'R1', descripcion: 'Presupuesto del material escolar', cumplido: true },
      { id: 'R2', descripcion: 'Justificante de matriculación', cumplido: false },
    ],
    documentos: [
      { id: 'DOC-1', nombre: 'Solicitud firmada.pdf', tipo: 'solicitud', firmado: true },
      { id: 'DOC-2', nombre: 'Presupuesto.pdf', tipo: 'anexo', firmado: false },
    ],
  },
  'TR-2026-000121': {
    requisitos: [{ id: 'R1', descripcion: 'Identidad de cedente y cesionario', cumplido: false }],
    documentos: [{ id: 'DOC-1', nombre: 'Contrato de cesión.pdf', tipo: 'contrato', firmado: false }],
  },
  'TR-2026-000099': {
    requisitos: [{ id: 'R1', descripcion: 'Justificante del traslado', cumplido: false }],
    documentos: [],
  },
  'TR-2026-000088': {
    requisitos: [{ id: 'R1', descripcion: 'Testamento digital', cumplido: true }],
    documentos: [{ id: 'DOC-1', nombre: 'Testamento.pdf', tipo: 'testamento', firmado: true }],
  },
};

const TRANSICIONES: Record<string, EstadoTramite> = {
  validar: 'revision',
  aprobar: 'resolucion',
  subsanar: 'subsanacion',
  validar_subsanacion: 'revision',
  emitir_firma: 'firma',
  resolver: 'resolucion',
  rechazar: 'cierre',
  cerrar: 'cierre',
};

const DESCRIPCIONES: Record<string, string> = {
  validar: 'Validación del gestor',
  aprobar: 'Aprobación del trámite',
  subsanar: 'Solicitud de subsanación',
  validar_subsanacion: 'Subsanación validada',
  emitir_firma: 'Emisión de firma',
  resolver: 'Resolución emitida',
  rechazar: 'Trámite rechazado',
  cerrar: 'Trámite cerrado',
};

const EXPEDIENTES: Expediente[] = TRAMITES.map((t, i) => ({
  id: t.expedienteId!,
  titulo: t.titulo,
  dip: t.dip,
  nombreCiudadano: t.nombreCiudadano,
  servicio: t.servicio ?? 'General',
  estado: t.estado,
  numActuaciones: (t.actuaciones ?? []).length + i,
  documentos: 2 + i,
  creadoEn: AHORA,
}));

// Censo REAL completo (coincide con CONTRIBUYENTES): todas las personas y el junior.
const CIUDADANOS: CiudadanoResumen[] = [
  { dip: '23749931M', nombre: 'Mikel Alegre Marcos', nivel: 'N3', cuentas: 4, expedientesActivos: 3, estado: 'activo' },
  { dip: '72583347U', nombre: 'Unai García Almazán', nivel: 'N3', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '20521220S', nombre: 'Salma El Harrak', nivel: 'N3', cuentas: 1, expedientesActivos: 2, estado: 'activo' },
  { dip: '45134577U', nombre: 'Uriel', nivel: 'N2', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '86843254E', nombre: 'Enzo Alegre Marcos', nivel: 'N2', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '38599364E', nombre: 'Edgar', nivel: 'N2', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '49348594L', nombre: 'Leire', nivel: 'N2', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '58285937S', nombre: 'Shaheer Shajjad Bhatti', nivel: 'N2', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '74929475A', nombre: 'Aitor de Felipe Alcántara', nivel: 'N2', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '83759384A', nombre: 'Ana Maria', nivel: 'N2', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '65725675A', nombre: 'Alba Marcos del Pozo', nivel: 'N2', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '31856370M', nombre: 'Minaya Covas Armesto', nivel: 'N1', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '82639682N', nombre: 'Nuria', nivel: 'N1', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '39587539P', nombre: 'Phoebe', nivel: 'N1', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '39672964I', nombre: 'Iker', nivel: 'N1', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
  { dip: '86209131P', nombre: 'Pablo Ruiz', nivel: 'N1', cuentas: 1, expedientesActivos: 1, estado: 'activo' },
];

const NOTIFICACIONES: Notificacion[] = [
  { id: 'NOTIF-1', nivel: 'pendiente', titulo: 'Trámite a punto de vencer', mensaje: 'TR-2026-000121 vence en 1 día.', destinatarioDip: '23749931M', leida: false, acuseRecibido: false, creadaEn: AHORA },
  { id: 'NOTIF-2', nivel: 'accion', titulo: 'Firma pendiente', mensaje: 'Falta 1 de 2 firmas en la sucesión EXP-2026-000088.', destinatarioDip: '23749931M', leida: false, acuseRecibido: true, creadaEn: AHORA },
  { id: 'NOTIF-3', nivel: 'info', titulo: 'CNIC programado', mensaje: 'CNIC-IVA v4 se publicará el 15/08.', leida: true, acuseRecibido: true, creadaEn: AHORA },
];

const AUDITORIA: EventoAuditoria[] = [
  { id: 'AUD-2026-000521', usuario: 'Mikel Alegre Marcos', servicio: 'tramites', accion: 'aprobar', objetoTipo: 'tramite', objetoId: 'TR-2026-000184', fecha: AHORA },
  { id: 'AUD-2026-000520', usuario: 'Unai García', servicio: 'expedientes', accion: 'vincular_documento', objetoTipo: 'expediente', objetoId: 'EXP-2026-000121', fecha: AHORA },
  { id: 'AUD-2026-000519', usuario: 'Sistema', servicio: 'fiscalidad', accion: 'bloquear_limite_500k', objetoTipo: 'cuenta', objetoId: 'ACC-2026-000077', motivo: 'Supera el límite de capital', fecha: AHORA },
];

function cnic(codigo: string, etiqueta: string, tipoValor: string, valor: string | number, unidad?: string): CNICRegla {
  return {
    codigo, etiqueta, tipoValor, valor, unidad, version: 1, estado: 'vigente', autor: 'BOP',
    fuente: 'BOP', bopUrl: `https://bop.laplaceta.org/cnic.html?codigo=${codigo}`,
    historial: [{ version: 1, valor, estado: 'vigente', fecha: '2026-07-01' }],
  };
}

// Valores REALES del Boletín Oficial (CNI Cap. IV, CNIC-4.x vigentes).
const CNIC: CNICRegla[] = [
  cnic('CNIC-IVA', 'Impuesto sobre el Valor Añadido (tipo general)', 'porcentaje', 12, '%'),
  cnic('CNIC-LIMITE-CAPITAL-PERSONAL', 'Límite de capital cuenta personal', 'numero', 500000, 'Pz'),
  cnic('CNIC-LIMITE-CAPITAL-INSTITUCIONAL', 'Límite de capital cuenta institucional/estatal', 'numero', 10000000, 'Pz'),
  cnic('CNIC-CUENTA-CIUDADANA-SALDO', 'Saldo máximo cuenta ciudadana', 'numero', 500000, 'Pz'),
  cnic('CNIC-SANCION-SALDO-EXCESO-PERSONAL', 'Multa por exceso de capital personal (Art. 4.1)', 'numero', 225000, 'Pz'),
  cnic('CNIC-SANCION-SALDO-NEGATIVO-DIA-6', 'Sanción saldo negativo desde día 6 (Art. 4.2)', 'numero', 25000, 'Pz'),
  cnic('CNIC-SANCION-SALDO-NEGATIVO-DIA-30', 'Sanción saldo negativo día 30 (acumulable, Art. 4.2)', 'numero', 125000, 'Pz'),
  cnic('CNIC-SMI-MENSUAL', 'Salario Mínimo Interprofesional', 'numero', 150, 'Pz'),
  cnic('CNIC-SALARIO-MAXIMO-MENSUAL', 'Salario Máximo Interprofesional', 'numero', 1750, 'Pz'),
  cnic('CNIC-RBU-SEMANAL', 'RBU semanal', 'numero', 5, 'Pz'),
  cnic('CNIC-TASA-TRANSFERENCIA-MAXIMA', 'Tasa máxima de transferencia', 'porcentaje', 12, '%'),
  // IRM por Índice de Acumulación (Art. 4.10)
  cnic('CNIC-IRM-PARTICULAR-0', 'IRM particular IA ≤ 0', 'porcentaje', 0, '%'),
  cnic('CNIC-IRM-PARTICULAR-1', 'IRM particular 0 < IA ≤ 0,05', 'porcentaje', 0.5, '%'),
  cnic('CNIC-IRM-PARTICULAR-2', 'IRM particular 0,05 < IA ≤ 0,15', 'porcentaje', 1.5, '%'),
  cnic('CNIC-IRM-PARTICULAR-3', 'IRM particular 0,15 < IA ≤ 0,30', 'porcentaje', 3, '%'),
  cnic('CNIC-IRM-PARTICULAR-4', 'IRM particular IA > 0,30', 'porcentaje', 5, '%'),
  cnic('CNIC-IRM-COMPARTIDA-0', 'IRM compartida IA ≤ 0', 'porcentaje', 0, '%'),
  cnic('CNIC-IRM-COMPARTIDA-1', 'IRM compartida 0 < IA ≤ 0,05', 'porcentaje', 0.75, '%'),
  cnic('CNIC-IRM-COMPARTIDA-2', 'IRM compartida 0,05 < IA ≤ 0,15', 'porcentaje', 2, '%'),
  cnic('CNIC-IRM-COMPARTIDA-3', 'IRM compartida 0,15 < IA ≤ 0,30', 'porcentaje', 4, '%'),
  cnic('CNIC-IRM-COMPARTIDA-4', 'IRM compartida IA > 0,30', 'porcentaje', 6, '%'),
  cnic('CNIC-IRM-EMPRESA-0', 'IRM empresa IA ≤ 0', 'porcentaje', 0, '%'),
  cnic('CNIC-IRM-EMPRESA-1', 'IRM empresa 0 < IA ≤ 0,05', 'porcentaje', 1, '%'),
  cnic('CNIC-IRM-EMPRESA-2', 'IRM empresa 0,05 < IA ≤ 0,15', 'porcentaje', 3, '%'),
  cnic('CNIC-IRM-EMPRESA-3', 'IRM empresa 0,15 < IA ≤ 0,30', 'porcentaje', 6, '%'),
  cnic('CNIC-IRM-EMPRESA-4', 'IRM empresa IA > 0,30', 'porcentaje', 9, '%'),
  // IGF personas físicas (Art. 4.13)
  cnic('CNIC-IGF-PF-TRAMO-1', 'IGF PF tramo exento (hasta)', 'numero', 5000, 'Pz'),
  cnic('CNIC-IGF-PF-TIPO-1', 'IGF PF tipo tramo exento', 'porcentaje', 0, '%'),
  cnic('CNIC-IGF-PF-TRAMO-2', 'IGF PF segundo tramo (hasta)', 'numero', 20000, 'Pz'),
  cnic('CNIC-IGF-PF-TIPO-2', 'IGF PF tipo segundo tramo', 'porcentaje', 10, '%'),
  cnic('CNIC-IGF-PF-TRAMO-3', 'IGF PF tercer tramo (hasta)', 'numero', 500000, 'Pz'),
  cnic('CNIC-IGF-PF-TIPO-3', 'IGF PF tipo tercer tramo', 'porcentaje', 30, '%'),
  // IGF empresas y entidades (Art. 4.14)
  cnic('CNIC-IGF-EMPRESA-TRAMO-1', 'IGF empresa tramo exento (hasta)', 'numero', 5000, 'Pz'),
  cnic('CNIC-IGF-EMPRESA-TIPO-1', 'IGF empresa tipo tramo exento', 'porcentaje', 0, '%'),
  cnic('CNIC-IGF-EMPRESA-TRAMO-2', 'IGF empresa segundo tramo (hasta)', 'numero', 20000, 'Pz'),
  cnic('CNIC-IGF-EMPRESA-TIPO-2', 'IGF empresa tipo segundo tramo', 'porcentaje', 5, '%'),
  cnic('CNIC-IGF-EMPRESA-TRAMO-3', 'IGF empresa tercer tramo (hasta)', 'numero', 500000, 'Pz'),
  cnic('CNIC-IGF-EMPRESA-TIPO-3', 'IGF empresa tipo tercer tramo', 'porcentaje', 35, '%'),
  cnic('CNIC-IGF-EMPRESA-TIPO-4', 'IGF empresa tipo tramo > 500.000', 'porcentaje', 85, '%'),
  cnic('CNIC-EXENCION-EMPRESA-PEQUENA', 'Umbral exención IGF empresa pequeña (Art. 4.15)', 'numero', 20000, 'Pz'),
  // Cotizaciones laborales (Art. 4.5): tramos por sueldo bruto mensual
  cnic('CNIC-COTIZACION-TRAMO-1-LIMITE', 'Tope tramo 1 cotización (sueldo bruto)', 'numero', 1700, 'Pz'),
  cnic('CNIC-COTIZACION-TRAMO-2-LIMITE', 'Tope tramo 2 cotización (sueldo bruto)', 'numero', 3000, 'Pz'),
  cnic('CNIC-COTIZACION-TRABAJADOR-TRAMO-1', 'Cotización trabajador tramo 1', 'porcentaje', 7.5, '%'),
  cnic('CNIC-COTIZACION-TRABAJADOR-TRAMO-2', 'Cotización trabajador tramo 2', 'porcentaje', 10.5, '%'),
  cnic('CNIC-COTIZACION-TRABAJADOR-TRAMO-3', 'Cotización trabajador tramo 3', 'porcentaje', 17.5, '%'),
  cnic('CNIC-COTIZACION-EMPRESA-TRAMO-1', 'Cotización empresa tramo 1', 'porcentaje', 7.5, '%'),
  cnic('CNIC-COTIZACION-EMPRESA-TRAMO-2', 'Cotización empresa tramo 2', 'porcentaje', 10.5, '%'),
  cnic('CNIC-COTIZACION-EMPRESA-TRAMO-3', 'Cotización empresa tramo 3', 'porcentaje', 17.5, '%'),
  cnic('CNIC-COTIZACION-TOTAL-TRAMO-1', 'Cotización total tramo 1', 'porcentaje', 15, '%'),
  cnic('CNIC-COTIZACION-TOTAL-TRAMO-2', 'Cotización total tramo 2', 'porcentaje', 21, '%'),
  cnic('CNIC-COTIZACION-TOTAL-TRAMO-3', 'Cotización total tramo 3', 'porcentaje', 35, '%'),
  // Bono de bienvenida (CNI Art. 7)
  cnic('CNIC-BONO-BIENVENIDA-CIUDADANA', 'Bono de bienvenida alta plena', 'numero', 500, 'Pz'),
  cnic('CNIC-BONO-BIENVENIDA-JUNIOR-BASICA', 'Bono de bienvenida menor de 16 años', 'numero', 750, 'Pz'),
];

const OPERACIONES: Operacion[] = [
  { id: 'OP-2026-000321', concepto: 'Nómina agosto', importe: 350, origen: 'FUND-BLP', destino: '84866700A', clasificacion: 'nomina', inconsistencia: 'NOMINA_SIN_REFERENCIA', estado: 'retenida', fecha: AHORA },
  { id: 'OP-2026-000320', concepto: 'Factura proveedor', importe: 112, origen: 'EIP-XJETNL', destino: 'PROV-01', clasificacion: 'factura', estado: 'procesada', fecha: AHORA },
  { id: 'OP-2026-000319', concepto: 'Subvención concedida', importe: 1000, origen: 'AGLDP', destino: 'EIP-X4NGQU', clasificacion: 'subvencion', inconsistencia: 'SUBVENCION_SIN_EXPEDIENTE', estado: 'retenida', fecha: AHORA },
];

const ENTIDADES: EntidadRegistral[] = [
  { eip: 'EIP-XJETNL', nombre: 'Unhiro Inversiones S.P.', tipo: 'Sociedad', representantes: ['23749931M', '20521220S'], estado: 'activa', cumplimiento: 'Al día', cuentas: 1, titulares: 2, participacionTotal: 100 },
  { eip: 'EIP-X4NGQU', nombre: 'Red del Grupo de La Placeta S.P.', tipo: 'Sociedad', representantes: ['23749931M', '72583347U'], estado: 'activa', cumplimiento: 'Al día', cuentas: 2, titulares: 2, participacionTotal: 100 },
];

// Mapa nombre de cuenta del banco → EIP (para cuentas Business sin campo `eip`).
// Se completa con los datos reales del censo (Supabase) cuando llegan por el banco.
const EIP_POR_NOMBRE_CUENTA: Record<string, string> = {
  'Unhiro S.PV.': 'EIP-XJETNL',
  'Unhiro Inversiones S.P.': 'EIP-XJETNL',
  'Red del Grupo de La Placeta S.P.': 'EIP-X4NGQU',
  // 'Placeta Telecom S.P.': EIP pendiente de confirmar en censo (llega por `eip` real).
  'Capitália Empresa': 'CAPITALIA_BANK',
};

// Nombre canónico registral por EIP.
const NOMBRE_ENTIDAD_POR_EIP: Record<string, string> = {
  'EIP-XJETNL': 'Unhiro Inversiones S.P.',
  'EIP-X4NGQU': 'Red del Grupo de La Placeta S.P.',
  'CAPITALIA_BANK': 'Capitália Empresa',
};

const SISTEMA_CUENTAS = /^(TGLP|AGLDP|VAULT_EMISION|DIP-|sys-|biz-market-|FUND-BLP)$/;

function eipDeCuenta(c: CuentaBancaria): string {
  if (c.eip) return c.eip;
  if (SISTEMA_CUENTAS.test(c.id)) return '';
  return EIP_POR_NOMBRE_CUENTA[c.nombre] ?? '';
}

// Entidades derivadas de las cuentas Business REALES del banco.
function entidadesDelBanco(cuentas: CuentaBancaria[]): EntidadRegistral[] {
  const map = new Map<string, EntidadRegistral & { titularesSet: Set<string>; pctTotal: number }>();
  for (const c of cuentas) {
    if (c.tipo !== 'Business' || c.estado === 'cerrada') continue;
    const eip = eipDeCuenta(c);
    if (!eip) continue;
    let e = map.get(eip);
    if (!e) {
      e = {
        eip,
        nombre: NOMBRE_ENTIDAD_POR_EIP[eip] ?? c.nombre,
        tipo: eip === 'CAPITALIA_BANK' ? 'Sociedad pública' : 'Sociedad',
        representantes: [],
        estado: 'activa',
        cumplimiento: 'Al día',
        cuentas: 0,
        titulares: 0,
        participacionTotal: 0,
        titularesSet: new Set(),
        pctTotal: 0,
      };
      map.set(eip, e);
    }
    e.cuentas = (e.cuentas ?? 0) + 1;
    for (const p of c.participaciones ?? []) {
      e.titularesSet.add(p.dip || p.nombre);
      if (p.dip && !e.representantes.includes(p.dip)) e.representantes.push(p.dip);
      e.pctTotal += p.pct;
    }
  }
  return Array.from(map.values()).map(({ titularesSet, pctTotal, ...e }) => ({
    ...e,
    titulares: Math.max(titularesSet.size, e.representantes.length),
    participacionTotal: Math.round(pctTotal * 10) / 10,
  }));
}

// Facturas emitidas por entidad (ventas reales del banco, más seed representativo).
const FACTURAS_EMITIDAS: Record<string, FacturaEmitida[]> = {
  'EIP-XJETNL': [
    { id: 'FAC-2026-000184', numero: 'FAC-2026-000184', concepto: 'Servicios de consultoría', importe: 112, estado: 'cobrada', fecha: '2026-08-01', receptor: 'Proveedor PROV-01', receptorId: 'PROV-01' },
  ],
  'EIP-X4NGQU': [
    { id: 'FAC-2026-000190', numero: 'FAC-2026-000190', concepto: 'Servicios de la red', importe: 150, estado: 'cobrada', fecha: '2026-08-05', receptor: 'Mikel Alegre Marcos', receptorId: '23749931M' },
  ],
};

// ── Banco real: se lee el estado en vivo del banco a través del BFF ──
// (/api/bank/state). En desarrollo el proxy de Vite reenvía /api al BFF;
// si no está disponible (offline/tests), se usa el seed de abajo.
let cacheBancoLive: { cuentas: CuentaBancaria[]; tarjetas: TarjetaDigital[] } | null = null;
async function estadoBancoLive() {
  if (cacheBancoLive) return cacheBancoLive;
  try {
    const r = await fetch('/api/bank/state', { credentials: 'include' });
    if (!r.ok) return null;
    const state = await r.json();
    const cuentas: CuentaBancaria[] = (state.accounts || []).map((a: any) => {
      const nombre = String(a.displayName || a.name || '').replace(/\s*\(.*\)\s*$/, '').trim();
      const esFund = /fundacion|fundación/i.test(String(a.displayName || '')) || /^FUND-/.test(String(a.id || ''));
      const holders: { dip: string; nombre: string; pct: number }[] = (a.accountHolders || [])
        .filter((h: any) => Number(h.ownershipPercent || h.pct || 0) > 0)
        .map((h: any) => ({
          dip: String(h.placetaId || h.dip || '').toUpperCase(),
          nombre: String(h.displayName || h.name || h.placetaId || h.dip || '').replace(/\s*\(.*\)\s*$/, '').trim(),
          pct: Number(h.ownershipPercent || h.pct || 0),
        }));
      return {
        id: a.id,
        nombre,
        tipo: a.type || 'Current',
        dip: (a.placetaId || '').toUpperCase(),
        saldo: Number(a.balancePz || 0),
        estado: a.closedAt ? 'cerrada' : 'activa',
        esFundacion: esFund,
        eip: String(a.eip || '').toUpperCase(),
        participaciones: holders,
      };
    });
    const tarjetas: TarjetaDigital[] = (state.digitalCards || state.cards || []).map((d: any) => {
      const num = String(d.cardNumber || d.id || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
      return {
        id: d.id, alias: d.alias || 'Tarjeta', accountId: d.accountId || '',
        tier: d.tier || 'Standard', frozen: !!d.frozen, cardNumber: num,
        promoPhysical: !!d.promoPhysical, pin: d.pin || '0000',
        contactlessLimitPz: 500, weeklyLimitPz: 1000,
      };
    });
    cacheBancoLive = { cuentas, tarjetas };
    return cacheBancoLive;
  } catch {
    return null;
  }
}
async function arrayCuentas(): Promise<CuentaBancaria[]> {
  const live = await estadoBancoLive();
  return live ? live.cuentas : CUENTAS;
}
async function arrayTarjetas(): Promise<TarjetaDigital[]> {
  const live = await estadoBancoLive();
  return live ? live.tarjetas : TARJETAS;
}

// ── Verificación automática de requisitos de bono (datos REALES) ──────
// Magnitudes reales del ciudadano que los requisitos pueden comprobar.
async function evaluarCiudadano(dip: string) {
  const cuentas = await arrayCuentas();
  const propias = cuentas.filter((c) => c.dip === dip && c.estado === 'activa');
  const patrimonio = propias.reduce((s, c) => s + c.saldo, 0);
  const ciudadano = CIUDADANOS.find((x) => x.dip === dip);
  const contrib = CONTRIBUYENTES.find((x) => x.id === dip);
  const juniorActivo = propias.some((c) => c.tipo === 'Child') ? 1 : 0;
  const nivel = ciudadano?.nivel === 'N3' ? 3 : ciudadano?.nivel === 'N2' ? 2 : 1;
  return {
    patrimonio,
    cuentas: propias.length,
    junior: juniorActivo,
    // Sin fecha de nacimiento en el censo local, la cuenta Child es el
    // indicador real de minoría de edad (< 16) que usa PlacetaID.
    edad: juniorActivo ? 15 : 18,
    nivel,
    fiscal: contrib?.estadoFiscal === 'al_dia' ? 1 : 0,
  };
}

function cumple(actual: number, operador: RequisitoBono['operador'], valor: number): boolean {
  switch (operador) {
    case '<': return actual < valor;
    case '>': return actual > valor;
    case '<=': return actual <= valor;
    case '>=': return actual >= valor;
    case '==': return actual === valor;
    default: return false;
  }
}

/** Devuelve la lista de requisitos NO cumplidos (vacía = cumple todos). */
async function verificarRequisitos(dip: string, requisitos: RequisitoBono[]): Promise<RequisitoBono[]> {
  const d = await evaluarCiudadano(dip);
  const fallos: RequisitoBono[] = [];
  for (const r of requisitos) {
    const actual = d[r.tipo as keyof typeof d];
    if (typeof actual !== 'number' || !cumple(actual, r.operador, r.valor)) fallos.push(r);
  }
  return fallos;
}

// Placeta Junior REAL: se intenta leer de la API oficial de la Academia
// (admin-placeta.vercel.app). Requiere autenticación; sin credenciales se usa
// el seed representativo (nunca inventado: son las actividades reales del catálogo).
async function juniorLive(path: string): Promise<any[] | null> {
  try {
    const r = await fetch(`https://admin-placeta.vercel.app/api/junior/${path}`, { credentials: 'include' });
    if (!r.ok) return null;
    const d = await r.json();
    const arr = Array.isArray(d) ? d : (d?.data ?? null);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

// ── Participación democrática (votaciones, juntas, encuestas) ────────
const VOTACIONES: Votacion[] = [
  { id: 'VOT-2026-0001', titulo: 'Presupuestos participativos 2026', categoria: 'referendum', descripcion: 'Aprobación del presupuesto anual.', rango: 'ciudadania_plena', opciones: ['A favor', 'En contra', 'Abstención'], estado: 'abierta', resultado: null, aFavor: 12, enContra: 3, abstenciones: 2, totalVotos: 17, creadaEn: AHORA },
  { id: 'VOT-2026-0002', titulo: 'Elección del Consejo Junior', categoria: 'eleccion', descripcion: 'Elegir representante junior.', rango: 'junior', opciones: ['Pablo Ruiz', 'Ana García'], estado: 'cerrada', resultado: 'aprobada', aFavor: 20, enContra: 5, abstenciones: 1, totalVotos: 26, creadaEn: AHORA, cerradaEn: AHORA },
];
const VOTOS_REGISTRO: VotoRegistro[] = [
  { id: 'RGV-1', votacionId: 'VOT-2026-0002', dip: '23749931M', voto: 'Pablo Ruiz', timestamp: AHORA, esJunta: true, anonimo: false },
];
const JUNTAS: Junta[] = [
  { id: 'JUN-2026-0001', titulo: 'Sesión ordinaria de la Junta', fecha: '2026-08-20', asistentes: ['23749931M', '72583347U'], ordenDelDia: ['Aprobación del acta anterior', 'Presupuestos 2026'], votaciones: ['VOT-2026-0001'], acta: '', estado: 'convocada' },
];
const ENCUESTAS: Encuesta[] = [
  { id: 'ENC-2026-0001', titulo: 'Horario de apertura del RSP', pregunta: '¿Qué horario prefieres?', opciones: ['Mañanas', 'Tardes', 'Continuo'], rango: 'todos', estado: 'abierta', respuestas: { 'Mañanas': 8, 'Tardes': 5, 'Continuo': 3 }, totalRespuestas: 16, creadaEn: AHORA },
];

// Contribuyentes REALES del banco (GET /api/crm-state, saldos agregados por DIP/EIP).
const CONTRIBUYENTES: Contribuyente[] = [
  { id: '23749931M', nombre: 'Mikel Alegre Marcos', tipo: 'persona', cuentas: 4, saldoTotalPz: 487994, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: '72583347U', nombre: 'Unai García Almazán', tipo: 'persona', cuentas: 1, saldoTotalPz: 484857, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: '20521220S', nombre: 'Salma El Harrak', tipo: 'persona', cuentas: 1, saldoTotalPz: 35457, estadoFiscal: 'pendiente', ultimaDeclaracion: '2026-06' },
  { id: '45134577U', nombre: 'Uriel', tipo: 'persona', cuentas: 1, saldoTotalPz: 9940, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: '86843254E', nombre: 'Enzo Alegre Marcos', tipo: 'persona', cuentas: 1, saldoTotalPz: 158, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: '38599364E', nombre: 'Edgar', tipo: 'persona', cuentas: 1, saldoTotalPz: 493, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: '49348594L', nombre: 'Leire', tipo: 'persona', cuentas: 1, saldoTotalPz: 491, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: '58285937S', nombre: 'Shaheer Shajjad Bhatti', tipo: 'persona', cuentas: 1, saldoTotalPz: 189, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: '74929475A', nombre: 'Aitor de Felipe Alcántara', tipo: 'persona', cuentas: 1, saldoTotalPz: 66, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: '83759384A', nombre: 'Ana Maria', tipo: 'persona', cuentas: 1, saldoTotalPz: 99, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: '65725675A', nombre: 'Alba Marcos del Pozo', tipo: 'persona', cuentas: 1, saldoTotalPz: 93, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: '86209131P', nombre: 'Pablo Ruiz', tipo: 'junior', cuentas: 1, saldoTotalPz: 750, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: 'EIP-XJETNL', nombre: 'Unhiro Inversiones S.P.', tipo: 'empresa', cuentas: 1, saldoTotalPz: 131, estadoFiscal: 'al_dia', ultimaDeclaracion: '2026-07' },
  { id: 'EIP-X4NGQU', nombre: 'Red del Grupo de La Placeta S.P.', tipo: 'empresa', cuentas: 2, saldoTotalPz: 18422, estadoFiscal: 'pendiente', ultimaDeclaracion: '2026-06' },
];

// Declaraciones REALES: saldos del banco; IGF con la escala real del BOP
// (exento 5.000; 10% (5.000,20.000]; 30% (20.000,500.000]). IRM con IA ilustrativo.
const DECLARACIONES: DeclaracionResumen[] = [
  { id: 'DEC-2026-07-001', mesPeriodo: '2026-07', contribuyenteId: '23749931M', contribuyenteNombre: 'Mikel Alegre Marcos', patrimonioMedio: 487994, cuotaIrm: 2928, cuotaIgf: 141898, estado: 'cobrada' },
  { id: 'DEC-2026-07-002', mesPeriodo: '2026-07', contribuyenteId: '72583347U', contribuyenteNombre: 'Unai García Almazán', patrimonioMedio: 484857, cuotaIrm: 2909, cuotaIgf: 140957, estado: 'cobrada' },
  { id: 'DEC-2026-07-003', mesPeriodo: '2026-07', contribuyenteId: '20521220S', contribuyenteNombre: 'Salma El Harrak', patrimonioMedio: 35457, cuotaIrm: 9, cuotaIgf: 6137, estado: 'cobrada' },
  { id: 'DEC-2026-07-004', mesPeriodo: '2026-07', contribuyenteId: '45134577U', contribuyenteNombre: 'Uriel', patrimonioMedio: 9940, cuotaIrm: 2, cuotaIgf: 494, estado: 'cobrada' },
  { id: 'DEC-2026-07-005', mesPeriodo: '2026-07', contribuyenteId: 'EIP-X4NGQU', contribuyenteNombre: 'Red del Grupo de La Placeta S.P.', patrimonioMedio: 18422, cuotaIrm: 7, cuotaIgf: 671, estado: 'cobrada' },
  { id: 'DEC-2026-08-001', mesPeriodo: '2026-08', contribuyenteId: '23749931M', contribuyenteNombre: 'Mikel Alegre Marcos', patrimonioMedio: 487994, cuotaIrm: 2928, cuotaIgf: 141898, estado: 'pendiente_aprobacion' },
  { id: 'DEC-2026-08-002', mesPeriodo: '2026-08', contribuyenteId: '20521220S', contribuyenteNombre: 'Salma El Harrak', patrimonioMedio: 35457, cuotaIrm: 9, cuotaIgf: 6137, estado: 'borrador' },
  { id: 'DEC-2026-08-003', mesPeriodo: '2026-08', contribuyenteId: 'EIP-XJETNL', contribuyenteNombre: 'Unhiro Inversiones S.P.', patrimonioMedio: 131, cuotaIrm: 0, cuotaIgf: 0, estado: 'aprobada' },
  { id: 'DEC-2026-08-004', mesPeriodo: '2026-08', contribuyenteId: '72583347U', contribuyenteNombre: 'Unai García Almazán', patrimonioMedio: 484857, cuotaIrm: 2909, cuotaIgf: 140957, estado: 'aprobada' },
];

const DECLARACION_EXTRA: Record<string, Partial<DeclaracionDetalle>> = {
  'DEC-2026-08-001': {
    cuentaIdBlp: 'ACC-23749931M-01', exencionAplicada: 'Ninguna', diasActivosMes: 31,
    ivaExento: false, expedienteId: 'EXP-2026-000184',
    documentos: [
      { id: 'DOC-1', nombre: 'DFM-2026-08-000001.pdf', tipo: 'dfm-mensual' },
      { id: 'DOC-2', nombre: 'Declaración IRM.pdf', tipo: 'declaracion-irm' },
      { id: 'DOC-3', nombre: 'Declaración IGF.pdf', tipo: 'declaracion-igf' },
    ],
    pdfUrl: '/api/v1/tributos/declaraciones/DEC-2026-08-001/pdf',
    desglose: {
      baseIrm: 73199, tipoIrm: 4, retencionesIrm: 0, bonificacionesIrm: 0,
      patrimonioBruto: 487994, patrimonioExento: 5000, baseIgf: 482994, tipoIgf: 30,
      ivaRepercutido: 0, ivaSoportado: 0, cuotaIva: 0,
    },
    empleos: [
      { empleadorEip: 'EIP-X4NGQU', empleadorNombre: 'Red del Grupo de La Placeta S.P.', salarioBruto: 150, cotizacionPct: 7.5, cotizacionTrabajador: 11.25, salarioNeto: 138.75 },
    ],
  },
  'DEC-2026-08-004': {
    cuentaIdBlp: 'acc-1765267998957', exencionAplicada: 'Ninguna', diasActivosMes: 31, ivaExento: false,
    documentos: [{ id: 'DOC-1', nombre: 'DFM-2026-08-000004.pdf', tipo: 'dfm-mensual' }],
    empleos: [
      { empleadorEip: 'EIP-XJETNL', empleadorNombre: 'Unhiro Inversiones S.P.', salarioBruto: 1750, cotizacionPct: 10.5, cotizacionTrabajador: 183.75, salarioNeto: 1566.25 },
    ],
  },
  'DEC-2026-08-003': {
    cuentaIdBlp: 'ACC-EIP-XJETNL-01', exencionAplicada: 'IVA exento (empresa)', diasActivosMes: 31,
    ivaExento: true, expedienteId: 'EXP-2026-000190',
    documentos: [{ id: 'DOC-1', nombre: 'DFM-2026-08-000003.pdf', tipo: 'dfm-mensual' }],
    desglose: {
      baseIrm: 0, tipoIrm: 0.75, retencionesIrm: 0, bonificacionesIrm: 0,
      patrimonioBruto: 131, patrimonioExento: 5000, baseIgf: 0, tipoIgf: 0,
      ivaRepercutido: 0, ivaSoportado: 0, cuotaIva: 0,
    },
  },
};

function desgloseDe(d: DeclaracionResumen): DesgloseFiscal {
  const P = d.patrimonioMedio;
  const exento = 5000; // CNIC-IGF-PF-TRAMO-1
  const baseIgf = Math.max(0, P - exento);
  const baseIrm = Math.round(P * 0.05); // IA ilustrativo (tramo 1)
  return {
    baseIrm,
    tipoIrm: 0.5,
    retencionesIrm: 0,
    bonificacionesIrm: 0,
    patrimonioBruto: P,
    patrimonioExento: exento,
    baseIgf,
    tipoIgf: P > 20000 ? 30 : P > 5000 ? 10 : 0,
    ivaRepercutido: 0,
    ivaSoportado: 0,
    cuotaIva: 0,
  };
}

const DOCS_CIUDADANO: DocumentoCiudadano[] = [
  { id: 'DOC-2026-0001', nombre: 'Declaración Fiscal Mensual DFM-2026-07.pdf', tipo: 'declaracion', estado: 'firmado', fecha: '2026-07-05' },
  { id: 'DOC-2026-0002', nombre: 'Certificado de residencia.pdf', tipo: 'certificado', estado: 'emitido', fecha: '2026-06-10' },
  { id: 'DOC-2026-0003', nombre: 'Contrato de cesión.pdf', tipo: 'contrato', estado: 'pendiente', fecha: '2026-08-01' },
];

const FIRMAS_CIUDADANO: FirmaCiudadano[] = [
  { id: 'FIR-1', documento: 'Contrato de cesión.pdf', firmante: 'Mikel Alegre Marcos', estado: 'pendiente' },
  { id: 'FIR-2', documento: 'Acta de reunión.pdf', firmante: 'Mikel Alegre Marcos', estado: 'completada', fecha: '2026-07-20' },
];

const OBLIGACIONES_CIUDADANO: Obligacion[] = [
  { id: 'TR-2026-000121', tipo: 'tramite', titulo: 'Cambio de titularidad — Cuenta compartida', estado: 'firma', plazo: '7 días' },
  { id: 'DEC-2026-08-001', tipo: 'declaracion', titulo: 'Declaración agosto 2026', estado: 'pendiente_aprobacion', plazo: '5 ago' },
];

// Seed registral (documentos/obligaciones). El resto del detalle se deriva
// de las cuentas reales del banco en `getEntidad`.
const ENTIDADES_DETALLE: Record<string, { documentos: DocumentoCiudadano[]; obligaciones: Obligacion[] }> = {
  'EIP-XJETNL': {
    documentos: [{ id: 'DOC-1', nombre: 'Escritura de constitución.pdf', tipo: 'escritura', estado: 'firmado', fecha: '2026-01-15' }],
    obligaciones: [{ id: 'DEC-2026-08-003', tipo: 'declaracion', titulo: 'Declaración agosto 2026', estado: 'aprobada', plazo: '5 ago' }],
  },
};

// Producción real: 0 subvenciones concedidas (GET /api/transparencia).
const SUBVENCIONES: SubvencionResumen[] = [];
const SUBVENCIONES_DETALLE: Record<string, SubvencionDetalle> = {};

// Cuentas REALES del banco (GET /api/crm-state) para el buscador de IBAN.
const CUENTAS_REALES: CuentaSugerencia[] = [
  { id: 'acc-1765153714103', etiqueta: 'Mikel Alegre Marcos · Current', tipo: 'Current' },
  { id: 'acc-1765307094012-757', etiqueta: 'Mikel Alegre Marcos · Savings', tipo: 'Savings' },
  { id: 'acc-1765307093680-656', etiqueta: 'Salma El Harrak · Current', tipo: 'Current' },
  { id: 'acc-1765267998957', etiqueta: 'Unai García Almazán · Current', tipo: 'Current' },
  { id: 'acc-1765307093731-583', etiqueta: 'Placeta Telecom S.P. · Business', tipo: 'Business' },
  { id: 'acc-co-1765320068081', etiqueta: 'Red del Grupo de La Placeta S.P. · Business', tipo: 'Business' },
  { id: 'acc-co-1765312323183', etiqueta: 'Unhiro S.PV. · Business', tipo: 'Business' },
  { id: 'acc-1765307093981-360', etiqueta: 'Capitália Bank S.PV. · Business', tipo: 'Business' },
  { id: 'u-84866700a', etiqueta: 'Placeta Junior - Ana García · Child', tipo: 'Child' },
  { id: 'u-86209131p', etiqueta: 'Placeta Junior - Pablo Ruiz · Child', tipo: 'Child' },
];

// Bonificaciones: regímenes de bono (empresa → particular). Se crean desde el panel.
const BONOS: RegimenBono[] = [];
const BONOS_DETALLE: Record<string, BonoDetalle> = {};

// Cuentas y tarjetas REALES del banco (GET /api/crm-state).
const CUENTAS: CuentaBancaria[] = [
  { id: 'acc-1765153714103', nombre: 'Mikel Alegre Marcos', tipo: 'Current', dip: '23749931M', saldo: 477763.59, estado: 'activa' },
  { id: 'acc-1765307094012-757', nombre: 'Mikel Alegre Marcos', tipo: 'Savings', dip: '23749931M', saldo: 6156.53, estado: 'activa' },
  { id: 'acct-d6f0d4c5-29c2-4926-9bbc-969f8911535e', nombre: 'Inversiones Mikel', tipo: 'Investment', dip: '23749931M', saldo: 4074, estado: 'activa' },
  { id: 'acc-1765267998957', nombre: 'Unai García Almazán', tipo: 'Current', dip: '72583347U', saldo: 484857.18, estado: 'activa' },
  { id: 'acc-1765307093680-656', nombre: 'Salma El Harrak', tipo: 'Current', dip: '20521220S', saldo: 35457.1, estado: 'activa' },
  { id: 'acc-1765307093855-979', nombre: 'Uriel', tipo: 'Current', dip: '45134577U', saldo: 9940.14, estado: 'activa' },
  { id: 'acc-co-1765320068081', nombre: 'Red del Grupo de La Placeta S.P.', tipo: 'Business', dip: '23749931M', saldo: 18421.83, estado: 'activa', participaciones: [{ dip: '23749931M', nombre: 'Mikel Alegre Marcos', pct: 60 }, { dip: '72583347U', nombre: 'Unai García Almazán', pct: 40 }] },
  { id: 'acc-1765307093731-583', nombre: 'Placeta Telecom S.P.', tipo: 'Business', dip: '23749931M', saldo: 460435.91, estado: 'activa', participaciones: [{ dip: '23749931M', nombre: 'Mikel Alegre Marcos', pct: 100 }] },
  { id: 'acc-co-1765312323183', nombre: 'Unhiro S.PV.', tipo: 'Business', dip: '23749931M', saldo: 131.3, estado: 'activa', participaciones: [{ dip: '23749931M', nombre: 'Mikel Alegre Marcos', pct: 50 }, { dip: '20521220S', nombre: 'Salma El Harrak', pct: 50 }] },
  { id: 'CAPITALIA_BANK', nombre: 'Capitália Empresa', tipo: 'Business', dip: 'CAPITALIA-BANK', saldo: 17985, estado: 'activa' },
  { id: 'TGLP', nombre: 'TGLP Tributos', tipo: 'Business', dip: '', saldo: -24050.25, estado: 'activa' },
  { id: 'FUND-BLP', nombre: 'Fundación La Placeta', tipo: 'Business', dip: '', saldo: 4520, estado: 'activa', esFundacion: true },
  { id: 'u-86209131p', nombre: 'Placeta Junior - Pablo Ruiz', tipo: 'Child', dip: '86209131P', saldo: 750, estado: 'activa' },
];

const TARJETAS: TarjetaDigital[] = [
  { id: 'card-acc-1765153714103', alias: 'Tarjeta Virtual', accountId: 'acc-1765153714103', tier: 'Standard', frozen: false, cardNumber: '775503', pin: '0421', contactlessLimitPz: 500, weeklyLimitPz: 1000 },
  { id: 'card-acc-1765307094012-757', alias: 'Tarjeta Ahorro', accountId: 'acc-1765307094012-757', tier: 'Standard', frozen: false, cardNumber: '2841', pin: '9130', contactlessLimitPz: 500, weeklyLimitPz: 1000 },
  { id: 'card-acc-co-1765312323183', alias: 'Tarjeta Empresa', accountId: 'acc-co-1765312323183', tier: 'Business', frozen: false, cardNumber: '9912', pin: '5522', contactlessLimitPz: 2000, weeklyLimitPz: 10000 },
  { id: 'card-capitalia', alias: 'Tarjeta Capitália', accountId: 'CAPITALIA_BANK', tier: 'Business', frozen: true, cardNumber: '3307', pin: '7719', contactlessLimitPz: 2000, weeklyLimitPz: 10000 },
  { id: 'card-promo-mikel', alias: 'Promo Card', accountId: '', tier: 'Standard', frozen: true, cardNumber: '0001', promoPhysical: true, pin: '0000', contactlessLimitPz: 500, weeklyLimitPz: 1000 },
];

// Placeta Junior (normativa CNI Cap. III / Art. 5-6; academia con IVA 12% y Capitalia).
const JUNIOR_ACTIVIDADES: ActividadJunior[] = [
  { id: 'ACT-1', titulo: 'Matemáticas básicas', edadMin: 6, edadMax: 12, complejidad: 'Fácil', precio: 5.6, recompensa: 10, estado: 'aprobada', colaborador: 'Mikel Alegre Marcos' },
  { id: 'ACT-2', titulo: 'Historia de La Placeta', edadMin: 12, edadMax: 17, complejidad: 'Media', precio: 11.2, recompensa: 25, estado: 'aprobada', colaborador: 'Mikel Alegre Marcos' },
  { id: 'ACT-3', titulo: 'Robótica junior', edadMin: 14, edadMax: 17, complejidad: 'Difícil', precio: 22.4, recompensa: 50, estado: 'en_revision', colaborador: 'Unai García Almazán' },
];
const JUNIOR_COLABORADORES: ColaboradorJunior[] = [
  { dip: '23749931M', nombre: 'Mikel Alegre Marcos', acuerdoFirmado: true, actividades: 2, puntos: 180 },
  { dip: '72583347U', nombre: 'Unai García Almazán', acuerdoFirmado: true, actividades: 1, puntos: 40 },
];
const JUNIOR_DIPLOMAS: DiplomaJunior[] = [
  { id: 'DIP-1', dip: '86209131P', nombre: 'Pablo Ruiz', actividad: 'Matemáticas básicas', fecha: '2026-07-20' },
];

const CONTEXTOS: Record<string, ContextoCiudadano> = {
  '23749931M': {
    dip: '23749931M', nombre: 'Mikel Alegre Marcos', nivel: 'N3',
    email: 'mikel@laplaceta.org', telefono: '+34 600 000 000',
    bloques: [
      { clave: 'identidad', etiqueta: 'Identidad', icono: 'user', items: [{ clave: 'dip', etiqueta: 'DIP', valor: '23749931M' }, { clave: 'nivel', etiqueta: 'Verificación', valor: 'N3' }] },
      { clave: 'banco', etiqueta: 'Banco', icono: 'wallet', items: [{ clave: 'cuentas', etiqueta: 'Cuentas', valor: 4 }, { clave: 'saldo', etiqueta: 'Saldo total', valor: '487.994 Pz' }] },
      { clave: 'fiscalidad', etiqueta: 'Fiscalidad', icono: 'receipt', items: [{ clave: 'declaraciones', etiqueta: 'Declaraciones', valor: 2 }, { clave: 'deuda', etiqueta: 'Deuda pendiente', valor: '0 Pz' }] },
      { clave: 'patrimonio', etiqueta: 'Patrimonio', icono: 'home', items: [
        { clave: 'titularidades', etiqueta: 'Titularidades', valor: 3 },
        { clave: 'compartidas', etiqueta: 'Cuentas compartidas', valor: '2 (50% / 50%)' },
        { clave: 'participaciones', etiqueta: 'Participaciones empresa', valor: 'Unhiro 60% · Red GDLP 100%' },
        { clave: 'empresas', etiqueta: 'Empresas', valor: 'Placeta Telecom · Ubuntu · Unhiro · Red GDLP' },
      ] },
      { clave: 'expedientes', etiqueta: 'Expedientes', icono: 'folder', items: [{ clave: 'activos', etiqueta: 'Activos', valor: 3 }, { clave: 'historicos', etiqueta: 'Históricos', valor: 12 }] },
    ],
  },
};

function filtro<T>(items: T[], f?: Filtros): T[] {
  let out = items;
  if (f?.estado) out = out.filter((i) => (i as { estado?: string }).estado === f.estado);
  if (f?.q) {
    const q = f.q.toLowerCase();
    out = out.filter((i) => JSON.stringify(i).toLowerCase().includes(q));
  }
  return out;
}

export const mockProvider: Provider = {
  async login(_dip, password) {
    if (password !== 'demo') throw new Error('Contraseña incorrecta (modo demo: usa "demo")');
    return SESSION;
  },
  async iniciarPlacetaID() {
    // En modo demo no hay SSO real; el panel ofrece el acceso demo como fallback.
    return { redirect: '' };
  },
  async logout() {},
  async me() {
    // En modo demo no hay sesión persistente: siempre se pasa por el login.
    return null;
  },
  async dashboard(): Promise<DashboardStats> {
    return {
      expedientes: 184, incidencias: 12, incidenciasAbiertas: 4,
      notificacionesNoLeidas: 2, cnicVigentes: 68, nominas: 21, facturas: 44,
      bloqueos500k: 1, retribucionesPendientes: 3, operacionesRetenidas: 2,
      comprobaciones: 8, comprobacionesInconsistencia: 1,
    };
  },
  async bandeja() {
    return TRAMITES.filter((t) => t.asignadoA || t.vencido);
  },
  async listarTramites(f) {
    // El campo extra `actuaciones` es estructuralmente compatible con Tramite[];
    // la tabla solo muestra las columnas declaradas, así que no molesta.
    return filtro(TRAMITES, f);
  },
  async getTramite(id) {
    const t = TRAMITES.find((x) => x.id === id);
    if (!t) throw new Error('Trámite no encontrado');
    const d = DETALLES[id] ?? { requisitos: [], documentos: [] };
    return { ...t, ...d, actuaciones: ACTUACIONES[id] ?? [] };
  },
  async crearTramite(datos: NuevoTramite) {
    const id = `TR-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const expedienteId = `EXP-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const nuevo: Tramite = {
      id,
      tipo: datos.tipo,
      titulo: datos.concepto,
      dip: datos.dip,
      nombreCiudadano: datos.nombre ?? datos.dip,
      estado: 'inicio',
      plazo: TIPOS_TRAMITE.find((x) => x.id === datos.tipo)?.plazoDias ?? 15,
      vencido: false,
      asignadoA: null,
      expedienteId,
      servicio: datos.servicio,
      firmasCompletas: 0,
      firmasRequeridas: 1,
      actualizadoEn: new Date().toISOString(),
      datosEspecificos: datos.datos ?? {},
    };
    TRAMITES.unshift(nuevo);
    EXPEDIENTES.unshift({
      id: expedienteId,
      titulo: nuevo.titulo,
      dip: nuevo.dip,
      nombreCiudadano: nuevo.nombreCiudadano,
      servicio: nuevo.servicio ?? 'General',
      estado: nuevo.estado,
      numActuaciones: 0,
      documentos: 0,
      creadoEn: nuevo.actualizadoEn,
    });
    // Solicitud de adhesión a un bono: el sistema adscribe automáticamente y resuelve.
    if (datos.tipo === 'solicitud_bono' && datos.datos?.bono && datos.datos?.dip) {
      try {
        await mockProvider.adscribirCiudadano(datos.datos.bono, datos.datos.dip.toUpperCase());
        nuevo.estado = 'resolucion';
      } catch { /* sin presupuesto o cerrado */ }
    }
    return nuevo;
  },
  async avanzarTramite(id, accion, datos) {
    const t = TRAMITES.find((x) => x.id === id);
    if (!t) throw new Error('Trámite no encontrado');
    t.estado = TRANSICIONES[accion] ?? t.estado;
    t.actualizadoEn = new Date().toISOString();
    if (accion === 'subsanar' && Array.isArray(datos?.requisitos)) {
      const d = DETALLES[id] ?? { requisitos: [], documentos: [] };
      d.requisitos = datos.requisitos as Requisito[];
    }
    const act = ACTUACIONES[id] ?? (ACTUACIONES[id] = []);
    act.push({
      id: `ACT-${act.length + 1}`,
      tipo: accion,
      descripcion: DESCRIPCIONES[accion] ?? accion,
      autor: 'Mikel Alegre Marcos',
      fecha: new Date().toISOString(),
    });
  },
  async enviar2FA(): Promise<Solicitud2FA> {
    return { id: `2FA-${Date.now()}`, estado: 'pendiente' };
  },
  async confirmar2FA() {
    return true; // demo: PlacetaID móvil confirma siempre
  },
  async listarExpedientes(f) {
    return filtro(EXPEDIENTES, f);
  },
  async getExpediente(id) {
    const e = EXPEDIENTES.find((x) => x.id === id);
    const t = TRAMITES.find((x) => x.expedienteId === id);
    if (!e) throw new Error('Expediente no encontrado');
    return { ...e, actuaciones: t?.actuaciones ?? [] };
  },
  async buscarCiudadanos(q) {
    if (!q) return CIUDADANOS;
    return CIUDADANOS.filter((c) => (c.nombre + c.dip).toLowerCase().includes(q.toLowerCase()));
  },
  async contextoCiudadano(dip) {
    return CONTEXTOS[dip] ?? {
      dip, nombre: dip, nivel: 'N1',
      bloques: [{ clave: 'identidad', etiqueta: 'Identidad', icono: 'user', items: [{ clave: 'dip', etiqueta: 'DIP', valor: dip }] }],
    };
  },
  async listarEntidades() {
    const cuentas = await arrayCuentas();
    const reales = entidadesDelBanco(cuentas);
    return reales.length ? reales : ENTIDADES;
  },
  async listarOperaciones() {
    return OPERACIONES;
  },
  async revertirOperacion(id) {
    const o = OPERACIONES.find((x) => x.id === id);
    if (!o) throw new Error('Operación no encontrada');
    if (o.estado !== 'retenida') throw new Error('Solo se pueden revertir operaciones retenidas');
    o.estado = 'rechazada';
  },
  async listarAuditoria(f) {
    return filtro(AUDITORIA, f);
  },
  async listarNotificaciones() {
    return NOTIFICACIONES;
  },
  async marcarLeida(id) {
    const n = NOTIFICACIONES.find((x) => x.id === id);
    if (n) n.leida = true;
  },
  async listarCNIC() {
    return CNIC;
  },
  async refrescarNormativa() {
    return { sincronizado: true, total: CNIC.length, fuente: 'BOP (bop.laplaceta.org)' };
  },
  async crearVersionCNIC(datos) {
    const prev = CNIC.find((c) => c.codigo === datos.codigo);
    const nueva: CNICRegla = {
      codigo: datos.codigo,
      etiqueta: prev?.etiqueta ?? datos.codigo,
      tipoValor: prev?.tipoValor ?? 'numero',
      valor: datos.valor,
      unidad: prev?.unidad,
      version: (prev?.version ?? 0) + 1,
      estado: 'borrador',
      autor: 'Mikel Alegre Marcos',
      fuente: 'local',
      bopUrl: 'https://bop.laplaceta.org',
      historial: prev
        ? [...(prev.historial ?? []), { version: prev.version, valor: prev.valor, estado: prev.estado, fecha: prev.fechaVigencia ?? '' }]
        : [],
    };
    CNIC.unshift(nueva);
    return nueva;
  },
  // ── Tributos ──────────────────────────────────────────────────────────
  async listarContribuyentes(f) {
    return filtro(CONTRIBUYENTES, f);
  },
  async getContribuyente(id) {
    const c = CONTRIBUYENTES.find((x) => x.id === id);
    if (!c) throw new Error('Contribuyente no encontrado');
    return {
      ...c,
      estimado: { cuotaIrm: 120, cuotaIgf: 30, proximoPago: '2026-09-05' },
      declaraciones: DECLARACIONES.filter((d) => d.contribuyenteId === id),
    };
  },
  async listarDeclaraciones(f) {
    return filtro(DECLARACIONES, f);
  },
  async getDeclaracion(id) {
    const d = DECLARACIONES.find((x) => x.id === id);
    if (!d) throw new Error('Declaración no encontrada');
    const base: DeclaracionDetalle = {
      ...d,
      cuentaIdBlp: '—',
      exencionAplicada: 'Ninguna',
      diasActivosMes: 31,
      ivaExento: false,
      expedienteId: undefined,
      documentos: [],
      pdfUrl: undefined,
      desglose: desgloseDe(d),
    };
    return { ...base, ...(DECLARACION_EXTRA[id] ?? {}) };
  },
  async accionDeclaracion(id, accion) {
    const d = DECLARACIONES.find((x) => x.id === id);
    if (!d) throw new Error('Declaración no encontrada');
    const map: Record<string, DeclaracionResumen['estado']> = {
      publicar: 'pendiente_aprobacion',
      aprobar: 'aprobada',
      emitir: 'emitida',
      cobrar: 'cobrada',
      rechazar: 'borrador',
    };
    if (map[accion]) d.estado = map[accion];
  },
  // ── Detalle de ciudadano / entidad ────────────────────────────────────
  async documentosDeCiudadano() {
    return DOCS_CIUDADANO;
  },
  async firmasDeCiudadano() {
    return FIRMAS_CIUDADANO;
  },
  async obligacionesDeCiudadano() {
    return OBLIGACIONES_CIUDADANO;
  },
  async buscarCuentas(q) {
    const ql = q.trim().toLowerCase();
    if (ql.length < 2) return [];
    return CUENTAS_REALES.filter((c) => c.etiqueta.toLowerCase().includes(ql) || c.id.toLowerCase().includes(ql));
  },
  async actualizarCiudadano(dip, datos) {
    const c = CIUDADANOS.find((x) => x.dip === dip);
    if (!c) throw new Error('Ciudadano no encontrado');
    const ctx = CONTEXTOS[dip];
    if (ctx) {
      if (datos.email !== undefined) ctx.email = datos.email;
      if (datos.telefono !== undefined) ctx.telefono = datos.telefono;
    }
  },
  async getEntidad(eip) {
    const cuentas = await arrayCuentas();
    const cuentasEip = cuentas.filter((c) => eipDeCuenta(c) === eip);
    const base = ENTIDADES.find((x) => x.eip === eip);
    const real = entidadesDelBanco(cuentas).find((x) => x.eip === eip);
    if (!base && !real && cuentasEip.length === 0) throw new Error('Entidad no encontrada');

    const nombre = real?.nombre ?? base?.nombre ?? (cuentasEip[0]?.nombre ?? eip);
    const repsDip = real?.representantes ?? base?.representantes ?? [];

    // Participación agregada desde las cuentas reales (por titular).
    const sumaPct = new Map<string, number>();
    for (const c of cuentasEip) {
      for (const p of c.participaciones ?? []) {
        if (p.dip) sumaPct.set(p.dip, (sumaPct.get(p.dip) ?? 0) + p.pct);
      }
    }
    const participacion: ParticipacionEmpresa[] = Array.from(sumaPct.entries()).map(([dip, pct]) => ({
      dip,
      nombre: CIUDADANOS.find((x) => x.dip === dip)?.nombre ?? dip,
      pct: Math.round(pct * 10) / 10,
    }));

    const representantes = repsDip.map((dip) => ({
      dip,
      nombre: CIUDADANOS.find((x) => x.dip === dip)?.nombre ?? dip,
      cargo: 'Representante legal',
    }));

    return {
      eip,
      nombre,
      tipo: real?.tipo ?? base?.tipo ?? 'Sociedad',
      estado: real?.estado ?? base?.estado ?? 'activa',
      cumplimiento: real?.cumplimiento ?? base?.cumplimiento,
      documentos: ENTIDADES_DETALLE[eip]?.documentos ?? [],
      obligaciones: ENTIDADES_DETALLE[eip]?.obligaciones ?? [],
      representantes,
      cuentas: cuentasEip,
      facturasEmitidas: FACTURAS_EMITIDAS[eip] ?? [],
      participacion,
      tramites: TRAMITES.filter((t) => t.dip === eip),
    };
  },
  // ── Subvenciones ───────────────────────────────────────────────────
  async listarSubvenciones(f) {
    return filtro(SUBVENCIONES, f);
  },
  async getSubvencion(id) {
    const s = SUBVENCIONES.find((x) => x.id === id);
    if (!s) throw new Error('Subvención no encontrada');
    return SUBVENCIONES_DETALLE[id] ?? { ...s, documentosRequeridos: [], gastos: [], justificaciones: [], excluirTipos: [], tiposAptos: [] };
  },
  async concederSubvencion(datos) {
    const nueva: SubvencionResumen = {
      id: `SUB-2026-${String(1000 + SUBVENCIONES.length + 1)}`,
      emisorEip: datos.emisorEip,
      emisorNombre: 'Administración General',
      receptorEip: datos.receptorEip,
      receptorNombre: datos.receptorEip,
      importe: datos.importe,
      importeRestante: datos.importe,
      concepto: datos.concepto,
      estado: 'concedida',
      fechaConcesion: new Date().toISOString().slice(0, 10),
      publicada: datos.publicada ?? false,
    };
    SUBVENCIONES.unshift(nueva);
    const detalle: SubvencionDetalle = {
      ...nueva,
      documentosRequeridos: [],
      gastos: [],
      justificaciones: [],
      excluirTipos: ['Tax', 'IrmCharge', 'IvaAdjustment', 'InvestmentTax', 'InvestmentCommission', 'LateTaxInterest'],
      tiposAptos: datos.tiposAptos ?? [],
      baremos: datos.baremos ?? [],
      publicadaEn: datos.publicada ? new Date().toISOString() : undefined,
      bopUrl: datos.publicada ? `https://gdlp.laplaceta.org/subvenciones.html?codigo=${nueva.id}` : undefined,
    };
    SUBVENCIONES_DETALLE[nueva.id] = detalle;
    return nueva;
  },
  async requerirDocumentosSubvencion(id, documentos) {
    const s = SUBVENCIONES.find((x) => x.id === id);
    if (!s) throw new Error('Subvención no encontrada');
    const d: SubvencionDetalle = SUBVENCIONES_DETALLE[id] ?? { ...s, documentosRequeridos: [], gastos: [], justificaciones: [] };
    d.documentosRequeridos = documentos.map((nombre, i) => ({ id: `DR-${i + 1}`, nombre, tipo: 'documento', aportado: false }));
    SUBVENCIONES_DETALLE[id] = d;
  },
  async justificarPagoSubvencion(id, gastoIds) {
    const s = SUBVENCIONES.find((x) => x.id === id);
    if (!s) throw new Error('Subvención no encontrada');
    const d = SUBVENCIONES_DETALLE[id];
    if (!d) throw new Error('Detalle no encontrado');
    let total = 0;
    for (const gid of gastoIds) {
      const g = d.gastos.find((x) => x.id === gid);
      const excluido = g?.excluido || (g?.kind && d.excluirTipos.includes(g.kind));
      const apto = !g?.kind || d.tiposAptos.length === 0 || d.tiposAptos.includes(g.kind);
      if (g && !g.justificado && !excluido && apto) {
        g.justificado = true;
        total += g.importe;
      }
    }
    if (total > s.importeRestante) {
      throw new Error(`El importe a justificar (${total}) supera el restante (${s.importeRestante})`);
    }
    d.justificaciones.push({
      id: `J-${d.justificaciones.length + 1}`,
      gastoId: gastoIds.join(','),
      importe: total,
      fecha: new Date().toISOString().slice(0, 10),
      transferenciaId: `TRF-2026-${Math.floor(100000 + Math.random() * 900000)}`,
    });
    s.importeRestante = Math.max(0, s.importeRestante - total);
    if (s.importeRestante === 0) s.estado = 'justificada';
  },
  // ── Bonificaciones (empresa → particular) ────────────────────────────
  async listarBonos() {
    return BONOS;
  },
  async getBono(id) {
    const b = BONOS.find((x) => x.id === id);
    if (!b) throw new Error('Bono no encontrado');
    return BONOS_DETALLE[id] ?? { ...b, adscripciones: [], justificaciones: [] };
  },
  async crearBono(datos) {
    const bono: RegimenBono = {
      id: `BON-2026-${String(1000 + BONOS.length + 1)}`,
      nombre: datos.nombre,
      emisorEip: datos.emisorEip,
      emisorNombre: NOMBRE_ENTIDAD_POR_EIP[datos.emisorEip] ?? ENTIDADES.find((e) => e.eip === datos.emisorEip)?.nombre ?? datos.emisorEip,
      presupuesto: datos.presupuesto,
      maxPorPersona: datos.maxPorPersona,
      baremos: datos.baremos ?? [],
      requisitos: datos.requisitos ?? [],
      fechaLimite: datos.fechaLimite,
      presupuestoUsado: 0,
      adscritos: 0,
      estado: 'activo',
    };
    BONOS.unshift(bono);
    return bono;
  },
  async adscribirCiudadano(id, dip) {
    const b = BONOS.find((x) => x.id === id);
    if (!b) throw new Error('Bono no encontrado');
    if (b.estado === 'cerrado') throw new Error('El bono está cerrado');
    if (b.presupuestoUsado + b.maxPorPersona > b.presupuesto) throw new Error('No queda presupuesto en este bono');

    // Comprobación AUTOMÁTICA de requisitos contra datos reales del banco/censo.
    const fallos = await verificarRequisitos(dip, b.requisitos ?? []);
    if (fallos.length > 0) {
      const detalle = fallos.map((f) => `${f.descripcion} (${f.explicacion})`).join(' · ');
      throw new Error(`No cumple los requisitos: ${detalle}`);
    }

    const d = BONOS_DETALLE[id] ?? { ...b, adscripciones: [], justificaciones: [] };
    if (!d.adscripciones.some((a) => a.dip === dip)) {
      d.adscripciones.push({ dip, nombre: CIUDADANOS.find((c) => c.dip === dip)?.nombre ?? dip, fechaAdscripcion: new Date().toISOString().slice(0, 10), justificado: 0 });
      b.adscritos += 1;
      b.presupuestoUsado = Math.min(b.presupuesto, b.presupuestoUsado + b.maxPorPersona);
      BONOS_DETALLE[id] = d;
    }
    if (b.presupuestoUsado >= b.presupuesto) b.estado = 'cerrado';
  },
  // ── Banco ───────────────────────────────────────────────────────────
  async listarCuentas(f) {
    return filtro(await arrayCuentas(), f);
  },
  async listarTarjetas() {
    return arrayTarjetas();
  },
  async accionCuenta(id, accion, datos) {
    const c = (await arrayCuentas()).find((x) => x.id === id);
    if (!c) throw new Error('Cuenta no encontrada');
    if (accion === 'bloquear') c.estado = 'bloqueada';
    else if (accion === 'desbloquear') c.estado = 'activa';
    else if (accion === 'cerrar') {
      if (c.estado === 'cerrada') throw new Error('La cuenta ya está cerrada');
      if (c.esFundacion) throw new Error('Las fundaciones no se pueden cerrar ni repartir');
      if (c.tipo === 'Business') {
        if (c.saldo > 0) throw new Error('Reparte antes los fondos de la empresa conforme al % de participaciones');
      } else if (c.saldo > 0) {
        const motivo = datos?.motivo;
        if (motivo !== 'baja' && motivo !== 'herencia') {
          throw new Error('No se pueden cerrar cuentas personales con capital salvo baja de usuario o herencia');
        }
      }
      c.estado = 'cerrada';
    }
  },
  async cambiarTipoCuenta(id, nuevoTipo) {
    const c = (await arrayCuentas()).find((x) => x.id === id);
    if (!c) throw new Error('Cuenta no encontrada');
    if (c.estado === 'cerrada') throw new Error('La cuenta está cerrada');
    c.tipo = nuevoTipo;
  },
  async repartirCuenta(id) {
    const cuentas = await arrayCuentas();
    const c = cuentas.find((x) => x.id === id);
    if (!c) throw new Error('Cuenta no encontrada');
    if (c.tipo !== 'Business') throw new Error('Solo las cuentas de empresa se reparten conforme al %');
    if (c.esFundacion) throw new Error('Las fundaciones no se reparten ni se cierran');
    if (c.saldo <= 0) throw new Error('La cuenta no tiene fondos que repartir');
    const partes = c.participaciones ?? [];
    if (partes.length === 0) throw new Error('Sin participaciones registradas para repartir');
    let restante = c.saldo;
    partes.forEach((p, i) => {
      const importe = i === partes.length - 1
        ? Math.round(restante * 100) / 100
        : Math.round((c.saldo * p.pct) / 100 * 100) / 100;
      const destino = cuentas.find((x) => x.dip === p.dip && x.estado === 'activa' && (x.tipo === 'Current' || x.tipo === 'Savings'));
      if (destino) destino.saldo = Math.round((destino.saldo + importe) * 100) / 100;
      restante = Math.round((restante - importe) * 100) / 100;
    });
    c.saldo = 0;
  },
  async abrirCuenta(datos) {
    const nueva: CuentaBancaria = {
      id: `acc-${Date.now()}`,
      nombre: datos.nombre,
      tipo: datos.tipo,
      dip: datos.dip,
      saldo: datos.saldoInicial || 0,
      estado: 'activa',
    };
    (await arrayCuentas()).push(nueva);
    return nueva;
  },
  async establecerLimiteTarjeta(id, limites) {
    const t = (await arrayTarjetas()).find((x) => x.id === id);
    if (!t) throw new Error('Tarjeta no encontrada');
    if (typeof limites.contactlessLimitPz === 'number') t.contactlessLimitPz = limites.contactlessLimitPz;
    if (typeof limites.weeklyLimitPz === 'number') t.weeklyLimitPz = limites.weeklyLimitPz;
  },
  async congelarTarjeta(id, frozen) {
    const t = (await arrayTarjetas()).find((x) => x.id === id);
    if (!t) throw new Error('Tarjeta no encontrada');
    t.frozen = frozen;
  },
  // ── Placeta Junior ───────────────────────────────────────────────────
  async listarActividadesJunior() {
    const live = await juniorLive('actividades?dip=23749931M');
    if (live && live.length) {
      return live.map((a: any) => ({
        id: a.id, titulo: a.titulo || a.nombre || 'Actividad',
        edadMin: a.edadMin ?? 6, edadMax: a.edadMax ?? 17,
        complejidad: a.complejidad || 'Media',
        precio: a.precio_total ?? a.precio ?? 5.6,
        recompensa: a.recompensa ?? 10,
        estado: a.estado || 'aprobada',
        colaborador: a.colaborador || '—',
      }));
    }
    return JUNIOR_ACTIVIDADES;
  },
  async listarColaboradoresJunior() {
    const live = await juniorLive('colaboradores');
    if (live && live.length) {
      return live.map((c: any) => ({
        dip: c.dip ?? c.placetaId ?? '',
        nombre: c.nombre ?? c.nombre_real ?? 'Colaborador',
        acuerdoFirmado: c.acuerdoFirmado ?? c.acuerdo_firmado ?? true,
        actividades: Number(c.actividades ?? c.num_actividades ?? 0),
        puntos: Number(c.puntos ?? 0),
      }));
    }
    return JUNIOR_COLABORADORES;
  },
  async listarDiplomasJunior() {
    const live = await juniorLive('diplomas');
    if (live && live.length) {
      return live.map((d: any) => ({
        id: d.id ?? `DIP-${d.dip}-${d.fecha}`,
        dip: d.dip ?? d.placetaId ?? '',
        nombre: d.nombre ?? d.nombre_real ?? '',
        actividad: d.actividad ?? d.actividad_titulo ?? '—',
        fecha: d.fecha ?? d.fecha_obtencion ?? '',
      }));
    }
    return JUNIOR_DIPLOMAS;
  },
  // ── Votaciones ─────────────────────────────────────────────────────
  async listarVotaciones() {
    return VOTACIONES;
  },
  async getVotacion(id) {
    const v = VOTACIONES.find((x) => x.id === id);
    if (!v) throw new Error('Votación no encontrada');
    const votos = VOTOS_REGISTRO.filter((r) => r.votacionId === id);
    return { ...v, votos };
  },
  async crearVotacion(datos) {
    const v: Votacion = {
      id: `VOT-2026-${String(VOTACIONES.length + 1).padStart(4, '0')}`,
      titulo: datos.titulo,
      categoria: datos.categoria as Votacion['categoria'],
      descripcion: datos.descripcion || '',
      reunionId: datos.reunionId,
      rango: (datos.rango || 'ciudadania_plena') as Votacion['rango'],
      opciones: datos.opciones || ['A favor', 'En contra', 'Abstención'],
      estado: 'abierta',
      resultado: null,
      aFavor: 0, enContra: 0, abstenciones: 0, totalVotos: 0,
      creadaEn: new Date().toISOString(),
    };
    VOTACIONES.unshift(v);
    return v;
  },
  async cerrarVotacion(id) {
    const v = VOTACIONES.find((x) => x.id === id);
    if (!v) throw new Error('Votación no encontrada');
    v.estado = 'cerrada';
    v.cerradaEn = new Date().toISOString();
    v.resultado = v.aFavor > v.enContra ? 'aprobada' : 'rechazada';
  },
  async publicarVotacion(id) {
    const v = VOTACIONES.find((x) => x.id === id);
    if (!v) throw new Error('Votación no encontrada');
    v.estado = 'publicada';
    v.publicadaEn = new Date().toISOString();
    v.bopUrl = `https://bop.laplaceta.org/votaciones.html?codigo=${id}`;
  },
  async listarVotos(id) {
    const ahora = Date.now();
    return VOTOS_REGISTRO.filter((r) => r.votacionId === id).map((r) => {
      const edad = ahora - new Date(r.timestamp).getTime();
      const anonimizado = !r.esJunta && edad > ANONIMATO_DIAS * 24 * 3600 * 1000;
      return { ...r, anonimo: anonimizado, dip: anonimizado ? '••••••' : r.dip };
    });
  },
  // ── Juntas ─────────────────────────────────────────────────────────
  async listarJuntas() {
    return JUNTAS;
  },
  async getJunta(id) {
    const j = JUNTAS.find((x) => x.id === id);
    if (!j) throw new Error('Junta no encontrada');
    return { ...j, votaciones: j.votaciones.map((vid) => VOTACIONES.find((v) => v.id === vid)!).filter(Boolean) };
  },
  async crearJunta(datos) {
    const j: Junta = {
      id: `JUN-2026-${String(JUNTAS.length + 1).padStart(4, '0')}`,
      titulo: datos.titulo,
      fecha: datos.fecha || new Date().toISOString().slice(0, 10),
      asistentes: datos.asistentes || [],
      ordenDelDia: datos.ordenDelDia || [],
      votaciones: datos.votaciones || [],
      acta: '',
      estado: 'convocada',
    };
    JUNTAS.unshift(j);
    return j;
  },
  async emitirActa(id, acta) {
    const j = JUNTAS.find((x) => x.id === id);
    if (!j) throw new Error('Junta no encontrada');
    j.acta = acta;
    j.estado = 'acta_emitida';
    j.actaUrl = `https://bop.laplaceta.org/juntas.html?codigo=${id}`;
  },
  // ── Encuestas ──────────────────────────────────────────────────────
  async listarEncuestas() {
    return ENCUESTAS;
  },
  async crearEncuesta(datos) {
    const e: Encuesta = {
      id: `ENC-2026-${String(ENCUESTAS.length + 1).padStart(4, '0')}`,
      titulo: datos.titulo,
      pregunta: datos.pregunta,
      opciones: datos.opciones || [],
      rango: (datos.rango || 'todos') as Encuesta['rango'],
      estado: 'abierta',
      respuestas: Object.fromEntries((datos.opciones || []).map((o: string) => [o, 0])),
      totalRespuestas: 0,
      creadaEn: new Date().toISOString(),
    };
    ENCUESTAS.unshift(e);
    return e;
  },
  async publicarEncuesta(id) {
    const e = ENCUESTAS.find((x) => x.id === id);
    if (!e) throw new Error('Encuesta no encontrada');
    e.estado = 'publicada';
    e.publicadaEn = new Date().toISOString();
    e.bopUrl = `https://bop.laplaceta.org/encuestas.html?codigo=${id}`;
  },
};
