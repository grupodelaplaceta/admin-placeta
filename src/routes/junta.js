import { Router } from 'express';
import { sbListSolicitantes, apiPlacetaidRegistros, apiPlacetaidStats } from '../config/db.js';
import { verificarPermiso } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCIA SUPABASE — Reuniones
// ═══════════════════════════════════════════════════════════════════════════

async function persistirReunion(r) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('rsp_reuniones').upsert({
      id: r.id, titulo: r.titulo, fecha: r.fecha, hora: r.hora,
      hora_fin: r.horaFin, lugar: r.lugar, convocante: r.convocante,
      tipo_reunion: r.tipoReunion, estado: r.estado,
      orden_del_dia: JSON.stringify(r.ordenDelDia || []),
      asistentes: JSON.stringify(r.asistentes || []),
      votaciones: JSON.stringify(r.votaciones || []),
      acta: r.acta ? JSON.stringify(r.acta) : null,
      fecha_firma: r.fechaFirma, hash_acta: r.hashActa,
      firma_presidente: r.firmaPresidente, firma_secretario: r.firmaSecretario,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error && error.code === '42P01') {
      console.warn('[Junta] Tabla rsp_reuniones no existe, creando...');
      try {
        await supabase.rpc('exec_sql', {
          sql: `CREATE TABLE IF NOT EXISTS rsp_reuniones (
            id TEXT PRIMARY KEY, titulo TEXT NOT NULL, fecha TEXT, hora TEXT,
            hora_fin TEXT, lugar TEXT, convocante TEXT, tipo_reunion TEXT DEFAULT 'Ordinaria',
            estado TEXT DEFAULT 'Planificada', orden_del_dia JSONB DEFAULT '[]',
            asistentes JSONB DEFAULT '[]', votaciones JSONB DEFAULT '[]',
            acta JSONB, fecha_firma TEXT, hash_acta TEXT,
            firma_presidente TEXT, firma_secretario TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
          );`
        });
      } catch (_) {}
    } else if (error) {
      console.warn('[Junta] Error persistir reunion:', error.message);
    }
  } catch (e) { console.warn('[Junta] Error persistir reunion:', e.message); }
}

async function cargarReunionesDesdeSupabase() {
  if (!supabase || memReuniones.size > 0) return;
  try {
    const { data } = await supabase.from('rsp_reuniones').select('*').order('fecha', { ascending: false });
    if (data) {
      data.forEach(r => {
        memReuniones.set(r.id, {
          id: r.id, titulo: r.titulo, fecha: r.fecha, hora: r.hora,
          horaFin: r.hora_fin, lugar: r.lugar, convocante: r.convocante,
          tipoReunion: r.tipo_reunion, estado: r.estado,
          ordenDelDia: typeof r.orden_del_dia === 'string' ? JSON.parse(r.orden_del_dia) : (r.orden_del_dia || []),
          asistentes: typeof r.asistentes === 'string' ? JSON.parse(r.asistentes) : (r.asistentes || []),
          votaciones: typeof r.votaciones === 'string' ? JSON.parse(r.votaciones) : (r.votaciones || []),
          acta: r.acta ? (typeof r.acta === 'string' ? JSON.parse(r.acta) : r.acta) : null,
          fechaFirma: r.fecha_firma, hashActa: r.hash_acta,
          firmaPresidente: r.firma_presidente, firmaSecretario: r.firma_secretario
        });
        const num = parseInt(r.id.slice(-3), 10);
        if (num > reunIdCounter) reunIdCounter = num;
      });
    }
  } catch (e) { console.warn('[Junta] Error cargar reuniones:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCIA SUPABASE — Reclamaciones
// ═══════════════════════════════════════════════════════════════════════════

async function persistirReclamacion(r) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('rsp_reclamaciones').upsert({
      id: r.id, ciudadano: r.ciudadano, asunto: r.asunto,
      descripcion: r.descripcion, prioridad: r.prioridad,
      estado: r.estado, fecha: r.fecha, asignado_a: r.asignadoA,
      respuestas: JSON.stringify(r.respuestas || []),
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error && error.code === '42P01') {
      try { await supabase.rpc('exec_sql', { sql: `CREATE TABLE IF NOT EXISTS rsp_reclamaciones (
        id TEXT PRIMARY KEY, ciudadano TEXT, asunto TEXT NOT NULL,
        descripcion TEXT, prioridad TEXT DEFAULT 'normal', estado TEXT DEFAULT 'abierta',
        fecha TEXT, asignado_a TEXT, respuestas JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );`}); } catch (_) {}
    } else if (error) { console.warn('[Junta] Error persistir reclamacion:', error.message); }
  } catch (e) { console.warn('[Junta] Error persistir reclamacion:', e.message); }
}

async function cargarReclamacionesDesdeSupabase() {
  if (!supabase || memReclamaciones.size > 0) return;
  try {
    const { data } = await supabase.from('rsp_reclamaciones').select('*').order('fecha', { ascending: false });
    if (data) {
      data.forEach(r => {
        memReclamaciones.set(r.id, {
          id: r.id, ciudadano: r.ciudadano, asunto: r.asunto,
          descripcion: r.descripcion, prioridad: r.prioridad,
          estado: r.estado, fecha: r.fecha, asignadoA: r.asignado_a,
          respuestas: typeof r.respuestas === 'string' ? JSON.parse(r.respuestas) : (r.respuestas || [])
        });
        const num = parseInt(r.id.slice(-3), 10);
        if (num > reclIdCounter) reclIdCounter = num;
      });
    }
  } catch (e) { console.warn('[Junta] Error cargar reclamaciones:', e.message); }
}

// ── Dashboard Junta ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const ciudadanos = await sbListSolicitantes({ limit: 100 });
  const placetaidStats = await apiPlacetaidStats();

  res.render('junta/dashboard', {
    titulo: 'Junta de La Placeta',
    entidad_actual: 'junta',
    totalCiudadanos: ciudadanos.length,
    placetaidStats,
    esPresidente: req.session.roles?.includes('presidente'),
    esVicepresidente: req.session.roles?.includes('vicepresidente'),
    esSecretario: req.session.roles?.includes('secretario')
  });
});

// ── Gestión de Ciudadanos ──────────────────────────────────────────────────
router.get('/ciudadanos', verificarPermiso('junta', 'gestion_ciudadanos'), async (req, res) => {
  const ciudadanos = await sbListSolicitantes();
  res.render('junta/ciudadanos', {
    titulo: 'Gestión de Ciudadanos',
    entidad_actual: 'junta',
    ciudadanos, total: ciudadanos.length
  });
});

// ── Gestión de PlacetaID ───────────────────────────────────────────────────
router.get('/placetaid', verificarPermiso('junta', 'gestion_placetaid'), async (req, res) => {
  const raw = await apiPlacetaidRegistros();
  // Normalizar campos de PLID26 (Español/MongoDB) a nombres consistentes
  const registros = (raw || []).map(r => ({
    dip: r.dip,
    nombre: r.nombre || r.displayName || '',
    apellidos: r.apellidos || '',
    email: r.correo || r.email || '',
    totpVerificado: r.totpVerified === true,
    bloqueado: r.bloqueado === true || r.banned === true,
    activo: r.activo !== false,
    rol: r.rol || 'ciudadano',
    tipo: r.tipo || '',
    createdAt: r.creadoEn || r.createdAt || '',
    fechaNacimiento: r.fechaNacimiento || '',
    placeid: r.placeid || '',
    intentosFallidos: r.intentosFallidos || 0
  }));
  res.render('junta/placetaid', {
    titulo: 'Gestión de PlacetaID',
    entidad_actual: 'junta',
    registros, total: registros.length
  });
});

// ── Gestión de Reclamaciones (con datos en memoria) ────────────────────────
const memReclamaciones = new Map();
let reclIdCounter = 0;

// Inicializar con ejemplos
(function initRecl() {
  if (memReclamaciones.size > 0) return;
  const ej = [
    { id: 'REC-001', ciudadano: 'Juan Pérez', asunto: 'Error en cálculo de tributos', descripcion: 'Discrepancia en el IRM del último periodo. El IA aplicado no corresponde con mis movimientos.', prioridad: 'Alta', estado: 'Abierta', fecha: '2026-07-10', asignadoA: '—', respuestas: [] },
    { id: 'REC-002', ciudadano: 'María López', asunto: 'Solicitud de revisión de multa', descripcion: 'Multa por exceso de capital aplicada incorrectamente. Mi saldo nunca superó el límite.', prioridad: 'Media', estado: 'En tramite', fecha: '2026-07-08', asignadoA: 'Admin Tributos', respuestas: [{ autor: 'Admin', texto: 'Caso en revisión por el departamento de cumplimiento.', fecha: '2026-07-09' }] },
  ];
  ej.forEach(e => { memReclamaciones.set(e.id, e); reclIdCounter = Math.max(reclIdCounter, parseInt(e.id.slice(-3))); setTimeout(() => persistirReclamacion(e), 100); });
})();

router.get('/reclamaciones', verificarPermiso('junta', 'gestion_reclamaciones'), (req, res) => {
  res.render('junta/reclamaciones', {
    titulo: 'Gestión de Reclamaciones',
    entidad_actual: 'junta',
    reclamaciones: [...memReclamaciones.values()].sort((a,b) => (b.fecha||'').localeCompare(a.fecha||''))
  });
});

// API endpoints for reclamaciones
router.get('/api/reclamaciones', verificarPermiso('junta', 'gestion_reclamaciones'), (req, res) => {
  res.json([...memReclamaciones.values()]);
});

router.post('/api/reclamaciones', verificarPermiso('junta', 'gestion_reclamaciones'), async (req, res) => {
  const { ciudadano, asunto, descripcion, prioridad, asignadoA } = req.body;
  const id = 'REC-' + String(++reclIdCounter).padStart(3, '0');
  const recl = { id, ciudadano: ciudadano || 'Anónimo', asunto, descripcion, prioridad: prioridad || 'Media', estado: 'Abierta', fecha: new Date().toISOString().slice(0,10), asignadoA: asignadoA || '—', respuestas: [] };
  memReclamaciones.set(id, recl);
  await persistirReclamacion(recl);
  res.json({ success: true, reclamacion: recl });
});

// ═════════════════════════════════════════════════════════════════════════
// REUNIONES — Almacenamiento en memoria + API
// ═════════════════════════════════════════════════════════════════════════
const memReuniones = new Map();
let reunIdCounter = 0;

// Inicializar con ejemplos
(function initReun() {
  if (memReuniones.size > 0) return;
  const hoy = new Date();
  const ej = [
    { id: 'REU-001', titulo: 'Consejo de Gobierno — Julio 2026', fecha: '2026-07-10', hora: '18:00', horaFin: '20:30', lugar: 'Sala Virtual GDLP', convocante: 'Presidencia', tipoReunion: 'Ordinaria', estado: 'Acta_Firmada', ordenDelDia: ['Aprobación acta anterior', 'Revisión presupuestos Q3', 'Nuevas medidas tributarias', 'Ruegos y preguntas'], asistentes: [{nombre:'Presidencia', presente:true}, {nombre:'Vicepresidencia', presente:true}, {nombre:'Secretaría', presente:true}, {nombre:'Admin Tributos', presente:true}, {nombre:'Dir. Comunicación', presente:false}], votaciones: [{id:'VOT-001', titulo:'Aprobación Presupuestos 2026', grupo:'Junta', quorum:60, aFavor:4, enContra:1, abstenciones:0, cerrada:true, resultado:'Aprobada'}], acta: {horaInicio:'18:05', horaFin:'20:15', desarrollo:'Sesión ordinaria del Consejo de Gobierno...', puntosTratados:[{titulo:'Aprobación acta anterior', descripcion:'Se aprueba por unanimidad', acuerdo:'Acta anterior aprobada'}], proximosPasos:'Próxima reunión en agosto'}, fechaFirma: '2026-07-11', hashActa: 'a1b2c3d4e5f6' },
    { id: 'REU-002', titulo: 'Comité de Tributos', fecha: '2026-07-05', hora: '16:00', horaFin: '18:00', lugar: 'Sala 3', convocante: 'Admin Tributos', tipoReunion: 'Comité', estado: 'Acta_Pendiente', ordenDelDia: ['Revisión recaudación mensual', 'Nuevos contribuyentes', 'Incidencias'], asistentes: [{nombre:'Admin Tributos', presente:true}, {nombre:'Inspector Fiscal', presente:true}], votaciones: [], acta: {horaInicio:'16:10', horaFin:'17:50', desarrollo:'Reunión del comité...', puntosTratados:[], proximosPasos:'Emitir informe'} },
    { id: 'REU-003', titulo: 'Plenario Ciudadano', fecha: '2026-07-20', hora: '19:00', horaFin: '21:00', lugar: 'Auditorio Virtual', convocante: 'Presidencia', tipoReunion: 'Plenario', estado: 'Planificada', ordenDelDia: ['Elección nuevos cargos', 'Propuesta reforma estatutos', 'Turno abierto de palabra'], asistentes: [{nombre:'Presidencia', presente:false}, {nombre:'Vicepresidencia', presente:false}], votaciones: [] },
  ];
  ej.forEach(e => { memReuniones.set(e.id, e); reunIdCounter = Math.max(reunIdCounter, parseInt(e.id.slice(-3))); });
  // Persistir ejemplos a Supabase
  setTimeout(() => ej.forEach(e => persistirReunion(e)), 100);
})();

router.get('/reuniones', verificarPermiso('junta', 'gestion_reuniones'), async (req, res) => {
  await cargarReunionesDesdeSupabase();
  res.render('junta/reuniones', {
    titulo: 'Gestión de Reuniones y Actas',
    entidad_actual: 'junta',
    reuniones: [...memReuniones.values()].sort((a,b) => (b.fecha||'').localeCompare(a.fecha||''))
  });
});

// API: Listar reuniones
router.get('/api/reuniones', verificarPermiso('junta', 'gestion_reuniones'), async (req, res) => {
  await cargarReunionesDesdeSupabase();
  res.json([...memReuniones.values()].sort((a,b) => (b.fecha||'').localeCompare(a.fecha||'')));
});

// API: Crear reunión
router.post('/api/reuniones', verificarPermiso('junta', 'gestion_reuniones'), async (req, res) => {
  const { titulo, fecha, hora, horaFin, lugar, tipoReunion, ordenDelDia, asistentes } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título requerido' });
  const id = 'REU-' + String(++reunIdCounter).padStart(3, '0');
  const reunion = {
    id, titulo, fecha: fecha || new Date().toISOString().slice(0,10), hora: hora || '—', horaFin: horaFin || '—',
    lugar: lugar || '—', convocante: req.session.usuario?.nombre || 'Admin',
    tipoReunion: tipoReunion || 'Ordinaria', estado: 'Planificada', ordenDelDia: ordenDelDia || [],
    asistentes: asistentes || [], votaciones: [], acta: null, created_at: new Date().toISOString()
  };
  memReuniones.set(id, reunion);
  await persistirReunion(reunion);
  res.json({ success: true, reunion });
});

// API: Obtener reunión
router.get('/api/reuniones/:id', verificarPermiso('junta', 'gestion_reuniones'), async (req, res) => {
  let r = memReuniones.get(req.params.id);
  if (!r && supabase) {
    const { data } = await supabase.from('rsp_reuniones').select('*').eq('id', req.params.id).single();
    if (data) { r = data; memReuniones.set(req.params.id, data); }
  }
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  res.json(r);
});

// API: Actualizar reunión (datos generales o asistentes)
router.put('/api/reuniones/:id', verificarPermiso('junta', 'gestion_reuniones'), async (req, res) => {
  let r = memReuniones.get(req.params.id);
  if (!r && supabase) {
    const { data } = await supabase.from('rsp_reuniones').select('*').eq('id', req.params.id).single();
    if (data) { r = data; memReuniones.set(req.params.id, data); }
  }
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  const { titulo, fecha, hora, horaFin, lugar, tipoReunion, ordenDelDia, asistentes } = req.body;
  if (titulo !== undefined) r.titulo = titulo;
  if (fecha !== undefined) r.fecha = fecha;
  if (hora !== undefined) r.hora = hora;
  if (horaFin !== undefined) r.horaFin = horaFin;
  if (lugar !== undefined) r.lugar = lugar;
  if (tipoReunion !== undefined) r.tipoReunion = tipoReunion;
  if (ordenDelDia !== undefined) r.ordenDelDia = ordenDelDia;
  if (asistentes !== undefined) r.asistentes = asistentes;
  await persistirReunion(r);
  res.json({ success: true, reunion: r });
});

// API: Guardar acta (pasa a Acta_Pendiente)
router.put('/api/reuniones/:id/acta', verificarPermiso('junta', 'gestion_reuniones'), async (req, res) => {
  let r = memReuniones.get(req.params.id);
  if (!r && supabase) {
    const { data } = await supabase.from('rsp_reuniones').select('*').eq('id', req.params.id).single();
    if (data) r = data;
  }
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  const { horaInicio, horaFin, desarrollo, puntosTratados, proximosPasos } = req.body;
  r.acta = { horaInicio: horaInicio || r.hora, horaFin: horaFin || r.horaFin, desarrollo, puntosTratados: puntosTratados || [], proximosPasos };
  if (r.estado === 'Planificada') r.estado = 'Acta_Pendiente';
  memReuniones.set(req.params.id, r);
  await persistirReunion(r);
  res.json({ success: true, acta: r.acta });
});

// API: Firmar acta (pasa a Acta_Firmada)
router.put('/api/reuniones/:id/firmar', verificarPermiso('junta', 'gestion_reuniones'), async (req, res) => {
  let r = memReuniones.get(req.params.id);
  if (!r && supabase) {
    const { data } = await supabase.from('rsp_reuniones').select('*').eq('id', req.params.id).single();
    if (data) r = data;
  }
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  if (r.estado !== 'Acta_Pendiente') return res.status(400).json({ error: 'El acta debe estar en estado pendiente para firmarla' });
  r.estado = 'Acta_Firmada';
  r.fechaFirma = new Date().toISOString();
  r.hashActa = require('crypto').createHash('sha256').update(r.id + JSON.stringify(r.acta) + Date.now()).digest('hex').slice(0, 16);
  r.firmaPresidente = req.session.usuario?.nombre || 'Admin';
  r.firmaSecretario = req.session.usuario?.nombre || 'Admin';
  memReuniones.set(req.params.id, r);
  await persistirReunion(r);
  res.json({ success: true, hash: r.hashActa, estado: r.estado });
});

// API: PDF del acta
router.get('/api/reuniones/:id/pdf', verificarPermiso('junta', 'gestion_reuniones'), async (req, res) => {
  try {
    let r = memReuniones.get(req.params.id);
    if (!r && supabase) {
      const { data } = await supabase.from('rsp_reuniones').select('*').eq('id', req.params.id).single();
      if (data) r = data;
    }
    if (!r) return res.status(404).json({ error: 'No encontrada' });
    const { generarPDF } = await import('../config/documentos.js');
    const buffer = await generarPDF('junta', {
      id: r.id, titulo: `Acta: ${r.titulo}`,
      tipo: r.estado === 'Acta_Firmada' ? 'acta-firmada' : 'acta',
      datos: {
        reunion: r.titulo, fecha: r.fecha, horaInicio: r.acta?.horaInicio || r.hora, horaFin: r.acta?.horaFin || r.horaFin,
        lugar: r.lugar, convocante: r.convocante, tipoReunion: r.tipoReunion, numActa: r.id.slice(-3),
        asistentes: r.asistentes, ordenDelDia: r.ordenDelDia, desarrollo: r.acta?.desarrollo,
        puntosTratados: r.acta?.puntosTratados, votaciones: r.votaciones,
        acuerdos: r.acta?.puntosTratados?.filter(p => p.acuerdo).map(p => p.acuerdo) || [],
        proximosPasos: r.acta?.proximosPasos,
        firmaPresidente: r.firmaPresidente, firmaSecretario: r.firmaSecretario,
        fechaFirma: r.fechaFirma, hashActa: r.hashActa
      },
      estado: r.estado, createdAt: r.created_at || r.fecha,
      refId: r.id, refTipo: 'acta'
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename=ACTA-${r.id}.pdf` });
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════════════
// VOTACIONES — Almacenamiento en memoria + API
// ═════════════════════════════════════════════════════════════════════════
const memVotaciones = new Map();
let votIdCounter = 0;
let votIdInited = false;

async function initVotIdCounter() {
  if (votIdInited || !supabase) return;
  try {
    const { data } = await supabase.from('rsp_votaciones')
      .select('id').order('id', { ascending: false }).limit(1);
    if (data && data.length > 0) {
      const match = data[0].id.match(/VOT-(\d+)/);
      if (match) votIdCounter = parseInt(match[1], 10);
    }
  } catch (_) { /* usar default */ }
  votIdInited = true;
}

// Sin datos de ejemplo — solo Supabase
(function initVot() { if (memVotaciones.size > 0) return; })();

router.get('/votaciones', verificarPermiso('junta', 'crear_votaciones'), async (req, res) => {
  let votaciones = [];
  if (supabase) {
    try {
      const { data } = await supabase.from('rsp_votaciones').select('*').order('created_at', { ascending: false });
      if (data) votaciones = data.map(v => ({
        id: v.id, titulo: v.titulo, descripcion: v.descripcion, categoria: v.categoria,
        grupo: v.grupo || 'Junta', quorum: v.quorum,
        aFavor: v.a_favor || 0, enContra: v.en_contra || 0, abstenciones: v.abstenciones || 0,
        totalVotos: v.total_votos || 0, totalEmitidos: v.total_emitidos || 0,
        estado: v.estado || 'Activa', resultado: v.resultado,
        reunionId: v.reunion_id, created_at: v.created_at
      }));
    } catch (e) { console.error('[Junta] Error Supabase:', e.message); }
  }
  res.render('junta/votaciones', {
    titulo: 'Gestión de Votaciones',
    entidad_actual: 'junta',
    votaciones,
    esPresidente: req.session.roles?.includes('presidente')
  });
});

// API: Listar votaciones (solo Supabase)
router.get('/api/votaciones', verificarPermiso('junta', 'crear_votaciones'), async (req, res) => {
  let votaciones = [];
  if (supabase) {
    try {
      const { data } = await supabase.from('rsp_votaciones').select('*');
      if (data) votaciones = data;
    } catch (e) {}
  }
  res.json(votaciones);
});

// API: Crear votación (persiste en Supabase)
router.post('/api/votaciones', verificarPermiso('junta', 'crear_votaciones'), async (req, res) => {
  const { titulo, grupo, quorum, aFavor, enContra, abstenciones, reunionId, cerrar, descripcion, categoria, fechaLimite } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título requerido' });
  await initVotIdCounter();
  const id = 'VOT-' + String(++votIdCounter).padStart(3, '0');
  const total = (aFavor||0) + (enContra||0) + (abstenciones||0);
  const cerrada = cerrar === true;
  const votacion = {
    id, titulo, descripcion: descripcion || '', categoria: categoria || grupo || 'General',
    grupo: grupo || 'Junta', quorum: quorum || 50,
    aFavor: aFavor || 0, enContra: enContra || 0, abstenciones: abstenciones || 0,
    totalVotos: total, totalEmitidos: 0,
    estado: cerrada ? 'Cerrada' : 'Activa',
    resultado: cerrada ? ((aFavor||0) > (enContra||0) ? 'Aprobada' : 'Rechazada') : null,
    reunionId: reunionId || null, fechaCreacion: new Date().toISOString(),
    fechaLimite: fechaLimite || null, created_at: new Date().toISOString()
  };
  memVotaciones.set(id, votacion);

  // Persistir en Supabase
  if (supabase) {
    try {
      await supabase.from('rsp_votaciones').upsert({
        id, titulo, descripcion: descripcion || '', categoria: categoria || grupo || 'General',
        grupo: grupo || 'Junta', quorum: quorum || 50,
        a_favor: aFavor || 0, en_contra: enContra || 0, abstenciones: abstenciones || 0,
        total_votos: total, total_emitidos: 0,
        estado: cerrada ? 'Cerrada' : 'Activa',
        resultado: cerrada ? ((aFavor||0) > (enContra||0) ? 'Aprobada' : 'Rechazada') : null,
        reunion_id: reunionId || null, fecha_limite: fechaLimite || null
      }, { onConflict: 'id' });
    } catch (e) { console.warn('[Junta] No se pudo persistir votación:', e.message); }
  }

  // Enviar a PlacetaID para notificar al grupo correspondiente
  try {
    const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
    const API_KEY = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';
    fetch(`${PLACETAID_API}/admin/votaciones`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify(votacion), signal: AbortSignal.timeout(5000)
    }).catch(() => {});
  } catch {}

  if (reunionId) {
    const r = memReuniones.get(reunionId);
    if (r) {
      if (!r.votaciones) r.votaciones = [];
      r.votaciones.push(votacion);
    }
  }
  res.json({ success: true, votacion });
});

// API: Obtener votación
router.get('/api/votaciones/:id', verificarPermiso('junta', 'crear_votaciones'), (req, res) => {
  const v = memVotaciones.get(req.params.id);
  if (!v) return res.status(404).json({ error: 'No encontrada' });
  res.json(v);
});

// API: Actualizar votos
router.put('/api/votaciones/:id', verificarPermiso('junta', 'crear_votaciones'), (req, res) => {
  const v = memVotaciones.get(req.params.id);
  if (!v) return res.status(404).json({ error: 'No encontrada' });
  const { aFavor, enContra, abstenciones } = req.body;
  if (aFavor !== undefined) v.aFavor = aFavor;
  if (enContra !== undefined) v.enContra = enContra;
  if (abstenciones !== undefined) v.abstenciones = abstenciones;
  v.totalVotos = (v.aFavor||0) + (v.enContra||0) + (v.abstenciones||0);
  res.json({ success: true, votacion: v });
});

// API: Cerrar votación (persiste en Supabase)
router.put('/api/votaciones/:id/cerrar', verificarPermiso('junta', 'crear_votaciones'), async (req, res) => {
  const id = req.params.id;
  // Primero buscar en memoria, si no, leer de Supabase
  let v = memVotaciones.get(id);
  if (!v && supabase) {
    try {
      const { data } = await supabase.from('rsp_votaciones').select('*').eq('id', id).single();
      if (data) v = { aFavor: data.a_favor, enContra: data.en_contra };
    } catch (_) {}
  }
  const aFavor = v?.aFavor || 0;
  const enContra = v?.enContra || 0;
  const resultado = aFavor > enContra ? 'Aprobada' : 'Rechazada';
  if (supabase) {
    try {
      await supabase.from('rsp_votaciones').update({ estado: 'Cerrada', resultado }).eq('id', id);
    } catch (e) { console.warn('[Junta] Error persistente cierre:', e.message); }
  }
  if (v) { v.estado = 'Cerrada'; v.resultado = resultado; }
  // Notificar cierre a PlacetaID
  try {
    const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
    const API_KEY = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';
    fetch(`${PLACETAID_API}/admin/votaciones/${id}/cerrar`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY }
    }).catch(() => {});
  } catch {}
  res.json({ success: true, resultado });
});

// API: Reabrir votación
router.put('/api/votaciones/:id/reabrir', verificarPermiso('junta', 'crear_votaciones'), async (req, res) => {
  const id = req.params.id;
  if (supabase) {
    try { await supabase.from('rsp_votaciones').update({ estado: 'Activa', resultado: null }).eq('id', id); }
    catch (e) { console.warn('[Junta] Error persistente reapertura:', e.message); }
  }
  const v = memVotaciones.get(id);
  if (v) { v.estado = 'Activa'; v.resultado = null; }
  res.json({ success: true });
});

// ── Gestión de Cargos ──────────────────────────────────────────────────────
router.get('/cargos', verificarPermiso('junta', 'gestion_cargos'), (req, res) => {
  res.render('junta/cargos', {
    titulo: 'Gestión de Cargos',
    entidad_actual: 'junta'
  });
});

// ── Gestión de Departamentos ───────────────────────────────────────────────
router.get('/departamentos', verificarPermiso('junta', 'gestion_departamentos'), (req, res) => {
  res.render('junta/departamentos', {
    titulo: 'Gestión de Departamentos',
    entidad_actual: 'junta'
  });
});

// ── Gestión de Recursos Digitales ──────────────────────────────────────────
router.get('/recursos', verificarPermiso('junta', 'gestion_recursos'), (req, res) => {
  res.render('junta/recursos', {
    titulo: 'Recursos Digitales',
    entidad_actual: 'junta'
  });
});

// ── Documentación ─────────────────────────────────────────────────────────
router.get('/documentos', verificarPermiso('junta', 'gestion_ciudadanos'), (req, res) => {
  res.render('documentos', {
    titulo: 'Documentación - Junta de La Placeta',
    entidad_actual: 'junta'
  });
});

// ── Gestión de Usuarios Junior ─────────────────────────────────────────────
router.get('/junior', verificarPermiso('junta', 'gestion_junior'), (req, res) => {
  res.render('junta/junior', {
    titulo: 'Usuarios Placeta Junior',
    entidad_actual: 'junta'
  });
});

export default router;
