/* ═══════════════════════════════════════════════════════════════════════
   Placeta Junior — API bancaria PÚBLICA (la consume la app Android).

   Las cuentas del monedero son las cuentas Child REALES del Banco de La
   Placeta. El menor actúa sobre su dinero según el límite de envío
   (sendLimitPz) que tiene asignado su cuenta.

   Fuentes de datos:
   - Banco: `getBankState()` (lectura) y `postBanco(action, data)` (mutación)
   - Supabase: junior_menores, junior_control_parental, junior_transacciones

   Rutas (montadas bajo /api/junior):
     GET  /monedero?dip=X
     POST /academy/transferir   { dip, dip_destino, cantidad, concepto }
     GET  /academy/rbu?dip=X
   ═══════════════════════════════════════════════════════════════════════ */
import { Router } from 'express';
import { randomBytes } from 'crypto';
import { supabase } from './supabase.js';

const RBU_DIARIO = 5;               // Pz diarios de la Renta Básica Universal
const RBU_FUNDACION = 'AGLDP';      // Fundación del Banco de La Placeta
const TUTOR_DEMO = '11111111D';

const cuentaDeJunior = (junior) =>
  junior?.cuenta_banco || `u-${String(junior?.dip || '').toLowerCase().replace(/-/g, '')}`;

export function juniorRouter({ getBankState, postBanco }) {
  const router = Router();

  // ── Acceso a Supabase (junior) ────────────────────────────────────────
  async function buscarJunior(dip) {
    if (!supabase || !dip) return null;
    const { data, error } = await supabase
      .from('junior_menores')
      .select('*')
      .eq('dip', String(dip).trim().toUpperCase())
      .maybeSingle();
    if (error) return null;
    return data;
  }

  async function limitesParentales(juniorId) {
    if (!supabase || !juniorId) return null;
    const { data, error } = await supabase
      .from('junior_control_parental')
      .select('*')
      .eq('junior_id', juniorId)
      .maybeSingle();
    if (error) return null;
    return data;
  }

  function parseCategorias(v) {
    try { return typeof v === 'string' ? JSON.parse(v || '[]') : (v || []); }
    catch { return []; }
  }

  function limitesEfectivos(limites) {
    if (limites) {
      return {
        gasto_diario: Number(limites.limite_gasto_diario ?? limites.gasto_diario) || 10,
        gasto_semanal: Number(limites.limite_gasto_semanal ?? limites.gasto_semanal) || 50,
        limite_aprobacion_tutor: Number(limites.limite_aprobacion_tutor) || 1000,
        tiempo_uso: Number(limites.tiempo_uso_diario_minutos ?? limites.tiempo_uso_diario) || 60,
        requiere_aprobacion: limites.requiere_aprobacion_extra !== false,
        categorias_bloqueadas: parseCategorias(limites.categorias_bloqueadas),
      };
    }
    return {
      gasto_diario: 10, gasto_semanal: 50, limite_aprobacion_tutor: 1000,
      tiempo_uso: 60, requiere_aprobacion: true, categorias_bloqueadas: [],
    };
  }

  async function historial(juniorId, limit = 30) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('junior_transacciones')
      .select('*')
      .eq('junior_id', juniorId)
      .order('creado_en', { ascending: false })
      .limit(limit);
    return error ? [] : (data || []);
  }

  async function actualizarSaldo(juniorId, saldo) {
    if (!supabase) return;
    await supabase.from('junior_menores').update({ placetas_saldo: saldo }).eq('id', juniorId);
  }

  async function crearTransaccion(tx) {
    if (!supabase) return;
    await supabase.from('junior_transacciones').insert(tx);
  }

  const resolverDip = (req) =>
    String(req.query.dip || req.body?.dip || req.headers['x-junior-dip'] || '').trim();

  const ipDe = (req) =>
    (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  const estadoActivo = (junior) => ['activo', 'active', 'aprobado', 'approved'].includes(String(junior?.estado || '').toLowerCase());
  const nombreCompleto = (junior) => `${junior?.nombre || ''} ${junior?.apellidos || ''}`.trim();
  const datosJunior = (junior) => ({
    id: junior.id, solicitante_id: junior.solicitante_id || junior.id,
    dip: junior.dip, nombre: junior.nombre || '', apellidos: junior.apellidos || '',
    alias: junior.alias || '', edad: junior.edad ?? null, modalidad: junior.modalidad || 'estandar',
    placetas_saldo: junior.placetas_saldo ?? 0, nivel_academia: junior.nivel_academia || 1,
    estado: junior.estado || 'activo', tutor_dip: junior.tutor_dip || '', tutor_nombre: junior.tutor_nombre || '',
  });
  async function solicitarPlacetaId(dipTutor, dipMenor, servicio) {
    const base = process.env.PLACETAID_AUTH_URL || 'https://id.laplaceta.org';
    try {
      const r = await fetch(`${base}/api/mobil/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dip: dipTutor, servicio, servicioUrl: `placeta-junior://auth?dip=${encodeURIComponent(dipMenor)}`, plataforma: 'android', dip_menor: dipMenor }) });
      const body = await r.json().catch(() => ({}));
      return r.ok && body.ok !== false ? body : null;
    } catch { return null; }
  }

  // El contenido se trata como datos, nunca como HTML ejecutable. Para los
  // esquemas se conserva únicamente la gramática declarativa soportada por
  // los dos reproductores.
  function sanearContenido(contenido) {
    const c = contenido && typeof contenido === 'object' ? { ...contenido } : { version: 2, bloques: [] };
    const sanearBloque = (b) => {
      if (!b || typeof b !== 'object') return null;
      if (b.tipo !== 'esquema') return b;
      const s = b.esquema && typeof b.esquema === 'object' ? b.esquema : b;
      const tipos = new Set(['texto', 'rectangulo', 'circulo', 'linea']);
      const elementos = Array.isArray(s.elementos) ? s.elementos.slice(0, 100).filter(e => e && tipos.has(e.tipo)).map(e => {
        const out = { tipo: e.tipo, x: Number(e.x) || 0, y: Number(e.y) || 0, ancho: Number(e.ancho) || 100, alto: Number(e.alto) || 50, color: /^#[0-9a-f]{6}$/i.test(String(e.color || '')) ? e.color : '#6d28d9' };
        if (e.tipo === 'texto') { out.texto = String(e.texto || '').slice(0, 500); out.tamano = Math.min(64, Math.max(10, Number(e.tamano) || 20)); out.negrita = e.negrita === true; }
        if (e.tipo === 'circulo') out.radio = Math.min(500, Math.max(1, Number(e.radio) || 20));
        if (e.tipo === 'linea') { out.x2 = Number(e.x2) || 0; out.y2 = Number(e.y2) || 0; out.grosor = Math.min(20, Math.max(1, Number(e.grosor) || 2)); }
        if (e.aria_label) out.aria_label = String(e.aria_label).slice(0, 200);
        if (e.accion?.tipo === 'popup') out.accion = { tipo: 'popup', titulo: String(e.accion.titulo || 'Información').slice(0, 120), contenido: String(e.accion.contenido || '').slice(0, 1000) };
        return out;
      }) : [];
      return { ...b, esquema: { ancho: Math.min(1200, Math.max(100, Number(s.ancho) || 800)), alto: Math.min(900, Math.max(80, Number(s.alto) || 450)), elementos } };
    };
    if (Array.isArray(c.bloques)) c.bloques = c.bloques.map(sanearBloque).filter(Boolean);
    if (Array.isArray(c.niveles)) c.niveles = c.niveles.map(n => ({ ...n, bloques: Array.isArray(n.bloques) ? n.bloques.map(sanearBloque).filter(Boolean) : [] }));
    return c;
  }

  // Contrato de identidad consumido por Placeta Junior App. Se mantienen
  // tolerancias para registros antiguos con estado aprobado/active.
  router.post('/login', async (req, res) => {
    try {
      const dip = String(req.body?.dip || '').trim().toUpperCase();
      if (!dip) return res.status(400).json({ success: false, error: 'DIP requerido' });
      const junior = await buscarJunior(dip);
      if (!junior) return res.status(404).json({ success: false, error: 'No existe un perfil Junior con ese DIP' });
      if (['bloqueado', 'suspendido', 'revocado'].includes(String(junior.estado || '').toLowerCase())) {
        return res.status(403).json({ success: false, error: 'La cuenta Junior está bloqueada. El tutor debe contactar con soporte.' });
      }
      // Las cuentas ya activadas no deben volver a pasar por el alta ni por
      // una autorización nueva: ese era el motivo del fallo de reentrada.
      if (estadoActivo(junior)) return res.json({ success: true, junior: datosJunior(junior), dip_menor: dip, nombre_menor: nombreCompleto(junior), requiere_autorizacion_tutor: false });
      if (!junior.tutor_dip) return res.status(409).json({ success: false, error: 'El perfil no tiene tutor vinculado. Completa el vínculo desde PlacetaID.' });
      const solicitud = await solicitarPlacetaId(junior.tutor_dip, dip, 'Placeta Junior - Acceso');
      if (!solicitud) return res.status(502).json({ success: false, error: 'No se pudo contactar con PlacetaID para pedir autorización al tutor.' });
      return res.json({ success: false, requiere_autorizacion_tutor: true, requestId: solicitud.requestId || solicitud.request_id, codigo: solicitud.codigo, dip_menor: dip, nombre_menor: nombreCompleto(junior), mensaje: 'El tutor debe autorizar la activación desde PlacetaID Móvil.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.get('/perfil', async (req, res) => {
    const junior = await buscarJunior(resolverDip(req));
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
    const limites = await limitesParentales(junior.id);
    res.json({ success: true, junior: datosJunior(junior), limites_parentales: limitesEfectivos(limites) });
  });

  router.get('/tutor-info/:dip', async (req, res) => {
    const junior = await buscarJunior(req.params.dip);
    if (junior) return res.json({ success: true, tutor: { dip: junior.tutor_dip || '', nombre: junior.tutor_nombre || '' } });
    if (!supabase) return res.status(404).json({ error: 'Tutor no encontrado' });
    const { data, error } = await supabase.from('junior_menores').select('tutor_dip,tutor_nombre').eq('tutor_dip', String(req.params.dip).trim().toUpperCase()).limit(1).maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Tutor no encontrado' });
    res.json({ success: true, tutor: { dip: data.tutor_dip, nombre: data.tutor_nombre || '' } });
  });

  // Juniors vinculados al tutor. Esta ruta es pública de lectura porque la
  // app PlacetaID ya ha seleccionado la identidad del tutor; nunca devuelve
  // datos sensibles ni perfiles de otros tutores.
  router.get('/menores/:tutorDip', async (req, res) => {
    if (!supabase) return res.json([]);
    const tutorDip = String(req.params.tutorDip || '').trim().toUpperCase();
    if (!tutorDip) return res.status(400).json({ error: 'Tutor requerido' });
    const { data, error } = await supabase
      .from('junior_menores')
      .select('id,dip,alias,tutor_dip,cuenta_banco,nombre,apellidos,creado_en,estado')
      .eq('tutor_dip', tutorDip)
      .not('estado', 'in', '(revocado,bloqueado)')
      .order('creado_en', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  // Guarda los límites que modifica el tutor en PlacetaID.
  router.post('/control-parental', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const b = req.body || {};
      const dipTutor = String(b.dip_tutor || '').trim().toUpperCase();
      const dipMenor = String(b.dip_menor || '').trim().toUpperCase();
      const junior = await buscarJunior(dipMenor);
      if (!junior || String(junior.tutor_dip || '').toUpperCase() !== dipTutor) {
        return res.status(403).json({ error: 'El menor no está vinculado a este tutor' });
      }
      const fila = {
        junior_id: junior.id,
        limite_gasto_diario: Math.max(0, Number(b.limite_gasto_diario) || 10),
        limite_gasto_semanal: Math.max(0, Number(b.limite_gasto_semanal) || 50),
        limite_aprobacion_tutor: Math.max(0, Number(b.limite_aprobacion_tutor) || 1000),
        tiempo_uso_diario_minutos: Math.max(0, Number(b.tiempo_uso_diario ?? b.tiempo_uso) || 60),
        actualizado_en: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('junior_control_parental')
        .upsert(fila, { onConflict: 'junior_id' }).select('*').single();
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true, limites: limitesEfectivos(data) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // DevAI es una herramienta pública: permite enviar actividades sin crear
  // una cuenta. Todo envío queda en revisión y no se publica directamente.
  router.post('/actividades', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
      const b = req.body || {};
      const titulo = String(b.titulo || '').trim();
      const descripcion = String(b.descripcion || '').trim();
      const contenido = sanearContenido(b.contenido);
      if (!titulo || !descripcion) return res.status(400).json({ error: 'Título y descripción son obligatorios' });
      const bloques = Array.isArray(contenido.bloques) ? contenido.bloques : [];
      const niveles = contenido.niveles || contenido.diapositivas;
      if (!bloques.length && !Array.isArray(niveles)) return res.status(400).json({ error: 'La actividad debe tener bloques o diapositivas' });
      const fila = {
        titulo, descripcion,
        categoria: String(b.categoria || 'General'),
        tipo: String(b.tipo || 'otro'),
        edad_recomendada: String(b.edad_recomendada || '6-12'),
        dificultad: String(b.dificultad || 'media'),
        tiempo_estimado: Number(b.tiempo_estimado) || 10,
        precio_licencia: Math.max(0, Number(b.precio_licencia) || 0),
        precio_intento: Math.max(0, Number(b.precio_intento) || 0),
        recompensa: Math.max(0, Number(b.recompensa) || 0),
        subvencionada: b.subvencionada === true,
        num_preguntas: Number(b.num_preguntas) || 0,
        num_fases: Number(b.num_fases) || (Array.isArray(niveles) ? niveles.length : bloques.length),
        contenido,
        estado: 'en_revision',
        publica: false,
        tipo_titular: 'anonimo',
        autor_nombre: 'DevAI · envío anónimo',
        creado_en: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('junior_actividades').insert(fila).select('id,titulo,estado').single();
      if (error) return res.status(500).json({ error: error.message });
      res.status(201).json({ success: true, actividad: data, mensaje: 'Enviada a revisión del Filtro de Placeta Junior.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/register', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ success: false, message: 'Supabase no configurado' });
      const b = req.body || {};
      const nombre = String(b.nombre || '').trim();
      const apellidos = String(b.apellidos || '').trim();
      const tutorDip = String(b.dni_tutor || '').trim().toUpperCase();
      if (!nombre || !apellidos || !tutorDip) return res.status(400).json({ success: false, message: 'Nombre, apellidos y DIP/DNI del tutor son obligatorios' });
      const { data: existente } = await supabase.from('junior_menores').select('id,dip').eq('nombre', nombre).eq('apellidos', apellidos).eq('tutor_dip', tutorDip).limit(1).maybeSingle();
      if (existente) return res.status(409).json({ success: false, message: 'Ya existe un registro Junior vinculado a ese tutor', dip: existente.dip });
      const dip = `JUNIOR-${randomBytes(4).toString('hex').toUpperCase()}`;
      const fila = { dip, nombre, apellidos, fecha_nacimiento: b.fecha_nacimiento || null, tutor_dip: tutorDip, tutor_nombre: `${b.nombre_tutor || ''} ${b.apellidos_tutor || ''}`.trim(), estado: 'pendiente', placetas_saldo: 0, nivel_academia: 1, creado_en: new Date().toISOString() };
      const { data, error } = await supabase.from('junior_menores').insert(fila).select('*').single();
      if (error) return res.status(500).json({ success: false, message: `No se pudo guardar el registro: ${error.message}` });
      res.status(201).json({ success: true, dip: data.dip, junior_id: data.id, tutor_dip: data.tutor_dip, tutor_nombre: data.tutor_nombre, necesita_firma_tutor: true, placetaid_codigo: null, message: 'Registro creado. El tutor debe autorizarlo desde PlacetaID.' });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  MONEDERO — saldo real de la cuenta Child + límites + historial
  // ═══════════════════════════════════════════════════════════════════════
  router.get('/monedero', async (req, res) => {
    try {
      const junior = await buscarJunior(resolverDip(req));
      if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });

      const limites = await limitesParentales(junior.id);
      const efectivos = limitesEfectivos(limites);

      const filas = await historial(junior.id);
      const hoy = new Date().toISOString().slice(0, 10);
      const inicioSemana = new Date();
      inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
      const semStr = inicioSemana.toISOString().slice(0, 10);

      const gastoHoy = filas
        .filter((t) => t.tipo === 'gastar' && (t.creado_en || '').slice(0, 10) === hoy)
        .reduce((s, t) => s + (t.cantidad || 0), 0);
      const gastoSemana = filas
        .filter((t) => t.tipo === 'gastar' && (t.creado_en || '') >= semStr)
        .reduce((s, t) => s + (t.cantidad || 0), 0);
      const ingresos = filas
        .filter((t) => ['ganar', 'bonus', 'rbu', 'ingreso'].includes(t.tipo))
        .reduce((s, t) => s + (t.cantidad || 0), 0);

      const titular = `${junior.nombre || ''} ${junior.apellidos || ''}`.trim() || 'Menor';
      const accountId = cuentaDeJunior(junior);
      let cuentaBanco = {
        id: accountId,
        tipo: 'Child',
        iban: '',
        sendLimitPz: efectivos.gasto_diario,
        saldo_real: 0,
        titular,
        cotitular: junior.tutor_nombre || 'Tutor legal',
        tutorDip: junior.tutor_dip || '',
        tutorNombre: junior.tutor_nombre || '',
      };

      // Leer la cuenta Child REAL del banco (MongoDB vía crm-state)
      try {
        const state = await getBankState();
        const real = (state?.accounts || []).find((a) => a.id === accountId);
        if (real) {
          cuentaBanco = {
            id: real.id || accountId,
            tipo: real.type || 'Child',
            iban: real.iban || '',
            sendLimitPz: real.sendLimitPz || efectivos.gasto_diario,
            saldo_real: real.balancePz || 0,
            titular,
            cotitular: junior.tutor_nombre || 'Tutor legal',
            tutorDip: junior.tutor_dip || '',
            tutorNombre: junior.tutor_nombre || '',
          };
          // El límite de envío de la cuenta Child es el límite diario efectivo.
          if (Number(real.sendLimitPz) > 0) efectivos.gasto_diario = Number(real.sendLimitPz);
        }
      } catch { /* banco offline: se usan límites parentales como respaldo */ }

      res.json({
        saldo_actual: cuentaBanco.saldo_real || junior.placetas_saldo || 0,
        ingresos_totales: ingresos,
        gasto_hoy: gastoHoy,
        gasto_semana: gastoSemana,
        limites: efectivos,
        saldo_disponible_hoy: Math.max(0, efectivos.gasto_diario - gastoHoy),
        saldo_disponible_semana: Math.max(0, efectivos.gasto_semanal - gastoSemana),
        historial: filas,
        nivel_academia: junior.nivel_academia || 1,
        nombre_menor: titular,
        tutor_nombre: junior.tutor_nombre || '',
        cuenta_bancaria: cuentaBanco,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  TRANSFERENCIA ENTRE JUNIORS — cuenta Child → cuenta Child
  //  Respeta el límite de envío (sendLimitPz) de la cuenta del emisor.
  // ═══════════════════════════════════════════════════════════════════════
  router.post('/academy/transferir', async (req, res) => {
    try {
      const junior = await buscarJunior(resolverDip(req));
      if (!junior) return res.status(404).json({ success: false, error: 'Perfil no encontrado' });

      const { dip_destino, cantidad, concepto } = req.body || {};
      const monto = parseInt(cantidad, 10);
      if (!dip_destino || !Number.isFinite(monto) || monto <= 0) {
        return res.status(400).json({ success: false, error: 'Destino y cantidad positiva requeridos' });
      }
      if (String(dip_destino).trim().toUpperCase() === String(junior.dip).toUpperCase()) {
        return res.status(400).json({ success: false, error: 'No puedes enviarte placetas a ti mismo' });
      }

      const destino = await buscarJunior(dip_destino);
      if (!destino) return res.status(404).json({ success: false, error: 'Destinatario no encontrado' });

      const limites = limitesEfectivos(await limitesParentales(junior.id));
      const filas = await historial(junior.id);
      const hoy = new Date().toISOString().slice(0, 10);
      const inicioSemana = new Date();
      inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
      const semana = inicioSemana.toISOString().slice(0, 10);
      const gastoHoy = filas.filter(t => ['gastar', 'transferencia'].includes(t.tipo) && String(t.creado_en || '').slice(0, 10) === hoy).reduce((s, t) => s + Number(t.cantidad || 0), 0);
      const gastoSemana = filas.filter(t => ['gastar', 'transferencia'].includes(t.tipo) && String(t.creado_en || '') >= semana).reduce((s, t) => s + Number(t.cantidad || 0), 0);

      const esDemo = junior.tutor_dip === TUTOR_DEMO ||
        (junior.dip || '').includes('DEMO') || (dip_destino || '').includes('DEMO');
      if (!esDemo && gastoHoy + monto > limites.gasto_diario) return res.status(403).json({ success: false, error: `Límite diario excedido (${limites.gasto_diario} Pz)`, necesita_autorizacion_tutor: true });
      if (!esDemo && gastoSemana + monto > limites.gasto_semanal) return res.status(403).json({ success: false, error: `Límite semanal excedido (${limites.gasto_semanal} Pz)`, necesita_autorizacion_tutor: true });
      const cuentaOrigenId = cuentaDeJunior(junior);
      const cuentaDestinoId = cuentaDeJunior(destino);

      let sendLimitPz = null;
      let saldoReal = null;
      try {
        const state = await getBankState();
        const real = (state?.accounts || []).find((a) => a.id === cuentaOrigenId);
        if (real) {
          sendLimitPz = Number(real.sendLimitPz) || null;
          saldoReal = Number(real.balancePz) || 0;
        }
      } catch { /* banco offline */ }

      if (!esDemo && sendLimitPz && monto > sendLimitPz) {
        return res.status(403).json({
          success: false,
          error: `Tu cuenta infantil tiene un límite de envío de ${sendLimitPz} Pz. Para enviar más pide autorización a tu tutor.`,
          necesita_autorizacion_tutor: true,
          send_limit_pz: sendLimitPz,
        });
      }

      const saldoActual = saldoReal != null ? saldoReal : (junior.placetas_saldo || 0);
      if (!esDemo && saldoActual < monto) {
        return res.status(400).json({
          success: false,
          error: `No tienes suficientes placetas. Tienes ${saldoActual}, intentas enviar ${monto}.`,
        });
      }

      if (!esDemo) {
        const r = await postBanco('transferir', {
          from: cuentaOrigenId,
          to: cuentaDestinoId,
          cantidad: monto,
          concepto: concepto || 'Transferencia Placeta Junior',
          juniorDip: junior.dip,
          tutorDip: junior.tutor_dip,
        });
        if (!r?.success) {
          return res.status(400).json({ success: false, error: r?.error || 'El banco rechazó la transferencia' });
        }
      }

      const ip = ipDe(req);
      const nuevoOrigen = Math.max(0, (junior.placetas_saldo || 0) - monto);
      const nuevoDestino = (destino.placetas_saldo || 0) + monto;
      await actualizarSaldo(junior.id, nuevoOrigen);
      await actualizarSaldo(destino.id, nuevoDestino);
      await crearTransaccion({
        junior_id: junior.id, tipo: 'transferencia',
        concepto: concepto || `Enviado a ${destino.nombre}`,
        cantidad: monto, saldo_resultante: nuevoOrigen, ip,
      });
      await crearTransaccion({
        junior_id: destino.id, tipo: 'ganar',
        concepto: concepto || `Recibido de ${junior.nombre}`,
        cantidad: monto, saldo_resultante: nuevoDestino, ip,
      });

      res.json({
        success: true,
        mensaje: `Transferencia de ${monto} Pz a ${destino.nombre} realizada.`,
        saldo_actual: nuevoOrigen,
        es_demo: esDemo,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  RBU — Renta Básica Universal Junior (5 Pz diarios, de la Fundación)
  // ═══════════════════════════════════════════════════════════════════════
  router.get('/academy/rbu', async (req, res) => {
    try {
      const junior = await buscarJunior(resolverDip(req));
      if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
      if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });

      const esDemo = junior.tutor_dip === TUTOR_DEMO || (junior.dip || '').includes('DEMO');
      const hoy = new Date().toISOString().slice(0, 10);

      const { data: yaReclamado } = await supabase
        .from('junior_transacciones')
        .select('id')
        .eq('junior_id', junior.id)
        .eq('tipo', 'rbu')
        .gte('creado_en', hoy)
        .limit(1);
      if (yaReclamado && yaReclamado.length) {
        return res.json({ success: false, message: 'Ya has reclamado tu RBU hoy. ¡Vuelve mañana! 🌅' });
      }

      let streak = 1;
      for (let d = 1; d < 7; d++) {
        const fecha = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
        const { data: dia } = await supabase
          .from('junior_transacciones')
          .select('id')
          .eq('junior_id', junior.id)
          .eq('tipo', 'rbu')
          .gte('creado_en', fecha)
          .lt('creado_en', fecha + 'T23:59:59')
          .limit(1);
        if (dia && dia.length) streak++;
        else break;
      }

      if (!esDemo) {
        try {
          const banco = await postBanco('transferir', {
            from: RBU_FUNDACION,
            to: cuentaDeJunior(junior),
            cantidad: RBU_DIARIO,
            concepto: `RBU día ${streak} — Placeta Junior`,
            juniorDip: junior.dip,
            tutorDip: junior.tutor_dip,
          });
          if (!banco?.success) return res.status(502).json({ success: false, error: banco?.error || 'El banco no confirmó la RBU' });
        } catch (e) {
          return res.status(502).json({ success: false, error: `No se pudo abonar la RBU: ${e.message}` });
        }
      }

      const ip = ipDe(req);
      const nuevoSaldo = (junior.placetas_saldo || 0) + RBU_DIARIO;
      await actualizarSaldo(junior.id, nuevoSaldo);
      await crearTransaccion({
        junior_id: junior.id, tipo: 'rbu',
        concepto: `RBU día ${streak}${esDemo ? ' (Demo)' : ''}`,
        cantidad: RBU_DIARIO, saldo_resultante: nuevoSaldo, ip,
      });

      res.json({
        success: true,
        cantidad: RBU_DIARIO,
        streak,
        nuevo_saldo: nuevoSaldo,
        message: `¡RBU reclamada! +${RBU_DIARIO} Pz. Día ${streak} de racha semanal.`,
        es_demo: esDemo,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
