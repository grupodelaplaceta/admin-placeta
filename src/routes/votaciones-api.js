/**
 * API DE VOTACIONES — Sistema completo de votación electrónica
 *
 * Características:
 *   - Categorías de destinatario funcionales (Junta, +18, Ciudadanos, etc.)
 *   - Contador regresivo con fecha límite + hora
 *   - "Ejercer voto" con registro oficial (SHA-256) anti-fraude
 *   - Historial de votos (anónimo después de 30 días, excepto Junta)
 *   - Vinculación directa a actas de reunión
 *   - Notificaciones push automáticas
 */

import { Router } from 'express';
import crypto from 'crypto';
import { registrarConexion, TIPO_CONEXION } from '../config/rsp.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// ALMACENAMIENTO EN MEMORIA
// ═══════════════════════════════════════════════════════════════════════════

// Votaciones activas e históricas
const memVotaciones = new Map();
let votIdCounter = 0;

// Registro oficial de votos emitidos (para auditoría y anti-fraude)
// Cada entrada: { id, votacionId, dip, nombre, voto (a_favor/en_contra/abstencion), timestamp, hash, categoria }
const memRegistroVotos = new Map();
let regVotoCounter = 0;

// Categorías de destinatario disponibles
const CATEGORIAS_VOTO = {
  junta: { nombre: 'Junta de La Placeta', descripcion: 'Miembros de la Junta Directiva', roles: ['presidente', 'vicepresidente', 'secretario', 'vocal'] },
  mayores_18: { nombre: '+18', descripcion: 'Ciudadanos mayores de edad', edadMinima: 18 },
  ciudadanos: { nombre: 'Ciudadanos', descripcion: 'Todos los ciudadanos registrados' },
  tributos: { nombre: 'Tributos', descripcion: 'Departamento de Tributos' },
  administracion: { nombre: 'Administración', descripcion: 'Departamento de Administración' },
  banco: { nombre: 'Banco', descripcion: 'Departamento Bancario' },
  todos: { nombre: 'Todos', descripcion: 'Todos los grupos y departamentos' }
};

// Inicializar con ejemplos (ELIMINADO — solo datos reales de Supabase)
(function initVotaciones() {
  if (memVotaciones.size > 0) return;
  // Sin datos de ejemplo — las votaciones solo vienen de Supabase
})();

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCIA SUPABASE
// ═══════════════════════════════════════════════════════════════════════════

async function persistirVotacion(votacion) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('rsp_votaciones').upsert({
      id: votacion.id, titulo: votacion.titulo, descripcion: votacion.descripcion || '',
      categoria: votacion.categoria || 'General', grupo: votacion.grupo || 'Publico_General',
      quorum: votacion.quorum || 50,
      a_favor: votacion.aFavor || 0, en_contra: votacion.enContra || 0,
      abstenciones: votacion.abstenciones || 0,
      total_votos: votacion.totalVotos || 0, total_emitidos: votacion.totalEmitidos || 0,
      estado: votacion.estado || 'Activa', resultado: votacion.resultado || null,
      fecha_creacion: votacion.fechaCreacion || votacion.created_at,
      fecha_limite: votacion.fechaLimite || null,
      reunion_id: votacion.reunionId || null,
      requiere_quorum: votacion.requiereQuorum !== undefined ? votacion.requiereQuorum : true,
      created_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error && error.code === '42P01') {
      console.warn('[Votos] Tabla rsp_votaciones no existe');
    } else if (error) {
      console.warn('[Votos] Error persistente:', error.message);
    }
  } catch (e) { /* silencioso */ }
}

async function persistirRegistroVoto(registro) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('rsp_registro_votos').insert({
      id: registro.id, votacion_id: registro.votacionId,
      dip: registro.dip, nombre: registro.nombre || '',
      categoria: registro.categoria || 'General', voto: registro.voto,
      hash: registro.hash, oficial: registro.oficial !== false,
      timestamp: registro.timestamp
    });
    if (error && error.code === '42P01') {
      console.warn('[Votos] Tabla rsp_registro_votos no existe');
    }
  } catch (e) { /* silencioso */ }
}

// ── LEER VOTACIONES DESDE SUPABASE ──────────────────────────────────────
async function getVotacionesFromSupabase() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('rsp_votaciones')
      .select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(v => ({
      id: v.id, titulo: v.titulo, descripcion: v.descripcion || '',
      categoria: v.categoria || 'General', grupo: v.grupo || 'Publico_General',
      quorum: v.quorum, aFavor: v.a_favor || 0, enContra: v.en_contra || 0,
      abstenciones: v.abstenciones || 0,
      totalVotos: v.total_votos || 0, totalEmitidos: v.total_emitidos || 0,
      estado: v.estado || 'Activa', resultado: v.resultado || null,
      fechaCreacion: v.fecha_creacion, fechaLimite: v.fecha_limite,
      reunionId: v.reunion_id, requiereQuorum: v.requiere_quorum,
      created_at: v.created_at
    }));
  } catch (e) {
    console.warn('[Votos] Error leyendo de Supabase:', e.message);
    return [];
  }
}

async function getRegistroVotosFromSupabase(votacionId = null) {
  if (!supabase) return [];
  try {
    let query = supabase.from('rsp_registro_votos').select('*').order('timestamp', { ascending: false });
    if (votacionId) query = query.eq('votacion_id', votacionId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id, votacionId: r.votacion_id,
      dip: r.dip, nombre: r.nombre || '',
      categoria: r.categoria || 'General', voto: r.voto,
      hash: r.hash, oficial: r.oficial, timestamp: r.timestamp
    }));
  } catch (e) {
    console.warn('[Votos] Error leyendo registro:', e.message);
    return [];
  }
}

/**
 * Obtiene la fecha límite como objeto Date
 */
function getFechaLimite(votacion) {
  if (!votacion.fechaLimite) return null;
  return new Date(votacion.fechaLimite);
}

/**
 * Calcula el tiempo restante para una votación
 */
function calcularTiempoRestante(votacion) {
  const limite = getFechaLimite(votacion);
  if (!limite) return null;
  const ahora = new Date();
  const diff = limite.getTime() - ahora.getTime();
  if (diff <= 0) return { expirada: true, dias: 0, horas: 0, minutos: 0, total: 0 };
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { expirada: false, dias, horas, minutos, total: diff };
}

/**
 * Verifica si un DIP puede votar en una categoría
 */
function puedeVotarEnCategoria(dip, categoria, perfil) {
  if (categoria === 'todos') return true;
  if (categoria === 'ciudadanos') return true;
  if (categoria === 'mayores_18') {
    if (!perfil?.edad) return true; // Si no sabemos la edad, asumimos que sí
    return perfil.edad >= 18;
  }
  if (categoria === 'junta') {
    return perfil?.rol === 'presidente' || perfil?.rol === 'vicepresidente' ||
           perfil?.rol === 'secretario' || perfil?.rol === 'vocal';
  }
  // Para categorías de departamento, verificar si el usuario pertenece
  return perfil?.entidades?.includes(categoria) || false;
}

/**
 * Determina si el voto debe ser anónimo (30 días después del cierre)
 */
function debeSerAnonimo(votacion) {
  if (!votacion.fechaLimite) return false;
  if (votacion.categoria === 'junta') return false; // Exento: las de junta siempre visibles
  const limite = new Date(votacion.fechaLimite);
  const ahora = new Date();
  const diff = ahora.getTime() - limite.getTime();
  return diff > 30 * 24 * 60 * 60 * 1000; // 30 días
}

/**
 * Genera un hash SHA-256 para el registro oficial de voto
 */
function generarHashVoto(votacionId, dip, voto, timestamp) {
  const payload = `${votacionId}:${dip}:${voto}:${timestamp}:${process.env.VOTACION_SECRET || 'placetaid-vote-secret-2026'}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Registra conexión en RSP para facturación
 */
function rspRegistrar(tipo, endpoint, entidad = 'votaciones') {
  setImmediate(() => {
    try {
      registrarConexion({
        entidad,
        tipo,
        endpoint,
        usuario: 'sistema-votaciones',
        dip: '',
        detalle: 'Sistema de Votaciones Electrónicas'
      });
    } catch (e) { /* silencioso */ }
  });
}

/**
 * Envía notificación push a los destinatarios de una categoría
 */
async function notificarVotacion(votacion, tipo = 'nueva') {
  try {
    const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
    const API_KEY = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';

    await fetch(`${PLACETAID_API}/admin/votaciones/notificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({
        votacionId: votacion.id,
        titulo: votacion.titulo,
        categoria: votacion.categoria,
        tipo,
        fechaLimite: votacion.fechaLimite
      }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (e) {
    console.error('Error notificando votación:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINTS API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/votaciones
 * Lista todas las votaciones
 */
router.get('/votaciones', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /api/votaciones');
  let votaciones = [...memVotaciones.values()];
  if (votaciones.length === 0) {
    const desdeDB = await getVotacionesFromSupabase();
    if (desdeDB.length > 0) votaciones = desdeDB;
  }
  res.json(votaciones.map(v => ({
    ...v,
    tiempoRestante: calcularTiempoRestante(v),
    esAnonimo: debeSerAnonimo(v)
  })).sort((a, b) => (b.created_at || b.fechaCreacion || '').localeCompare(a.created_at || a.fechaCreacion || '')));
});

/**
 * GET /api/votaciones/activas
 * Lista solo votaciones activas (no cerradas)
 */
router.get('/votaciones/activas', async (req, res) => {
  let activas = [...memVotaciones.values()].filter(v => v.estado === 'Activa');
  if (activas.length === 0) {
    const desdeDB = await getVotacionesFromSupabase();
    activas = desdeDB.filter(v => v.estado === 'Activa');
  }
  res.json(activas.map(v => ({ ...v, tiempoRestante: calcularTiempoRestante(v) })));
});

/**
 * GET /api/votaciones/categorias
 * Lista las categorías disponibles
 */
router.get('/votaciones/categorias', (req, res) => {
  res.json(CATEGORIAS_VOTO);
});

/**
 * POST /api/votaciones
 * Crear una nueva votación
 */
router.post('/votaciones', (req, res) => {
  const {
    titulo, descripcion, categoria, grupo, quorum,
    aFavor, enContra, abstenciones, reunionId,
    cerrar, fechaLimite, requiereQuorum
  } = req.body;

  if (!titulo) return res.status(400).json({ error: 'Título requerido' });
  if (!categoria) return res.status(400).json({ error: 'Categoría de destinatario requerida' });
  if (!CATEGORIAS_VOTO[categoria]) return res.status(400).json({ error: `Categoría no válida. Usar: ${Object.keys(CATEGORIAS_VOTO).join(', ')}` });

  const id = 'VOT-' + String(++votIdCounter).padStart(3, '0');
  const total = (aFavor || 0) + (enContra || 0) + (abstenciones || 0);
  const cerrada = cerrar === true;

  // Fecha límite: si no se proporciona, 7 días por defecto
  let fechaLim = fechaLimite;
  if (!fechaLim) {
    const def = new Date();
    def.setDate(def.getDate() + 7);
    fechaLim = def.toISOString();
  }

  const votacion = {
    id, titulo, descripcion: descripcion || '',
    categoria, grupo: grupo || CATEGORIAS_VOTO[categoria]?.nombre || 'General',
    quorum: quorum || 50,
    aFavor: aFavor || 0, enContra: enContra || 0, abstenciones: abstenciones || 0,
    totalVotos: 0, totalEmitidos: 0,
    estado: cerrada ? 'Cerrada' : 'Activa',
    resultado: cerrada ? ((aFavor || 0) > (enContra || 0) ? 'Aprobada' : 'Rechazada') : null,
    fechaCreacion: new Date().toISOString(),
    fechaLimite: fechaLim,
    reunionId: reunionId || null,
    requiereQuorum: requiereQuorum !== undefined ? requiereQuorum : true,
    created_at: new Date().toISOString().slice(0, 10)
  };

  memVotaciones.set(id, votacion);
  persistirVotacion(votacion);

  // Vincular a reunión si aplica
  if (reunionId) {
    try {
      // Intentar importar y actualizar la reunión
      const { memReuniones } = require('./junta.js');
      if (memReuniones) {
        const r = memReuniones.get(reunionId);
        if (r) {
          if (!r.votaciones) r.votaciones = [];
          r.votaciones.push({ id: votacion.id, titulo: votacion.titulo, grupo: votacion.grupo });
        }
      }
    } catch (e) {
      // Si no se puede importar, ignoramos (es opcional)
    }
  }

  // Notificar push
  notificarVotacion(votacion, 'nueva');

  res.json({ success: true, votacion });
});

/**
 * GET /api/votaciones/:id
 * Obtener detalle de una votación
 */
router.get('/votaciones/:id', (req, res) => {
  const v = memVotaciones.get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Votación no encontrada' });

  const esAnonimo = debeSerAnonimo(v);
  const votos = [...memRegistroVotos.values()]
    .filter(r => r.votacionId === v.id);

  res.json({
    ...v,
    tiempoRestante: calcularTiempoRestante(v),
    esAnonimo,
    votos: esAnonimo ? votos.map(r => ({
      id: r.id,
      hash: r.hash,
      oficial: r.oficial,
      timestamp: r.timestamp,
      // Anónimo: ocultar identidad
      dip: r.categoria === 'junta' ? r.dip : '***',
      nombre: r.categoria === 'junta' ? r.nombre : 'Voto anónimo',
      voto: r.voto
    })) : votos
  });
});

/**
 * PUT /api/votaciones/:id
 * Actualizar votación (solo admin)
 */
router.put('/votaciones/:id', (req, res) => {
  const v = memVotaciones.get(req.params.id);
  if (!v) return res.status(404).json({ error: 'No encontrada' });

  const { titulo, descripcion, categoria, grupo, quorum, reunionId, requiereQuorum } = req.body;
  if (titulo !== undefined) v.titulo = titulo;
  if (descripcion !== undefined) v.descripcion = descripcion;
  if (categoria !== undefined && CATEGORIAS_VOTO[categoria]) v.categoria = categoria;
  if (grupo !== undefined) v.grupo = grupo;
  if (quorum !== undefined) v.quorum = quorum;
  if (reunionId !== undefined) v.reunionId = reunionId;
  if (requiereQuorum !== undefined) v.requiereQuorum = requiereQuorum;

  res.json({ success: true, votacion: v });
});

/**
 * POST /api/votaciones/:id/ejercer
 * Ejercer voto (emitir voto como ciudadano)
 * Body: { dip, nombre, voto: "a_favor"|"en_contra"|"abstencion", perfil?: {} }
 */
router.post('/votaciones/:id/ejercer', (req, res) => {
  const { dip, nombre, voto, perfil } = req.body;
  const v = memVotaciones.get(req.params.id);

  if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
  if (v.estado !== 'Activa') return res.status(400).json({ error: 'Esta votación ya está cerrada' });
  if (!dip) return res.status(400).json({ error: 'DIP requerido' });
  if (!voto || !['a_favor', 'en_contra', 'abstencion'].includes(voto)) {
    return res.status(400).json({ error: 'Voto inválido. Usar: a_favor, en_contra, abstencion' });
  }

  // Verificar fecha límite
  const tiempo = calcularTiempoRestante(v);
  if (tiempo && tiempo.expirada) {
    // Cerrar automáticamente si expiró
    v.estado = 'Cerrada';
    v.resultado = (v.aFavor || 0) > (v.enContra || 0) ? 'Aprobada' : 'Rechazada';
    return res.status(400).json({ error: 'Votación expirada', estado: 'Cerrada' });
  }

  // Registrar conexión RSP
  rspRegistrar(TIPO_CONEXION.MODIFICACION, `POST /api/votaciones/${req.params.id}/ejercer`);

  // Verificar que el DIP pueda votar en esta categoría
  if (!puedeVotarEnCategoria(dip, v.categoria, perfil)) {
    return res.status(403).json({ error: `No tienes derecho a voto en la categoría "${v.categoria}"` });
  }

  // Verificar que no haya votado ya
  const yaVoto = [...memRegistroVotos.values()].some(r => r.votacionId === v.id && r.dip === dip);
  if (yaVoto) {
    return res.status(409).json({ error: 'Ya has ejercido tu voto en esta votación' });
  }

  // Registrar voto
  const regId = 'REG-' + String(++regVotoCounter).padStart(5, '0');
  const timestamp = new Date().toISOString();
  const hash = generarHashVoto(v.id, dip, voto, timestamp);

  const registro = {
    id: regId,
    votacionId: v.id,
    dip,
    nombre: nombre || dip,
    categoria: v.categoria,
    voto,
    timestamp,
    hash,
    oficial: true
  };

  memRegistroVotos.set(regId, registro);
  persistirRegistroVoto(registro);
  persistirVotacion(v); // Actualizar conteo en Supabase

  // Actualizar conteo
  if (voto === 'a_favor') v.aFavor = (v.aFavor || 0) + 1;
  else if (voto === 'en_contra') v.enContra = (v.enContra || 0) + 1;
  else if (voto === 'abstencion') v.abstenciones = (v.abstenciones || 0) + 1;
  v.totalVotos = (v.aFavor || 0) + (v.enContra || 0) + (v.abstenciones || 0);
  v.totalEmitidos = [...memRegistroVotos.values()].filter(r => r.votacionId === v.id).length;

  res.json({
    success: true,
    message: 'Voto registrado oficialmente',
    registro: {
      id: regId,
      hash,
      timestamp,
      oficial: true
    },
    votacion: {
      id: v.id,
      aFavor: v.aFavor,
      enContra: v.enContra,
      abstenciones: v.abstenciones,
      totalVotos: v.totalVotos
    }
  });
});

/**
 * POST /api/votaciones/:id/cerrar
 * Cerrar votación manualmente
 */
router.post('/votaciones/:id/cerrar', (req, res) => {
  const v = memVotaciones.get(req.params.id);
  if (!v) return res.status(404).json({ error: 'No encontrada' });
  if (v.estado === 'Cerrada') return res.status(400).json({ error: 'Ya está cerrada' });

  v.estado = 'Cerrada';
  v.resultado = (v.aFavor || 0) > (v.enContra || 0) ? 'Aprobada' : 'Rechazada';

  // Notificar cierre
  notificarVotacion(v, 'cerrada');

  res.json({ success: true, resultado: v.resultado, aFavor: v.aFavor, enContra: v.enContra, abstenciones: v.abstenciones });
});

/**
 * POST /api/votaciones/:id/reabrir
 * Reabrir votación
 */
router.post('/votaciones/:id/reabrir', (req, res) => {
  const v = memVotaciones.get(req.params.id);
  if (!v) return res.status(404).json({ error: 'No encontrada' });
  v.estado = 'Activa';
  v.resultado = null;
  res.json({ success: true });
});

/**
 * GET /api/votaciones/mis-votos/:dip
 * Obtener votaciones donde un DIP ha participado
 */
router.get('/votaciones/mis-votos/:dip', (req, res) => {
  const { dip } = req.params;
  if (!dip) return res.status(400).json({ error: 'DIP requerido' });

  const misVotos = [...memRegistroVotos.values()]
    .filter(r => r.dip === dip)
    .map(r => {
      const votacion = memVotaciones.get(r.votacionId);
      return {
        registroId: r.id,
        votacionId: r.votacionId,
        titulo: votacion?.titulo || 'Votación eliminada',
        categoria: votacion?.categoria || r.categoria,
        voto: r.voto,
        timestamp: r.timestamp,
        hash: r.hash,
        oficial: r.oficial,
        estado: votacion?.estado || 'Desconocido',
        resultado: votacion?.resultado || null,
        reunionId: votacion?.reunionId || null
      };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  res.json(misVotos);
});

/**
 * GET /api/votaciones/pendientes/:dip
 * Obtener votaciones activas donde un DIP aún no ha votado
 */
router.get('/votaciones/pendientes/:dip', (req, res) => {
  const { dip } = req.params;
  if (!dip) return res.status(400).json({ error: 'DIP requerido' });

  const yaVotadas = new Set(
    [...memRegistroVotos.values()]
      .filter(r => r.dip === dip)
      .map(r => r.votacionId)
  );

  const pendientes = [...memVotaciones.values()]
    .filter(v => v.estado === 'Activa' && !yaVotadas.has(v.id))
    .map(v => ({
      ...v,
      tiempoRestante: calcularTiempoRestante(v),
      yaVoto: false
    }));

  res.json(pendientes);
});

/**
 * GET /api/votaciones/historial/:dip
 * Historial completo de votos (con anonimización automática a los 30 días)
 */
router.get('/votaciones/historial/:dip', (req, res) => {
  const { dip } = req.params;
  if (!dip) return res.status(400).json({ error: 'DIP requerido' });

  const todasVotaciones = [...memVotaciones.values()];

  const historial = todasVotaciones.map(v => {
    const esAnonimo = debeSerAnonimo(v);
    const misVotos = [...memRegistroVotos.values()].filter(r => r.votacionId === v.id);
    const miVoto = misVotos.find(r => r.dip === dip);

    return {
      id: v.id,
      titulo: v.titulo,
      descripcion: v.descripcion,
      categoria: v.categoria,
      grupo: v.grupo,
      estado: v.estado,
      resultado: v.resultado,
      fechaCreacion: v.fechaCreacion,
      fechaLimite: v.fechaLimite,
      reunionId: v.reunionId,
      aFavor: v.aFavor,
      enContra: v.enContra,
      abstenciones: v.abstenciones,
      totalVotos: v.totalVotos,
      totalEmitidos: v.totalEmitidos,
      miVoto: miVoto ? {
        voto: miVoto.voto,
        timestamp: miVoto.timestamp,
        hash: miVoto.hash,
        oficial: miVoto.oficial
      } : null,
      esAnonimo,
      // Si es anónimo, no mostrar los detalles de otros votantes
      votos: esAnonimo ? [] : misVotos.map(r => ({
        dip: r.categoria === 'junta' ? r.dip : '***',
        nombre: r.categoria === 'junta' ? r.nombre : '***',
        voto: r.voto,
        hash: r.hash
      }))
    };
  }).sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || ''));

  res.json(historial);
});

/**
 * GET /api/votaciones/registro-oficial
 * Obtener el registro oficial completo (solo admin)
 */
router.get('/votaciones/registro-oficial', (req, res) => {
  const registros = [...memRegistroVotos.values()]
    .map(r => {
      const v = memVotaciones.get(r.votacionId);
      return {
        ...r,
        votacionTitulo: v?.titulo || 'N/A',
        // Verificar anonimización
        dip: debeSerAnonimo(v) && v?.categoria !== 'junta' ? '***' : r.dip,
        nombre: debeSerAnonimo(v) && v?.categoria !== 'junta' ? '***' : r.nombre
      };
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  res.json({
    total: registros.length,
    registros
  });
});

/**
 * GET /api/votaciones/verificar-voto/:votacionId/:dip
 * Verificar la integridad de un voto mediante su hash
 */
router.get('/votaciones/verificar-voto/:votacionId/:dip', (req, res) => {
  const { votacionId, dip } = req.params;
  const registro = [...memRegistroVotos.values()]
    .find(r => r.votacionId === votacionId && r.dip === dip);

  if (!registro) return res.status(404).json({ error: 'Voto no encontrado' });

  // Recalcular hash para verificar integridad
  const hashVerificado = generarHashVoto(registro.votacionId, registro.dip, registro.voto, registro.timestamp);
  const integro = hashVerificado === registro.hash;

  res.json({
    verificado: integro,
    oficial: registro.oficial,
    timestamp: registro.timestamp,
    hash: registro.hash,
    hashRecalculado: hashVerificado,
    voto: registro.voto,
    integro
  });
});

/**
 * GET /api/votaciones/vinculadas/:reunionId
 * Obtener votaciones vinculadas a una reunión
 */
router.get('/votaciones/vinculadas/:reunionId', (req, res) => {
  const { reunionId } = req.params;
  const votaciones = [...memVotaciones.values()]
    .filter(v => v.reunionId === reunionId)
    .map(v => ({
      ...v,
      tiempoRestante: calcularTiempoRestante(v)
    }));
  res.json(votaciones);
});

/**
 * POST /api/votaciones/:id/notificar
 * Re-enviar notificación push para una votación
 */
router.post('/votaciones/:id/notificar', async (req, res) => {
  const v = memVotaciones.get(req.params.id);
  if (!v) return res.status(404).json({ error: 'No encontrada' });

  await notificarVotacion(v, 'recordatorio');
  res.json({ success: true, message: 'Notificación reenviada' });
});

export default router;

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINTS MÓVIL — leen/escriben directamente en Supabase
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/mobil/votaciones/pendientes/:dip — Votaciones pendientes para un DIP
export async function mobilGetPendientes(dip) {
  if (!supabase) return [];
  try {
    const { data: votaciones } = await supabase.from('rsp_votaciones')
      .select('*').eq('estado', 'Activa').order('created_at', { ascending: false });
    if (!votaciones) return [];

    const { data: misVotos } = await supabase.from('rsp_registro_votos')
      .select('votacion_id').eq('dip', dip);
    const yaVotadas = new Set((misVotos || []).map(r => r.votacion_id));

    return votaciones.filter(v => !yaVotadas.has(v.id)).map(v => ({
      id: v.id, titulo: v.titulo, descripcion: v.descripcion || '',
      categoria: v.categoria || 'General', grupo: v.grupo || 'Publico_General',
      quorum: v.quorum, aFavor: v.a_favor || 0, enContra: v.en_contra || 0,
      abstenciones: v.abstenciones || 0, totalVotos: v.total_votos || 0,
      totalEmitidos: v.total_emitidos || 0, estado: v.estado || 'Activa',
      resultado: v.resultado, fechaCreacion: v.fecha_creacion,
      fechaLimite: v.fecha_limite, reunionId: v.reunion_id,
      requiereQuorum: v.requiere_quorum,
      tiempoRestante: null, esAnonimo: false, yaVoto: false
    }));
  } catch (e) { return []; }
}

// GET /api/mobil/votaciones/historial/:dip — Historial de votos
export async function mobilGetHistorial(dip) {
  if (!supabase) return [];
  try {
    const { data: registros } = await supabase.from('rsp_registro_votos')
      .select('*').eq('dip', dip).order('timestamp', { ascending: false });
    if (!registros || registros.length === 0) return [];

    const ids = [...new Set(registros.map(r => r.votacion_id))];
    const { data: votaciones } = await supabase.from('rsp_votaciones')
      .select('*').in('id', ids);
    if (!votaciones) return [];

    const vMap = new Map(votaciones.map(v => [v.id, v]));
    return registros.map(r => {
      const v = vMap.get(r.votacion_id) || {};
      return {
        id: r.votacion_id, titulo: v.titulo || 'Votación',
        descripcion: v.descripcion, categoria: v.categoria || r.categoria,
        grupo: v.grupo, estado: v.estado, resultado: v.resultado,
        fechaCreacion: v.fecha_creacion, fechaLimite: v.fecha_limite,
        reunionId: v.reunion_id, aFavor: v.a_favor || 0, enContra: v.en_contra || 0,
        abstenciones: v.abstenciones || 0, totalVotos: v.total_votos || 0,
        totalEmitidos: v.total_emitidos || 0,
        miVoto: { voto: r.voto, timestamp: r.timestamp, hash: r.hash, oficial: r.oficial },
        esAnonimo: false, votos: []
      };
    });
  } catch (e) { return []; }
}

// POST /api/mobil/votaciones/:id/ejercer — Emitir voto
export async function mobilEmitirVoto(votacionId, dip, nombre, voto) {
  if (!supabase) return { success: false, error: 'Supabase no disponible' };
  try {
    // Verificar que la votación existe y está activa
    const { data: votacion } = await supabase.from('rsp_votaciones')
      .select('*').eq('id', votacionId).single();
    if (!votacion) return { success: false, error: 'Votación no encontrada' };
    if (votacion.estado !== 'Activa') return { success: false, error: 'Votación cerrada' };

    // Verificar voto duplicado
    const { data: existente } = await supabase.from('rsp_registro_votos')
      .select('id').eq('votacion_id', votacionId).eq('dip', dip);
    if (existente && existente.length > 0) return { success: false, error: 'Ya has votado' };

    // Crear hash
    const timestamp = new Date().toISOString();
    const hash = crypto.createHash('sha256')
      .update(`${votacionId}:${dip}:${voto}:${timestamp}:placetaid-vote-secret-2026`)
      .digest('hex');

    const regId = 'REG-' + Date.now().toString(36).toUpperCase();

    // Insertar voto
    const { error: insertError } = await supabase.from('rsp_registro_votos').insert({
      id: regId, votacion_id: votacionId, dip, nombre: nombre || dip,
      categoria: votacion.categoria || 'General', voto, hash, oficial: true, timestamp
    });
    if (insertError) return { success: false, error: insertError.message };

    // Actualizar conteo
    const campo = voto === 'a_favor' ? 'a_favor' : voto === 'en_contra' ? 'en_contra' : 'abstenciones';
    await supabase.rpc('exec_sql', {
      sql: `UPDATE rsp_votaciones SET ${campo} = ${campo} + 1, total_votos = total_votos + 1, total_emitidos = total_emitidos + 1 WHERE id = '${votacionId}'`
    }).catch(async () => {
      // Fallback: leer y actualizar
      const { data: v } = await supabase.from('rsp_votaciones').select('*').eq('id', votacionId).single();
      if (v) {
        const upd = { total_votos: (v.total_votos || 0) + 1, total_emitidos: (v.total_emitidos || 0) + 1 };
        if (voto === 'a_favor') upd.a_favor = (v.a_favor || 0) + 1;
        else if (voto === 'en_contra') upd.en_contra = (v.en_contra || 0) + 1;
        else upd.abstenciones = (v.abstenciones || 0) + 1;
        await supabase.from('rsp_votaciones').update(upd).eq('id', votacionId);
      }
    });

    return {
      success: true, message: 'Voto registrado oficialmente',
      registro: { id: regId, hash, timestamp, oficial: true },
      votacion: { id: votacionId }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
