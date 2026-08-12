/**
 * JUNIOR AUTH (nativo en RSP) — Registro y login de Placeta Junior
 *
 * Migrado desde el CRM de GDLP (junior-auth.js) al RSP para que todo
 * Placeta Junior viva en el RSP (admin-placeta). Accede directamente a
 * Supabase y registra RSP Billing en cada conexión.
 *
 * Endpoints (montado en /api/junior):
 *   POST /register   → alta del menor (pendiente firma del tutor)
 *   POST /login      → login por DIP con autorización PlacetaID del tutor
 *   GET  /login/poll/:requestId → comprobar autorización del tutor
 *   GET  /verify/:juniorId     → web de verificación tras la firma
 *   GET|POST /logout           → cerrar sesión
 */
import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import {
  sbFindSolicitanteByEmail, sbFindSolicitanteByDip,
  sbCreateSolicitante, sbUpdateSolicitante,
  sbFindControlParentalByDni, sbCreateControlParental,
  sbCreateJunior, sbFindJuniorByDip, sbUpdateJunior,
  sbCreateLog, sbCreateJuniorLog, sbCreatePlacetaTransaction,
  sbCreateTributosContributor, sbGetTributosContributorByPlacetaId
} from '../config/db.js';
import { registrarConexion, TIPO_CONEXION } from '../config/rsp.js';

const router = Router();

const BANCO_API = (process.env.BANCO_API_URL || 'https://api.banco.laplaceta.org').replace(/\/+$/, '');
const PLACETAID_API = process.env.PLACETAID_API_URL || 'https://id.laplaceta.org/api';
const CRM_KEY = process.env.CRM_READ_KEY || 'crm-gdlp-shared-key-2026';
const PLACETAID_KEY = process.env.PLACETAID_CLIENT_ID || 'ccb611655030bdadf7218418dc195dcb';

// ── Registro de conexión RSP (tarificación) — Placeta Junior auth ──────
function rspRegistrar(tipo, endpoint, usuario = '', dip = '') {
  setImmediate(() => {
    try {
      registrarConexion({
        entidad: 'junior',
        tipo,
        endpoint: `[Auth] ${endpoint}`,
        usuario: usuario || 'junior-auth',
        dip: dip || '',
        detalle: 'Placeta Junior auth (RSP)'
      });
    } catch (e) { /* silencioso */ }
  });
}

async function apiBanco(action, data = {}) {
  const r = await fetch(`${BANCO_API}/api/crm-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CRM-Key': CRM_KEY },
    body: JSON.stringify({ action, ...data }),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || 'Error en API banco');
  }
  return r.json();
}

async function apiBancoGetState() {
  const r = await fetch(`${BANCO_API}/api/crm-state`, {
    method: 'GET',
    headers: { 'X-CRM-Key': CRM_KEY },
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) return null;
  return r.json();
}

function juniorAccountId(junior = {}) {
  return junior.cuenta_banco || `u-${String(junior.dip || '').toLowerCase().replace(/-/g, '')}`;
}

async function saldoBancarioJunior(junior) {
  const bankState = await apiBancoGetState().catch(() => null);
  const account = (bankState?.accounts || []).find(a => a.id === juniorAccountId(junior));
  if (!account) return junior.placetas_saldo || 0;
  const saldo = Number(account.balancePz) || 0;
  if (saldo !== (junior.placetas_saldo || 0)) {
    await sbUpdateJunior(junior.id, { placetas_saldo: saldo }).catch(() => {});
  }
  return saldo;
}

// ═══════════════════════════════════════════════════════════════════════════
//  REGISTRO — Placeta Junior (menores de 16 años)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/register', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/register', '', req.body?.dni_tutor);
  try {
    const { nombre, apellidos, fecha_nacimiento, nombre_tutor, apellidos_tutor, dni_tutor, email, tutor_ya_existe } = req.body;

    if (!nombre || !apellidos || !fecha_nacimiento || !email) {
      return res.status(400).json({ error: 'Todos los campos obligatorios deben completarse.' });
    }
    if (!dni_tutor) {
      return res.status(400).json({ error: 'El DNI del tutor legal es obligatorio.' });
    }
    if (!tutor_ya_existe && (!nombre_tutor || !apellidos_tutor)) {
      return res.status(400).json({ error: 'Los datos del tutor legal son obligatorios.' });
    }
    const tutorFirstName = tutor_ya_existe ? (nombre_tutor || 'Tutor') : nombre_tutor;
    const tutorLastName = tutor_ya_existe ? (apellidos_tutor || '') : apellidos_tutor;

    const nacimiento = new Date(fecha_nacimiento);
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mesDiff = hoy.getMonth() - nacimiento.getMonth();
    if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < nacimiento.getDate())) edad--;

    if (edad >= 16) {
      return res.status(400).json({ error: 'Placeta Junior es solo para menores de 16 años. Los mayores deben usar PlacetaID estándar.' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const dipDigits = String(Math.floor(10000000 + Math.random() * 90000000));
    const dipLetter = (nombre.trim().charAt(0) || 'X').toUpperCase();
    const dip = `${dipDigits}${dipLetter}`;

    // Email único para el menor
    let minorEmail = email;
    if (tutor_ya_existe) {
      minorEmail = `junior-${dipDigits}@laplaceta.org`;
      const exist = await sbFindSolicitanteByEmail(minorEmail).catch(() => null);
      if (exist) minorEmail = `junior-${dipDigits}-${Date.now()}@laplaceta.org`;
    } else {
      const emailExistente = await sbFindSolicitanteByEmail(email);
      if (emailExistente) {
        return res.status(400).json({ error: 'El email ya está registrado en el sistema.' });
      }
    }

    // Encriptar DNI del tutor
    const salt = crypto.randomBytes(16).toString('hex');
    const dniHash = crypto.createHash('sha256').update(dni_tutor + salt).digest('hex');

    // Buscar o crear tutor
    let tutorRecord = await sbFindSolicitanteByDip(dni_tutor);
    if (!tutorRecord) {
      const cpRecords = await sbFindControlParentalByDni(dni_tutor);
      if (cpRecords && cpRecords.length > 0) {
        const cp = cpRecords[0];
        tutorRecord = await sbCreateSolicitante({
          alias: `tutor-${dipDigits.slice(0, 6)}`,
          nombre_real: `${tutorFirstName} ${tutorLastName}`.trim(),
          email: cp.email_tutor || email,
          dip: dni_tutor,
          franja_edad: 'Alta_Plena',
          rol: 'tutor',
          estado: 'activo',
          ip_registro: ip
        });
      } else {
        tutorRecord = await sbCreateSolicitante({
          alias: `tutor-${dipDigits.slice(0, 6)}`,
          nombre_real: `${tutorFirstName} ${tutorLastName}`.trim(),
          email: email,
          dip: dni_tutor,
          franja_edad: 'Alta_Plena',
          rol: 'tutor',
          estado: 'activo',
          ip_registro: ip
        });
      }
    }

    // Crear solicitante (menor)
    const alias = `${nombre.toLowerCase().replace(/\s/g, '')}.${dipDigits.slice(0, 4)}`;
    const nuevoSolicitante = await sbCreateSolicitante({
      alias,
      nombre_real: `${nombre} ${apellidos}`,
      email: minorEmail,
      fecha_nacimiento,
      edad,
      dip,
      placeid: `PLID-J${dipDigits.slice(0, 6)}`,
      franja_edad: 'Tutelada_Basica',
      password_hash: null,
      rol: 'miembro',
      estado: 'pendiente',
      ip_registro: ip
    });

    // Crear registro en junior_menores
    const juniorRecord = await sbCreateJunior({
      solicitante_id: nuevoSolicitante.id,
      dip,
      nombre, apellidos,
      fecha_nacimiento,
      edad,
      modalidad: 'Placeta Junior',
      tutor_dip: dni_tutor,
      tutor_nombre: `${tutorFirstName} ${tutorLastName}`.trim(),
      dni_tutor_hash: dniHash,
      dni_tutor_salt: salt,
      email_contacto: minorEmail,
      estado: 'pendiente_firma_tutor',
      placetas_saldo: 0,
      nivel_academia: 1,
      ip_registro: ip
    });

    await sbCreateLog({
      usuario_id: nuevoSolicitante.id,
      accion: 'registro_junior',
      detalle: `Registro Placeta Junior: ${nombre} ${apellidos} (DIP: ${dip}, Tutor: ${dni_tutor})`,
      ip
    });
    await sbCreateJuniorLog({
      junior_id: juniorRecord.id,
      accion: 'registro',
      detalle: `Registro completado. Edad: ${edad}. Pendiente firma del tutor vía PlacetaID Móvil.`,
      ip
    });

    // Solicitud de firma PlacetaID para el tutor
    let placetaidRequest = null;
    try {
      const placetaIdResp = await fetch(`${PLACETAID_API}/mobil/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dip: dni_tutor,
          servicio: 'Placeta Junior - Registro',
          servicioUrl: `${process.env.CRM_BASE_URL || 'https://rsp.laplaceta.org'}/api/junior/verify/${juniorRecord.id}`,
          plataforma: 'web'
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (placetaIdResp.ok) {
        placetaidRequest = await placetaIdResp.json();
        await sbCreateJuniorLog({
          junior_id: juniorRecord.id,
          accion: 'placetaid_solicitud',
          detalle: `Solicitud de firma PlacetaID creada. Código: ${placetaidRequest.codigo}. RequestId: ${placetaidRequest.requestId}`,
          ip
        });
      }
    } catch (pidErr) {
      console.warn('[Placeta Junior] Error creando solicitud PlacetaID:', pidErr.message);
    }

    // Auto-vincular si es modo demo o PlacetaID no disponible
    let autoVinculado = false;
    let cuentaInfo = null;
    const esDemo = dni_tutor === '11111111D' || !placetaidRequest;
    if (esDemo) {
      try {
        await sbUpdateJunior(juniorRecord.id, { estado: 'activo', ip_firma: ip }).catch(() => {});
        await sbUpdateSolicitante(nuevoSolicitante.id, { estado: 'activo' }).catch(() => {});

        const bankResp = await fetch(`${BANCO_API}/api/crm-state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CRM-Key': CRM_KEY },
          body: JSON.stringify({
            action: 'crear-cuenta-infantil',
            juniorDip: dip,
            juniorNombre: `${nombre} ${apellidos}`,
            tutorAccountId: `u-${dni_tutor?.toLowerCase().replace(/-/g, '')}`,
            sendLimitPz: 50,
            tutorDip: dni_tutor
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (bankResp.ok) {
          cuentaInfo = await bankResp.json();
          try {
            await fetch(`${BANCO_API}/api/crm-state`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-CRM-Key': CRM_KEY },
              body: JSON.stringify({
                action: 'bono-bienvenida',
                juniorAccountId: cuentaInfo.accountId,
                juniorDip: dip,
                tutorDip: dni_tutor
              }),
              signal: AbortSignal.timeout(10000)
            });
          } catch (_) {}
        }
        autoVinculado = true;
        console.log(`[Placeta Junior] Menor ${dip} auto-vinculado. IBAN: ${cuentaInfo?.iban || 'N/A'}`);
      } catch (autoErr) {
        console.warn('[Placeta Junior] Error en auto-vinculación:', autoErr.message);
      }
    }

    const responseData = {
      success: true,
      message: autoVinculado
        ? `Registro completado. Cuenta bancaria creada (${cuentaInfo?.iban || 'GDLP-AP...'}). Ya puedes iniciar sesión con el DIP: ${dip}`
        : 'Registro completado. El tutor legal debe firmar desde PlacetaID Móvil.',
      redirect: autoVinculado ? '/dashboard' : '/registro/pendiente-firma',
      dip,
      necesita_firma_tutor: !autoVinculado,
      junior_id: juniorRecord.id,
      tutor_dip: dni_tutor,
      tutor_nombre: tutorRecord?.nombre_real || (tutorFirstName + ' ' + tutorLastName).trim(),
      tutor_email: tutorRecord?.email || email,
      auto_vinculado: autoVinculado,
      cuenta_bancaria: cuentaInfo
    };

    if (placetaidRequest) {
      responseData.placetaid_codigo = placetaidRequest.codigo;
      responseData.placetaid_requestId = placetaidRequest.requestId;
    }

    return res.json(responseData);
  } catch (err) {
    console.error('[Placeta Junior] Error en registro:', err);
    res.status(500).json({ error: 'Error interno del servidor. Inténtelo de nuevo más tarde.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  LOGIN — DIP only, no password. Goes through tutor PlacetaID auth.
// ═══════════════════════════════════════════════════════════════════════════

router.post('/login', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.MODIFICACION, 'POST /junior/login', '', req.body?.dip);
  try {
    const { dip } = req.body;
    if (!dip) return res.status(400).json({ error: 'DIP requerido' });

    const usuario = await sbFindSolicitanteByDip(dip);
    if (!usuario) return res.status(401).json({ error: 'DIP no encontrado en el sistema.' });

    const junior = await sbFindJuniorByDip(usuario.dip);
    if (!junior) return res.status(403).json({ error: 'Esta cuenta no tiene acceso a Placeta Junior.' });
    const saldoReal = await saldoBancarioJunior(junior);

    if (junior.estado === 'pendiente_firma_tutor') {
      const esDemo = junior.tutor_dip === '11111111D';
      if (esDemo) {
        await sbUpdateJunior(junior.id, { estado: 'activo', ip_firma: req.ip }).catch(() => {});
        junior.estado = 'activo';
      } else {
        return res.status(403).json({
          error: 'Cuenta pendiente de activación.',
          detalle: 'El tutor legal debe firmar los documentos desde PlacetaID Móvil.',
          junior_id: junior.id,
          estado: junior.estado
        });
      }
    }

    if (junior.estado === 'suspendido' || junior.estado === 'baja') {
      return res.status(403).json({ error: 'Cuenta suspendida o dada de baja.' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

    // Autorización del tutor vía PlacetaID
    if (junior.tutor_dip) {
      try {
        const resp = await fetch(`${PLACETAID_API}/mobil/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dip: junior.tutor_dip,
            servicio: `Acceso de ${junior.nombre} ${junior.apellidos} a Placeta Junior`,
            servicioUrl: `placeta-junior://auth?dip=${junior.dip}`,
            plataforma: 'android'
          }),
          signal: AbortSignal.timeout(8000)
        });
        if (resp.ok) {
          const authReq = await resp.json();
          await sbCreateLog({
            usuario_id: usuario.id,
            accion: 'login_junior_solicitud',
            detalle: `Solicitud de acceso enviada al tutor ${junior.tutor_dip}. RequestId: ${authReq.requestId}`,
            ip
          });
          return res.json({
            success: true,
            requiere_autorizacion_tutor: true,
            requestId: authReq.requestId,
            codigo: authReq.codigo,
            mensaje: 'Solicitud enviada al tutor. Debe aprobarla desde PlacetaID Móvil.',
            dip_menor: junior.dip,
            nombre_menor: `${junior.nombre} ${junior.apellidos}`,
            junior: {
              id: junior.id, solicitante_id: usuario.id, dip: usuario.dip,
              nombre: junior.nombre, apellidos: junior.apellidos,
              alias: usuario.alias, edad: junior.edad,
              modalidad: junior.modalidad,
              placetas_saldo: saldoReal,
              nivel_academia: junior.nivel_academia, estado: junior.estado
            }
          });
        }
      } catch (authErr) {
        console.warn('[Login] PlacetaID no disponible, acceso directo:', authErr.message);
      }
    }

    // Fallback: acceso directo
    await sbUpdateSolicitante(usuario.id, { ultimo_acceso: new Date().toISOString(), ip_ultimo_acceso: ip });
    await sbCreateLog({
      usuario_id: usuario.id,
      accion: 'login_junior_directo',
      detalle: 'Acceso directo (PlacetaID no disponible)',
      ip
    });

    if (req.session) {
      req.session.junior = {
        id: junior.id, solicitante_id: usuario.id, dip: usuario.dip,
        nombre: junior.nombre, apellidos: junior.apellidos,
        alias: usuario.alias, edad: junior.edad, modalidad: junior.modalidad,
        placetas_saldo: saldoReal, nivel_academia: junior.nivel_academia,
        estado: junior.estado, tutor_nombre: junior.tutor_nombre || '',
        tutor_dip: junior.tutor_dip || ''
      };
    }

    res.json({
      success: true,
      requiere_autorizacion_tutor: false,
      redirect: '/dashboard',
      junior: {
        id: junior.id, solicitante_id: usuario.id, dip: usuario.dip,
        nombre: junior.nombre, apellidos: junior.apellidos,
        alias: usuario.alias, edad: junior.edad, modalidad: junior.modalidad,
        placetas_saldo: saldoReal, nivel_academia: junior.nivel_academia,
        estado: junior.estado
      }
    });
  } catch (err) {
    console.error('[Placeta Junior] Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  POLL — Verificar si el tutor autorizó el acceso (directo a PlacetaID)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/login/poll/:requestId', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/login/poll/:requestId');
  try {
    const resp = await fetch(`${PLACETAID_API}/mobil/poll/${req.params.requestId}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (resp.ok) {
      const result = await resp.json();
      const autorizado = result.autorizado === true || result.estado === 'authorized';
      return res.json({ success: true, aprobado: autorizado, status: result.estado || 'pending' });
    }
    res.json({ success: true, aprobado: false, status: 'pending' });
  } catch (err) {
    res.json({ success: false, aprobado: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  VERIFY — Web para PlacetaID: tutor firmó el registro
// ═══════════════════════════════════════════════════════════════════════════

router.get('/verify/:juniorId', async (req, res) => {
  rspRegistrar(TIPO_CONEXION.CONSULTA, 'GET /junior/verify/:juniorId');
  try {
    const { juniorId } = req.params;
    if (!juniorId) return res.status(400).json({ error: 'ID de junior requerido' });

    const { data: junior } = await supabase
      .from('junior_menores')
      .select('id, dip, nombre, apellidos, tutor_dip, tutor_nombre, estado')
      .eq('id', juniorId)
      .single()
      .catch(() => ({ data: null }));

    if (!junior) {
      return res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;padding:40px">❌ Menor no encontrado</h1>');
    }

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Verificación Placeta Junior</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font-family:sans-serif;background:linear-gradient(135deg,#3a00e1,#4e3b70);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#fff;border-radius:24px;padding:40px;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.15)}
    .icon{font-size:64px;margin-bottom:16px}h1{font-size:24px;font-weight:800;color:#1a1a2e;margin-bottom:8px}p{color:#666;font-size:14px;line-height:1.6;margin-bottom:24px}
    .status{display:inline-block;padding:8px 20px;border-radius:20px;font-size:13px;font-weight:600;margin:8px 0}
    .status-pending{background:#fff3cd;color:#856404}.status-active{background:#d4edda;color:#155724}
    .btn{display:inline-block;padding:12px 32px;border-radius:12px;border:none;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;color:#fff;background:linear-gradient(135deg,#3a00e1,#4e3b70)}
    .detail{background:#f8f9fa;border-radius:12px;padding:16px;text-align:left;margin:16px 0;font-size:13px}
    .detail-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee}
    .detail-row:last-child{border-bottom:none}.detail-label{color:#888}.detail-value{font-weight:600;color:#333}</style></head><body>
    <div class="card">
      <div class="icon">${junior.estado === 'activo' ? '✅' : '⏳'}</div>
      <h1>${junior.estado === 'activo' ? '¡Registro Verificado!' : 'Pendiente de Firma'}</h1>
      <p>${junior.estado === 'activo' ? 'El tutor legal ha firmado el alta. El menor ya puede acceder a Placeta Junior.' : 'El tutor legal debe abrir PlacetaID Móvil y aprobar la solicitud de firma para activar la cuenta.'}</p>
      <div class="detail">
        <div class="detail-row"><span class="detail-label">Menor</span><span class="detail-value">${junior.nombre || ''} ${junior.apellidos || ''}</span></div>
        <div class="detail-row"><span class="detail-label">DIP</span><span class="detail-value">${junior.dip || ''}</span></div>
        <div class="detail-row"><span class="detail-label">Tutor</span><span class="detail-value">${junior.tutor_nombre || ''}</span></div>
        <div class="detail-row"><span class="detail-label">Estado</span><span class="status ${junior.estado === 'activo' ? 'status-active' : 'status-pending'}">${junior.estado === 'activo' ? '✅ Activo' : '⏳ Pendiente firma'}</span></div>
      </div>
      <a href="placeta-junior://auth" class="btn">Ir a Placeta Junior</a>
    </div></body></html>`);
  } catch (err) {
    console.error('[Verify] Error:', err.message);
    res.status(500).send('Error interno');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════════════════════════

router.get('/logout', (req, res) => {
  if (req.session) req.session = null;
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  if (req.session) req.session = null;
  res.json({ success: true, redirect: '/' });
});

export default router;
