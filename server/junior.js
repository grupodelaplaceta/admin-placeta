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
import { randomBytes, randomUUID, createHmac } from 'crypto';
import { supabase } from './supabase.js';

const RBU_DIARIO = 5;               // Pz diarios de la Renta Básica Universal
// La RBU sale de la cuenta propia de la Fundación, no de la cuenta general
// de Administración/Tributos.
const RBU_FUNDACION = 'FOUNDATION_RBU';
const CAPITALIA = 'CAPITALIA_BANK'; // Cuenta real que financia recompensas/IVA
const TUTOR_DEMO = '11111111D';

// Huella irreversible del DNI: permite comparar sin conservar el documento.
const huellaDni = (dni) => createHmac('sha256', process.env.DNI_HASH_SECRET || process.env.SESSION_SECRET || 'placeta-junior-dni-2026')
  .update(String(dni || '').trim().toUpperCase().replace(/\s+/g, ''))
  .digest('hex');

function edadEnFecha(fecha) {
  const valor = String(fecha || '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const es = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  if (!iso && !es) return null;
  const year = Number(iso ? iso[1] : es[3]);
  const month = Number(iso ? iso[2] : es[2]) - 1;
  const day = Number(iso ? iso[3] : es[1]);
  const nacimiento = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getUTCFullYear() - year;
  if (hoy.getUTCMonth() < month || (hoy.getUTCMonth() === month && hoy.getUTCDate() < day)) edad--;
  return edad;
}

  const cuentaDeJunior = (junior) =>
  junior?.cuenta_banco || `u-${String(junior?.dip || '').toLowerCase().replace(/-/g, '')}`;

export function juniorRouter({ getBankState, postBanco }) {
  const router = Router();

  // The bank owns the account and balance. Provisioning is deterministic and
  // idempotent, so it is safe to run on login, profile and every wallet read.
  async function asegurarCuentaJunior(junior) {
    if (!junior?.dip) return null;
    const id = cuentaDeJunior(junior);
    try {
      const state = await getBankState();
      const encontrada = (state?.accounts || []).find((a) => a.id === id || String(a.placetaId || '').toUpperCase() === String(junior.dip).toUpperCase());
      if (encontrada) return encontrada;
      const tutorAccount = (state?.accounts || []).find((a) =>
        String(a.placetaId || a.titularDip || a.dip || '').toUpperCase() === String(junior.tutor_dip || '').toUpperCase()
      );
      const creada = await postBanco('crear-cuenta-infantil', {
        juniorDip: junior.dip,
        juniorNombre: nombreCompleto(junior) || junior.dip,
        tutorDip: junior.tutor_dip || 'TUTOR-LEGAL',
        tutorAccountId: tutorAccount?.id || undefined,
        sendLimitPz: limitesEfectivos(await limitesParentales(junior.id)).gasto_diario,
      });
      if (supabase && creada?.accountId && !junior.cuenta_banco) {
        await supabase.from('junior_menores').update({ cuenta_banco: creada.accountId }).eq('id', junior.id);
      }
      return { id: creada?.accountId || id, type: 'Child', iban: creada?.iban || '', balancePz: 0, sendLimitPz: 50 };
    } catch (e) {
      // Do not hide the real failure from operations; callers can return a
      // clear bank error while legacy/demo installations keep working.
      return null;
    }
  }

  async function saldoCuentaJunior(junior) {
    const account = await asegurarCuentaJunior(junior);
    if (!account) return null;
    return { ...account, balancePz: Number(account.balancePz || 0) };
  }

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
    if (error) console.error('[junior] No se pudo leer junior_transacciones:', error.message);
    return error ? [] : (data || []);
  }

  async function actualizarSaldo(juniorId, saldo) {
    if (!supabase) return;
    await supabase.from('junior_menores').update({ placetas_saldo: saldo }).eq('id', juniorId);
  }

  async function crearTransaccion(tx) {
    if (!supabase) return { ok: false, error: 'Supabase no configurado' };
    let { error } = await supabase.from('junior_transacciones').insert(tx);
    // Algunas instalaciones antiguas no tienen la columna técnica `ip`.
    // El movimiento educativo sigue siendo válido sin ese campo, así que
    // reintentamos únicamente ante un error de esquema/cache.
    if (error && tx.ip && /column .* does not exist|schema cache/i.test(error.message || '')) {
      const compatible = { ...tx };
      delete compatible.ip;
      ({ error } = await supabase.from('junior_transacciones').insert(compatible));
    }
    if (error) {
      console.error('[junior] No se pudo guardar transacción:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
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
      if (estadoActivo(junior)) {
        await asegurarCuentaJunior(junior);
        return res.json({ success: true, junior: datosJunior(junior), dip_menor: dip, nombre_menor: nombreCompleto(junior), requiere_autorizacion_tutor: false });
      }
      if (!junior.tutor_dip) return res.status(409).json({ success: false, error: 'El perfil no tiene tutor vinculado. Completa el vínculo desde PlacetaID.' });
      const solicitud = await solicitarPlacetaId(junior.tutor_dip, dip, 'Placeta Junior - Acceso');
      if (!solicitud) return res.status(502).json({ success: false, error: 'No se pudo contactar con PlacetaID para pedir autorización al tutor.' });
      return res.json({ success: false, requiere_autorizacion_tutor: true, requestId: solicitud.requestId || solicitud.request_id, codigo: solicitud.codigo, dip_menor: dip, nombre_menor: nombreCompleto(junior), mensaje: 'El tutor debe autorizar la activación desde PlacetaID Móvil.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Cierra el segundo paso del login: PlacetaID autoriza la solicitud, pero
  // la cuenta Junior vive en Supabase y necesita reflejar ese consentimiento
  // antes de poder devolver una sesión activa.
  router.post('/activar', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ success: false, error: 'Supabase no configurado' });
      const dip = String(req.body?.dip || '').trim().toUpperCase();
      const requestId = String(req.body?.requestId || req.body?.request_id || '').trim();
      if (!dip || !requestId) return res.status(400).json({ success: false, error: 'DIP y requestId son obligatorios' });
      const junior = await buscarJunior(dip);
      if (!junior) return res.status(404).json({ success: false, error: 'Perfil no encontrado' });
      const base = process.env.PLACETAID_AUTH_URL || 'https://id.laplaceta.org';
      const comprobacion = await fetch(`${base}/api/mobil/poll/${encodeURIComponent(requestId)}`);
      const estado = await comprobacion.json().catch(() => ({}));
      const autorizado = comprobacion.ok && (
        estado.autorizado === true || estado.estado === 'authorized' ||
        (estado.ok === true && estado.estado === 'authorized')
      );
      if (!autorizado) return res.status(403).json({ success: false, error: 'La autorización del tutor aún no consta como aprobada' });
      const { data, error } = await supabase
        .from('junior_menores')
        .update({ estado: 'activo' })
        .eq('id', junior.id)
        .select('*')
        .single();
      if (error) return res.status(500).json({ success: false, error: error.message });
      await asegurarCuentaJunior(data);
      res.json({ success: true, junior: datosJunior(data) });
    } catch (e) { res.status(502).json({ success: false, error: e.message }); }
  });

  router.get('/perfil', async (req, res) => {
    const junior = await buscarJunior(resolverDip(req));
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
    const limites = await limitesParentales(junior.id);
    res.json({ success: true, junior: datosJunior(junior), limites_parentales: limitesEfectivos(limites) });
  });

  router.get('/tutor-info/:dip', async (req, res) => {
    const tutorDip = String(req.params.dip || '').trim().toUpperCase();
    const junior = await buscarJunior(req.params.dip);
    if (junior) return res.json({ success: true, tutor: { dip: junior.tutor_dip || '', nombre: junior.tutor_nombre || '', email: junior.tutor_email || junior.email || '', fecha_nacimiento: junior.fecha_nacimiento_tutor || '' } });

    // El tutor puede no tener todavía ningún menor: en ese caso la fuente de
    // verdad es PlacetaID, no `junior_menores`.
    try {
      const base = process.env.PLACETAID_AUTH_URL || 'https://id.laplaceta.org';
      const respuesta = await fetch(`${base}/api/mobil/status/${encodeURIComponent(tutorDip)}`);
      const body = await respuesta.json().catch(() => ({}));
      const r = body.registro || body.usuario || body;
      if (respuesta.ok && r && (r.dip || r.placeid || r.nombre || r.nombreCompleto)) {
        return res.json({ success: true, tutor: {
          dip: tutorDip,
          nombre: r.nombre || r.nombreCompleto || '',
          apellidos: r.apellidos || '',
          email: r.email || r.correo || r.emailContacto || '',
          fecha_nacimiento: r.fecha_nacimiento || r.fechaNacimiento || r.birthDate || '',
        } });
      }
    } catch { /* se intenta la copia local como respaldo */ }

    if (!supabase) return res.status(404).json({ error: 'Tutor no encontrado' });
      const { data, error } = await supabase.from('junior_menores').select('tutor_dni_hash,tutor_nombre').eq('tutor_dni_hash', huellaDni(tutorDip)).limit(1).maybeSingle();
    if (error || !data) return res.status(404).json({ error: 'Tutor no encontrado' });
    res.json({ success: true, tutor: { dip: '', nombre: data.tutor_nombre || '', email: '', fecha_nacimiento: '' } });
  });

  // Configuración pública que consume la app al iniciar. No contiene
  // secretos: solo límites funcionales del producto que también tienen
  // valores por defecto en el cliente para soportar una caída temporal.
  router.get('/config', (_req, res) => {
    res.json({
      success: true,
      rbu: { cantidad: 5 },
      control_parental: {
        niveles: {
          'PJ-N1': { diario: 0, semanal: 0, aprobacion_tutor: 0 },
          'PJ-N2': { diario: 10, semanal: 50, aprobacion_tutor: 5 },
          'PJ-N3': { diario: 25, semanal: 100, aprobacion_tutor: 10 },
          'PJ-N4': { diario: 50, semanal: 250, aprobacion_tutor: 50 },
          'PJ-N5': { diario: 100, semanal: 500, aprobacion_tutor: 100 },
        },
      },
      academia: { examen_umbral_preguntas: 10, aprobado_min: 70 },
      offline: { max_actividades: 10 },
    });
  });

  // Juniors vinculados al tutor. Esta ruta es pública de lectura porque la
  // app PlacetaID ya ha seleccionado la identidad del tutor; nunca devuelve
  // datos sensibles ni perfiles de otros tutores.
  router.get('/menores/:tutorDip', async (req, res) => {
    if (!supabase) return res.json([]);
    const tutorDip = String(req.params.tutorDip || '').trim().toUpperCase();
    if (!tutorDip) return res.status(400).json({ error: 'Tutor requerido' });
    let { data, error } = await supabase
      .from('junior_menores')
      // La tabla compartida no siempre tiene alias/cuenta_banco. Seleccionar
      // las columnas explícitas hacía que PostgREST devolviese 500 y PlacetaID
      // terminase mostrando una lista vacía.
      .select('*')
      .eq('tutor_dni_hash', huellaDni(tutorDip))
      .not('estado', 'in', '(revocado,bloqueado)')
      .order('creado_en', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    // Backfill every legacy Junior lazily, and provision future profiles on
    // their first tutor listing. One failed account must not hide the others.
    const enriquecidos = await Promise.all((data || []).map(async (j) => {
      const cuenta = await asegurarCuentaJunior(j);
      return { ...j, alias: j.alias || `${j.nombre || ''} ${j.apellidos || ''}`.trim() || j.dip, cuenta_banco: j.cuenta_banco || cuenta?.id || null };
    }));
    // Some old installations did not fill tutor_dni_hash. Include those
    // records as a backwards-compatible fallback for PlacetaID Mobile.
    if (!enriquecidos.length && tutorDip) {
      const fallback = await supabase.from('junior_menores').select('*').eq('tutor_dip', tutorDip).not('estado', 'in', '(revocado,bloqueado)').order('creado_en', { ascending: false });
      if (!fallback.error) {
        const rows = await Promise.all((fallback.data || []).map(async (j) => {
          const cuenta = await asegurarCuentaJunior(j);
          return { ...j, alias: j.alias || `${j.nombre || ''} ${j.apellidos || ''}`.trim() || j.dip, cuenta_banco: j.cuenta_banco || cuenta?.id || null };
        }));
        return res.json(rows);
      }
    }
    res.json(enriquecidos);
  });

  // Backfill operable from RCPA after deployment. It provisions every legacy
  // Junior in one pass and is protected separately from the public app API.
  router.post('/sincronizar-cuentas', async (req, res) => {
    const key = process.env.RCPA_UPDATE_KEY || '';
    if (!key || req.headers['x-rcpa-update-key'] !== key) return res.status(401).json({ error: 'No autorizado' });
    if (!supabase) return res.status(503).json({ error: 'Supabase no configurado' });
    const { data, error } = await supabase.from('junior_menores').select('*').not('estado', 'in', '(revocado,bloqueado)');
    if (error) return res.status(500).json({ error: error.message });
    const resultados = await Promise.all((data || []).map(async (j) => ({ dip: j.dip, cuenta: Boolean(await asegurarCuentaJunior(j)) })));
    res.json({ success: true, total: resultados.length, provisionadas: resultados.filter(r => r.cuenta).length, resultados });
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
      // `junior_actividades` se comparte con instalaciones que tienen un
      // esquema mínimo. Los campos de catálogo no son columnas garantizadas
      // (por ejemplo, `subvencionada`), así que se conservan en JSON para no
      // hacer fallar el alta cuando el esquema cacheado no los conoce.
      const contenidoConMetadatos = {
        ...contenido,
        edad_recomendada: String(b.edad_recomendada || '6-12'),
        dificultad: String(b.dificultad || 'media'),
        tiempo_estimado: Number(b.tiempo_estimado) || 10,
        precio_licencia: Math.max(0, Number(b.precio_licencia) || 0),
        precio_intento: Math.max(0, Number(b.precio_intento) || 0),
        recompensa: Math.max(0, Number(b.recompensa) || 0),
        subvencionada: b.subvencionada === true,
        num_preguntas: Number(b.num_preguntas) || 0,
        num_fases: Number(b.num_fases) || (Array.isArray(niveles) ? niveles.length : bloques.length),
      };
      const fila = {
        // La tabla no tiene valor por defecto en todas las instalaciones.
        // Generarlo aquí evita el error de NOT NULL al publicar desde DevAI.
        id: randomUUID(),
        // Estas son las columnas que usa el catálogo público y que existen en
        // el esquema actual. El resto vive dentro de `contenido`.
        titulo, descripcion,
        categoria: String(b.categoria || 'General'),
        tipo: String(b.tipo || 'otro'),
        contenido: contenidoConMetadatos,
        estado: 'en_revision',
        publica: false,
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
      const dniTutor = String(b.dni_tutor || '').trim().toUpperCase();
      const tutorDip = String(b.tutor_dip || '').trim().toUpperCase();
      const edadTutor = edadEnFecha(b.fecha_nacimiento_tutor);
      if (!nombre || !apellidos || !dniTutor) return res.status(400).json({ success: false, message: 'Nombre, apellidos y DNI del tutor son obligatorios' });
      if (edadTutor === null || edadTutor < 16) return res.status(400).json({ success: false, message: 'El tutor debe tener al menos 16 años' });
      if (process.env.NODE_ENV === 'production' && !process.env.DNI_HASH_SECRET) return res.status(503).json({ success: false, message: 'El servidor no tiene configurada la clave de protección del DNI' });
      // Este hash corresponde exclusivamente al DNI del adulto tutor.
      const tutorHash = huellaDni(dniTutor);
      const { data: existente } = await supabase.from('junior_menores').select('id,dip').eq('nombre', nombre).eq('apellidos', apellidos).eq('tutor_dni_hash', tutorHash).limit(1).maybeSingle();
      if (existente) return res.status(409).json({ success: false, message: 'Ya existe un registro Junior vinculado a ese tutor', dip: existente.dip });
      const dip = `JUNIOR-${randomBytes(4).toString('hex').toUpperCase()}`;
      const ahora = new Date().toISOString();
      const tutorNombre = `${b.nombre_tutor || ''} ${b.apellidos_tutor || ''}`.trim();
      const filaBase = { dip, nombre, apellidos, tutor_dni_hash: tutorHash, modalidad: 'estandar', estado: 'pendiente', creado_en: ahora };
      const filaCompleta = {
        ...filaBase,
        fecha_nacimiento: b.fecha_nacimiento || null,
        tutor_nombre: tutorNombre,
        tutor_dip: tutorDip || null,
        tutor_email: String(b.email || '').trim() || null,
        fecha_nacimiento_tutor: b.fecha_nacimiento_tutor || null,
        placetas_saldo: 0,
        nivel_academia: 1,
      };
      let { data, error } = await supabase.from('junior_menores').insert(filaCompleta).select('*').single();
      // Algunas instalaciones mantienen una tabla Junior mínima. PostgREST
      // rechaza toda la fila si una columna opcional no está en su cache.
      if (error && /column .* does not exist|schema cache/i.test(error.message || '')) {
        ({ data, error } = await supabase.from('junior_menores').insert(filaBase).select('*').single());
      }
      if (error) return res.status(500).json({ success: false, message: `No se pudo guardar el registro: ${error.message}` });
      await asegurarCuentaJunior(data);
      res.status(201).json({ success: true, dip: data.dip, junior_id: data.id, tutor_dip: data.tutor_dip || tutorDip || '', tutor_nombre: data.tutor_nombre || tutorNombre, necesita_firma_tutor: true, placetaid_codigo: null, message: tutorDip ? 'Registro creado. El tutor debe firmar los documentos para activarlo.' : 'Registro creado. El tutor debe completar su alta en PlacetaID y autorizarlo.' });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
  });

  // Instantánea legal inmutable: una actualización futura nunca modifica
  // el texto, versión ni fecha de una firma ya registrada.
  router.post('/legal/firmas', async (req, res) => {
    try {
      if (!supabase) return res.status(503).json({ success: false, error: 'Supabase no configurado' });
      const dip = String(req.body?.dip_menor || '').trim().toUpperCase();
      const documento = String(req.body?.documento_id || '').trim();
      const version = String(req.body?.version || '').trim();
      const texto = String(req.body?.texto || '');
      if (!dip || !documento || !version || !texto) return res.status(400).json({ success: false, error: 'Documento legal incompleto' });
      const junior = await buscarJunior(dip);
      if (!junior) return res.status(404).json({ success: false, error: 'Perfil Junior no encontrado' });
      const id = `PJ-FIRMA-${dip}-${documento}`;
      const fila = { id, dip_menor: dip, junior_id: junior.id, documento_id: documento, version, texto, tutor_nombre: String(req.body?.tutor_nombre || '').slice(0, 160), firmado_en: new Date().toISOString() };
      const { error } = await supabase.from('junior_documentos_firmados').upsert(fila, { onConflict: 'id', ignoreDuplicates: true });
      if (error) return res.status(500).json({ success: false, error: error.message });
      res.json({ success: true, id, version });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  MONEDERO — saldo real de la cuenta Child + límites + historial
  // ═══════════════════════════════════════════════════════════════════════
  router.get('/monedero', async (req, res) => {
    try {
      const junior = await buscarJunior(resolverDip(req));
      if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });

      const cuentaReal = await saldoCuentaJunior(junior);
      if (!cuentaReal && !String(junior.tutor_dip || '').includes('11111111D')) {
        return res.status(502).json({ error: 'No se pudo crear o localizar la cuenta Child real en Banco' });
      }

      const limites = await limitesParentales(junior.id);
      const efectivos = limitesEfectivos(limites);

      const filas = await historial(junior.id);
      const movimientosBanco = [];
      try {
        const estadoBanco = await getBankState();
        const idsCuenta = new Set([cuentaDeJunior(junior), cuentaReal?.id].filter(Boolean));
        (estadoBanco?.transactions || [])
          .filter((t) => idsCuenta.has(t.fromAccountId) || idsCuenta.has(t.toAccountId))
          .slice(0, 50)
          .forEach((t) => {
            const concepto = t.concept || t.note || 'Movimiento bancario';
            const cantidad = Number(t.amountPz || 0);
            // Las recompensas/canjes ya tienen un movimiento CRM asociado.
            // No duplicarlas al mezclar la fuente bancaria con la educativa.
            const yaRegistrado = filas.some((f) =>
              String(f.concepto || '').trim().toLowerCase() === String(concepto).trim().toLowerCase() &&
              Number(f.cantidad || 0) === cantidad
            );
            if (!yaRegistrado) movimientosBanco.push({
              id: `bank:${t.id || t.transactionId || `${t.createdAt || ''}:${cantidad}`}`,
              junior_id: junior.id,
              tipo: idsCuenta.has(t.toAccountId) ? 'ganar' : 'gastar',
              concepto, cantidad, saldo_resultante: null,
              creado_en: t.createdAt || new Date().toISOString(),
            });
          });
      } catch { /* historial bancario opcional */ }
      const historialCompleto = [...filas, ...movimientosBanco]
        .sort((a, b) => String(b.creado_en || '').localeCompare(String(a.creado_en || '')))
        .slice(0, 100);
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
        const real = (state?.accounts || []).find((a) => a.id === accountId || a.id === cuentaReal?.id);
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
        // Zero is a valid real balance; never fall back to the legacy mirror
        // when Banco says the account has exactly 0 Pz.
        saldo_actual: cuentaBanco.saldo_real ?? junior.placetas_saldo ?? 0,
        ingresos_totales: ingresos,
        gasto_hoy: gastoHoy,
        gasto_semana: gastoSemana,
        limites: efectivos,
        saldo_disponible_hoy: Math.max(0, efectivos.gasto_diario - gastoHoy),
        saldo_disponible_semana: Math.max(0, efectivos.gasto_semanal - gastoSemana),
        historial: historialCompleto,
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
      const [cuentaOrigen, cuentaDestino] = await Promise.all([
        asegurarCuentaJunior(junior), asegurarCuentaJunior(destino),
      ]);
      if ((!cuentaOrigen || !cuentaDestino) && junior.tutor_dip !== TUTOR_DEMO) {
        return res.status(502).json({ success: false, error: 'Una de las cuentas Child no está disponible en Banco' });
      }

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
      const cuentaOrigenId = cuentaOrigen?.id || cuentaDeJunior(junior);
      const cuentaDestinoId = cuentaDestino?.id || cuentaDeJunior(destino);

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
      const estadoDespues = await getBankState().catch(() => null);
      const nuevoOrigen = Number(estadoDespues?.accounts?.find(a => a.id === cuentaOrigenId)?.balancePz ?? Math.max(0, (junior.placetas_saldo || 0) - monto));
      const nuevoDestino = Number(estadoDespues?.accounts?.find(a => a.id === cuentaDestinoId)?.balancePz ?? ((destino.placetas_saldo || 0) + monto));
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

      const cuentaRbu = await asegurarCuentaJunior(junior);
      if (!cuentaRbu && !esDemo) return res.status(502).json({ success: false, error: 'No se pudo crear o localizar la cuenta Child del menor' });

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
            to: cuentaRbu?.id || cuentaDeJunior(junior),
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
      const cuenta = cuentaRbu || await saldoCuentaJunior(junior);
      if (!cuenta && !esDemo) return res.status(502).json({ success: false, error: 'No se pudo localizar la cuenta Child del menor' });
      const estadoDespues = esDemo ? null : await getBankState().catch(() => null);
      const nuevoSaldo = Number(estadoDespues?.accounts?.find(a => a.id === cuentaDeJunior(junior))?.balancePz ?? ((junior.placetas_saldo || 0) + RBU_DIARIO));
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

  // ── PROGRESO Y PUNTOS ───────────────────────────────────────────────
  // La app Android y la web comparten el mismo registro de resultados. Se
  // guardan como movimientos de puntos, sin crear saldos ficticios.
  router.get('/puntos/:dip', async (req, res) => {
    try {
      const junior = await buscarJunior(req.params.dip);
      if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
      const filas = await historial(junior.id, 500);
      const verdes = filas.filter(t => t.tipo === 'punto_verde').reduce((n, t) => n + Number(t.cantidad || 0), 0);
      const rojos = filas.filter(t => t.tipo === 'punto_rojo').reduce((n, t) => n + Number(t.cantidad || 0), 0);
      const canjesVerdes = filas.filter(t => t.tipo === 'canje_puntos' && String(t.concepto || '').toLowerCase().includes('verdes')).reduce((n, t) => n + Number(t.cantidad || 0), 0);
      const canjesRojos = filas.filter(t => t.tipo === 'canje_puntos' && String(t.concepto || '').toLowerCase().includes('rojos')).reduce((n, t) => n + Number(t.cantidad || 0), 0);
      const canjeado = canjesVerdes + canjesRojos;
      const disponiblesVerdes = Math.max(0, verdes - canjesVerdes);
      const disponiblesRojos = Math.max(0, rojos - canjesRojos);
      res.json({ success: true, puntos: {
        puntos_verdes: verdes, puntos_rojos: rojos, canjeado,
        puntos_verdes_disponibles: disponiblesVerdes, puntos_rojos_disponibles: disponiblesRojos
      }, tabla_canje: [{ puntos_verdes: 10, placetas: 1 }, { puntos_verdes: 50, placetas: 5 }], tabla_canje_rojos: [{ puntos_rojos: 10, placetas: 1 }, { puntos_rojos: 50, placetas: 5 }] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/actividades/:id/realizar', async (req, res) => {
    try {
      const junior = await buscarJunior(req.body?.dip);
      if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
      const respuestas = Array.isArray(req.body?.respuestas) ? req.body.respuestas : [];
      const verdes = respuestas.filter(r => r?.correcta === true).length;
      const rojos = respuestas.filter(r => r?.correcta === false).length;
      let actividadMeta = null;
      try { actividadMeta = (await supabase.from('junior_actividades').select('titulo,recompensa,es_reto_semanal,fecha_fin_reto,contenido').eq('id', req.params.id).maybeSingle()).data; } catch { /* opcional */ }
      const contenidoMeta = actividadMeta?.contenido || {};
      const esReto = actividadMeta?.es_reto_semanal === true || contenidoMeta.es_reto_semanal === true;
      const fechaFin = actividadMeta?.fecha_fin_reto || contenidoMeta.fecha_fin_reto || null;
      const retoCerrado = esReto && fechaFin && Date.parse(fechaFin) < Date.now();
      const resultadoId = String(req.body?.resultado_id || '').trim().slice(0, 160);
      if (resultadoId) {
        const previas = await historial(junior.id, 500);
        const marca = `resultado:${resultadoId}`;
        if (previas.some(t => String(t.concepto || '').includes(marca))) {
          return res.json({ success: true, duplicado: true, puntos_verdes: 0, puntos_rojos: 0, recompensa: 0, recompensa_max: 0, diploma: null });
        }
      }
      // La clasificación se congela al llegar la fecha límite. La actividad
      // sigue disponible y sus puntos educativos se conservan.
      if (esReto && !retoCerrado && supabase) {
        try { await supabase.from('junior_reto_intentos').insert({ actividad_id: req.params.id, junior_id: junior.id, puntos_verdes: verdes, puntos_rojos: rojos, tiempo_ms: Math.max(0, Number(req.body?.tiempo_ms) || 0), creado_en: new Date().toISOString() }); } catch { /* tabla opcional durante migración */ }
      }
      const unidadLabel = req.body?.unidad !== undefined ? ` · Unidad ${Number(req.body.unidad) + 1}` : '';
      const marcaResultado = resultadoId ? ` · resultado:${resultadoId}` : '';
      const puntos = [['punto_verde', verdes], ['punto_rojo', rojos]].filter(([, cantidad]) => cantidad).map(([tipo, cantidad]) => ({
        junior_id: junior.id, tipo, concepto: `Actividad ${req.params.id}${unidadLabel}${marcaResultado}`,
        cantidad, saldo_resultante: junior.placetas_saldo || 0, ip: ipDe(req)
      }));
      for (const tx of puntos) {
        const guardado = await crearTransaccion(tx);
        if (!guardado.ok) return res.status(503).json({ success: false, error: 'No se pudieron guardar los puntos. Inténtalo de nuevo.' });
      }
      // La recompensa es proporcional a los puntos verdes logrados frente al
      // máximo posible y queda limitada por la recompensa de la actividad.
      const recompensaMax = Math.max(0, Number(req.body?.recompensa_unidad || actividadMeta?.recompensa || actividadMeta?.contenido?.recompensa || 0));
      const maxPuntos = Math.max(0, Number(req.body?.puntos_maximos) || 0);
      const resultadoFinal = req.body?.resultado_final !== false;
      const proporcion = maxPuntos > 0 ? Math.min(1, verdes / maxPuntos) : 0;
      const recompensa = resultadoFinal ? Math.min(recompensaMax, Math.round(recompensaMax * proporcion)) : 0;
      if (recompensa > 0) {
        const esDemo = junior.tutor_dip === TUTOR_DEMO || (junior.dip || '').includes('DEMO');
        if (!esDemo) {
          const banco = await postBanco('transferir', { from: CAPITALIA, to: cuentaDeJunior(junior), cantidad: recompensa, iva: 0, concepto: `Recompensa actividad ${req.params.id}`, juniorDip: junior.dip, tutorDip: junior.tutor_dip });
          if (!banco?.success) return res.status(502).json({ error: banco?.error || 'El banco no confirmó la recompensa' });
        }
        const estadoDespues = esDemo ? null : await getBankState().catch(() => null);
        const saldoNuevo = Number(estadoDespues?.accounts?.find(a => a.id === cuentaDeJunior(junior))?.balancePz ?? ((junior.placetas_saldo || 0) + recompensa));
        await crearTransaccion({ junior_id: junior.id, tipo: 'recompensa_actividad', concepto: `Recompensa actividad ${req.params.id}${marcaResultado}`, cantidad: recompensa, saldo_resultante: saldoNuevo, ip: ipDe(req) });
      }
      // Los diplomas se generan únicamente al superar un examen sin errores.
      // Si la tabla aún no está disponible, el registro de puntos no falla.
      let diploma = null;
      if (supabase && rojos === 0 && verdes > 0) {
        try {
          const { data: actividad } = await supabase.from('junior_actividades').select('titulo,es_examen').eq('id', req.params.id).maybeSingle();
          if (actividad?.es_examen === true) {
            const idDiploma = `DIP-${String(junior.dip).toUpperCase()}-${req.params.id}`;
            const fila = {
              id: idDiploma,
              dip: junior.dip,
              nombre: nombreCompleto(junior),
              actividad: actividad.titulo || req.params.id,
              fecha: new Date().toISOString().slice(0, 10),
              juniorDip: junior.dip,
              juniorNombre: nombreCompleto(junior),
              actividadTitulo: actividad.titulo || req.params.id,
              creado_en: new Date().toISOString(),
            };
            const insertado = await supabase.from('junior_diplomas').upsert(fila, { onConflict: 'id' }).select('*').maybeSingle();
            if (!insertado.error) diploma = insertado.data || fila;
          }
        } catch { /* El diploma es adicional; nunca invalida la puntuación. */ }
      }
      res.json({ success: true, puntos_verdes: verdes, puntos_rojos: rojos, recompensa, recompensa_max: recompensaMax, diploma });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Ranking de retos: nunca devuelve menores ajenos; solo el propio perfil y
  // amistades aceptadas. El orden queda inmutable porque filtra por la fecha
  // de cierre del reto.
  router.get('/retos/:id/ranking', async (req, res) => {
    try {
      const yo = await buscarJunior(resolverDip(req));
      if (!yo || !supabase) return res.json({ success: true, ranking: [], cerrado: false });
      const { data: actividad } = await supabase.from('junior_actividades').select('fecha_fin_reto,contenido').eq('id', req.params.id).maybeSingle();
      const fin = actividad?.fecha_fin_reto || actividad?.contenido?.fecha_fin_reto || null;
      const query = supabase.from('junior_reto_intentos').select('junior_id,puntos_verdes,puntos_rojos,tiempo_ms,creado_en').eq('actividad_id', req.params.id);
      const { data: intentos } = fin ? await query.lte('creado_en', fin) : await query;
      const { data: amigos } = await supabase.from('junior_amigos').select('dip,dip_amigo').or(`dip.eq.${yo.dip},dip_amigo.eq.${yo.dip}`).eq('estado', 'aceptada');
      const dps = new Set([yo.dip, ...(amigos || []).flatMap(a => [a.dip, a.dip_amigo]).filter(Boolean)]);
      const perfilesPermitidos = await Promise.all([...dps].map(d => buscarJunior(d)));
      const idsPermitidos = new Set(perfilesPermitidos.filter(Boolean).map(p => p.id));
      const permitidos = (intentos || []).filter(i => idsPermitidos.has(i.junior_id));
      const ids = [...new Set(permitidos.map(i => i.junior_id))];
      const perfiles = perfilesPermitidos;
      const nombres = new Map(perfiles.filter(Boolean).map(p => [p.id, `${p.nombre || ''} ${p.apellidos || ''}`.trim()]));
      const ranking = permitidos.map(i => ({ nombre: nombres.get(i.junior_id) || 'Jugador', puntos_verdes: Number(i.puntos_verdes || 0), puntos_rojos: Number(i.puntos_rojos || 0), tiempo_medio_ms: Number(i.tiempo_ms || 0), es_propio: i.junior_id === yo.id })).sort((a,b) => b.puntos_verdes - a.puntos_verdes || a.puntos_rojos - b.puntos_rojos || a.tiempo_medio_ms - b.tiempo_medio_ms);
      res.json({ success: true, cerrado: !!(fin && Date.parse(fin) < Date.now()), fecha_fin: fin, ranking });
    } catch (e) { res.json({ success: true, ranking: [], cerrado: false }); }
  });

  router.post('/puntos/canjear', async (req, res) => {
    try {
      const junior = await buscarJunior(req.body?.dip);
      if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
      const rojos = req.body?.tipo === 'rojos';
      const puntos = Math.max(0, parseInt(rojos ? req.body?.puntos_rojos : req.body?.puntos_verdes, 10) || 0);
      const placetas = Math.floor(puntos / 10);
      if (!placetas) return res.status(400).json({ error: 'Necesitas al menos 10 puntos para canjearlos' });
      const filas = await historial(junior.id, 500);
      const etiquetaPuntos = rojos ? 'rojos' : 'verdes';
      const usados = filas.filter(t => t.tipo === 'canje_puntos' && String(t.concepto || '').toLowerCase().includes(etiquetaPuntos)).reduce((n, t) => n + Number(t.cantidad || 0), 0);
      const disponibles = (filas.filter(t => t.tipo === (rojos ? 'punto_rojo' : 'punto_verde')).reduce((n, t) => n + Number(t.cantidad || 0), 0) - usados);
      if (puntos > disponibles) return res.status(400).json({ error: 'No tienes suficientes puntos disponibles' });
      const banco = await postBanco('transferir', { from: CAPITALIA, to: cuentaDeJunior(junior), cantidad: placetas, iva: 0, concepto: `Canje de ${puntos} puntos — Placeta Junior`, juniorDip: junior.dip, tutorDip: junior.tutor_dip });
      if (!banco?.success) return res.status(502).json({ error: banco?.error || 'El banco no confirmó el abono' });
      const estadoDespues = await getBankState().catch(() => null);
      const saldo = Number(estadoDespues?.accounts?.find(a => a.id === cuentaDeJunior(junior))?.balancePz ?? junior.placetas_saldo ?? 0);
      await crearTransaccion({ junior_id: junior.id, tipo: 'canje_puntos', concepto: `Canje de ${puntos} puntos ${etiquetaPuntos}`, cantidad: puntos, saldo_resultante: saldo, ip: ipDe(req) });
      res.json({ success: true, placetas_obtenidas: placetas, saldo_actual: saldo });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  router.get('/amigos', async (req, res) => {
    try {
      const dip = String(resolverDip(req)).toUpperCase();
      if (!supabase || !dip) return res.json({ success: true, amigos: [] });
      const { data, error } = await supabase.from('junior_amigos').select('*').or(`dip.eq.${dip},dip_amigo.eq.${dip}`).eq('estado', 'aceptada');
      if (error) return res.json({ success: true, amigos: [] });
      const otros = (data || []).map(a => String(a.dip).toUpperCase() === dip ? a.dip_amigo : a.dip).filter(Boolean);
      const perfiles = await Promise.all(otros.map(d => buscarJunior(d)));
      res.json({ success: true, amigos: perfiles.filter(Boolean).map(p => ({ dip: p.dip, nombre: `${p.nombre || ''} ${p.apellidos || ''}`.trim(), placetas: p.placetas_saldo || 0 })) });
    } catch (e) { res.json({ success: true, amigos: [] }); }
  });

  router.post('/amigos/solicitar', async (req, res) => {
    try {
      const origen = await buscarJunior(req.body?.dip);
      const destino = await buscarJunior(req.body?.dip_amigo);
      if (!origen || !destino) return res.status(404).json({ success: false, error: 'Solo puedes añadir cuentas Junior existentes' });
      if (!supabase) return res.status(503).json({ success: false, error: 'Servicio de amistades no disponible' });
      const { error } = await supabase.from('junior_amigos').upsert({ dip: origen.dip, dip_amigo: destino.dip, estado: 'aceptada', creado_en: new Date().toISOString() }, { onConflict: 'dip,dip_amigo' });
      if (error) return res.status(503).json({ success: false, error: 'Servicio de amistades no disponible' });
      res.json({ success: true, mensaje: 'Amistad añadida.' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  return router;
}
