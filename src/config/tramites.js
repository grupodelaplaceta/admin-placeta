/**
 * MOTOR DE TRÁMITES — Workflow Engine del RSP
 * ───────────────────────────────────────────────────────────────
 * Cada trámite define su propio flujo (pasos), documentación,
 * validaciones automáticas, acciones por estado y responsables.
 * El frontend simplemente representa ese flujo.
 *
 * Numeración única:
 *   RSP-2026-000001 → trámite general
 *   EXP-2026-000001 → expediente (se crea automáticamente al presentar)
 *   DOC-2026-000001 → documento
 *   SIG-2026-000001 → firma
 *   OP-2026-000001  → operación económica
 *
 * Persistencia: Supabase (rsp_tramites) + memoria.
 */

import { supabase } from './supabase.js';
import { generarIdentificador, hashIntegridad } from './identificadores.js';
import { apiBancoGetState } from './db.js';
import { crearNotificacion } from './notificaciones.js';
import { crearExpediente, vincularObjeto } from './expedientes.js';
import { crearYEnviarFirma, estadoFirma, enviarAPlacetaID } from './firma-placetid.js';

const TABLA = 'rsp_tramites';
const memTramites = new Map();

/* ── Estados genéricos ─────────────────────────────────────────── */
export const ESTADOS = ['borrador','presentado','validacion','revision','subsanacion','resolucion','firma','ejecucion','justificacion','cerrado','rechazado'];

export const ESTADO_UI = {
  borrador:    { label: 'Borrador',   color: 'var(--tq)',            icono: 'draft' },
  presentado:  { label: 'Presentado', color: '#38bdf8',              icono: 'send' },
  validacion:  { label: 'Validación', color: '#a5b4fc',              icono: 'fact_check' },
  revision:    { label: 'En revisión',color: '#fbbf24',              icono: 'manage_search' },
  subsanacion: { label: 'Subsanación',color: '#fb923c',              icono: 'published_with_changes' },
  resolucion:  { label: 'Resolución', color: '#c4b5fd',              icono: 'gavel' },
  firma:       { label: 'Pendiente de firma', color: '#38bdf8',      icono: 'draw' },
  ejecucion:   { label: 'En ejecución', color: '#34d399',            icono: 'payments' },
  justificacion: { label: 'Justificación', color: '#34d399',         icono: 'fact_check' },
  cerrado:     { label: 'Completado', color: '#34d399',              icono: 'check_circle' },
  rechazado:   { label: 'Rechazado', color: '#f87171',               icono: 'cancel' },
};

/* ── Catálogo de trámites ──────────────────────────────────────── */
export const TRAMITES = {
  subvencion: {
    id: 'subvencion', nombre: 'Solicitud de subvención', icono: '💸',
    descripcion: 'Solicita una ayuda o subvención para tu entidad o proyecto.',
    color: '#8b5cf6',
    pasos: [
      { id: 'inicio', titulo: 'Inicio' },
      { id: 'datos', titulo: 'Datos' },
      { id: 'docs', titulo: 'Documentación' },
      { id: 'validacion', titulo: 'Validación' },
      { id: 'revision', titulo: 'Revisión' },
      { id: 'subsanacion', titulo: 'Subsanación' },
      { id: 'resolucion', titulo: 'Resolución' },
      { id: 'firma', titulo: 'Firma' },
      { id: 'ejecucion', titulo: 'Ejecución' },
      { id: 'justificacion', titulo: 'Justificación' },
      { id: 'cerrado', titulo: 'Cierre y archivo' },
    ],
    documentos: ['memoria', 'presupuesto', 'estatutos'],
    campos: [
      { key: 'objeto', label: 'Objeto de la ayuda', tipo: 'text', obligatorio: true },
      { key: 'importe_solicitado', label: 'Importe solicitado (Pz)', tipo: 'number', obligatorio: true },
      { key: 'entidad', label: 'Entidad beneficiaria', tipo: 'entidad', obligatorio: false },
    ],
    acciones: {
      borrador:   [{ id: 'presentar', label: 'Presentar solicitud', icono: 'send', rol: 'solicitante', nivel: 'accion' }],
      presentado: [{ id: 'iniciar_validacion', label: 'Iniciar validación automática', icono: 'fact_check', rol: 'admin' }],
      validacion: [{ id: 'pasar_revision', label: 'Pasar a revisión', icono: 'manage_search', rol: 'admin' }],
      revision: [
        { id: 'aprobar', label: 'Aprobar', icono: 'check_circle', rol: 'admin', nivel: 'accion' },
        { id: 'subsanar', label: 'Solicitar subsanación', icono: 'published_with_changes', rol: 'admin' },
        { id: 'rechazar', label: 'Rechazar', icono: 'cancel', rol: 'admin' },
      ],
      subsanacion: [{ id: 'aportar_documentos', label: 'Aportar documentación', icono: 'upload_file', rol: 'solicitante', nivel: 'accion' }],
      resolucion: [{ id: 'emitir_firma', label: 'Enviar a firma (PlacetaID Móvil)', icono: 'draw', rol: 'admin', nivel: 'accion' }],
      firma:      [
        { id: 'verificar_firma', label: 'Comprobar firma en PlacetaID', icono: 'sync', rol: 'admin' },
        { id: 'reenviar_firma', label: 'Reenviar a PlacetaID Móvil', icono: 'send', rol: 'admin' },
        { id: 'confirmar_firma', label: 'Confirmar firma', icono: 'verified', rol: 'sistema' },
      ],
      ejecucion:  [{ id: 'ejecutar', label: 'Registrar ejecución / pago', icono: 'payments', rol: 'admin' }],
      justificacion: [{ id: 'justificar', label: 'Presentar justificación', icono: 'task_alt', rol: 'solicitante', nivel: 'accion' }],
    },
  },
  'alta-entidad': {
    id: 'alta-entidad', nombre: 'Alta de entidad', icono: '🏢',
    descripcion: 'Registra una nueva entidad u organización en el ecosistema.',
    color: '#6366f1',
    pasos: [
      { id: 'inicio', titulo: 'Inicio' }, { id: 'datos', titulo: 'Datos' },
      { id: 'docs', titulo: 'Documentación' }, { id: 'validacion', titulo: 'Validación' },
      { id: 'revision', titulo: 'Revisión' }, { id: 'subsanacion', titulo: 'Subsanación' },
      { id: 'resolucion', titulo: 'Aprobación' }, { id: 'firma', titulo: 'Firma' }, { id: 'cerrado', titulo: 'Activa' },
    ],
    documentos: ['estatutos', 'cif', 'representante'],
    campos: [
      { key: 'razon_social', label: 'Razón social', tipo: 'text', obligatorio: true },
      { key: 'cif', label: 'CIF / Identificación', tipo: 'text', obligatorio: true },
      { key: 'domicilio', label: 'Domicilio', tipo: 'text', obligatorio: false },
      { key: 'representante', label: 'Representante (DIP)', tipo: 'dip', obligatorio: true },
    ],
    acciones: {
      borrador: [{ id: 'presentar', label: 'Presentar solicitud', icono: 'send', rol: 'solicitante', nivel: 'accion' }],
      presentado: [{ id: 'iniciar_validacion', label: 'Iniciar validación', icono: 'fact_check', rol: 'admin' }],
      validacion: [{ id: 'pasar_revision', label: 'Pasar a revisión', icono: 'manage_search', rol: 'admin' }],
      revision: [
        { id: 'aprobar', label: 'Aprobar alta', icono: 'check_circle', rol: 'admin', nivel: 'accion' },
        { id: 'subsanar', label: 'Solicitar subsanación', icono: 'published_with_changes', rol: 'admin' },
        { id: 'rechazar', label: 'Rechazar', icono: 'cancel', rol: 'admin' },
      ],
      subsanacion: [{ id: 'aportar_documentos', label: 'Aportar documentación', icono: 'upload_file', rol: 'solicitante', nivel: 'accion' }],
      resolucion: [{ id: 'emitir_firma', label: 'Enviar a firma (PlacetaID Móvil)', icono: 'draw', rol: 'admin', nivel: 'accion' }],
      firma: [
        { id: 'verificar_firma', label: 'Comprobar firma en PlacetaID', icono: 'sync', rol: 'admin' },
        { id: 'reenviar_firma', label: 'Reenviar a PlacetaID Móvil', icono: 'send', rol: 'admin' },
        { id: 'confirmar_firma', label: 'Confirmar firma', icono: 'verified', rol: 'sistema' },
      ],
    },
  },
  'cambio-datos': {
    id: 'cambio-datos', nombre: 'Cambio de datos', icono: '✏️',
    descripcion: 'Solicita la modificación de tus datos personales o de tu entidad.',
    color: '#22d3ee',
    pasos: [
      { id: 'inicio', titulo: 'Inicio' }, { id: 'datos', titulo: 'Datos' },
      { id: 'validacion', titulo: 'Validación' }, { id: 'revision', titulo: 'Revisión' },
      { id: 'resolucion', titulo: 'Resolución' }, { id: 'cerrado', titulo: 'Cierre' },
    ],
    documentos: [],
    campos: [
      { key: 'campo', label: 'Campo a modificar', tipo: 'select', opciones: ['Nombre', 'Dirección', 'Teléfono', 'Representante', 'Datos de entidad'], obligatorio: true },
      { key: 'valor_nuevo', label: 'Nuevo valor', tipo: 'text', obligatorio: true },
      { key: 'motivo', label: 'Motivo', tipo: 'text', obligatorio: false },
    ],
    acciones: {
      borrador: [{ id: 'presentar', label: 'Presentar solicitud', icono: 'send', rol: 'solicitante', nivel: 'accion' }],
      presentado: [{ id: 'iniciar_validacion', label: 'Iniciar validación', icono: 'fact_check', rol: 'admin' }],
      validacion: [{ id: 'pasar_revision', label: 'Pasar a revisión', icono: 'manage_search', rol: 'admin' }],
      revision: [
        { id: 'aprobar', label: 'Aprobar cambio', icono: 'check_circle', rol: 'admin', nivel: 'accion' },
        { id: 'subsanar', label: 'Solicitar subsanación', icono: 'published_with_changes', rol: 'admin' },
        { id: 'rechazar', label: 'Rechazar', icono: 'cancel', rol: 'admin' },
      ],
      subsanacion: [{ id: 'aportar_documentos', label: 'Aportar información', icono: 'upload_file', rol: 'solicitante', nivel: 'accion' }],
      resolucion: [{ id: 'cerrar', label: 'Cerrar trámite', icono: 'archive', rol: 'admin' }],
    },
  },
  'cambio-titularidad': {
    id: 'cambio-titularidad', nombre: 'Cambio de titularidad', icono: '🔄',
    descripcion: 'Transfiere la titularidad de una cuenta o entidad a otra persona.',
    color: '#f472b6',
    pasos: [
      { id: 'inicio', titulo: 'Inicio' }, { id: 'datos', titulo: 'Datos' },
      { id: 'docs', titulo: 'Documentación' }, { id: 'validacion', titulo: 'Validación' },
      { id: 'revision', titulo: 'Revisión' }, { id: 'resolucion', titulo: 'Resolución' },
      { id: 'firma', titulo: 'Firmas' }, { id: 'ejecucion', titulo: 'Ejecución' }, { id: 'cerrado', titulo: 'Cierre' },
    ],
    documentos: ['titulo', 'contrato'],
    campos: [
      { key: 'objeto', label: 'Objeto (cuenta / entidad)', tipo: 'text', obligatorio: true },
      { key: 'cedente_dip', label: 'Titular actual (DIP)', tipo: 'dip', obligatorio: true },
      { key: 'cesionario_dip', label: 'Nuevo titular (DIP)', tipo: 'dip', obligatorio: true },
      { key: 'motivo', label: 'Motivo legal', tipo: 'select', opciones: ['Compraventa', 'Fusión', 'Reestructuración', 'Sucesión / herencia', 'Otro'], obligatorio: true },
    ],
    acciones: {
      borrador: [{ id: 'presentar', label: 'Presentar solicitud', icono: 'send', rol: 'solicitante', nivel: 'accion' }],
      presentado: [{ id: 'iniciar_validacion', label: 'Iniciar validación', icono: 'fact_check', rol: 'admin' }],
      validacion: [{ id: 'pasar_revision', label: 'Pasar a revisión', icono: 'manage_search', rol: 'admin' }],
      revision: [
        { id: 'aprobar', label: 'Aprobar', icono: 'check_circle', rol: 'admin', nivel: 'accion' },
        { id: 'subsanar', label: 'Solicitar subsanación', icono: 'published_with_changes', rol: 'admin' },
        { id: 'rechazar', label: 'Rechazar', icono: 'cancel', rol: 'admin' },
      ],
      subsanacion: [{ id: 'aportar_documentos', label: 'Aportar documentación', icono: 'upload_file', rol: 'solicitante', nivel: 'accion' }],
      resolucion: [{ id: 'emitir_firma', label: 'Enviar a firma (PlacetaID Móvil)', icono: 'draw', rol: 'admin', nivel: 'accion' }],
      firma: [
        { id: 'verificar_firma', label: 'Comprobar firma en PlacetaID', icono: 'sync', rol: 'admin' },
        { id: 'reenviar_firma', label: 'Reenviar a PlacetaID Móvil', icono: 'send', rol: 'admin' },
        { id: 'confirmar_firma', label: 'Confirmar firma', icono: 'verified', rol: 'sistema' },
      ],
      ejecucion: [{ id: 'ejecutar', label: 'Ejecutar cambio', icono: 'swap_horiz', rol: 'admin' }],
    },
  },
  'solicitud-pago': {
    id: 'solicitud-pago', nombre: 'Solicitud de pago', icono: '💰',
    descripcion: 'Solicita un pago u operación económica (factura, retribución, ayuda).',
    color: '#10b981',
    pasos: [
      { id: 'inicio', titulo: 'Solicitud' }, { id: 'validacion', titulo: 'Validación' },
      { id: 'control', titulo: 'Control fiscal' }, { id: 'autorizacion', titulo: 'Autorización' },
      { id: 'pago', titulo: 'Pago banco' }, { id: 'cerrado', titulo: 'Confirmado' },
    ],
    documentos: ['factura'],
    campos: [
      { key: 'concepto', label: 'Concepto', tipo: 'text', obligatorio: true },
      { key: 'importe', label: 'Importe (Pz)', tipo: 'number', obligatorio: true },
      { key: 'beneficiario', label: 'Beneficiario', tipo: 'entidad', obligatorio: true },
      { key: 'cuenta_origen', label: 'Cuenta origen', tipo: 'text', obligatorio: false },
    ],
    acciones: {
      borrador: [{ id: 'presentar', label: 'Solicitar pago', icono: 'send', rol: 'solicitante', nivel: 'accion' }],
      presentado: [{ id: 'iniciar_validacion', label: 'Iniciar validación', icono: 'fact_check', rol: 'admin' }],
      validacion: [{ id: 'control_fiscal', label: 'Pasar a control fiscal', icono: 'calculate', rol: 'admin' }],
      revision: [{ id: 'autorizar', label: 'Autorizar pago', icono: 'verified', rol: 'admin', nivel: 'accion' }],
      resolucion: [{ id: 'emitir_pago', label: 'Emitir pago', icono: 'payments', rol: 'admin' }],
      ejecucion: [{ id: 'confirmar', label: 'Confirmar pago', icono: 'check_circle', rol: 'admin' }],
    },
  },
};

/* ── Persistencia ──────────────────────────────────────────────── */
async function listarDB(filtros = {}) {
  if (!supabase) return null;
  try {
    let q = supabase.from(TABLA).select('*').order('created_at', { ascending: false }).limit(300);
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    if (filtros.tipo) q = q.eq('tipo', filtros.tipo);
    if (filtros.solicitante_dip) q = q.eq('solicitante_dip', filtros.solicitante_dip);
    if (filtros.prioridad) q = q.eq('prioridad', filtros.prioridad);
    const { data } = await q;
    return data || [];
  } catch { return null; }
}

async function upsertDB(t) {
  if (!supabase) return false;
  try {
    await supabase.from(TABLA).upsert(t, { onConflict: 'id' });
    return true;
  } catch (e) {
    if (e?.code === '42P01' || /could not find the table/i.test(e?.message || '')) {
      try {
        await supabase.rpc('exec_sql', { sql: `CREATE TABLE IF NOT EXISTS rsp_tramites (
          id TEXT PRIMARY KEY, tipo TEXT NOT NULL, titulo TEXT NOT NULL,
          solicitante_dip TEXT, solicitante_nombre TEXT, entidad_eip TEXT, entidad_nombre TEXT,
          estado TEXT DEFAULT 'borrador', paso INTEGER DEFAULT 0, prioridad TEXT DEFAULT 'normal',
          responsable_dip TEXT, responsable_nombre TEXT, datos JSONB, documentos JSONB,
          validaciones JSONB, historial JSONB, comunicaciones JSONB, expediente_id TEXT,
          siguiente_accion TEXT, fecha_presentacion TEXT, fecha_limite TEXT, resolucion JSONB,
          hash TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
        );` });
        await supabase.from(TABLA).upsert(t, { onConflict: 'id' });
        return true;
      } catch { /* memoria */ }
    }
    return false;
  }
}

/* ── Utilidades ────────────────────────────────────────────────── */
function esAdmin(autor) { return autor?.rol === 'admin' || ['superadmin', 'rsp_admin'].includes(autor?.rol); }

/** Confirma la firma de un trámite (desde PlacetaID Móvil) y avanza el workflow */
async function confirmarFirma(t, autor = {}) {
  if (t.estado !== 'firma') throw new Error('El trámite no está en estado de firma');
  const firma = {
    id: await generarIdentificador('SIG'),
    fecha: new Date().toISOString(),
    firmante: autor.nombre || 'PlacetaID Móvil',
    dip: t.solicitante_dip,
    docId: t.firmaDocId || null,
  };
  t.firmas = [...(t.firmas || []), firma];
  t.estado = t.tipo === 'alta-entidad' ? 'cerrado' : 'ejecucion';
  t.siguiente_accion = t.estado === 'cerrado' ? 'Trámite completado' : 'Ejecutar el trámite';
  await crearNotificacion({ nivel: 'completado', titulo: `${t.id}: firma registrada`, mensaje: 'El documento se firmó desde PlacetaID Móvil', servicio: 'rsp', destinatario_dip: t.solicitante_dip, objeto_tipo: 'TRAMITE', objeto_id: t.id, enlace: `/rsp/tramites/${t.id}` });
}

/** Comprueba el estado de firma en PlacetaID y avanza si está firmado */
export async function verificarFirma(id, autor = {}) {
  const t = await getTramite(id);
  if (!t) throw new Error('Trámite no encontrado');
  if (t.estado !== 'firma') throw new Error('El trámite no está en estado de firma');
  if (!t.firmaDocId) throw new Error('No se ha enviado documento de firma todavía');
  const st = await estadoFirma(t.firmaDocId, 'rsp');
  if (!st.encontrado) return { tramite: t, firmado: false, mensaje: 'No se encuentra el documento de firma' };
  if (!st.firmado) return { tramite: t, firmado: false, mensaje: 'Aún sin firmar en PlacetaID Móvil' };
  await confirmarFirma(t, autor);
  t.historial = [...(t.historial || []), { fecha: new Date().toISOString(), quien: autor.nombre || autor.dip || 'Sistema', accion: 'Firma verificada en PlacetaID' }];
  t.updated_at = new Date().toISOString();
  memTramites.set(t.id, t);
  await upsertDB(t);
  return { tramite: t, firmado: true, mensaje: 'Firma verificada y trámite avanzado' };
}

function siguienteAccion(tramite, autor) {
  const cfg = TRAMITES[tramite.tipo];
  const accs = (cfg?.acciones || {})[tramite.estado] || [];
  const autorRol = esAdmin(autor) ? 'admin' : 'solicitante';
  const disponibles = accs.filter(a => a.rol === autorRol);
  if (disponibles.length) return disponibles[0].label;
  // Acción pendiente de otro rol → informar
  if (accs.length) {
    const otroRol = accs[0].rol === 'admin' ? 'administración' : 'el solicitante';
    return `Esperando acción de ${otroRol}: ${accs[0].label}`;
  }
  return 'Sin acciones pendientes';
}

/** Valida automáticamente un trámite con datos reales del banco */
export async function validarTramite(t) {
  let banco = null;
  try { banco = await apiBancoGetState(); } catch { /* sin banco */ }
  const users = banco?.users || [];
  const accounts = banco?.accounts || [];
  const dipNorm = (s) => String(s || '').trim().toUpperCase();
  const dip = dipNorm(t.solicitante_dip);
  const tieneCuenta = accounts.some(a => dipNorm(a.placetaId) === dip && !/^sys-|^DIP-|^ALBA-|TGLP|AGLDP|VAULT|CAPITALIA|FOUNDATION|FUND-BLP/i.test(String(a.id)));
  const enPadron = users.some(u => dipNorm(u.placetaId) === dip || dipNorm(u.dip) === dip);
  let entidadActiva = null;
  if (t.entidad_eip) {
    const eip = dipNorm(t.entidad_eip);
    const cuentaEmp = accounts.find(a => dipNorm(a.eip) === eip && String(a.type).toLowerCase().includes('business'));
    entidadActiva = !!cuentaEmp;
  }
  const cfg = TRAMITES[t.tipo] || {};
  const docsRequeridos = cfg.documentos || [];
  const docEstados = (t.documentos || []).reduce((m, d) => { m[d.nombre] = d.estado; return m; }, {});
  const docsCompletos = docsRequeridos.every(d => docEstados[d] === 'validado');

  return [
    { id: 'identidad', nombre: 'Identidad verificada', ok: enPadron || tieneCuenta, nivel: 'ok' },
    { id: 'entidad', nombre: 'Entidad activa', ok: t.entidad_eip ? entidadActiva : true, nivel: 'ok' },
    { id: 'documentacion', nombre: 'Documentación obligatoria completa', ok: docsRequeridos.length === 0 ? true : docsCompletos, nivel: 'ok' },
    { id: 'cuenta', nombre: 'Cuenta bancaria verificada', ok: tieneCuenta, nivel: 'ok' },
  ];
}

/* ── API pública ───────────────────────────────────────────────── */

export async function listarTramites(filtros = {}) {
  const db = await listarDB(filtros);
  if (db && db.length > 0) { db.forEach(t => memTramites.set(t.id, t)); return db; }
  let lista = [...memTramites.values()].reverse();
  if (filtros.estado) lista = lista.filter(t => t.estado === filtros.estado);
  if (filtros.tipo) lista = lista.filter(t => t.tipo === filtros.tipo);
  if (filtros.solicitante_dip) lista = lista.filter(t => t.solicitante_dip === filtros.solicitante_dip);
  if (filtros.busqueda) {
    const q = String(filtros.busqueda).toLowerCase();
    lista = lista.filter(t => [t.id, t.titulo, t.solicitante_nombre, t.entidad_nombre].join(' ').toLowerCase().includes(q));
  }
  return lista;
}

export async function getTramite(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(TABLA).select('*').eq('id', id).maybeSingle();
      if (data) { memTramites.set(id, data); return data; }
    } catch { /* memoria */ }
  }
  return memTramites.get(id) || null;
}

/** Crea un trámite (borrador) */
export async function crearTramite(datos, autor = {}) {
  const cfg = TRAMITES[datos.tipo];
  if (!cfg) throw new Error('Tipo de trámite no válido');
  if (!datos.titulo) throw new Error('El título del trámite es obligatorio');
  const id = await generarIdentificador('RSP');
  const t = {
    id,
    tipo: datos.tipo,
    titulo: datos.titulo,
    solicitante_dip: datos.solicitante_dip || autor.dip || null,
    solicitante_nombre: datos.solicitante_nombre || autor.nombre || null,
    entidad_eip: datos.entidad_eip || null,
    entidad_nombre: datos.entidad_nombre || null,
    estado: 'borrador',
    paso: 0,
    prioridad: datos.prioridad || 'normal',
    responsable_dip: datos.responsable_dip || null,
    responsable_nombre: datos.responsable_nombre || null,
    datos: datos.datos || {},
    documentos: (datos.documentos || []).map(d => ({ nombre: d.nombre, estado: d.estado || 'pendiente', fecha: new Date().toISOString() })),
    validaciones: [],
    historial: [{ fecha: new Date().toISOString(), quien: autor.nombre || autor.dip || 'Sistema', accion: 'Trámite creado' }],
    comunicaciones: [],
    expediente_id: null,
    siguiente_accion: 'Presentar la solicitud',
    fecha_presentacion: null,
    fecha_limite: datos.fecha_limite || null,
    resolucion: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  t.hash = hashIntegridad({ id, tipo: t.tipo, titulo: t.titulo, solicitante: t.solicitante_dip });
  memTramites.set(id, t);
  await upsertDB(t);
  return t;
}

/** Avanza el trámite según la acción ejecutada */
export async function avanzarTramite(id, { accion, nota = '', datos = {} }, autor = {}) {
  const t = await getTramite(id);
  if (!t) throw new Error('Trámite no encontrado');
  if (t.estado === 'cerrado' || t.estado === 'rechazado') throw new Error('El trámite ya está finalizado');

  const cfg = TRAMITES[t.tipo] || {};
  const accs = (cfg.acciones || {})[t.estado] || [];
  const accionDef = accs.find(a => a.id === accion);
  if (!accionDef) throw new Error(`Acción "${accion}" no permitida en estado "${t.estado}"`);
  if (accionDef.rol === 'admin' && !esAdmin(autor)) throw new Error('No tienes permiso para esta acción');

  const cambio = {
    presentar: async () => {
      t.estado = 'presentado';
      t.fecha_presentacion = new Date().toISOString();
      t.siguiente_accion = 'Iniciar validación automática';
      // Crear expediente vinculado automáticamente
      try {
        const exp = await crearExpediente({ titulo: t.titulo, tipo: t.tipo, persona_dip: t.solicitante_dip, entidad_eip: t.entidad_eip, responsable_dip: autor.dip, responsable_nombre: autor.nombre, relacion_ids: [{ tipo: 'TRAMITE', id: t.id, label: t.titulo }] }, autor);
        t.expediente_id = exp.id;
        await vincularObjeto(exp.id, 'TRAMITE', t.id, t.titulo);
      } catch { /* sin expediente */ }
      await crearNotificacion({ nivel: 'info', titulo: `Trámite ${t.id} presentado`, mensaje: t.titulo, servicio: 'rsp', destinatario_dip: t.solicitante_dip, objeto_tipo: 'TRAMITE', objeto_id: t.id, enlace: `/rsp/tramites/${t.id}` });
      return `Trámite ${t.id} presentado correctamente`;
    },
    iniciar_validacion: async () => {
      t.estado = 'validacion';
      t.validaciones = await validarTramite(t);
      t.siguiente_accion = 'Revisar resultado de validaciones';
      await crearNotificacion({ nivel: 'info', titulo: `Validación de ${t.id}`, mensaje: 'Se han ejecutado las validaciones automáticas', servicio: 'rsp', destinatario_dip: t.solicitante_dip, objeto_tipo: 'TRAMITE', objeto_id: t.id, enlace: `/rsp/tramites/${t.id}` });
      return 'Validaciones automáticas ejecutadas';
    },
    pasar_revision: async () => { t.estado = 'revision'; t.siguiente_accion = 'Revisar y resolver'; return 'Trámite en revisión'; },
    control_fiscal: async () => { t.estado = 'revision'; t.siguiente_accion = 'Realizar control fiscal y autorizar'; return 'Trámite en control fiscal'; },
    aprobar: async () => {
      t.estado = 'resolucion';
      t.resolucion = { estado: 'aprobado', fecha: new Date().toISOString(), por: autor.nombre || autor.dip, nota: nota || '' };
      t.siguiente_accion = 'Emitir resolución y solicitar firma';
      await crearNotificacion({ nivel: 'pendiente', titulo: `${t.id} aprobado`, mensaje: 'Tu solicitud ha sido aprobada. Próximo paso: firma.', servicio: 'rsp', destinatario_dip: t.solicitante_dip, objeto_tipo: 'TRAMITE', objeto_id: t.id, enlace: `/rsp/tramites/${t.id}` });
      return 'Solicitud aprobada';
    },
    autorizar: async () => { t.estado = 'resolucion'; t.siguiente_accion = 'Emitir pago'; return 'Pago autorizado'; },
    subsanar: async () => {
      t.estado = 'subsanacion';
      t.siguiente_accion = 'Aportar la documentación requerida';
      await crearNotificacion({ nivel: 'accion', titulo: `${t.id}: se requiere subsanación`, mensaje: nota || 'Debes aportar documentación adicional', servicio: 'rsp', destinatario_dip: t.solicitante_dip, objeto_tipo: 'TRAMITE', objeto_id: t.id, enlace: `/rsp/tramites/${t.id}` });
      return 'Subsanación solicitada';
    },
    aportar_documentos: async () => {
      (datos.documentos || []).forEach(d => {
        const idx = (t.documentos || []).findIndex(x => x.nombre === d.nombre);
        if (idx >= 0) t.documentos[idx] = { ...t.documentos[idx], estado: d.estado || 'validado', fecha: new Date().toISOString() };
        else t.documentos = [...(t.documentos || []), { nombre: d.nombre, estado: d.estado || 'validado', fecha: new Date().toISOString() }];
      });
      t.estado = 'revision';
      t.siguiente_accion = 'Revisar documentación aportada';
      await crearNotificacion({ nivel: 'info', titulo: `${t.id}: documentación aportada`, mensaje: 'El solicitante ha aportado la documentación', servicio: 'rsp', objeto_tipo: 'TRAMITE', objeto_id: t.id, enlace: `/rsp/tramites/${t.id}` });
      return 'Documentación actualizada';
    },
    emitir_firma: async () => {
      t.estado = 'firma';
      t.siguiente_accion = 'El solicitante firma desde PlacetaID Móvil';
      // Crear documento oficial y enviarlo a PlacetaID Móvil para firma
      const envio = await crearYEnviarFirma({
        titulo: `${t.id} — ${t.titulo}`,
        tipo: 'resolucion',
        dip: t.solicitante_dip,
        tramiteId: t.id,
        datos: { tramiteId: t.id, tipoTramite: t.tipo },
      }).catch(err => { console.warn('[Trámites] Error creando firma:', err.message); return null; });
      if (envio) {
        t.firmaDocId = envio.docId;
        t.firmaCsv = envio.csv;
        t.firmaHash = envio.hash;
        t.firmaEnviada = envio.enviado;
      }
      await crearNotificacion({ nivel: 'accion', titulo: `${t.id}: documento listo para firmar`, mensaje: 'El solicitante debe firmar desde PlacetaID Móvil', servicio: 'rsp', destinatario_dip: t.solicitante_dip, objeto_tipo: 'TRAMITE', objeto_id: t.id, enlace: `/rsp/tramites/${t.id}` });
      return envio?.enviado ? 'Documento enviado a PlacetaID Móvil para firma' : '⚠️ Firma creada pero no se pudo enviar a PlacetaID (modo offline) — reenvía desde el panel';
    },
    reenviar_firma: async () => {
      if (!t.firmaDocId) throw new Error('No hay documento de firma pendiente');
      const ok = await enviarAPlacetaID(t.firmaDocId, `${t.id} — ${t.titulo}`, 'resolucion', 'rsp', t.firmaCsv, t.solicitante_dip, t.firmaHash);
      t.firmaEnviada = ok;
      return ok ? 'Reenviado a PlacetaID Móvil' : 'No se pudo reenviar (modo offline)';
    },
    verificar_firma: async () => {
      if (!t.firmaDocId) throw new Error('No se ha enviado documento de firma todavía');
      const st = await estadoFirma(t.firmaDocId, 'rsp');
      if (!st.encontrado) return 'No se encuentra el documento de firma';
      if (!st.firmado) return 'Aún sin firmar en PlacetaID Móvil — esperando al solicitante';
      await confirmarFirma(t, autor);
      return 'Firma verificada: documento firmado en PlacetaID Móvil';
    },
    confirmar_firma: async () => { await confirmarFirma(t, autor); return 'Firma confirmada desde PlacetaID Móvil'; },
    emitir_pago: async () => { t.estado = 'ejecucion'; t.siguiente_accion = 'Confirmar pago emitido'; return 'Pago en emisión'; },
    firmar: async () => {
      t.estado = t.tipo === 'solicitud-pago' ? 'ejecucion' : (t.tipo === 'alta-entidad' ? 'cerrado' : 'ejecucion');
      const firma = { id: await generarIdentificador('SIG'), fecha: new Date().toISOString(), firmante: autor.nombre || autor.dip };
      t.firmas = [...(t.firmas || []), firma];
      t.siguiente_accion = t.estado === 'cerrado' ? 'Trámite completado' : 'Ejecutar el trámite';
      return 'Firma registrada';
    },
    ejecutar: async () => {
      t.estado = t.tipo === 'solicitud-pago' ? 'cerrado' : 'justificacion';
      const op = { id: await generarIdentificador('OP'), fecha: new Date().toISOString(), por: autor.nombre || autor.dip };
      t.operaciones = [...(t.operaciones || []), op];
      t.siguiente_accion = t.estado === 'cerrado' ? 'Trámite completado' : 'Presentar justificación';
      return 'Ejecución registrada';
    },
    confirmar: async () => { t.estado = 'cerrado'; t.siguiente_accion = 'Trámite completado'; return 'Pago confirmado'; },
    justificar: async () => {
      t.estado = 'cerrado';
      t.siguiente_accion = 'Trámite completado';
      await crearNotificacion({ nivel: 'completado', titulo: `${t.id} finalizado`, mensaje: 'El trámite se ha cerrado correctamente', servicio: 'rsp', destinatario_dip: t.solicitante_dip, objeto_tipo: 'TRAMITE', objeto_id: t.id, enlace: `/rsp/tramites/${t.id}` });
      return 'Trámite justificado y cerrado';
    },
    cerrar: async () => { t.estado = 'cerrado'; t.siguiente_accion = 'Trámite completado'; return 'Trámite cerrado'; },
    rechazar: async () => {
      t.estado = 'rechazado';
      t.resolucion = { estado: 'rechazado', fecha: new Date().toISOString(), por: autor.nombre || autor.dip, nota: nota || 'Documentación insuficiente' };
      t.siguiente_accion = 'Ver resolución';
      await crearNotificacion({ nivel: 'pendiente', titulo: `${t.id} rechazado`, mensaje: nota || 'Documentación insuficiente', servicio: 'rsp', destinatario_dip: t.solicitante_dip, objeto_tipo: 'TRAMITE', objeto_id: t.id, enlace: `/rsp/tramites/${t.id}` });
      return 'Trámite rechazado';
    },
  };

  if (!cambio[accion]) throw new Error(`Acción "${accion}" no implementada`);
  const msj = await cambio[accion]();

  // Historial + comunicación
  t.historial = [...(t.historial || []), { fecha: new Date().toISOString(), quien: autor.nombre || autor.dip || 'Sistema', accion: accionDef.label, nota: nota || '' }];
  if (nota) t.comunicaciones = [...(t.comunicaciones || []), { fecha: new Date().toISOString(), remitente: autor.nombre || autor.dip || 'RSP', texto: nota }];
  t.updated_at = new Date().toISOString();
  memTramites.set(t.id, t);
  await upsertDB(t);
  return { tramite: t, mensaje: msj };
}

/** Añade una comunicación oficial al hilo del trámite */
export async function anadirComunicacion(id, { texto }, autor = {}) {
  const t = await getTramite(id);
  if (!t) throw new Error('Trámite no encontrado');
  if (!texto) throw new Error('El mensaje es obligatorio');
  t.comunicaciones = [...(t.comunicaciones || []), { fecha: new Date().toISOString(), remitente: autor.nombre || autor.dip || 'RSP', texto }];
  t.updated_at = new Date().toISOString();
  memTramites.set(t.id, t);
  await upsertDB(t);
  return t;
}

/** Actualiza responsable / prioridad */
export async function actualizarTramite(id, cambios, autor = {}) {
  const t = await getTramite(id);
  if (!t) throw new Error('Trámite no encontrado');
  if (t.estado === 'cerrado') throw new Error('Un trámite cerrado no se puede modificar');
  for (const k of ['responsable_dip', 'responsable_nombre', 'prioridad', 'entidad_eip', 'entidad_nombre', 'titulo']) {
    if (cambios[k] !== undefined) t[k] = cambios[k];
  }
  t.historial = [...(t.historial || []), { fecha: new Date().toISOString(), quien: autor.nombre || autor.dip || 'Sistema', accion: 'Trámite actualizado' }];
  t.updated_at = new Date().toISOString();
  memTramites.set(t.id, t);
  await upsertDB(t);
  return t;
}

/** Progreso del stepper (pasos del catálogo con estado hecho/activo) */
export function progresoDe(t) {
  const cfg = TRAMITES[t.tipo] || {};
  const pasos = cfg.pasos || [];
  const estadoActivo = ESTADO_UI[t.estado]?.label || t.estado;
  let activoIdx = 0;
  if (t.estado === 'subsanacion') activoIdx = Math.max(0, pasos.findIndex(p => p.id === 'subsanacion'));
  else if (t.estado === 'presentado') activoIdx = pasos.findIndex(p => p.id === 'validacion');
  else if (t.estado === 'validacion') activoIdx = pasos.findIndex(p => p.id === 'validacion');
  else if (t.estado === 'revision') activoIdx = pasos.findIndex(p => p.id === 'revision');
  else if (t.estado === 'resolucion') activoIdx = pasos.findIndex(p => p.id === 'resolucion');
  else if (t.estado === 'firma') activoIdx = pasos.findIndex(p => p.id === 'firma');
  else if (t.estado === 'ejecucion') activoIdx = pasos.findIndex(p => p.id === 'ejecucion');
  else if (t.estado === 'justificacion') activoIdx = pasos.findIndex(p => p.id === 'justificacion');
  else if (t.estado === 'cerrado') activoIdx = pasos.length - 1;
  else if (t.estado === 'rechazado') activoIdx = pasos.findIndex(p => p.id === 'revision');
  const idx = Math.max(0, activoIdx);
  return pasos.map((p, i) => ({
    ...p,
    hecho: i < idx || t.estado === 'cerrado',
    activo: i === idx && t.estado !== 'cerrado',
    rechazado: t.estado === 'rechazado',
  }));
}

/** Estado del módulo (KPIs para la lista) */
export async function estadoTramites() {
  const todos = await listarTramites();
  const enCurso = todos.filter(t => !['cerrado', 'rechazado', 'borrador'].includes(t.estado));
  const requierenAccion = todos.filter(t => ['subsanacion', 'firma', 'revision'].includes(t.estado));
  return {
    total: todos.length,
    pendientes: todos.filter(t => ['presentado', 'validacion'].includes(t.estado)).length,
    enCurso: enCurso.length,
    finalizados: todos.filter(t => ['cerrado', 'rechazado'].includes(t.estado)).length,
    requierenAccion: requierenAccion.length,
    porEstado: Object.fromEntries(ESTADOS.map(e => [e, todos.filter(x => x.estado === e).length])),
  };
}

/** Mi bandeja: acciones pendientes del usuario (solicitante) */
export async function bandejaDe(dip) {
  const todos = await listarTramites({ solicitante_dip: dip });
  const acciones = todos
    .filter(t => ['subsanacion', 'firma', 'justificacion', 'revision'].includes(t.estado) || (t.estado === 'borrador' && t.solicitante_dip === dip))
    .map(t => {
      const cfg = TRAMITES[t.tipo] || {};
      const accs = (cfg.acciones || {})[t.estado] || [];
      const accion = accs.find(a => a.rol === 'solicitante') || accs[0];
      const prioridad = t.prioridad === 'alta' ? 0 : t.prioridad === 'normal' ? 1 : 2;
      return { tramite: t, accion, prioridad, color: ESTADO_UI[t.estado]?.color, label: ESTADO_UI[t.estado]?.label };
    })
    .sort((a, b) => a.prioridad - b.prioridad);
  return acciones;
}

/** Bandeja de trabajo: expedientes que requieren acción del administrador */
export async function trabajoPendiente() {
  const todos = await listarTramites();
  const pendientes = todos
    .filter(t => ['presentado', 'validacion', 'revision', 'subsanacion', 'resolucion', 'ejecucion'].includes(t.estado))
    .map(t => {
      const cfg = TRAMITES[t.tipo] || {};
      const accs = (cfg.acciones || {})[t.estado] || [];
      const accion = accs.find(a => a.rol === 'admin') || accs[0];
      const p = t.prioridad === 'alta' ? 3 : t.prioridad === 'normal' ? 2 : 1;
      return { tramite: t, accion, p, color: ESTADO_UI[t.estado]?.color, label: ESTADO_UI[t.estado]?.label };
    })
    .sort((a, b) => b.p - a.p);
  return {
    urgentes: pendientes.filter(x => x.tramite.prioridad === 'alta').length,
    pendientes: pendientes.length,
    enProceso: todos.filter(t => ['borrador', 'presentado', 'validacion', 'resolucion', 'firma', 'ejecucion', 'justificacion'].includes(t.estado)).length,
    items: pendientes,
  };
}
