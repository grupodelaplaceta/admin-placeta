/* ═══════════════════════════════════════════════════════════════════════
   RSP Web · Proveedor mock (demo sin backend)
   Datos de demostración coherentes con el modelo real. Se usa cuando
   VITE_USE_MOCK=true (por defecto en local).
   ═══════════════════════════════════════════════════════════════════════ */

import type {
  Session, DashboardStats, Tramite, Expediente,
  CiudadanoResumen, Notificacion, EventoAuditoria, CNICRegla, Operacion,
  EntidadRegistral, Filtros, Actuacion, Requisito, DocumentoVinculado,
  NuevoTramite, EstadoTramite, Contribuyente,
  DeclaracionResumen, DeclaracionDetalle, DocumentoCiudadano, FirmaCiudadano,
  Obligacion, SubvencionResumen, SubvencionDetalle, Solicitud2FA,
  DesgloseFiscal, CuentaSugerencia, RegimenBono, BonoDetalle, CuentaBancaria, TarjetaDigital,
  ActividadJunior, ColaboradorJunior, DiplomaJunior, CodigoJunior, Subapartado,
  Votacion, VotoRegistro, Junta, Encuesta, FacturaEmitida, ParticipacionEmpresa, Nomina, RequisitoBono, BopDocumento,
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

// Sin datos demo: los trámites reales llegan del backend (Supabase). Arrancan vacíos.
const TRAMITES: (Tramite & { actuaciones?: Actuacion[] })[] = [];

const ACTUACIONES: Record<string, Actuacion[]> = {};

const DETALLES: Record<string, { requisitos: Requisito[]; documentos: DocumentoVinculado[] }> = {};

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
// Ciudadanos derivados de las cuentas reales del banco (placetaId = DIP).
const CIUDADANOS: CiudadanoResumen[] = [];

const NOTIFICACIONES: Notificacion[] = [];

const AUDITORIA: EventoAuditoria[] = [];

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

const OPERACIONES: Operacion[] = [];

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

// Ciudadanos REALES derivados de las cuentas del banco (placetaId = DIP).
async function ciudadanosDelBanco(): Promise<CiudadanoResumen[]> {
  const cuentas = await arrayCuentas();
  const DIP = /^[XYZ0-9][0-9]{7,8}[A-Z]$/;
  const map = new Map<string, CiudadanoResumen>();
  for (const c of cuentas) {
    if (!DIP.test(c.dip)) continue;
    const e = map.get(c.dip) ?? { dip: c.dip, nombre: c.nombre, nivel: 'N1' as CiudadanoResumen['nivel'], cuentas: 0, expedientesActivos: 0, estado: 'activo' as const };
    e.cuentas += 1;
    map.set(c.dip, e);
  }
  return Array.from(map.values());
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
const VOTACIONES: Votacion[] = [];
const VOTOS_REGISTRO: VotoRegistro[] = [];
const JUNTAS: Junta[] = [];
const ENCUESTAS: Encuesta[] = [];

// Contribuyentes REALES del banco (GET /api/crm-state, saldos agregados por DIP/EIP).
const BOP_DOCUMENTOS: BopDocumento[] = [];

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

const DOCS_CIUDADANO: DocumentoCiudadano[] = [];
const FIRMAS_CIUDADANO: FirmaCiudadano[] = [];
const OBLIGACIONES_CIUDADANO: Obligacion[] = [];

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

// Placeta Junior REAL: se proxea de la API oficial de la Academia. Sin red, vacío.
const JUNIOR_ACTIVIDADES: ActividadJunior[] = [];
const JUNIOR_COLABORADORES: ColaboradorJunior[] = [];
const JUNIOR_DIPLOMAS: DiplomaJunior[] = [];
const JUNIOR_CODIGOS: CodigoJunior[] = [];
const JUNIOR_SUBAPARTADOS: Subapartado[] = [];
const NOMINAS: Nomina[] = [];
const FACTURAS_ENTIDAD: FacturaEmitida[] = [];

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
    const cuentas = await arrayCuentas();
    return {
      // Solo datos reales/derivados. Los contadores sin fuente real valen 0.
      expedientes: 0,
      incidencias: 0,
      incidenciasAbiertas: 0,
      notificacionesNoLeidas: NOTIFICACIONES.filter((n) => !n.leida).length,
      cnicVigentes: CNIC.length, // CNIC reales del BOP
      nominas: 0,
      facturas: 0,
      bloqueos500k: cuentas.filter((c) => c.saldo > 500000 && c.tipo !== 'Business').length,
      retribucionesPendientes: 0,
      operacionesRetenidas: 0,
      comprobaciones: 0,
      comprobacionesInconsistencia: 0,
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
    const todos = await ciudadanosDelBanco();
    if (!q) return todos;
    return todos.filter((c) => (c.nombre + c.dip).toLowerCase().includes(q.toLowerCase()));
  },
  async contextoCiudadano(dip) {
    const cuentas = await arrayCuentas();
    const propias = cuentas.filter((c) => c.dip === dip);
    const saldo = propias.reduce((s, c) => s + c.saldo, 0);
    const contrib = CONTRIBUYENTES.find((x) => x.id === dip);
    const nombre = propias[0]?.nombre ?? contrib?.nombre ?? dip;
    return {
      dip,
      nombre,
      nivel: 'N1',
      email: `${dip.toLowerCase()}@laplaceta.org`,
      bloques: [
        { clave: 'identidad', etiqueta: 'Identidad', icono: 'user', items: [{ clave: 'dip', etiqueta: 'DIP', valor: dip }] },
        { clave: 'banco', etiqueta: 'Banco', icono: 'wallet', items: [
          { clave: 'cuentas', etiqueta: 'Cuentas', valor: propias.length },
          { clave: 'saldo', etiqueta: 'Saldo total', valor: `${saldo.toLocaleString('es-ES')} Pz` },
        ] },
        { clave: 'fiscalidad', etiqueta: 'Fiscalidad', icono: 'receipt', items: [
          { clave: 'estado', etiqueta: 'Estado fiscal', valor: contrib?.estadoFiscal ?? '—' },
        ] },
      ],
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
  async aprobarCNIC(codigo) {
    const regla = CNIC.find((c) => c.codigo === codigo);
    if (!regla) throw new Error('CNIC no encontrado');
    regla.estado = 'vigente';
    regla.fuente = 'BOP';
  },
  async listarBopDocumentos() {
    return BOP_DOCUMENTOS;
  },
  async guardarBopDocumento(datos) {
    const anterior = BOP_DOCUMENTOS.find((d) => d.codigo === datos.codigo);
    const documento: BopDocumento = {
      id: anterior?.id ?? `BOP-${Date.now()}`,
      codigo: datos.codigo.toUpperCase(), titulo: datos.titulo, tipo: datos.tipo,
      categoria: datos.categoria, estado: 'proyecto', contenidoMd: datos.contenidoMd,
      version: (anterior?.version ?? 0) + 1, aprobadaEnJunta: false,
      autorDip: SESSION.usuario.dip, notasCambio: datos.notasCambio,
      cnicRefs: datos.cnicRefs,
    };
    if (anterior) Object.assign(anterior, documento);
    else BOP_DOCUMENTOS.unshift(documento);
    return documento;
  },
  async aprobarBopDocumento(id) {
    const documento = BOP_DOCUMENTOS.find((d) => d.id === id);
    if (!documento) throw new Error('Documento BOP no encontrado');
    documento.estado = 'vigente';
    documento.aprobadaEnJunta = true;
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
  async actualizarCiudadano(dip, _datos) {
    const c = (await ciudadanosDelBanco()).find((x) => x.dip === dip);
    if (!c) throw new Error('Ciudadano no encontrado');
    // El mock no persiste email/teléfono (datos de PlacetaID): sin efecto real.
  },
  async migrarJunior(dip, nombre, tutorDip) {
    return { success: true, requiereTutor: !tutorDip, requiereFirma: true, tramite: { id: `TR-${Date.now()}`, tipo: 'sentencia_justicia', dip, nombreCiudadano: nombre || dip, estado: tutorDip ? 'pendiente_firma' : 'pendiente_tutor' }, expediente: { id: `EXP-${Date.now()}`, dip, tipo: 'migracion_junior', firma: { estado: 'pendiente_firma' } } };
  },
  async getEntidad(eip) {
    const cuentas = await arrayCuentas();
    const cuentasEip = cuentas.filter((c) => eipDeCuenta(c) === eip);
    const base = ENTIDADES.find((x) => x.eip === eip);
    const real = entidadesDelBanco(cuentas).find((x) => x.eip === eip);
    if (!base && !real && cuentasEip.length === 0) throw new Error('Entidad no encontrada');

    const nombre = real?.nombre ?? base?.nombre ?? (cuentasEip[0]?.nombre ?? eip);
    const repsDip = real?.representantes ?? base?.representantes ?? [];
    const nombreDe = (dip: string) => cuentas.find((x) => x.dip === dip)?.nombre
      ?? CONTRIBUYENTES.find((x) => x.id === dip)?.nombre ?? dip;

    // Participación agregada desde las cuentas reales (por titular).
    const sumaPct = new Map<string, number>();
    for (const c of cuentasEip) {
      for (const p of c.participaciones ?? []) {
        if (p.dip) sumaPct.set(p.dip, (sumaPct.get(p.dip) ?? 0) + p.pct);
      }
    }
    const participacion: ParticipacionEmpresa[] = Array.from(sumaPct.entries()).map(([dip, pct]) => ({
      dip,
      nombre: nombreDe(dip),
      pct: Math.round(pct * 10) / 10,
    }));

    const representantes = repsDip.map((dip) => ({
      dip,
      nombre: nombreDe(dip),
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
      const nombre = CONTRIBUYENTES.find((c) => c.id === dip)?.nombre
        ?? (await ciudadanosDelBanco()).find((c) => c.dip === dip)?.nombre ?? dip;
      d.adscripciones.push({ dip, nombre, fechaAdscripcion: new Date().toISOString().slice(0, 10), justificado: 0 });
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
  async cambiarEstadoActividadJunior(id: string, estado: 'aprobada' | 'rechazada' | 'en_revision') {
    const a = JUNIOR_ACTIVIDADES.find((x) => x.id === id);
    if (a) a.estado = estado;
  },
  async listarCodigosJunior() {
    return JUNIOR_CODIGOS;
  },
  async crearCodigoJunior(datos) {
    const c: CodigoJunior = {
      id: `COD-${Date.now()}`,
      codigo: datos.codigo || `GDLP-XXXX-${Math.floor(1000 + Math.random() * 9000)}`,
      tipo: datos.tipo,
      valor: datos.tipo === 'recarga' ? (datos.valor || 0) : 0,
      actividadIds: datos.actividadIds || [],
      estado: 'disponible',
      dipVinculado: null,
      creadoEn: new Date().toISOString(),
      canjeadoEn: null,
    };
    JUNIOR_CODIGOS.unshift(c);
    return c;
  },
  async accionCodigoJunior(id, accion) {
    const c = JUNIOR_CODIGOS.find((x) => x.id === id);
    if (!c) throw new Error('Código no encontrado');
    if (accion === 'revocar') c.estado = 'revocado';
    else { c.estado = 'disponible'; c.dipVinculado = null; c.canjeadoEn = null; }
  },
  async listarSubapartados(actividadId) {
    return JUNIOR_SUBAPARTADOS.filter((s) => s.actividadId === actividadId);
  },
  async crearSubapartado(actividadId, datos) {
    const s: Subapartado = {
      id: `SUB-${Date.now()}`,
      actividadId,
      titulo: datos.titulo,
      orden: JUNIOR_SUBAPARTADOS.filter((x) => x.actividadId === actividadId).length + 1,
      tipo: datos.tipo || 'diapositiva',
      desbloqueado: false,
      recompensa: datos.recompensa || 0,
      desbloqueo: 'completar_anterior',
    };
    JUNIOR_SUBAPARTADOS.push(s);
    return s;
  },
  async desbloquearSubapartado(actividadId, subId) {
    void actividadId;
    const s = JUNIOR_SUBAPARTADOS.find((x) => x.id === subId);
    if (s) s.desbloqueado = true;
  },
  async editarEntidad(eip, datos) {
    const cuentas = await arrayCuentas();
    const propias = cuentas.filter((c) => eipDeCuenta(c) === eip);
    if (!propias.length) throw new Error('Entidad no encontrada');
    const nombre = datos.nombre;
    if (nombre) propias.forEach((c) => { c.nombre = nombre; });
    if (datos.participaciones) propias.forEach((c) => { c.participaciones = datos.participaciones; });
  },
  async listarFacturasEntidad(eip) {
    return FACTURAS_ENTIDAD.filter((f) => (f as any).emisor === eip);
  },
  async listarNominas() {
    return NOMINAS;
  },
  async crearNomina(datos) {
    const n: Nomina = {
      id: `NOM-${Date.now()}`,
      dip: datos.dip,
      nombre: datos.nombre || datos.dip,
      periodo: datos.periodo || new Date().toISOString().slice(0, 7),
      bruto: datos.bruto,
      retenciones: datos.retenciones || 0,
      neto: datos.neto || datos.bruto,
      cuentaBanco: datos.cuentaBanco || '',
      estado: 'pendiente',
      actualizadoEn: new Date().toISOString(),
    };
    NOMINAS.unshift(n);
    return n;
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
  async editarVotacion(id, datos) {
    const v = VOTACIONES.find((x) => x.id === id);
    if (!v) throw new Error('Votación no encontrada');
    if (datos.titulo) v.titulo = datos.titulo;
    if (datos.descripcion !== undefined) v.descripcion = datos.descripcion;
    if (datos.categoria) v.categoria = datos.categoria as Votacion['categoria'];
    if (datos.rango) v.rango = datos.rango as Votacion['rango'];
    if (Array.isArray(datos.opciones)) v.opciones = datos.opciones;
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
