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
        gasto_diario: limites.limite_gasto_diario || 10,
        gasto_semanal: limites.limite_gasto_semanal || 50,
        limite_aprobacion_tutor: limites.limite_aprobacion_tutor || 1000,
        tiempo_uso: limites.tiempo_uso_diario_minutos || 60,
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

      const esDemo = junior.tutor_dip === TUTOR_DEMO ||
        (junior.dip || '').includes('DEMO') || (dip_destino || '').includes('DEMO');
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
          await postBanco('transferir', {
            from: RBU_FUNDACION,
            to: cuentaDeJunior(junior),
            cantidad: RBU_DIARIO,
            concepto: `RBU día ${streak} — Placeta Junior`,
            juniorDip: junior.dip,
            tutorDip: junior.tutor_dip,
          });
        } catch (e) { console.warn('[RBU] Banco:', e.message); }
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
