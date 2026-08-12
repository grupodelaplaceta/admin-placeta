/**
 * Gestión de Empresas y EIP — Tabla independiente (no bancaria)
 * Almacena solo: nombre, DIP de empresa, EIP, representantes.
 * Las empresas van por EIP, no por IBAN.
 */
import { Router } from 'express';
import { verificarPermiso } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { apiBancoGetState } from '../config/db.js';

const router = Router();

// ── Almacenamiento en memoria ─────────────────────────────────────────────
const memEmpresas = new Map();
let idCounter = 0;

function nextId() { return 'EMP-' + String(++idCounter).padStart(4, '0'); }

async function persistirEmpresa(e) {
  if (!supabase) return;
  try {
    // representantes se guarda como JSONB (array), NO como texto
    const { error } = await supabase.from('rsp_empresas').upsert({
      id: e.id, nombre: e.nombre, eip: e.eip, dip: e.dip,
      representantes: e.representantes || [],
      activa: e.activa !== false, creada: e.creada,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error && error.code === '42P01') {
      try { await supabase.rpc('exec_sql', { sql: `CREATE TABLE IF NOT EXISTS rsp_empresas (
        id TEXT PRIMARY KEY, nombre TEXT NOT NULL, eip TEXT, dip TEXT,
        representantes JSONB DEFAULT '[]', activa BOOLEAN DEFAULT true, creada TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );`}); } catch (_) {}
    } else if (error) { console.warn('[Empresas] Error persistir:', error.message); }
  } catch (err) { console.warn('[Empresas] Error persistir:', err.message); }
}

// Cargar empresas REALES desde Supabase (persistentes).
// NO se siembran ejemplos: si no hay datos reales, la tabla sale vacía.
async function initEmpresas() {
  try {
    if (supabase) {
      const { data } = await supabase.from('rsp_empresas').select('*').limit(1000);
      if (data && data.length > 0) {
        // Limpiar restos de los datos de ejemplo sembrados antes (datos falsos)
        for (const row of data) {
          if ((row.id === 'EMP-0001' || row.id === 'EMP-0002') &&
              (row.eip === 'EIP-CAP001' || row.eip === 'EIP-TRIB01')) {
            try { await supabase.from('rsp_empresas').delete().eq('id', row.id); } catch (_) {}
            continue;
          }
          let rep = row.representantes || [];
          if (typeof rep === 'string') { try { rep = JSON.parse(rep || '[]'); } catch (_) { rep = []; } }
          memEmpresas.set(row.id, {
            id: row.id, nombre: row.nombre, eip: row.eip, dip: row.dip,
            representantes: rep, activa: row.activa !== false, creada: row.creada
          });
          const n = parseInt(String(row.id || '').replace(/\D/g, ''), 10);
          if (!Number.isNaN(n)) idCounter = Math.max(idCounter, n);
        }
      }
    }
  } catch (e) { console.warn('[Empresas] No se pudieron cargar de Supabase:', e.message); }
}

const empresasReady = initEmpresas();

// ── Listado de Empresas (solo datos propios, sin IBAN/saldos) ──────────────
router.get('/empresas', async (req, res) => {
  await empresasReady;
  const empresas = [...memEmpresas.values()].filter(e => e.activa !== false);
  res.render('empresas/lista', {
    titulo: 'Gestión de Empresas y EIP',
    entidad_actual: req.baseUrl.replace('/', ''),
    empresas, total: empresas.length
  });
});

// ── API: Listar empresas ──────────────────────────────────────────────────
router.get('/api/empresas', async (req, res) => {
  await empresasReady;
  res.json([...memEmpresas.values()].filter(e => e.activa !== false));
});

// ── API: Crear empresa (alta manual por DIP o EIP, o auto-alta con EIP) ──
router.post('/api/empresas/crear', async (req, res) => {
  const { nombre, eip, dipEmpresa, representanteDip, representanteNombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

  // Si no se proporciona EIP, generarlo automáticamente
  const eipFinal = eip || 'EIP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  // Si no se proporciona DIP, usar el nombre normalizado
  const dipFinal = dipEmpresa || nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

  const representantes = [];
  if (representanteDip) {
    representantes.push({ dip: representanteDip, nombre: representanteNombre || representanteDip, cargo: 'Representante' });
  }

  const id = nextId();
  const empresa = { id, nombre, eip: eipFinal, dip: dipFinal, representantes, activa: true, creada: new Date().toISOString() };
  memEmpresas.set(id, empresa);
  await persistirEmpresa(empresa);
  res.json({ success: true, empresa });
});

// ── API: Obtener empresa ──────────────────────────────────────────────────
router.get('/api/empresas/:id', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  res.json(emp);
});

// ── API: Modificar empresa ────────────────────────────────────────────────
router.put('/api/empresas/:id', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  const { nombre, eip, dipEmpresa } = req.body;
  Object.assign(emp, { ...(nombre && { nombre }), ...(eip && { eip }), ...(dipEmpresa && { dip: dipEmpresa }) });
  memEmpresas.set(req.params.id, emp);
  await persistirEmpresa(emp);
  res.json({ success: true, empresa: emp });
});

// ── API: Vincular ciudadano como representante ───────────────────────────
router.post('/api/empresas/:id/representante', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  const { dip, nombre, cargo } = req.body;
  if (!dip) return res.status(400).json({ error: 'DIP requerido' });
  // Evitar duplicados
  if (!emp.representantes.find(r => r.dip === dip)) {
    emp.representantes.push({ dip, nombre: nombre || dip, cargo: cargo || 'Representante' });
  }
  await persistirEmpresa(emp);
  res.json({ success: true, representantes: emp.representantes });
});

// ── API: Quitar representante ─────────────────────────────────────────────
router.delete('/api/empresas/:id/representante/:dip', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  emp.representantes = emp.representantes.filter(r => r.dip !== req.params.dip);
  await persistirEmpresa(emp);
  res.json({ success: true, representantes: emp.representantes });
});

// ── API: Importar titulares de la cuenta bancaria (con su %) ─────────────
// Busca la cuenta de EMPRESA en el estado del Banco (por EIP o por nombre) y
// trae sus cotitulares/titulares registrados (accountHolders) con el % de
// participación, incorporándolos como representantes de la empresa.
router.post('/api/empresas/:id/importar-titulares', async (req, res) => {
  try {
    const emp = memEmpresas.get(req.params.id);
    if (!emp) return res.status(404).json({ error: 'No encontrada' });

    const state = await apiBancoGetState();
    if (!state) return res.status(502).json({ error: 'No se pudo leer el estado del Banco' });

    const cuentas = Array.isArray(state.accounts) ? state.accounts : [];
    const usuarios = Array.isArray(state.users) ? state.users : [];
    const holders = Array.isArray(state.accountHolders) ? state.accountHolders : [];

    // 1) Localizar la cuenta de empresa: por EIP o por nombre (displayName)
    const eipNorm = String(emp.eip || '').trim().toUpperCase();
    let cuenta = cuentas.find(a => a.type === 'Business' && eipNorm && String(a.eip || '').trim().toUpperCase() === eipNorm);
    if (!cuenta) cuenta = cuentas.find(a => a.type === 'Business' && a.displayName && String(a.displayName).trim().toLowerCase() === String(emp.nombre || '').trim().toLowerCase());
    if (!cuenta) return res.status(404).json({ error: 'No se encontró la cuenta de empresa en el Banco (revisa el EIP o el nombre)' });

    // 2) Cotitulares/titulares registrados en esa cuenta
    const deCuenta = holders.filter(h => h.accountId === cuenta.id);
    if (deCuenta.length === 0) return res.status(404).json({ error: 'La cuenta bancaria no tiene titulares registrados (accountHolders)' });

    const resolver = (placetaId) => {
      const u = usuarios.find(us => String(us.placetaId || '').trim().toUpperCase() === String(placetaId || '').trim().toUpperCase());
      return u ? { dip: u.dip, nombre: u.displayName || u.dip } : { dip: placetaId, nombre: placetaId };
    };

    let importados = 0;
    for (const h of deCuenta) {
      const persona = resolver(h.placetaId);
      const pct = Number(h.ownershipPercent || h.ownership || 0);
      if (emp.representantes.find(r => r.dip === persona.dip)) continue;
      emp.representantes.push({
        dip: persona.dip,
        nombre: persona.nombre,
        cargo: h.role === 'Primary' ? 'Titular principal' : (h.role || 'Titular'),
        ownershipPercent: pct
      });
      importados++;
    }
    await persistirEmpresa(emp);
    res.json({ success: true, importados, cuenta: cuenta.id, iban: cuenta.iban, representantes: emp.representantes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Dar de baja (borrado lógico) ─────────────────────────────────────
router.delete('/api/empresas/:id', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  emp.activa = false;
  await persistirEmpresa(emp);
  res.json({ success: true, message: 'Empresa dada de baja' });
});

// ── API: Reactivar empresa ────────────────────────────────────────────────
router.post('/api/empresas/:id/reactivar', async (req, res) => {
  const emp = memEmpresas.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'No encontrada' });
  emp.activa = true;
  await persistirEmpresa(emp);
  res.json({ success: true });
});

// ── Vista de Cumplimiento Fiscal ──────────────────────────────────────────
router.get('/empresas/cumplimiento', async (req, res) => {
  await empresasReady;
  const empresas = [...memEmpresas.values()].filter(e => e.activa !== false);
  // Enriquecer con el saldo REAL del banco (por EIP): el cumplimiento se calcula
  // sobre los fondos reales de la empresa, no sobre datos simulados.
  const state = await apiBancoGetState().catch(() => null);
  const saldoPorEip = new Map();
  for (const a of (state?.accounts || [])) {
    if (!a.eip) continue;
    const eip = String(a.eip).toUpperCase();
    saldoPorEip.set(eip, (saldoPorEip.get(eip) || 0) + (a.balancePz || 0));
  }
  res.render('empresas/cumplimiento', {
    titulo: 'Cumplimiento Fiscal — Empresas',
    entidad_actual: req.baseUrl.replace('/', ''),
    empresas: empresas.map(e => {
      const saldo = saldoPorEip.get(String(e.eip || '').toUpperCase()) || 0;
      const limite = (e.tipo || 'Business') === 'Business' ? 10000000 : 500000;
      return {
        id: e.id, nombre: e.nombre, eip: e.eip, dip: e.dip, tipo: e.tipo || 'Business',
        numRepresentantes: e.representantes?.length || 0,
        saldo: Math.round(saldo * 100) / 100,
        limite,
        exceso: saldo > limite ? Math.round((saldo - limite) * 100) / 100 : 0,
        compliance: saldo > limite ? 'ExcesoCapital' : 'Clear'
      };
    })
  });
});

export default router;
