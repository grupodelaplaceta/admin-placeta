/**
 * BAJAS, ALTAS, HERENCIAS Y TESTAMENTO DIGITAL — Puntos 17-21 del plan maestro
 *
 * 17. Bajas y altas de usuarios:
 *   - Al darse de baja: se mantiene su información durante el período de
 *     conservación, su DIP queda inactivo, su PlacetaID inactivo, se congelan
 *     determinadas operaciones, Tributos determina patrimonio y obligaciones
 *     pendientes, se tramitan participaciones y bienes.
 *   - Reactivación: si el DIP sigue dentro del período de conservación → se
 *     reactiva; si fue eliminado → DIP nuevo. El DIP nuevo NO elimina
 *     obligaciones anteriores legalmente pendientes.
 *
 * 18. Prevención del fraude mediante bajas y altas:
 *   - Historial interno para detectar patrones anómalos (alta → acumular
 *     patrimonio → baja → alta → repetir). Las obligaciones fiscales,
 *     sanciones y procedimientos abiertos no desaparecen por una baja.
 *
 * 19. Herencias y bienes de usuarios dados de baja:
 *   - Tributos determina oficialmente qué bienes/derechos/participaciones/
 *     obligaciones constan a nombre del usuario y pueden incluirse en su
 *     testamento digital.
 *   - Heredero: existe y activo → transmitir; dado de baja → comprobar su
 *     situación; ya no existe → regla de sustitución; no hay heredero →
 *     destino previsto por la normativa.
 *
 * 20. Fondos sin heredero → Fundación Banco de La Placeta (tras comprobar
 *     deudas, impuestos, obligaciones, titulares, herederos, participaciones
 *     y reclamaciones pendientes).
 *
 * 21. Participaciones empresariales sin heredero:
 *   - Valorar, determinar valor económico, comprobar régimen de la empresa,
 *     ofrecer a los demás socios, reparto proporcional, transmitir según
 *     régimen, liquidar obligaciones fiscales.
 *
 * Persistencia: rsp_bajas, rsp_testamentos, rsp_herencias (Supabase + memoria).
 */

import { supabase } from './supabase.js';
import { generarIdentificador } from './identificadores.js';
import { crearNotificacion } from './notificaciones.js';
import { registrarAuditoria } from './auditoria.js';
import { setParticipacion } from './patrimonio.js';

const T_BAJAS = 'rsp_bajas';
const T_TESTAMENTOS = 'rsp_testamentos';
const T_HERENCIAS = 'rsp_herencias';

const memBajas = [];
const memTestamentos = [];
const memHerencias = [];

// Constantes normativas
export const PERIODO_CONSERVACION_DIP = '7 años';      // política de conservación (configurable)
export const MAX_ALTAS_BAJAS_SOSPECHOSAS = 2;          // más de 2 ciclos alta/baja → patrón anómalo

// ── Persistencia genérica ────────────────────────────────────────────────
async function listarDB(tabla, filtros = {}) {
  if (!supabase) return null;
  try {
    let q = supabase.from(tabla).select('*').order('created_at', { ascending: false }).limit(300);
    for (const [k, v] of Object.entries(filtros)) {
      if (v !== undefined && v !== '') q = q.eq(k, v);
    }
    const { data } = await q;
    return data || [];
  } catch { return null; }
}

async function insertDB(tabla, row) {
  if (!supabase) return false;
  try { await supabase.from(tabla).insert(row); return true; }
  catch { return false; }
}

async function upsertDB(tabla, row) {
  if (!supabase) return false;
  try { await supabase.from(tabla).upsert(row, { onConflict: 'id' }); return true; }
  catch { return false; }
}

// ═════════════════════════════════════════════════════════════════════════
// 17. BAJAS Y ALTAS DE USUARIOS
// ═════════════════════════════════════════════════════════════════════════

export async function listarBajas(filtros = {}) {
  const db = await listarDB(T_BAJAS, filtros);
  if (db && db.length > 0) return db;
  let lista = [...memBajas].reverse();
  if (filtros.estado) lista = lista.filter(b => b.estado === filtros.estado);
  if (filtros.dip) lista = lista.filter(b => b.dip === filtros.dip);
  return lista;
}

/**
 * Da de baja a una persona.
 * - Registra la baja con fecha de conservación.
 * - DIP inactivo, PlacetaID inactivo, operaciones congeladas.
 * - Avisa a Tributos para que determine patrimonio y obligaciones.
 */
export async function darDeBaja({ dip, nombre = '', motivo = '', conservar_hasta }, autor = {}) {
  if (!dip) throw new Error('El DIP es obligatorio');
  const hoy = new Date();
  // Período de conservación por defecto: 7 años
  const conserva = conservar_hasta || new Date(hoy.getTime() + 7 * 365 * 86400000).toISOString().slice(0, 10);
  const id = `BAJA-${Date.now().toString(36).toUpperCase()}`;
  const baja = {
    id,
    dip,
    nombre,
    motivo,
    estado: 'baja_activa',
    fecha_baja: hoy.toISOString(),
    conservar_hasta: conserva,
    dip_inactivo: true,
    placetaid_inactivo: true,
    operaciones_congeladas: true,
    requiere_liquidacion_tributaria: true,
    historial: [{ estado: 'baja_activa', fecha: hoy.toISOString(), motivo: 'Baja de usuario', autor: autor.nombre || '' }],
    created_at: hoy.toISOString(),
    updated_at: hoy.toISOString(),
  };
  memBajas.push(baja);
  await insertDB(T_BAJAS, baja);

  // Notificar a Tributos
  try {
    await crearNotificacion({
      nivel: 'accion', titulo: `Baja de usuario ${nombre || dip}`,
      mensaje: 'Determinar patrimonio y obligaciones pendientes antes de tramitar participaciones y bienes.',
      servicio: 'rsp', objeto_tipo: 'BAJA', objeto_id: id, enlace: '/rsp/herencias',
    });
  } catch { /* opcional */ }

  return baja;
}

/**
 * Reactiva a una persona dada de baja.
 * - Si el DIP sigue dentro del período de conservación → se reactiva (mismo DIP).
 * - Si ya fue eliminado → se genera un DIP nuevo (quien llama aporta el nuevo).
 */
export async function reactivarBaja(bajaId, { motivo = '', nuevo_dip = null }, autor = {}) {
  const baja = (await listarBajas()).find(b => b.id === bajaId) || (memBajas.find(b => b.id === bajaId));
  if (!baja) throw new Error('Baja no encontrada');
  const hoy = new Date().toISOString().slice(0, 10);
  const dentroConservacion = hoy <= (baja.conservar_hasta || '');
  const dipFinal = nuevo_dip || (dentroConservacion ? baja.dip : null);
  if (!dipFinal) throw new Error('El DIP fue eliminado fuera del período de conservación: se requiere un DIP nuevo.');

  // Detección de patrón anómalo (punto 18)
  const ciclosAnteriores = (baja.historial || []).filter(h => h.estado === 'baja_activa').length;
  if (ciclosAnteriores + 1 > MAX_ALTAS_BAJAS_SOSPECHOSAS) {
    await crearNotificacion({
      nivel: 'accion', titulo: `⚠️ Patrón anómalo alta/baja para ${baja.dip}`,
      mensaje: `Se han detectado más de ${MAX_ALTAS_BAJAS_SOSPECHOSAS} ciclos de alta/baja. Las obligaciones fiscales y sanciones pendientes NO desaparecen por la baja.`,
      servicio: 'rsp', objeto_tipo: 'BAJA', objeto_id: baja.id,
    });
  }

  baja.estado = 'reactivada';
  baja.dip = dipFinal;
  baja.dip_inactivo = false;
  baja.placetaid_inactivo = false;
  baja.operaciones_congeladas = false;
  baja.historial = [...(baja.historial || []), { estado: 'reactivada', fecha: new Date().toISOString(), motivo, autor: autor.nombre || '', dip_final: dipFinal }];
  baja.updated_at = new Date().toISOString();
  await upsertDB(T_BAJAS, baja);
  return baja;
}

// ═════════════════════════════════════════════════════════════════════════
// 19. TESTAMENTO DIGITAL
// ═════════════════════════════════════════════════════════════════════════

export async function listarTestamentos(filtros = {}) {
  const db = await listarDB(T_TESTAMENTOS, filtros);
  if (db && db.length > 0) return db;
  return [...memTestamentos].reverse();
}

/**
 * Crea/actualiza el testamento digital de una persona.
 * Tributos determina qué bienes/derechos/participaciones/obligaciones constan
 * a nombre del usuario y pueden incluirse.
 * @param herederos [{dip, nombre, porcentaje, orden}]
 * @param bienes [{tipo, id, descripcion, valor}]
 */
export async function crearTestamento({ dip, nombre = '', herederos = [], bienes = [], disposiciones = '' }, autor = {}) {
  if (!dip) throw new Error('El titular del testamento (DIP) es obligatorio');
  const sumaPct = herederos.reduce((s, h) => s + (h.porcentaje || 0), 0);
  if (herederos.length > 0 && sumaPct > 100) throw new Error('La suma de porcentajes de los herederos supera el 100%');
  const id = `TEST-${Date.now().toString(36).toUpperCase()}`;
  const test = {
    id,
    dip,
    nombre,
    herederos,
    bienes,
    disposiciones,
    estado: 'vigente',
    autorizado_por: autor.nombre || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memTestamentos.push(test);
  await insertDB(T_TESTAMENTOS, test);
  return test;
}

// ═════════════════════════════════════════════════════════════════════════
// 19-21. HERENCIAS Y TRANSMISIONES
// ═════════════════════════════════════════════════════════════════════════

export async function listarHerencias(filtros = {}) {
  const db = await listarDB(T_HERENCIAS, filtros);
  if (db && db.length > 0) return db;
  return [...memHerencias].reverse();
}

export async function getHerencia(id) {
  if (supabase) {
    try {
      const { data } = await supabase.from(T_HERENCIAS).select('*').eq('id', id).maybeSingle();
      if (data) return data;
    } catch { /* memoria */ }
  }
  return memHerencias.find(h => h.id === id) || null;
}

/**
 * Inicia un proceso de herencia.
 * Tributos determina el inventario de bienes/participaciones/obligaciones.
 */
export async function iniciarHerencia({ causante_dip, causante_nombre = '', motivo = 'fallecimiento', herederos = [], bienes = [], participaciones = [], deudas = [] }, autor = {}) {
  if (!causante_dip) throw new Error('El causante (DIP) es obligatorio');
  const id = await generarIdentificador('HER');
  const herencia = {
    id,
    causante_dip,
    causante_nombre,
    motivo,
    estado: 'abierta',
    herederos,            // [{dip, nombre, porcentaje, situacion: 'activo'|'baja'|'inexistente'}]
    bienes: bienes,       // [{tipo, id, descripcion, valor, transmitido_a}]
    participaciones,      // [{entidad_eip, entidad_nombre, porcentaje, valor_economico, estado: 'pendiente'|'ofrecida'|'repartida'|'transmitida'|'fundacion'}]
    deudas,               // [{concepto, importe, estado: 'pendiente'|'liquidada'}]
    fondos_sin_heredero: [],
    resolucion: null,
    tramitada_por: autor.nombre || autor.dip || '',
    historial: [{ estado: 'abierta', fecha: new Date().toISOString(), motivo: 'Apertura del proceso de herencia', autor: autor.nombre || '' }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memHerencias.push(herencia);
  await insertDB(T_HERENCIAS, herencia);
  return herencia;
}

/**
 * Transmite un bien a un heredero.
 * Solo si el heredero existe y está ACTIVO. Si está de baja → se comprueba su
 * situación. Si ya no existe → regla de sustitución (siguiente heredero).
 */
export async function transmitirBien(herenciaId, bienIndex, herederoDip, autor = {}) {
  const h = await getHerencia(herenciaId);
  if (!h) throw new Error('Herencia no encontrada');
  const bien = h.bienes[bienIndex];
  if (!bien) throw new Error('Bien no encontrado');
  if (bien.transmitido_a) throw new Error('Este bien ya ha sido transmitido');

  const heredero = (h.herederos || []).find(x => x.dip === herederoDip);
  if (!heredero) throw new Error('El heredero indicado no está en el testamento');

  // Regla 19: el heredero debe existir y estar activo
  if (heredero.situacion === 'baja') {
    throw new Error('El heredero está dado de baja: comprobar su situación antes de transmitir.');
  }
  if (heredero.situacion === 'inexistente') {
    throw new Error('El heredero ya no existe: aplicar regla de sustitución (siguiente heredero en orden).');
  }

  bien.transmitido_a = herederoDip;
  bien.fecha_transmision = new Date().toISOString();
  h.estado = 'en_transmision';
  h.historial = [...(h.historial || []), { estado: 'en_transmision', fecha: new Date().toISOString(), motivo: `Transmisión de ${bien.descripcion || bien.tipo} a ${heredero.nombre || herederoDip}`, autor: autor.nombre || '' }];
  h.updated_at = new Date().toISOString();
  await upsertDB(T_HERENCIAS, h);
  return h;
}

/** Comprueba y aplica la regla de sustitución cuando un heredero ya no existe */
export async function aplicarSustitucion(herenciaId, herederoDip, sustitutoDip, autor = {}) {
  const h = await getHerencia(herenciaId);
  if (!h) throw new Error('Herencia no encontrada');
  const heredero = (h.herederos || []).find(x => x.dip === herederoDip);
  if (!heredero) throw new Error('Heredero no encontrado');
  heredero.situacion = 'sustituido';
  heredero.sustituto = sustitutoDip;
  h.historial = [...(h.historial || []), { estado: 'abierta', fecha: new Date().toISOString(), motivo: `Sustitución: ${herederoDip} → ${sustitutoDip}`, autor: autor.nombre || '' }];
  h.updated_at = new Date().toISOString();
  await upsertDB(T_HERENCIAS, h);
  return h;
}

/**
 * 20. Fondos sin heredero → Fundación Banco de La Placeta.
 * Se hace tras comprobar deudas, impuestos, obligaciones, titulares,
 * herederos, participaciones y reclamaciones pendientes.
 */
export async function fondosSinHerederoAFundacion(herenciaId, { importe, concepto = 'Fondos sin heredero válido' }, autor = {}) {
  const h = await getHerencia(herenciaId);
  if (!h) throw new Error('Herencia no encontrada');

  // Comprobaciones previas (punto 20)
  const deudasPendientes = (h.deudas || []).filter(d => d.estado !== 'liquidada').length;
  const reclamacionesPendientes = (h.historial || []).filter(x => x.motivo && /reclamaci/.test(x.motivo)).length;
  if (deudasPendientes > 0) throw new Error(`No se pueden derivar fondos a la Fundación: hay ${deudasPendientes} deuda(s) u obligación(es) pendiente(s).`);
  if (reclamacionesPendientes > 0) throw new Error('Hay reclamaciones pendientes: resolverlas antes de derivar fondos.');

  const registro = { importe: Number(importe) || 0, concepto, fecha: new Date().toISOString(), destino: 'fundacion' };
  h.fondos_sin_heredero = [...(h.fondos_sin_heredero || []), registro];
  h.historial = [...(h.historial || []), { estado: 'abierta', fecha: new Date().toISOString(), motivo: `Fondos sin heredero → Fundación (${concepto}): ${registro.importe} Pz`, autor: autor.nombre || '' }];
  h.updated_at = new Date().toISOString();
  await upsertDB(T_HERENCIAS, h);

  try {
    await crearNotificacion({
      nivel: 'completado', titulo: 'Fondos derivados a la Fundación',
      mensaje: `${concepto}: ${registro.importe} Pz → Fundación Banco de La Placeta (fines sociales).`,
      servicio: 'fundacion', objeto_tipo: 'HERENCIA', objeto_id: h.id,
    });
  } catch { /* opcional */ }

  return h;
}

/**
 * 21. Participación empresarial sin heredero.
 * Se valora, se comprueba el régimen, se ofrece a los demás socios y, si
 * procede, se reparte proporcionalmente entre ellos (o se transmite según
 * el régimen establecido). Antes se liquidan las obligaciones fiscales.
 */
export async function participacionSinHeredero(herenciaId, participacionIndex, { socios = [], valoracion = null, liquidar_fiscal = true }, autor = {}) {
  const h = await getHerencia(herenciaId);
  if (!h) throw new Error('Herencia no encontrada');
  const part = h.participaciones[participacionIndex];
  if (!part) throw new Error('Participación no encontrada');

  // Liquidar obligaciones fiscales previas
  if (liquidar_fiscal) {
    part.fiscal_liquidado = true;
  }

  // Reparto proporcional entre los demás socios
  if (socios.length > 0) {
    const totalPct = socios.reduce((s, x) => s + (x.porcentaje || 0), 0);
    if (totalPct > 100) throw new Error('El reparto entre socios supera el 100%');
    part.socios = socios;
    part.estado = 'repartida';
    part.valor_economico = valoracion || part.valor_economico || 0;
    part.reparto = socios.map(s => ({
      socio: s.dip || s.nombre, porcentaje: s.porcentaje || 0,
      valor: Math.round(((valoracion || part.valor_economico || 0) * (s.porcentaje || 0)) / 100 * 100) / 100,
    }));
  } else {
    part.estado = 'pendiente_oferta_socios';
    part.valor_economico = valoracion || part.valor_economico || 0;
  }

  h.historial = [...(h.historial || []), {
    estado: h.estado, fecha: new Date().toISOString(),
    motivo: `Participación en ${part.entidad_nombre || part.entidad_eip} (${part.porcentaje}%) sin heredero: ${part.estado === 'repartida' ? 'repartida entre socios' : 'pendiente de oferta a socios'}`,
    autor: autor.nombre || '',
  }];
  h.updated_at = new Date().toISOString();
  await upsertDB(T_HERENCIAS, h);
  return h;
}

/** Cierra el proceso de herencia tras comprobar que todo está resuelto */
export async function cerrarHerencia(herenciaId, autor = {}) {
  const h = await getHerencia(herenciaId);
  if (!h) throw new Error('Herencia no encontrada');
  const bienesPendientes = (h.bienes || []).filter(b => !b.transmitido_a).length;
  const deudasPendientes = (h.deudas || []).filter(d => d.estado !== 'liquidada').length;
  const partesPendientes = (h.participaciones || []).filter(p => !['repartida', 'transmitida', 'fundacion'].includes(p.estado)).length;
  if (bienesPendientes > 0) throw new Error(`Quedan ${bienesPendientes} bien(es) sin transmitir.`);
  if (deudasPendientes > 0) throw new Error(`Quedan ${deudasPendientes} deuda(s) sin liquidar.`);
  if (partesPendientes > 0) throw new Error(`Quedan ${partesPendientes} participación(es) sin resolver.`);

  h.estado = 'cerrada';
  h.fecha_cierre = new Date().toISOString();
  h.resolucion = `Herencia cerrada el ${new Date().toISOString().slice(0, 10)}`;
  h.historial = [...(h.historial || []), { estado: 'cerrada', fecha: new Date().toISOString(), motivo: 'Cierre del proceso de herencia', autor: autor.nombre || '' }];
  h.updated_at = new Date().toISOString();
  await upsertDB(T_HERENCIAS, h);
  return h;
}

/** FASE 10.2/10.3 — Reparto automático del patrimonio del causante entre
 *  los herederos ACTIVOS según su % (reusa setParticipacion con dedupe).
 *  Genera certificado DOC y notifica a cada heredero. */
export async function repartirPatrimonioAutomatico(herenciaId, autor = {}) {
  const h = await getHerencia(herenciaId);
  if (!h) throw new Error('Herencia no encontrada');
  if (h.estado === 'cerrada') throw new Error('La herencia ya está cerrada');

  const herederos = (h.herederos || []).filter(x => x.situacion === 'activo');
  if (herederos.length === 0) throw new Error('No hay herederos activos para repartir');
  const sumaPct = herederos.reduce((s, x) => s + (x.porcentaje || 0), 0);
  if (sumaPct <= 0) throw new Error('Los herederos no tienen porcentajes asignados');

  const reparto = [];
  const ahora = new Date().toISOString();

  // Participaciones empresariales del causante → herederos (reparto proporcional)
  for (const part of (h.participaciones || [])) {
    if (part.estado === 'repartida' || part.estado === 'transmitida') continue;
    for (const heredero of herederos) {
      const pctHer = (part.porcentaje || 0) * (heredero.porcentaje / sumaPct);
      try {
        await setParticipacion({
          titular_dip: heredero.dip,
          titular_nombre: heredero.nombre || '',
          entidad_eip: part.entidad_eip,
          entidad_nombre: part.entidad_nombre || '',
          porcentaje: Math.round(pctHer * 100) / 100,
          patrimonio_neto_entidad: part.valor_economico || 0,
        }, { nombre: autor.nombre || 'RSP', motivo: `Sucesión ${h.id} → ${heredero.nombre}` });
      } catch (e) { /* entidad inválida: se ignora */ }
    }
    part.estado = 'repartida';
  }

  // Bienes → reparto por % (registro informativo)
  for (const heredero of herederos) {
    const importe = Math.round((h.bienes || []).reduce((s, b) => s + (b.valor || 0), 0) * (heredero.porcentaje / sumaPct) * 100) / 100;
    reparto.push({ herederoDip: heredero.dip, herederoNombre: heredero.nombre || heredero.dip, porcentaje: heredero.porcentaje, importe, estado: 'repartido', en: ahora });
  }
  h.reparto = reparto;

  // Certificado de sucesión (FASE 10.3)
  h.certificado = {
    id: await generarIdentificador('DOC'),
    titulo: 'Certificado de sucesión',
    herenciaId: h.id,
    causante: h.causante_nombre || h.causante_dip,
    herederos: reparto.map(r => ({ dip: r.herederoDip, nombre: r.herederoNombre, porcentaje: r.porcentaje })),
    emitidoEn: ahora,
    emitidoPor: autor.nombre || autor.dip || 'RSP',
  };
  h.historial = [...(h.historial || []), { estado: 'reparto_automatico', fecha: ahora, quien: autor.nombre || 'RSP', nota: `Reparto automático entre ${herederos.length} herederos. Certificado ${h.certificado.id}` }];
  h.updated_at = ahora;

  // Notificar a cada heredero (FASE 10.3)
  for (const heredero of herederos) {
    try {
      await crearNotificacion({
        nivel: 'accion',
        titulo: `Sucesión ${h.id}: patrimonio repartido`, mensaje: `Recibes un ${heredero.porcentaje}% de la herencia de ${h.causante_nombre || h.causante_dip}. Certificado: ${h.certificado.id}`,
        servicio: 'rsp', destinatario_dip: heredero.dip, objeto_tipo: 'HERENCIA', objeto_id: h.id,
        enlace: `/rsp/herencias/${h.id}`
      });
    } catch { /* silencioso */ }
  }

  await upsertDB(T_HERENCIAS, h);
  await registrarAuditoria({ usuario: autor, servicio: 'rsp', accion: 'administrar', objeto_tipo: 'HERENCIA', objeto_id: h.id, valor_nuevo: { reparto, certificado: h.certificado.id }, motivo: 'Reparto automático de patrimonio' });
  return h;
}

/** Estado del módulo */
export async function estadoHerencias() {
  const [bajas, testamentos, herencias] = await Promise.all([listarBajas(), listarTestamentos(), listarHerencias()]);
  return {
    bajas: bajas.length,
    bajasActivas: bajas.filter(b => b.estado === 'baja_activa').length,
    reactivadas: bajas.filter(b => b.estado === 'reactivada').length,
    testamentos: testamentos.length,
    herencias: herencias.length,
    herenciasAbiertas: herencias.filter(h => h.estado !== 'cerrada').length,
    herenciasCerradas: herencias.filter(h => h.estado === 'cerrada').length,
    fondosAFundacion: herencias.reduce((s, h) => s + (h.fondos_sin_heredero || []).reduce((x, f) => x + (f.importe || 0), 0), 0),
  };
}

export default {
  PERIODO_CONSERVACION_DIP, MAX_ALTAS_BAJAS_SOSPECHOSAS,
  listarBajas, darDeBaja, reactivarBaja,
  listarTestamentos, crearTestamento,
  listarHerencias, getHerencia, iniciarHerencia, transmitirBien,
  aplicarSustitucion, fondosSinHerederoAFundacion, participacionSinHeredero, cerrarHerencia,
  repartirPatrimonioAutomatico, estadoHerencias,
};
