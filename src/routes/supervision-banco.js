import { Router } from 'express';
import { apiBancoGetState, apiBancoPost } from '../config/db.js';
import { tienePermiso } from '../config/permisos.js';

const router = Router();

// Guard combinado: permite a superadmin / rsp_admin / roles de banco con el permiso.
// El RSP supervisa el banco, así que sus administradores también pueden entrar.
function puedeBancoRsp(permiso) {
  return (req, res, next) => {
    const roles = req.session.roles || [];
    if (roles.includes('superadmin') || roles.includes('rsp_admin') || tienePermiso('banco', permiso, roles)) return next();
    if (req.xhr || req.path.startsWith('/api/')) {
      return res.status(403).json({ error: `Permiso denegado: ${permiso}` });
    }
    return res.redirect('/rsp');
  };
}

// ── Campos variables del banco que se pueden ajustar desde el RSP ──────
const CAMPOS_CONFIG = [
  { key: 'rbuAmountPz', label: 'Importe RBU (Pz)', tipo: 'number', def: 5 },
  { key: 'webBridgeCommissionPercent', label: 'Comisión puente web (%)', tipo: 'number', def: 3 },
  { key: 'capitaliaBankCommissionPercent', label: 'Comisión Capitalia Bank (%)', tipo: 'number', def: 2 },
  { key: 'investmentGainCommissionPercent', label: 'Comisión ganancia inversión (%)', tipo: 'number', def: 4 },
  { key: 'savingsInterestAnnualPercent', label: 'Interés ahorro anual (%)', tipo: 'number', def: 2 },
  { key: 'juniorSavingsInterestAnnualPercent', label: 'Interés ahorro junior (%)', tipo: 'number', def: 3 },
  { key: 'irmBusinessPercent', label: 'IRM empresas (%)', tipo: 'number', def: 9 },
  { key: 'vatPercent', label: 'IVA general (%)', tipo: 'number', def: 12 },
  { key: 'contactlessLimitPz', label: 'Límite contactless (Pz)', tipo: 'number', def: 500 },
  { key: 'maxCurrentBalancePz', label: 'Tope cuenta corriente (Pz)', tipo: 'number', def: 500000 },
  { key: 'maxSavingsBalancePz', label: 'Tope cuenta ahorro (Pz)', tipo: 'number', def: 1000000 },
  { key: 'maxChildBalancePz', label: 'Tope cuenta junior (Pz)', tipo: 'number', def: 5000 },
  { key: 'maxBusinessBalancePz', label: 'Tope cuenta empresa (Pz)', tipo: 'number', def: 10000000 }
];

function numero(value, def) {
  const n = Number(value);
  return Number.isFinite(n) ? n : def;
}

function aplicarCampo(config, campo, value) {
  if (value === '' || value === null || value === undefined) return;
  if (campo.tipo === 'number') config[campo.key] = numero(value, campo.def);
  else config[campo.key] = String(value);
}

// ── Panel de Supervisión del Banco (RSP) ───────────────────────────────
router.get('/supervision/banco', puedeBancoRsp('ver_cuentas'), async (req, res) => {
  const state = await apiBancoGetState();
  const config = state?.treasuryConfig || {};
  const transacciones = (state?.transactions || [])
    .filter(t => t.kind === 'Transfer' || t.kind === 'Reversal')
    .slice(0, 60);

  const cuentas = (state?.accounts || []).reduce((map, a) => {
    map[a.id] = a;
    return map;
  }, {});

  const filas = transacciones.map(t => {
    const origen = cuentas[t.fromAccountId];
    const destino = cuentas[t.toAccountId];
    return {
      id: t.id,
      concepto: t.concept || '—',
      fromAccountId: t.fromAccountId,
      toAccountId: t.toAccountId,
      origen: origen?.displayName || origen?.iban || t.fromAccountId,
      destino: destino?.displayName || destino?.iban || t.toAccountId,
      amountPz: t.amountPz,
      ivaPz: Number(t.ivaPz || t.taxAmount || 0),
      status: t.status || 'Settled',
      createdAt: t.createdAt || '',
      esReversal: t.kind === 'Reversal',
      originalTransactionId: t.originalTransactionId || null
    };
  });

  const campos = CAMPOS_CONFIG.map(c => ({
    ...c,
    valor: (config[c.key] !== undefined && config[c.key] !== null) ? config[c.key] : c.def
  }));

  res.render('supervision/banco', {
    titulo: 'Supervisión del Banco',
    entidad_actual: 'rsp',
    campos,
    filas,
    sinConexion: !state
  });
});

// ── Guardar configuración variable (comisiones, RBU, límites…) ─────────
router.post('/api/banco/config', puedeBancoRsp('modificar_cuentas'), async (req, res) => {
  try {
    const body = req.body || {};
    const config = {};
    for (const campo of CAMPOS_CONFIG) {
      aplicarCampo(config, campo, body[campo.key]);
    }
    const resultado = await apiBancoPost('guardar-config', { config, motivo: body.motivo || 'Ajuste desde RSP' });
    if (!resultado?.success) {
      return res.status(502).json({ error: resultado?.error || 'No se pudo guardar la configuración en el backend del banco' });
    }
    res.json({ success: true, message: resultado.message, config });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Revertir una transferencia ─────────────────────────────────────────
router.post('/api/banco/revertir-transferencia', puedeBancoRsp('revertir_operaciones'), async (req, res) => {
  try {
    const { transactionId, motivo } = req.body || {};
    if (!transactionId) return res.status(400).json({ error: 'transactionId requerido' });
    const resultado = await apiBancoPost('revertir-transferencia', { transactionId, motivo: motivo || 'Reversión desde RSP' });
    if (!resultado?.success) {
      return res.status(400).json({ error: resultado?.error || 'No se pudo revertir la transferencia' });
    }
    res.json({ success: true, ...resultado });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Soporte: listar y responder consultas/tickets del banco ────────────
router.get('/supervision/soporte', puedeBancoRsp('ver_cuentas'), async (req, res) => {
  const state = await apiBancoGetState();
  const tickets = (state?.supportTickets || []).slice().sort((a, b) =>
    (String(b.createdAt || '')).localeCompare(String(a.createdAt || ''))
  ).map(t => ({
    id: t.id,
    category: t.category || 'General',
    priority: t.priority || 'Media',
    subject: t.subject || '—',
    message: t.message || '',
    dip: t.dip || '',
    name: t.name || t.dip || '—',
    accountId: t.accountId || '',
    status: t.status || 'Abierto',
    createdAt: t.createdAt || '',
    responses: Array.isArray(t.responses) ? t.responses : []
  }));

  res.render('supervision/soporte', {
    titulo: 'Soporte del Banco',
    entidad_actual: 'rsp',
    tickets,
    sinConexion: !state
  });
});

router.post('/api/banco/responder-soporte', puedeBancoRsp('ver_cuentas'), async (req, res) => {
  try {
    const { ticketId, respuesta } = req.body || {};
    if (!ticketId || !respuesta?.trim()) return res.status(400).json({ error: 'ticketId y respuesta requeridos' });
    const resultado = await apiBancoPost('responder-soporte', { ticketId, respuesta: respuesta.trim() });
    if (!resultado?.success) {
      return res.status(400).json({ error: resultado?.error || 'No se pudo responder el ticket' });
    }
    res.json({ success: true, message: resultado.message, ticket: resultado.ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
