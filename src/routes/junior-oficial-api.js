/**
 * JUNIOR OFICIAL API — API oficial de la Academia Placeta Junior
 * Servida desde RSP / Admin Placeta (con tarificación RSP automática).
 *
 * MODELO ECONÓMICO:
 * - Todos los precios incluyen IVA (12%) que abona CAPITALIA (Placeta Junior)
 *   a Tributos (TGLP). El precio visible es el total (IVA incluido).
 * - Las compras reales se hacen con la cuenta bancaria del junior
 *   (historial bancario en bank_transactions + junior_transacciones).
 * - Los fondos de cada compra se envían a Capitalia (CAPITALIA_BANK).
 * - Los admins pagan las regalías a los titulares desde su propia cuenta.
 *
 * Rutas montadas en server.js bajo /api/junior (igual que las que usa la app):
 *   GET  /junior/academy/precios        → Catálogo de precios con IVA
 *   GET  /junior/academy/cuestionarios  → Cuestionarios + costos desbloqueo
 *   POST /junior/academy/evaluar        → Evaluar respuestas (puntos/recompensa)
 *   POST /junior/academy/desbloquear-nivel → Pago real → Capitalia (con IVA)
 *   POST /junior/academy/confirmar-pago → Pago genérico real → Capitalia
 *   GET  /junior/academy/rbu            → Renta Básica Universal Junior
 *   GET  /junior/monedero               → Saldo, límites, historial, cuenta
 *   GET  /junior/perfil                 → Perfil del junior
 *   GET  /junior/tutor-info/:dip        → Info del tutor
 *   POST /junior/regalias               → Admin paga regalías desde su cuenta
 *   GET  /junior/puntos/canje           → Tabla de canje puntos verdes → Pz
 */
import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import {
  sbFindJuniorByDip, sbUpdateJunior,
  sbGetParentalLimits, sbGetAcademyProgress, sbUpsertAcademyProgress,
  sbUpdatePlacetaBalance, sbCreatePlacetaTransaction, sbCreateJuniorLog,
  sbListJuniorTransactions, sbFindSolicitanteByDip
} from '../config/db.js';
import { apiBancoGetState, apiBancoPost } from '../config/db.js';
import { registrarConexion, TIPO_CONEXION } from '../config/rsp.js';
import {
  generarCuestionarios, COSTO_DESBLOQUEO_POR_NIVEL, getRangoEdad
} from '../data/cuestionarios.js';
import {
  IVA_PERCENT, TABLA_PRECIOS, COSTO_DESBLOQUEO_POR_NIVEL as COSTOS_ACADEMIA,
  RECOMPENSAS_POR_COMPLEJIDAD, TABLA_CANJE_PUNTOS_VERDES,
  desglosarPrecioConIva, getComplejidadPorPreguntas,
  precioLicenciaPara, precioIntentoPara
} from '../config/junior-precios.js';

const router = Router();

// ── Cuentas del sistema (Banco de La Placeta) ──────────────────────────
const CAPITALIA = 'CAPITALIA_BANK';
const TGLP = 'TGLP';
const AGLDP = 'AGLDP'; // Fundación / Administración (RBU, bonos)
const RBU_DIARIO = 5;  // Renta Básica Universal Junior: 5 Pz/día

// ── Registro de conexión RSP (tarificación) ────────────────────────────
function rspRegistrar(tipo, endpoint, usuario = '', dip = '') {
  setImmediate(() => {
    try {
      registrarConexion({
        entidad: 'junior',
        tipo,
        endpoint: `[API Oficial] ${endpoint}`,
        usuario: usuario || 'junior-api',
        dip: dip || '',
        detalle: 'Academia Placeta Junior (RSP)'
      });
    } catch (e) { /* silencioso */ }
  });
}

// ── Verificación de junior (compatible con la app) ─────────────────────
async function verificarJunior(req, res, next) {
  const dip = req.query.dip || req.body?.dip || req.headers['x-junior-dip'];
  if (!dip) return res.status(401).json({ error: 'No autorizado. Debes iniciar sesión.' });
  try {
    const junior = await sbFindJuniorByDip(dip);
    if (!junior) return res.status(401).json({ error: 'Perfil no encontrado.' });
    req.juniorDip = dip;
    req.juniorId = junior.id;
    req.juniorData = junior;
    next();
  } catch (e) {
    res.status(500).json({ error: 'Error verificando identidad.' });
  }
}

// Helper: notificar al tutor vía PlacetaID (opcional, no bloqueante)
async function notificarTutor(junior, concepto, detalles, monto = 0) {
  if (!junior?.tutor_dip) return;
  try {
    const { solicitarAutorizacionTutor } = await import('../services/placetaidService.js').catch(() => ({}));
    if (typeof solicitarAutorizacionTutor === 'function') {
      await solicitarAutorizacionTutor({
        dipTutor: junior.tutor_dip, concepto, monto,
        dipMenor: junior.dip, detalles: detalles || ''
      });
    }
  } catch (_) { /* PlacetaID offline, ignorar */ }
}

// ═══════════════════════════════════════════════════════════════════════
//  CATÁLOGO DE PRECIOS CON IVA (spec §9, §10)
// ═══════════════════════════════════════════════════════════════════════
router.get('/junior/academy/precios', (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/academy/precios');

  const tabla = TABLA_PRECIOS.map(t => ({
    complejidad: t.complejidad,
    preguntas: t.preguntas_max === null ? `${t.preguntas_min}+` : `${t.preguntas_min}-${t.preguntas_max}`,
    fases: t.fases_max === null ? `${t.fases_min}+` : `${t.fases_min}-${t.fases_max}`,
    precio_licencia: t.precio_licencia,
    precio_intento: t.precio_intento,
    ...desglosarPrecioConIva(t.precio_licencia),
    recompensa: t.recompensa
  }));

  res.json({
    success: true,
    iva_porcentaje: IVA_PERCENT,
    abona_iva: 'CAPITALIA_BANK (Placeta Junior) → TGLP (Tributos)',
    nota: 'Todos los precios incluyen IVA. El precio mostrado es el total.',
    costos_desbloqueo_nivel: Object.fromEntries(
      Object.entries(COSTOS_ACADEMIA).map(([n, costo]) => [n, desglosarPrecioConIva(costo)])
    ),
    recompensas_por_complejidad: RECOMPENSAS_POR_COMPLEJIDAD,
    canje_puntos_verdes: TABLA_CANJE_PUNTOS_VERDES,
    tabla_precios: tabla
  });
});

// ═══════════════════════════════════════════════════════════════════════
//  PUNTOS — Tabla de canje Puntos Verdes → Placetas (spec §16)
// ═══════════════════════════════════════════════════════════════════════
router.get('/junior/puntos/canje', (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/puntos/canje');
  res.json({ success: true, canje: TABLA_CANJE_PUNTOS_VERDES });
});

// ═══════════════════════════════════════════════════════════════════════
//  CUESTIONARIOS DISPONIBLES (nativo, con costos de desbloqueo + IVA)
// ═══════════════════════════════════════════════════════════════════════
router.get('/junior/academy/cuestionarios', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/academy/cuestionarios', '', req.juniorDip);
  try {
    const junior = req.juniorData;
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });

    const rangoEdad = getRangoEdad(junior.edad);
    const nivelActual = junior.nivel_academia || 1;
    const cuestionarios = {};
    const materias = ['matematicas', 'calculo_mental', 'lengua', 'medio', 'geografia'];
    const nombresMateria = {
      matematicas: 'Matemáticas',
      calculo_mental: 'Cálculo Mental',
      lengua: 'Lengua',
      medio: 'Medio',
      geografia: '🌍 Geografía'
    };

    const maxNivelVisible = Math.min(nivelActual, 35);
    for (let n = 1; n <= maxNivelVisible; n++) {
      const preguntasPorNivel = generarCuestionarios(junior.edad, n);
      for (const materia of materias) {
        if (!cuestionarios[materia]) {
          cuestionarios[materia] = { nombre: nombresMateria[materia], niveles: {} };
        }
        const preguntasArr = preguntasPorNivel[materia] || [];
        cuestionarios[materia].niveles[n] = preguntasArr.map((p, idx) => ({
          id: `${materia}-${n}-${idx}`,
          pregunta: p.pregunta,
          opciones: p.opciones,
          correcta: p.correcta,
          imagen: p.imagen || null,
          fuente: p.fuente || null,
          dificultad: p.dificultad,
          placetas_recompensa: p.placetas_recompensa
        }));
      }
    }

    // Costos de desbloqueo (con IVA incluido — Capitalia lo abona)
    const costos = {};
    for (let n = 2; n <= 35; n++) {
      costos[n] = COSTOS_ACADEMIA[n] || 999;
    }

    const progreso = await sbGetAcademyProgress(junior.id);

    res.json({
      rango_edad: rangoEdad,
      nivel_actual: nivelActual,
      nivel_maximo: 10,
      placetas_saldo: junior.placetas_saldo || 0,
      costos_desbloqueo: costos,
      costos_desglose_iva: Object.fromEntries(
        Object.entries(costos).slice(0, 10).map(([n, c]) => [n, desglosarPrecioConIva(c)])
      ),
      cuestionarios,
      progreso: progreso || { completados: {}, puntuacion_total: 0, nivel_maximo: 1 },
      materias_disponibles: materias.map(m => ({
        id: m, nombre: nombresMateria[m], niveles_disponibles: nivelActual
      })),
      iva: { porcentaje: IVA_PERCENT, abona: 'CAPITALIA_BANK', recibe: TGLP }
    });
  } catch (err) {
    console.error('[Academy Oficial] Error cargando cuestionarios:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  EVALUAR RESPUESTAS (nativo, con Puntos Verdes/Rojos + recompensa)
// ═══════════════════════════════════════════════════════════════════════
router.post('/junior/academy/evaluar', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/academy/evaluar', '', req.juniorDip);
  try {
    const { materia, nivel, respuestas } = req.body;
    if (!materia || !nivel || !respuestas || !Array.isArray(respuestas)) {
      return res.status(400).json({ error: 'Faltan datos: materia, nivel y respuestas.' });
    }

    const junior = req.juniorData;
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
    if (nivel > (junior.nivel_academia || 1)) {
      return res.status(403).json({ error: `Nivel ${nivel} no desbloqueado.` });
    }

    const todasPreguntas = generarCuestionarios(junior.edad, nivel);
    const preguntas = todasPreguntas[materia] || [];

    let aciertos = 0;
    let errores = 0;
    let totalPlacetasGanadas = 0;
    const resultados = [];

    for (const respuesta of respuestas) {
      const pregunta = preguntas[respuesta.idx];
      if (!pregunta) continue;
      const esCorrecta = respuesta.opcion === pregunta.correcta;
      if (esCorrecta) {
        aciertos++;
        totalPlacetasGanadas += pregunta.placetas_recompensa;
      } else {
        errores++;
      }
      resultados.push({
        idx: respuesta.idx,
        correcta: esCorrecta,
        respuesta_correcta: pregunta.correcta,
        placetas_ganadas: esCorrecta ? pregunta.placetas_recompensa : 0
      });
    }

    const totalPreguntas = respuestas.length;
    const porcentaje = totalPreguntas > 0 ? Math.round((aciertos / totalPreguntas) * 100) : 0;

    // Progreso en Supabase
    const progresoActual = await sbGetAcademyProgress(junior.id) || {};
    const completados = progresoActual.completados || {};
    if (!completados[materia]) completados[materia] = {};
    if (!completados[materia][nivel]) completados[materia][nivel] = [];
    completados[materia][nivel].push({
      fecha: new Date().toISOString(), aciertos, total: totalPreguntas, porcentaje,
      placetas_ganadas: totalPlacetasGanadas,
      puntos_verdes: aciertos, puntos_rojos: errores
    });

    const nuevoSaldo = (junior.placetas_saldo || 0) + totalPlacetasGanadas;
    await sbUpdatePlacetaBalance(junior.id, nuevoSaldo);
    await sbUpsertAcademyProgress({
      junior_id: junior.id, completados,
      puntuacion_total: (progresoActual.puntuacion_total || 0) + totalPlacetasGanadas,
      nivel_maximo: junior.nivel_academia || 1,
      actualizado_en: new Date().toISOString()
    });

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    if (totalPlacetasGanadas > 0) {
      await sbCreatePlacetaTransaction({
        junior_id: junior.id, tipo: 'ganar',
        concepto: `Nivel ${nivel} - ${materia}`,
        cantidad: totalPlacetasGanadas, saldo_resultante: nuevoSaldo, ip
      });
    }
    await sbCreateJuniorLog({
      junior_id: junior.id, accion: 'cuestionario_completado',
      detalle: `Materia: ${materia}, Nivel: ${nivel}, Aciertos: ${aciertos}/${totalPreguntas} (${porcentaje}%), Errores: ${errores}, Placetas: +${totalPlacetasGanadas}`, ip
    });

    if (porcentaje >= 60) {
      notificarTutor(junior,
        `${junior.nombre} completó ${materia} nivel ${nivel}`,
        `Aciertos: ${aciertos}/${totalPreguntas} (${porcentaje}%). Ganó ${totalPlacetasGanadas} Pz.`,
        totalPlacetasGanadas);
    }

    res.json({
      success: true, aciertos, errores, total: totalPreguntas, porcentaje,
      placetas_ganadas: totalPlacetasGanadas, saldo_actual: nuevoSaldo,
      resultados, aprobado: porcentaje >= 60,
      puntos: { verdes: aciertos, rojos: errores }
    });
  } catch (err) {
    console.error('[Academy Oficial] Error evaluando:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  DESBLOQUEAR NIVEL — Pago real con cuenta bancaria del junior → Capitalia
//  (IVA incluido en el precio, Capitalia lo abona a TGLP; historial completo)
// ═══════════════════════════════════════════════════════════════════════
router.post('/junior/academy/desbloquear-nivel', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/academy/desbloquear-nivel', '', req.juniorDip);
  try {
    const junior = req.juniorData;
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });

    const nivelActual = junior.nivel_academia || 1;
    const siguienteNivel = nivelActual + 1;
    if (siguienteNivel > 10) {
      return res.status(400).json({ error: '¡Ya has alcanzado el nivel máximo! 🎉' });
    }

    const costo = COSTOS_ACADEMIA[siguienteNivel];
    if (!costo) return res.status(400).json({ error: 'Nivel no válido' });
    const ivaInfo = desglosarPrecioConIva(costo);

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    // ── Límites del tutor ─────────────────────────────────────────
    const limites = await sbGetParentalLimits(junior.id);
    const limiteDiario = limites?.limite_gasto_diario || 10;
    const limiteAprobacionTutor = limites?.limite_aprobacion_tutor || 1000;
    const requiereAprobacion = limites?.requiere_aprobacion_extra !== false;

    const { data: transaccionesHoy } = await supabase
      .from('junior_transacciones')
      .select('cantidad')
      .eq('junior_id', junior.id)
      .eq('tipo', 'gastar')
      .gte('creado_en', new Date().toISOString().slice(0, 10));
    const gastoHoy = (transaccionesHoy || []).reduce((s, t) => s + (t.cantidad || 0), 0);

    if (gastoHoy + costo > limiteDiario) {
      return res.status(403).json({
        error: `Límite diario de gasto (${limiteDiario} Pz) excedido. Has gastado ${gastoHoy} Pz hoy.`,
        limite_diario: limiteDiario, gasto_hoy: gastoHoy,
        disponible_hoy: Math.max(0, limiteDiario - gastoHoy),
        necesita_autorizacion_tutor: false
      });
    }

    if (costo > limiteAprobacionTutor && requiereAprobacion) {
      await sbCreateJuniorLog({
        junior_id: junior.id, accion: 'solicitar_autorizacion_tutor',
        detalle: `Solicita autorización para gastar ${costo} Pz (desbloquear nivel ${siguienteNivel}). Límite aprobación: ${limiteAprobacionTutor} Pz`, ip
      });
      return res.status(403).json({
        error: `Esta compra de ${costo} Pz supera el límite de autorización automática de ${limiteAprobacionTutor} Pz. El tutor debe aprobarla desde PlacetaID Móvil.`,
        necesita_autorizacion_tutor: true, costo,
        limite_aprobacion: limiteAprobacionTutor,
        mensaje: 'Solicitud enviada al tutor. Debe aprobarla desde PlacetaID Móvil.'
      });
    }

    const saldoActual = junior.placetas_saldo || 0;
    if (saldoActual < costo) {
      return res.status(400).json({
        error: `No tienes suficientes placetas. Necesitas ${costo}, tienes ${saldoActual}.`,
        placetas_necesarias: costo, placetas_actuales: saldoActual
      });
    }

    // ── Pago bancario REAL: Junior → Capitalia (con IVA que abona Capitalia) ──
    const juniorAccountId = junior.cuenta_banco || `u-${junior.dip?.toLowerCase().replace(/-/g, '')}`;
    let pagoBancario = null;
    try {
      pagoBancario = await apiBancoPost('transferir', {
        from: juniorAccountId,
        to: CAPITALIA,
        cantidad: costo,
        concepto: `Desbloquear nivel ${siguienteNivel} - Academia`,
        iva: ivaInfo.iva,
        juniorDip: junior.dip,
        tutorDip: junior.tutor_dip,
        ip
      });
    } catch (bankErr) {
      console.warn('[Academy Oficial] Pago bancario no disponible:', bankErr.message);
    }

    // ── Descontar placetas internas + actualizar nivel ────────────
    const nuevoSaldo = saldoActual - costo;
    await sbUpdatePlacetaBalance(junior.id, nuevoSaldo);
    await sbUpdateJunior(junior.id, { nivel_academia: siguienteNivel });
    await sbUpsertAcademyProgress({
      junior_id: junior.id, nivel_maximo: siguienteNivel,
      actualizado_en: new Date().toISOString()
    });

    await sbCreatePlacetaTransaction({
      junior_id: junior.id, tipo: 'gastar',
      concepto: `Desbloquear nivel ${siguienteNivel}`,
      cantidad: costo, saldo_resultante: nuevoSaldo, ip
    });
    await sbCreateJuniorLog({
      junior_id: junior.id, accion: 'nivel_desbloqueado',
      detalle: `Nivel ${siguienteNivel} desbloqueado por ${costo} Pz (IVA incluido ${ivaInfo.iva} Pz). Pago bancario: ${pagoBancario ? 'OK' : 'no disponible'}`, ip
    });

    notificarTutor(junior,
      `🎓 ${junior.nombre} subió al nivel ${siguienteNivel}`,
      `Desbloqueó el nivel ${siguienteNivel} de la academia por ${costo} Pz (IVA incluido). Saldo: ${nuevoSaldo} Pz.`,
      costo);

    res.json({
      success: true,
      message: `🌟 ¡Nivel ${siguienteNivel} desbloqueado! ${pagoBancario ? 'Pago bancario realizado → Capitalia (IVA incluido).' : ''}`,
      nivel_actual: siguienteNivel, nivel_maximo: 10,
      saldo_actual: nuevoSaldo, costo,
      iva: ivaInfo,
      pago_bancario: !!pagoBancario,
      siguiente_nivel: siguienteNivel < 10 ? {
        nivel: siguienteNivel + 1,
        costo: COSTOS_ACADEMIA[siguienteNivel + 1] || '—'
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  CONFIRMAR PAGO — Pago genérico real → Capitalia (historial + IVA)
// ═══════════════════════════════════════════════════════════════════════
router.post('/junior/academy/confirmar-pago', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/academy/confirmar-pago', '', req.juniorDip);
  try {
    const { cantidad, concepto, nivel } = req.body;
    const junior = req.juniorData;
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });

    if ((junior.placetas_saldo || 0) < cantidad) {
      return res.status(400).json({ error: 'Saldo insuficiente', saldo_actual: junior.placetas_saldo, costo: cantidad });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const ivaInfo = desglosarPrecioConIva(cantidad);
    const nuevoSaldo = (junior.placetas_saldo || 0) - cantidad;

    // Pago bancario real → Capitalia
    const juniorAccountId = junior.cuenta_banco || `u-${junior.dip?.toLowerCase().replace(/-/g, '')}`;
    let pagoBancario = null;
    try {
      pagoBancario = await apiBancoPost('transferir', {
        from: juniorAccountId, to: CAPITALIA, cantidad,
        concepto: concepto || 'Pago Academia Placeta Junior',
        iva: ivaInfo.iva, juniorDip: junior.dip, tutorDip: junior.tutor_dip, ip
      });
    } catch (e) { console.warn('[Pago Oficial] Banco:', e.message); }

    await sbUpdatePlacetaBalance(junior.id, nuevoSaldo);
    await sbCreatePlacetaTransaction({
      junior_id: junior.id, tipo: 'gastar',
      concepto: concepto || `Desbloquear nivel ${nivel || '?'}`,
      cantidad, saldo_resultante: nuevoSaldo, ip
    });
    await sbCreateJuniorLog({
      junior_id: junior.id, accion: 'pago_upgrade',
      detalle: `Pago ${cantidad} Pz (IVA incluido ${ivaInfo.iva} Pz) → Capitalia. ${concepto || ''}. Saldo: ${nuevoSaldo} Pz`, ip
    });

    res.json({
      success: true, pagado: cantidad, saldo_anterior: junior.placetas_saldo,
      nuevo_saldo: nuevoSaldo, iva: ivaInfo, pago_bancario: !!pagoBancario,
      message: `✅ Pago confirmado: -${cantidad} Pz. Te quedan ${nuevoSaldo} Pz.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  RBU — Renta Básica Universal Junior (5 Pz diarios, desde Fundación)
// ═══════════════════════════════════════════════════════════════════════
router.get('/junior/academy/rbu', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/academy/rbu', '', req.juniorDip);
  try {
    const junior = req.juniorData;
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
    const esDemo = junior.tutor_dip === '11111111D';

    const hoy = new Date().toISOString().slice(0, 10);
    const { data: yaReclamado } = await supabase.from('junior_transacciones')
      .select('id').eq('junior_id', junior.id).eq('tipo', 'rbu')
      .gte('creado_en', hoy).limit(1);
    if (yaReclamado && yaReclamado.length > 0) {
      return res.json({ success: false, message: 'Ya has reclamado tu RBU hoy. ¡Vuelve mañana! 🌅' });
    }

    let streak = 1;
    for (let d = 1; d < 7; d++) {
      const fecha = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
      const { data: dia } = await supabase.from('junior_transacciones')
        .select('id').eq('junior_id', junior.id).eq('tipo', 'rbu')
        .gte('creado_en', fecha).lt('creado_en', fecha + 'T23:59:59').limit(1);
      if (dia && dia.length > 0) streak++;
      else break;
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const cantidad = RBU_DIARIO;

    // Transferencia real desde la Fundación → cuenta del junior
    const juniorAccountId = junior.cuenta_banco || junior.dip;
    try {
      if (!esDemo) {
        await apiBancoPost('transferir', {
          from: AGLDP, to: juniorAccountId, cantidad,
          concepto: `RBU día ${streak} — Placeta Junior`, juniorDip: junior.dip, tutorDip: junior.tutor_dip, ip
        });
      }
    } catch (e) { console.warn('[RBU Oficial] Banco:', e.message); }

    const nuevoSaldo = (junior.placetas_saldo || 0) + cantidad;
    await sbUpdatePlacetaBalance(junior.id, nuevoSaldo);
    await sbCreatePlacetaTransaction({
      junior_id: junior.id, tipo: 'rbu',
      concepto: `RBU día ${streak}${esDemo ? ' (Demo)' : ''}`,
      cantidad, saldo_resultante: nuevoSaldo, ip
    });
    await sbCreateJuniorLog({
      junior_id: junior.id, accion: 'rbu_reclamado',
      detalle: `RBU +${cantidad} Pz (día ${streak}). Saldo: ${nuevoSaldo} Pz${esDemo ? ' (Demo)' : ''}`, ip
    });

    res.json({
      success: true, cantidad, streak, nuevo_saldo: nuevoSaldo,
      message: `¡RBU reclamada! +${cantidad} Pz. Día ${streak} de racha semanal.`,
      es_demo: esDemo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  MONEDERO — Saldo, límites, historial y cuenta bancaria REAL
// ═══════════════════════════════════════════════════════════════════════
router.get('/junior/monedero', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/monedero', '', req.juniorDip);
  try {
    const junior = req.juniorData;
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });

    const limites = await sbGetParentalLimits(junior.id);
    const limitesEfectivos = limites ? {
      gasto_diario: limites.limite_gasto_diario || 10,
      gasto_semanal: limites.limite_gasto_semanal || 50,
      limite_aprobacion_tutor: limites.limite_aprobacion_tutor || 1000,
      tiempo_uso: limites.tiempo_uso_diario_minutos || 60,
      requiere_aprobacion: limites.requiere_aprobacion_extra !== false,
      categorias_bloqueadas: typeof limites.categorias_bloqueadas === 'string'
        ? JSON.parse(limites.categorias_bloqueadas || '[]')
        : (limites.categorias_bloqueadas || [])
    } : {
      gasto_diario: 10, gasto_semanal: 50, limite_aprobacion_tutor: 1000,
      tiempo_uso: 60, requiere_aprobacion: true, categorias_bloqueadas: []
    };

    const historial = await sbListJuniorTransactions(junior.id, 30);
    const hoy = new Date().toISOString().slice(0, 10);
    const inicioSemana = new Date();
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    const semStr = inicioSemana.toISOString().slice(0, 10);

    const gastoHoy = (historial || [])
      .filter(t => t.tipo === 'gastar' && (t.creado_en || '').slice(0, 10) === hoy)
      .reduce((s, t) => s + (t.cantidad || 0), 0);
    const gastoSemana = (historial || [])
      .filter(t => t.tipo === 'gastar' && (t.creado_en || '') >= semStr)
      .reduce((s, t) => s + (t.cantidad || 0), 0);
    const ingresos = (historial || [])
      .filter(t => t.tipo === 'ganar' || t.tipo === 'bonus')
      .reduce((s, t) => s + (t.cantidad || 0), 0);

    // Cuenta REAL del banco (MongoDB)
    let cuentaBanco = {
      id: junior.cuenta_banco || `u-${junior.dip?.toLowerCase().replace(/-/g, '')}`,
      tipo: 'Child', iban: '', sendLimitPz: limitesEfectivos.gasto_diario, saldo_real: 0
    };
    try {
      const bankState = await apiBancoGetState();
      if (bankState?.accounts) {
        const accountId = junior.cuenta_banco || `u-${junior.dip?.toLowerCase().replace(/-/g, '')}`;
        const realAccount = bankState.accounts.find(a => a.id === accountId);
        if (realAccount) {
          cuentaBanco = {
            id: realAccount.id || accountId,
            tipo: realAccount.type || 'Child',
            iban: realAccount.iban || '',
            sendLimitPz: realAccount.sendLimitPz || limitesEfectivos.gasto_diario,
            saldo_real: realAccount.balancePz || 0
          };
        }
      }
    } catch (bankErr) {
      console.warn('[Monedero Oficial] Error consultando banco:', bankErr.message);
    }

    res.json({
      saldo_actual: cuentaBanco.saldo_real || junior.placetas_saldo || 0,
      ingresos_totales: ingresos,
      gasto_hoy: gastoHoy,
      gasto_semana: gastoSemana,
      limites: limitesEfectivos,
      saldo_disponible_hoy: Math.max(0, limitesEfectivos.gasto_diario - gastoHoy),
      saldo_disponible_semana: Math.max(0, limitesEfectivos.gasto_semanal - gastoSemana),
      historial: historial || [],
      nivel_academia: junior.nivel_academia || 1,
      nombre_menor: `${junior.nombre || ''} ${junior.apellidos || ''}`.trim(),
      tutor_nombre: junior.tutor_nombre || '',
      cuenta_bancaria: cuentaBanco
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  PERFIL — Datos del junior + límites parentales
// ═══════════════════════════════════════════════════════════════════════
router.get('/junior/perfil', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/perfil', '', req.juniorDip);
  try {
    const junior = req.juniorData;
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
    const limites = await sbGetParentalLimits(junior.id);
    res.json({ junior, limites_parentales: limites });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  TUTOR-INFO — Datos del tutor legal
// ═══════════════════════════════════════════════════════════════════════
router.get('/junior/tutor-info/:dip', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, `GET /junior/tutor-info/${req.params.dip}`);
  try {
    const tutor = await sbFindSolicitanteByDip(req.params.dip);
    if (!tutor) return res.status(404).json({ error: 'Tutor no encontrado' });
    res.json({
      dip: tutor.dip,
      nombre: tutor.nombre_real || tutor.alias || '',
      email: tutor.email || '',
      franja_edad: tutor.franja_edad || '',
      estado: tutor.estado || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  REGALÍAS — Los admins pagan regalías a los titulares desde su cuenta
//  Body: { adminDip, fromAccountId, toAccountId, cantidad, concepto }
//  La cuenta admin (Capitalia o una cuenta de administración) paga al titular.
// ═══════════════════════════════════════════════════════════════════════
router.post('/junior/regalias', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/regalias');
  try {
    const { adminDip, fromAccountId, toAccountId, cantidad, concepto } = req.body;
    if (!adminDip || !fromAccountId || !toAccountId || !cantidad || cantidad <= 0) {
      return res.status(400).json({
        error: 'Faltan datos: adminDip, fromAccountId, toAccountId y cantidad (positiva) son requeridos'
      });
    }

    // Verificar que el admin existe
    const admin = await sbFindSolicitanteByDip(adminDip);
    if (!admin) return res.status(401).json({ error: 'Admin no encontrado' });

    // Pagar regalía real: cuenta admin → cuenta del titular
    const resultado = await apiBancoPost('pagar-regalia', {
      from: fromAccountId, to: toAccountId,
      cantidad, concepto: concepto || 'Regalía Placeta Junior'
    });

    if (!resultado?.success) {
      return res.status(400).json({
        success: false,
        error: resultado?.error || 'No se pudo ejecutar el pago de la regalía'
      });
    }

    // Registro en auditoría (junior_logs del sistema, sin junior_id se guarda como log global)
    await sbCreateJuniorLog({
      junior_id: null, accion: 'regalia_pagada',
      detalle: `Admin ${adminDip} pagó ${cantidad} Pz de regalía (${fromAccountId} → ${toAccountId}). ${concepto || ''}`,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
    });

    res.json({
      success: true,
      message: `✅ Regalía de ${cantidad} Pz pagada por el admin desde ${fromAccountId} → ${toAccountId}.`,
      transactionId: resultado.transactionId,
      fromBalance: resultado.fromBalance,
      toBalance: resultado.toBalance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  HISTORIAL DE TRANSACCIONES
// ═══════════════════════════════════════════════════════════════════════
router.get('/junior/historial', verificarJunior, async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/historial', '', req.juniorDip);
  try {
    const junior = req.juniorData;
    if (!junior) return res.status(404).json({ error: 'Perfil no encontrado' });
    const historial = await sbListJuniorTransactions(junior.id, 50);
    res.json(historial || []);
  } catch (err) {
    res.json([]);
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  FALLBACK PROXY → CRM (auth, register, amigos, legal, email, etc.)
//  Los endpoints de la academia son NATIVOS; el resto (login, register,
//  amigos, legal, email) se reenvía al CRM GDLP para no romper la app.
//  Las rutas que junior-api.js ya maneja de forma específica (menores,
//  documentos-pendientes, firmar-documento) se dejan pasar al siguiente
//  router (juniorApiRoutes) para conservar su lógica (prefijo "legal").
// ═══════════════════════════════════════════════════════════════════════
const CRM_URL = (process.env.CRM_BASE_URL || 'https://grupodelaplaceta.vercel.app').replace(/\/+$/, '');
const CRM_KEY = process.env.CRM_READ_KEY || 'crm-gdlp-shared-key-2026';

// Rutas que junior-api.js maneja de forma específica → dejar pasar (next)
const RUTAS_JUNIOR_API_PROXY = [
  '/junior/menores/',
  '/junior/documentos-pendientes/',
  '/junior/firmar-documento',
  '/junior/legal/'
];

// Fallback catch-all: reenvía al CRM las rutas /junior/* no definidas nativamente
router.all('/junior/*splat', async (req, res, next) => {
  const path = req.path; // /junior/...
  // Si junior-api.js la maneja específicamente, dejamos pasar al siguiente router
  if (RUTAS_JUNIOR_API_PROXY.some(p => path === p || path.startsWith(p))) {
    return next();
  }

  rspRegistrar(req.method === 'GET' ? TIPO_CONEXION.CONSULTA : TIPO_CONEXION.MODIFICACION, `${req.method} ${req.originalUrl}`, '', req.headers['x-junior-dip'] || '');
  try {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';
    const url = `${CRM_URL}/api${path}${qs ? '?' + qs : ''}`;
    const headers = {
      'X-CRM-Key': CRM_KEY,
      'Content-Type': 'application/json'
    };
    if (req.headers.cookie) headers['Cookie'] = req.headers.cookie;
    const fetchOpts = { method: req.method, headers, signal: AbortSignal.timeout(15000) };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body && Object.keys(req.body).length > 0) {
        fetchOpts.body = JSON.stringify(req.body);
      } else {
        const raw = await new Promise((resolve) => {
          let data = '';
          req.on('data', c => { data += c; });
          req.on('end', () => resolve(data));
        });
        fetchOpts.body = raw || undefined;
      }
    }
    const r = await fetch(url, fetchOpts);
    const text = await r.text();
    res.status(r.status).set('Content-Type', r.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: 'CRM no disponible', detalle: e.message });
  }
});

export default router;
