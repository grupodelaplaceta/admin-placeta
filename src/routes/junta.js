import { Router } from 'express';
import { sbListSolicitantes, apiPlacetaidRegistros, apiPlacetaidStats } from '../config/db.js';
import { verificarPermiso } from '../middleware/auth.js';

const router = Router();

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
  ej.forEach(e => { memReclamaciones.set(e.id, e); reclIdCounter = Math.max(reclIdCounter, parseInt(e.id.slice(-3))); });
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

router.post('/api/reclamaciones', verificarPermiso('junta', 'gestion_reclamaciones'), (req, res) => {
  const { ciudadano, asunto, descripcion, prioridad, asignadoA } = req.body;
  const id = 'REC-' + String(++reclIdCounter).padStart(3, '0');
  const recl = { id, ciudadano: ciudadano || 'Anónimo', asunto, descripcion, prioridad: prioridad || 'Media', estado: 'Abierta', fecha: new Date().toISOString().slice(0,10), asignadoA: asignadoA || '—', respuestas: [] };
  memReclamaciones.set(id, recl);
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
})();

router.get('/reuniones', verificarPermiso('junta', 'gestion_reuniones'), (req, res) => {
  res.render('junta/reuniones', {
    titulo: 'Gestión de Reuniones y Actas',
    entidad_actual: 'junta',
    reuniones: [...memReuniones.values()].sort((a,b) => (b.fecha||'').localeCompare(a.fecha||''))
  });
});

// API: Listar reuniones
router.get('/api/reuniones', verificarPermiso('junta', 'gestion_reuniones'), (req, res) => {
  res.json([...memReuniones.values()].sort((a,b) => (b.fecha||'').localeCompare(a.fecha||'')));
});

// API: Crear reunión
router.post('/api/reuniones', verificarPermiso('junta', 'gestion_reuniones'), (req, res) => {
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
  res.json({ success: true, reunion });
});

// API: Obtener reunión
router.get('/api/reuniones/:id', verificarPermiso('junta', 'gestion_reuniones'), (req, res) => {
  const r = memReuniones.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  res.json(r);
});

// API: Actualizar reunión (datos generales o asistentes)
router.put('/api/reuniones/:id', verificarPermiso('junta', 'gestion_reuniones'), (req, res) => {
  const r = memReuniones.get(req.params.id);
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
  res.json({ success: true, reunion: r });
});

// API: Guardar acta (pasa a Acta_Pendiente)
router.put('/api/reuniones/:id/acta', verificarPermiso('junta', 'gestion_reuniones'), (req, res) => {
  const r = memReuniones.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  const { horaInicio, horaFin, desarrollo, puntosTratados, proximosPasos } = req.body;
  r.acta = { horaInicio: horaInicio || r.hora, horaFin: horaFin || r.horaFin, desarrollo, puntosTratados: puntosTratados || [], proximosPasos };
  if (r.estado === 'Planificada') r.estado = 'Acta_Pendiente';
  res.json({ success: true, acta: r.acta });
});

// API: Firmar acta (pasa a Acta_Firmada)
router.put('/api/reuniones/:id/firmar', verificarPermiso('junta', 'gestion_reuniones'), (req, res) => {
  const r = memReuniones.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  if (r.estado !== 'Acta_Pendiente') return res.status(400).json({ error: 'El acta debe estar en estado pendiente para firmarla' });
  r.estado = 'Acta_Firmada';
  r.fechaFirma = new Date().toISOString();
  r.hashActa = require('crypto').createHash('sha256').update(r.id + JSON.stringify(r.acta) + Date.now()).digest('hex').slice(0, 16);
  r.firmaPresidente = req.session.usuario?.nombre || 'Admin';
  r.firmaSecretario = req.session.usuario?.nombre || 'Admin';
  res.json({ success: true, hash: r.hashActa, estado: r.estado });
});

// API: PDF del acta
router.get('/api/reuniones/:id/pdf', verificarPermiso('junta', 'gestion_reuniones'), async (req, res) => {
  try {
    const r = memReuniones.get(req.params.id);
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

(function initVot() {
  if (memVotaciones.size > 0) return;
  const ej = [
    { id: 'VOT-001', titulo: 'Aprobación Presupuestos 2026', grupo: 'Junta', quorum: 60, aFavor: 4, enContra: 1, abstenciones: 0, totalVotos: 5, estado: 'Cerrada', resultado: 'Aprobada', reunionId: 'REU-001', created_at: '2026-07-10' },
    { id: 'VOT-002', titulo: 'Reforma Tributaria — Tipo IRM', grupo: '+18', quorum: 50, aFavor: 28, enContra: 12, abstenciones: 5, totalVotos: 45, estado: 'Cerrada', resultado: 'Aprobada', reunionId: null, created_at: '2026-07-01' },
    { id: 'VOT-003', titulo: 'Nuevo Cargo Directivo — Dir. Comunicación', grupo: 'Junta', quorum: 50, aFavor: 0, enContra: 0, abstenciones: 0, totalVotos: 0, estado: 'Activa', resultado: null, reunionId: null, created_at: '2026-07-15' },
  ];
  ej.forEach(e => { memVotaciones.set(e.id, e); votIdCounter = Math.max(votIdCounter, parseInt(e.id.slice(-3))); });
})();

router.get('/votaciones', verificarPermiso('junta', 'crear_votaciones'), (req, res) => {
  res.render('junta/votaciones', {
    titulo: 'Gestión de Votaciones',
    entidad_actual: 'junta',
    votaciones: [...memVotaciones.values()].sort((a,b) => (b.created_at||'').localeCompare(a.created_at||'')),
    esPresidente: req.session.roles?.includes('presidente')
  });
});

// API: Listar votaciones
router.get('/api/votaciones', verificarPermiso('junta', 'crear_votaciones'), (req, res) => {
  res.json([...memVotaciones.values()]);
});

// API: Crear votación
router.post('/api/votaciones', verificarPermiso('junta', 'crear_votaciones'), (req, res) => {
  const { titulo, grupo, quorum, aFavor, enContra, abstenciones, reunionId, cerrar } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Título requerido' });
  const id = 'VOT-' + String(++votIdCounter).padStart(3, '0');
  const total = (aFavor||0) + (enContra||0) + (abstenciones||0);
  const cerrada = cerrar === true;
  const votacion = {
    id, titulo, grupo: grupo || 'Junta', quorum: quorum || 50,
    aFavor: aFavor || 0, enContra: enContra || 0, abstenciones: abstenciones || 0,
    totalVotos: total, estado: cerrada ? 'Cerrada' : 'Activa',
    resultado: cerrada ? ((aFavor||0) > (enContra||0) ? 'Aprobada' : 'Rechazada') : null,
    reunionId: reunionId || null, created_at: new Date().toISOString()
  };
  memVotaciones.set(id, votacion);

  // Si tiene reunionId, vincular a la reunión
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

// API: Cerrar votación
router.put('/api/votaciones/:id/cerrar', verificarPermiso('junta', 'crear_votaciones'), (req, res) => {
  const v = memVotaciones.get(req.params.id);
  if (!v) return res.status(404).json({ error: 'No encontrada' });
  v.estado = 'Cerrada';
  v.resultado = (v.aFavor||0) > (v.enContra||0) ? 'Aprobada' : 'Rechazada';
  res.json({ success: true, resultado: v.resultado });
});

// API: Reabrir votación
router.put('/api/votaciones/:id/reabrir', verificarPermiso('junta', 'crear_votaciones'), (req, res) => {
  const v = memVotaciones.get(req.params.id);
  if (!v) return res.status(404).json({ error: 'No encontrada' });
  v.estado = 'Activa';
  v.resultado = null;
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
