/* ═══════════════════════════════════════════════════════════════════════
   rsp-web-api — Rutas de dominio (lectura + escritura) del BFF.
   Implementación de REFERENCIA con almacén en memoria: cubre el contrato
   del httpProvider del SPA para que admin-placeta pueda desaparecer como
   capa web. Sustituir `store` por Supabase/Postgres en producción.
   Los datos del banco se leen en vivo (getBankState) y las mutaciones
   bancarias se aplican como overlay en memoria (el crm-state es de solo
   lectura). Las reglas de cierre/reparto replican el motor del SPA.
   ═══════════════════════════════════════════════════════════════════════ */
import { Router } from 'express';
import { calcularContribuyentes } from './tributos.js';

const AHORA = () => new Date().toISOString();
const round2 = (n) => Math.round(n * 100) / 100;
const limpiar = (s = '') => String(s).replace(/\s*\(.*\)\s*$/, '').trim();

export function createApiRouter({ getBankState }) {
  const router = Router();

  /* ── Almacén en memoria (solo datos creados en sesión; SIN datos demo) ── */
  // Los datos reales vienen del banco (crm-state), de la Academia
  // (admin-placeta) y del BOP. Nada de aquí se inventa: los listados que aún
  // no tienen fuente real arrancan vacíos.
  const store = {
    ciudadanos: [],   // derivados del banco en `ciudadanosDelBanco()`
    entidades: [],    // derivadas del banco en `entidadesDelBanco()`
    expedientes: [],  // fuente real: Supabase (a conectar)
    tramites: [],     // fuente real: Supabase (a conectar)
    subvenciones: [],
    subvencionesDetalle: {},
    bonos: [],
    bonosDetalle: {},
    juniorActividades: [],   // proxeados de la API real de la Academia
    juniorColaboradores: [],
    juniorDiplomas: [],
    operaciones: [],  // fuente real: motor de operaciones del banco
    auditoria: [],    // fuente real: Supabase (a conectar)
    notificaciones: [],
    cnic: [
      { codigo: 'CNIC-IGF-PF-TIPO-3', etiqueta: 'Tipo IGF personas físicas tramo 3', tipoValor: 'porcentaje', valor: 30, unidad: '%', version: 1, estado: 'vigente', autor: 'Tributos', fuente: 'BOP' },
      { codigo: 'CNIC-IGF-EMPRESA-TIPO-4', etiqueta: 'Tipo IGF empresas tramo 4', tipoValor: 'porcentaje', valor: 85, unidad: '%', version: 1, estado: 'vigente', autor: 'Tributos', fuente: 'BOP' },
    ],
    votaciones: [],
    votos: [],
    juntas: [],
    encuestas: [],
    solicitudes2fa: new Map(),
  };

  let nuevaCuentaSeq = 0;
  const nuevasCuentas = [];
  const overlayCuentas = new Map();
  const overlayTarjetas = new Map();

  function mapearCuenta(a) {
    const nombre = limpiar(a.displayName || a.name || a.id);
    const holders = (a.accountHolders || [])
      .filter((h) => Number(h.ownershipPercent || h.pct || 0) > 0)
      .map((h) => ({
        dip: String(h.placetaId || h.dip || '').toUpperCase(),
        nombre: limpiar(h.displayName || h.name || h.placetaId || h.dip || ''),
        pct: Number(h.ownershipPercent || h.pct || 0),
      }));
    return {
      id: a.id,
      nombre,
      tipo: a.type || 'Current',
      dip: (a.placetaId || '').toUpperCase(),
      saldo: Number(a.balancePz || 0),
      estado: a.closedAt ? 'cerrada' : 'activa',
      esFundacion: /fundacion|fundación/i.test(nombre) || /^FUND-/.test(a.id || ''),
      eip: String(a.eip || '').toUpperCase(),
      participaciones: holders,
    };
  }
  function mapearTarjeta(d) {
    const num = String(d.cardNumber || d.id || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
    return {
      id: d.id, alias: d.alias || 'Tarjeta', accountId: d.accountId || '',
      tier: d.tier || 'Standard', frozen: !!d.frozen, cardNumber: num,
      promoPhysical: !!d.promoPhysical, pin: d.pin || '0000',
      contactlessLimitPz: 500, weeklyLimitPz: 1000,
    };
  }

  async function listarCuentas() {
    const state = await getBankState();
    const base = (state.accounts || []).map(mapearCuenta);
    return [...base, ...nuevasCuentas].map((c) => ({ ...c, ...(overlayCuentas.get(c.id) || {}) }));
  }
  async function listarTarjetas() {
    const state = await getBankState();
    const base = (state.digitalCards || state.cards || []).map(mapearTarjeta);
    return base.map((t) => ({ ...t, ...(overlayTarjetas.get(t.id) || {}) }));
  }
  function mutarCuenta(id, patch) {
    overlayCuentas.set(id, { ...(overlayCuentas.get(id) || {}), ...patch });
  }

  /* ── Entidades derivadas de las cuentas Business reales del banco ── */
  const EIP_POR_NOMBRE = {
    'Unhiro S.PV.': 'EIP-XJETNL',
    'Unhiro Inversiones S.P.': 'EIP-XJETNL',
    'Red del Grupo de La Placeta S.P.': 'EIP-X4NGQU',
    // 'Placeta Telecom S.P.': EIP pendiente de confirmar (llega por `eip` real).
    'Capitália Empresa': 'CAPITALIA_BANK',
  };
  const NOMBRE_EIP = {
    'EIP-XJETNL': 'Unhiro Inversiones S.P.',
    'EIP-X4NGQU': 'Red del Grupo de La Placeta S.P.',
    'CAPITALIA_BANK': 'Capitália Empresa',
  };
  const SISTEMA_CUENTA = /^(TGLP|AGLDP|VAULT_EMISION|DIP-|sys-|biz-market-|FUND-BLP)$/;
  function eipDeCuenta(c) {
    if (c.eip) return c.eip;
    if (SISTEMA_CUENTA.test(c.id)) return '';
    return EIP_POR_NOMBRE[c.nombre] || '';
  }
  async function entidadesDelBanco() {
    const cuentas = await listarCuentas();
    const map = new Map();
    for (const c of cuentas) {
      if (c.tipo !== 'Business' || c.estado === 'cerrada') continue;
      const eip = eipDeCuenta(c);
      if (!eip) continue;
      let e = map.get(eip);
      if (!e) {
        e = {
          eip,
          nombre: NOMBRE_EIP[eip] || c.nombre,
          tipo: eip === 'CAPITALIA_BANK' ? 'Sociedad pública' : 'Sociedad',
          representantes: [],
          estado: 'activa',
          cumplimiento: 'Al día',
          cuentas: 0,
          titulares: 0,
          participacionTotal: 0,
        };
        map.set(eip, e);
      }
      e.cuentas += 1;
      for (const p of c.participaciones || []) {
        if (p.dip && !e.representantes.includes(p.dip)) e.representantes.push(p.dip);
      }
    }
    const out = [];
    for (const e of map.values()) {
      const unicos = new Set(e.representantes);
      out.push({ ...e, titulares: unicos.size, representantes: Array.from(unicos) });
    }
    return out;
  }
  // Ciudadanos REALES derivados de las cuentas del banco (placetaId = DIP).
  async function ciudadanosDelBanco() {
    const cuentas = await listarCuentas();
    const DIP = /^[XYZ0-9][0-9]{7,8}[A-Z]$/;
    const map = new Map();
    for (const c of cuentas) {
      if (!DIP.test(c.dip)) continue;
      const e = map.get(c.dip) || { dip: c.dip, nombre: c.nombre, nivel: 'N1', cuentas: 0, expedientesActivos: 0, estado: 'activo' };
      e.cuentas += 1;
      map.set(c.dip, e);
    }
    return Array.from(map.values());
  }
  // Facturas emitidas: ventas reales (sender = empresa) desde los movimientos.
  function facturasDe(eip, state, cuentas) {
    const propias = new Set(cuentas.filter((c) => eipDeCuenta(c) === eip).map((c) => c.id));
    const KINDS_VENTA = new Set(['Consumption', 'Placezum', 'OperationalFee', 'Service']);
    const facturas = [];
    for (const t of state.transactions || []) {
      if (t.status && String(t.status).toLowerCase() !== 'settled') continue;
      if (!propias.has(t.fromAccountId || t.fromIban)) continue;
      if (!KINDS_VENTA.has(t.kind || t.concept)) continue;
      facturas.push({
        id: t.id,
        numero: t.id,
        concepto: t.concept || t.kind || 'Venta',
        importe: Number(t.amountPz || t.netAmount || 0),
        estado: 'cobrada',
        fecha: (t.createdAt || t.timestamp || '').slice(0, 10),
        receptor: '',
        receptorId: t.toAccountId || t.toIban || '',
      });
    }
    return facturas;
  }

  // Requisitos de bono: comprobación automática contra datos reales.
  function cumple(actual, operador, valor) {
    switch (operador) {
      case '<': return actual < valor;
      case '>': return actual > valor;
      case '<=': return actual <= valor;
      case '>=': return actual >= valor;
      case '==': return actual === valor;
      default: return false;
    }
  }
  async function verificarRequisitos(dip, requisitos) {
    const cuentas = await listarCuentas();
    const ciudadanos = await ciudadanosDelBanco();
    const propias = cuentas.filter((c) => c.dip === dip && c.estado === 'activa');
    const junior = propias.some((c) => c.tipo === 'Child') ? 1 : 0;
    const nivel = ciudadanos.find((c) => c.dip === dip)?.nivel === 'N3' ? 3 : 1;
    const datos = {
      patrimonio: propias.reduce((s, c) => s + c.saldo, 0),
      cuentas: propias.length,
      junior,
      edad: junior ? 15 : 18,
      nivel,
      fiscal: 1, // al día por defecto en el censo del BFF de referencia
    };
    const fallos = [];
    for (const r of requisitos || []) {
      const actual = datos[r.tipo];
      if (typeof actual !== 'number' || !cumple(actual, r.operador, r.valor)) fallos.push(r);
    }
    return fallos;
  }

  function cerrarCuenta(c, motivo) {
    if (c.estado === 'cerrada') throw new Error('La cuenta ya está cerrada');
    if (c.esFundacion) throw new Error('Las fundaciones no se pueden cerrar ni repartir');
    if (c.tipo === 'Business') {
      if (c.saldo > 0) throw new Error('Reparte antes los fondos de la empresa conforme al % de participaciones');
    } else if (c.saldo > 0) {
      if (motivo !== 'baja' && motivo !== 'herencia') {
        throw new Error('No se pueden cerrar cuentas personales con capital salvo baja de usuario o herencia');
      }
    }
    return { estado: 'cerrada' };
  }

  function repartir(c, cuentas) {
    if (c.tipo !== 'Business') throw new Error('Solo las cuentas de empresa se reparten conforme al %');
    if (c.esFundacion) throw new Error('Las fundaciones no se reparten ni se cierran');
    if (c.saldo <= 0) throw new Error('La cuenta no tiene fondos que repartir');
    const partes = c.participaciones || [];
    if (partes.length === 0) throw new Error('Sin participaciones registradas para repartir');
    let restante = c.saldo;
    partes.forEach((p, i) => {
      const importe = i === partes.length - 1 ? round2(restante) : round2((c.saldo * p.pct) / 100);
      const destino = cuentas.find((x) => x.dip === p.dip && x.estado === 'activa' && (x.tipo === 'Current' || x.tipo === 'Savings'));
      if (destino) mutarCuenta(destino.id, { saldo: round2(destino.saldo + importe) });
      restante = round2(restante - importe);
    });
    mutarCuenta(c.id, { saldo: 0 });
  }

  /* ── Trámites ────────────────────────────────────────────────────── */
  router.get('/rsp/tramites/api', (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    const estado = req.query.estado;
    let lista = store.tramites;
    if (q) lista = lista.filter((t) => t.titulo.toLowerCase().includes(q) || t.dip.toLowerCase().includes(q));
    if (estado) lista = lista.filter((t) => t.estado === estado);
    res.json(lista);
  });
  router.get('/rsp/tramites/api/bandeja', (_req, res) => {
    res.json(store.tramites.filter((t) => t.asignadoA || t.vencido));
  });
  router.get('/rsp/tramites/api/:id', (req, res) => {
    const t = store.tramites.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Trámite no encontrado' });
    res.json({ ...t, requisitos: [], documentos: [], actuaciones: [] });
  });
  router.post('/rsp/tramites/api', (req, res) => {
    const d = req.body || {};
    const t = {
      id: `TR-${Date.now()}`,
      tipo: d.tipo || 'certificado',
      titulo: d.concepto || d.tipo,
      dip: d.dip,
      nombreCiudadano: d.nombre || d.dip,
      estado: 'inicio',
      plazo: 10,
      servicio: d.servicio || 'RSP',
      actualizadoEn: AHORA(),
      datosEspecificos: d.datos || {},
    };
    store.tramites.unshift(t);
    res.status(201).json(t);
  });
  router.post('/rsp/tramites/api/:id/accion', (req, res) => {
    const t = store.tramites.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Trámite no encontrado' });
    t.estado = req.body?.accion === 'resolver' ? 'resolucion' : req.body?.accion || t.estado;
    t.actualizadoEn = AHORA();
    res.json(t);
  });
  router.post('/rsp/tramites/api/2fa/enviar', (req, res) => {
    const id = `2FA-${Date.now()}`;
    store.solicitudes2fa.set(id, 'pendiente');
    res.json({ id, estado: 'pendiente' });
  });
  router.get('/rsp/tramites/api/2fa/estado/:id', (req, res) => {
    const s = store.solicitudes2fa.get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Solicitud 2FA no encontrada' });
    store.solicitudes2fa.set(req.params.id, 'confirmada');
    res.json(true);
  });

  /* ── Expedientes ─────────────────────────────────────────────────── */
  router.get('/rsp/expedientes/api', (_req, res) => res.json(store.expedientes));
  router.get('/rsp/expedientes/api/:id', (req, res) => {
    const e = store.expedientes.find((x) => x.id === req.params.id);
    if (!e) return res.status(404).json({ error: 'Expediente no encontrado' });
    res.json({ ...e, actuaciones: [] });
  });

  /* ── Ciudadanos / entidades ──────────────────────────────────────── */
  router.get('/rsp/api/ciudadanos', async (req, res) => {
    try {
      const todos = await ciudadanosDelBanco();
      const q = String(req.query.q || '').toLowerCase();
      const lista = q ? todos.filter((c) => c.nombre.toLowerCase().includes(q) || c.dip.toLowerCase().includes(q)) : todos;
      res.json(lista);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.get('/rsp/api/contexto/:dip', async (req, res) => {
    try {
      const c = (await ciudadanosDelBanco()).find((x) => x.dip === req.params.dip);
      if (!c) return res.status(404).json({ error: 'Ciudadano no encontrado' });
      res.json({ ...c, email: `${c.dip.toLowerCase()}@laplaceta.org`, bloques: [{ clave: 'identidad', etiqueta: 'Identidad', icono: 'user', items: [{ clave: 'nivel', etiqueta: 'Nivel', valor: c.nivel }] }] });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.post('/rsp/api/ciudadanos/:dip', async (req, res) => {
    try {
      const c = (await ciudadanosDelBanco()).find((x) => x.dip === req.params.dip);
      if (!c) return res.status(404).json({ error: 'Ciudadano no encontrado' });
      res.json({ ok: true });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.get('/rsp/api/ciudadanos/:dip/documentos', (_req, res) => res.json([]));
  router.get('/rsp/api/ciudadanos/:dip/firmas', (_req, res) => res.json([]));
  router.get('/rsp/api/ciudadanos/:dip/obligaciones', (_req, res) => res.json([]));
  router.get('/rsp/api/cuentas/buscar', async (req, res) => {
    try {
      const q = String(req.query.q || '').toLowerCase();
      const cuentas = await listarCuentas();
      res.json(cuentas.filter((c) => c.id.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)).map((c) => ({ id: c.id, etiqueta: `${c.nombre} · ${c.tipo}`, tipo: c.tipo })));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.get('/rsp/api/entidades', async (_req, res) => {
    try { res.json(await entidadesDelBanco()); } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/api/entidades/:eip', async (req, res) => {
    try {
      const eip = req.params.eip;
      const cuentas = await listarCuentas();
      const ciudadanos = await ciudadanosDelBanco();
      const propias = cuentas.filter((c) => eipDeCuenta(c) === eip);
      const entidad = (await entidadesDelBanco()).find((x) => x.eip === eip);
      if (!entidad && propias.length === 0) return res.status(404).json({ error: 'Entidad no encontrada' });

      // Participación agregada por titular.
      const suma = new Map();
      for (const c of propias) {
        for (const p of c.participaciones || []) {
          if (p.dip) suma.set(p.dip, (suma.get(p.dip) || 0) + p.pct);
        }
      }
      const participacion = Array.from(suma.entries()).map(([dip, pct]) => ({
        dip,
        nombre: ciudadanos.find((x) => x.dip === dip)?.nombre || dip,
        pct: Math.round(pct * 10) / 10,
      }));

      const state = await getBankState();
      const facturas = facturasDe(eip, state, cuentas);
      const tramites = store.tramites.filter((t) => t.dip === eip);

      res.json({
        eip,
        nombre: entidad?.nombre || NOMBRE_EIP[eip] || (propias[0]?.nombre ?? eip),
        tipo: entidad?.tipo || 'Sociedad',
        estado: entidad?.estado || 'activa',
        cumplimiento: entidad?.cumplimiento,
        representantes: (entidad?.representantes || []).map((dip) => ({
          dip,
          nombre: ciudadanos.find((x) => x.dip === dip)?.nombre || dip,
          cargo: 'Representante legal',
        })),
        documentos: [],
        obligaciones: [],
        cuentas: propias,
        facturasEmitidas: facturas,
        participacion,
        tramites,
      });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  /* ── Subvenciones ────────────────────────────────────────────────── */
  router.get('/rsp/subvenciones/api', (_req, res) => res.json(store.subvenciones));
  router.get('/rsp/subvenciones/api/:id', (req, res) => {
    const s = store.subvencionesDetalle[req.params.id];
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    res.json(s);
  });
  router.post('/rsp/subvenciones/api/conceder', (req, res) => {
    const d = req.body || {};
    const s = {
      id: `SUB-${Date.now()}`,
      emisorEip: d.emisorEip, emisorNombre: d.emisorEip,
      receptorEip: d.receptorEip, receptorNombre: d.receptorEip,
      importe: d.importe, importeRestante: d.importe,
      concepto: d.concepto, estado: 'concedida', fechaConcesion: AHORA().slice(0, 10),
      publicada: d.publicada ?? false,
    };
    store.subvenciones.unshift(s);
    store.subvencionesDetalle[s.id] = {
      ...s, documentosRequeridos: [], gastos: [], justificaciones: [],
      excluirTipos: ['Tax', 'IrmCharge', 'IvaAdjustment'],
      tiposAptos: d.tiposAptos || [],
      baremos: d.baremos || [],
      publicadaEn: d.publicada ? AHORA() : undefined,
      bopUrl: d.publicada ? `https://gdlp.laplaceta.org/subvenciones.html?codigo=${s.id}` : undefined,
    };
    res.status(201).json(s);
  });
  router.post('/rsp/subvenciones/api/:id/requerir-documentos', (req, res) => {
    const s = store.subvencionesDetalle[req.params.id];
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    s.documentosRequeridos = (req.body?.documentos || []).map((nombre, i) => ({ id: `DOC-${i}`, nombre, tipo: 'anexo', aportado: false }));
    res.json({ ok: true });
  });
  router.post('/rsp/subvenciones/api/:id/justificar', (req, res) => {
    const s = store.subvencionesDetalle[req.params.id];
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    s.estado = 'justificada';
    res.json({ ok: true });
  });

  /* ── Bonificaciones (bonos) ──────────────────────────────────────── */
  router.get('/rsp/bonos/api', (_req, res) => res.json(store.bonos));
  router.get('/rsp/bonos/api/:id', (req, res) => {
    const b = store.bonosDetalle[req.params.id];
    if (!b) return res.status(404).json({ error: 'Bono no encontrado' });
    res.json(b);
  });
  router.post('/rsp/bonos/api', (req, res) => {
    const d = req.body || {};
    const b = {
      id: `BONO-${Date.now()}`, nombre: d.nombre, emisorEip: d.emisorEip, emisorNombre: d.emisorEip,
      presupuesto: d.presupuesto, maxPorPersona: d.maxPorPersona, baremos: d.baremos || [],
      requisitos: d.requisitos || [],
      fechaLimite: d.fechaLimite, presupuestoUsado: 0, adscritos: 0, estado: 'activo',
    };
    store.bonos.unshift(b);
    store.bonosDetalle[b.id] = { ...b, adscripciones: [], justificaciones: [] };
    res.status(201).json(b);
  });
  router.post('/rsp/bonos/api/:id/adscribir', async (req, res) => {
    const b = store.bonos.find((x) => x.id === req.params.id);
    if (!b) return res.status(404).json({ error: 'Bono no encontrado' });
    const dip = (req.body?.dip || '').toUpperCase();

    // Comprobación automática de requisitos contra datos reales del banco.
    try {
      const fallos = await verificarRequisitos(dip, b.requisitos);
      if (fallos.length) {
        const detalle = fallos.map((f) => f.descripcion).join(' · ');
        return res.status(400).json({ error: `No cumple los requisitos: ${detalle}` });
      }
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }

    const detalle = store.bonosDetalle[b.id];
    if (!detalle.adscripciones.some((a) => a.dip === dip)) {
      detalle.adscripciones.push({ dip, nombre: dip, fechaAdscripcion: AHORA().slice(0, 10), justificado: 0 });
      b.adscritos += 1;
      b.presupuestoUsado = Math.min(b.presupuesto, b.presupuestoUsado + b.maxPorPersona);
    }
    res.json({ ok: true });
  });

  /* ── Banco (lectura viva + overlay de mutaciones) ────────────────── */
  router.get('/rsp/banco/api/cuentas', async (_req, res) => {
    try { res.json(await listarCuentas()); } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/banco/api/tarjetas', async (_req, res) => {
    try { res.json(await listarTarjetas()); } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.post('/rsp/banco/api/cuentas', (req, res) => {
    const d = req.body || {};
    const c = { id: `acc-nueva-${++nuevaCuentaSeq}`, nombre: d.nombre, tipo: d.tipo, dip: (d.dip || '').toUpperCase(), saldo: Number(d.saldoInicial || 0), estado: 'activa' };
    nuevasCuentas.push(c);
    res.status(201).json(c);
  });
  router.post('/rsp/banco/api/cuentas/:id/tipo', async (req, res) => {
    try {
      const c = (await listarCuentas()).find((x) => x.id === req.params.id);
      if (!c) return res.status(404).json({ error: 'Cuenta no encontrada' });
      mutarCuenta(c.id, { tipo: req.body?.tipo || c.tipo });
      res.json({ ok: true });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.post('/rsp/banco/api/cuentas/:id/repartir', async (req, res) => {
    try {
      const cuentas = await listarCuentas();
      const c = cuentas.find((x) => x.id === req.params.id);
      if (!c) return res.status(404).json({ error: 'Cuenta no encontrada' });
      repartir(c, cuentas);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/rsp/banco/api/cuentas/:id/:accion', async (req, res) => {
    try {
      const c = (await listarCuentas()).find((x) => x.id === req.params.id);
      if (!c) return res.status(404).json({ error: 'Cuenta no encontrada' });
      const accion = req.params.accion;
      if (accion === 'bloquear') mutarCuenta(c.id, { estado: 'bloqueada' });
      else if (accion === 'desbloquear') mutarCuenta(c.id, { estado: 'activa' });
      else if (accion === 'cerrar') mutarCuenta(c.id, cerrarCuenta(c, req.body?.motivo));
      else return res.status(400).json({ error: `Acción desconocida: ${accion}` });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/rsp/banco/api/tarjetas/:id/limites', async (req, res) => {
    try {
      const t = (await listarTarjetas()).find((x) => x.id === req.params.id);
      if (!t) return res.status(404).json({ error: 'Tarjeta no encontrada' });
      const patch = {};
      if (typeof req.body?.contactlessLimitPz === 'number') patch.contactlessLimitPz = req.body.contactlessLimitPz;
      if (typeof req.body?.weeklyLimitPz === 'number') patch.weeklyLimitPz = req.body.weeklyLimitPz;
      overlayTarjetas.set(t.id, { ...(overlayTarjetas.get(t.id) || {}), ...patch });
      res.json({ ok: true });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.post('/rsp/banco/api/tarjetas/:id/:accion', async (req, res) => {
    try {
      const t = (await listarTarjetas()).find((x) => x.id === req.params.id);
      if (!t) return res.status(404).json({ error: 'Tarjeta no encontrada' });
      overlayTarjetas.set(t.id, { ...(overlayTarjetas.get(t.id) || {}), frozen: req.params.accion === 'congelar' });
      res.json({ ok: true });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  /* ── Placeta Junior ──────────────────────────────────────────────── */
  // Datos REALES de la Academia (admin-placeta.vercel.app). Sin acceso se
  // degrada al seed representativo del catálogo (nunca inventado).
  const JUNIOR_URL = process.env.JUNIOR_API_URL || 'https://admin-placeta.vercel.app/api/junior';
  async function juniorLive(path) {
    try {
      const r = await fetch(`${JUNIOR_URL}/${path}`);
      if (!r.ok) return null;
      const d = await r.json();
      const arr = Array.isArray(d) ? d : (d?.data ?? null);
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  }
  router.get('/rsp/junior/api/actividades', async (_req, res) => {
    const live = await juniorLive('actividades?solo_publicas=1');
    if (live && live.length) {
      return res.json(live.map((a) => ({
        id: a.id, titulo: a.titulo || a.nombre || 'Actividad',
        edadMin: a.edadMin ?? a.edad_min ?? 6, edadMax: a.edadMax ?? a.edad_max ?? 17,
        complejidad: a.complejidad || 'Media',
        precio: a.precio_total ?? a.precio ?? 5.6,
        recompensa: a.recompensa ?? 10,
        estado: a.estado || 'aprobada',
        colaborador: a.colaborador || '—',
      })));
    }
    res.json(store.juniorActividades);
  });
  router.get('/rsp/junior/api/colaboradores', async (_req, res) => {
    const live = await juniorLive('colaboradores');
    if (live && live.length) {
      return res.json(live.map((c) => ({
        dip: c.dip ?? c.placetaId ?? '',
        nombre: c.nombre ?? c.nombre_real ?? 'Colaborador',
        acuerdoFirmado: c.acuerdoFirmado ?? c.acuerdo_firmado ?? true,
        actividades: Number(c.actividades ?? c.num_actividades ?? 0),
        puntos: Number(c.puntos ?? 0),
      })));
    }
    res.json(store.juniorColaboradores);
  });
  router.get('/rsp/junior/api/diplomas', async (_req, res) => {
    const live = await juniorLive('diplomas');
    if (live && live.length) {
      return res.json(live.map((d) => ({
        id: d.id ?? `DIP-${d.dip}-${d.fecha}`,
        dip: d.dip ?? d.placetaId ?? '',
        nombre: d.nombre ?? d.nombre_real ?? '',
        actividad: d.actividad ?? d.actividad_titulo ?? '—',
        fecha: d.fecha ?? d.fecha_obtencion ?? '',
      })));
    }
    res.json(store.juniorDiplomas);
  });

  /* ── Operaciones / auditoría / notificaciones ────────────────────── */
  router.get('/rsp/operaciones/api', (_req, res) => res.json(store.operaciones));
  router.post('/rsp/operaciones/api/:id/revertir', (req, res) => {
    const o = store.operaciones.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: 'Operación no encontrada' });
    if (o.estado !== 'retenida') return res.status(400).json({ error: 'Solo se pueden revertir operaciones retenidas' });
    o.estado = 'rechazada';
    res.json({ ok: true });
  });
  router.get('/rsp/auditoria/api', (_req, res) => res.json(store.auditoria));
  router.get('/api/notificaciones/mis', (_req, res) => res.json(store.notificaciones));
  router.post('/api/notificaciones/:id/leida', (req, res) => {
    const n = store.notificaciones.find((x) => x.id === req.params.id);
    if (!n) return res.status(404).json({ error: 'Notificación no encontrada' });
    n.leida = true;
    res.json({ ok: true });
  });

  /* ── Dashboard (estadísticas REALES derivadas del banco y la sesión) ── */
  router.get('/api/dashboard', async (_req, res) => {
    // El banco puede no estar configurado (sin CRM_READ_KEY): el dashboard
    // sigue respondiendo con el resto de contadores reales de la sesión.
    let bloqueos500k = 0;
    try {
      const cuentas = await listarCuentas();
      bloqueos500k = cuentas.filter((c) => c.saldo > 500000 && c.tipo !== 'Business').length;
    } catch {
      /* banco no disponible: se deja en 0 */
    }
    res.json({
      expedientes: store.expedientes.length,
      incidencias: 0,
      incidenciasAbiertas: 0,
      notificacionesNoLeidas: store.notificaciones.filter((n) => !n.leida).length,
      cnicVigentes: store.cnic.length,
      nominas: 0,
      facturas: 0,
      bloqueos500k,
      retribucionesPendientes: 0,
      operacionesRetenidas: store.operaciones.filter((o) => o.estado === 'retenida').length,
      comprobaciones: 0,
      comprobacionesInconsistencia: 0,
    });
  });

  /* ── Normativa (CNIC) ────────────────────────────────────────────── */
  router.get('/rsp/normativo/api', (_req, res) => res.json(store.cnic));
  router.post('/rsp/normativo/api/refresh', (_req, res) => res.json({ sincronizado: true, total: store.cnic.length, fuente: 'BOP' }));
  router.post('/rsp/normativo/api/version', (req, res) => {
    const d = req.body || {};
    const regla = {
      codigo: d.codigo, etiqueta: d.codigo, tipoValor: 'porcentaje', valor: d.valor, unidad: '%',
      version: 2, estado: 'validacion', autor: 'RSP', fuente: 'local',
    };
    store.cnic.push(regla);
    res.status(201).json(regla);
  });

  /* ── Tributos: detalle de contribuyente/declaración (vivo) ───────── */
  router.get('/rsp/tributos/api/contribuyentes', async (req, res) => {
    try {
      const state = await getBankState();
      const lista = calcularContribuyentes(state);
      const q = String(req.query.q || '').toLowerCase();
      res.json(lista.filter((c) => !q || c.nombre.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)));
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/tributos/api/contribuyentes/:id', async (req, res) => {
    try {
      const state = await getBankState();
      const c = calcularContribuyentes(state).find((x) => x.id === req.params.id);
      if (!c) return res.status(404).json({ error: 'Contribuyente no encontrado' });
      res.json({ ...c, cuentas: 1, saldoTotalPz: c.patrimonio, estadoFiscal: 'pendiente', estimado: { cuotaIrm: c.cuotaIrm, cuotaIgf: c.cuotaIgf, proximoPago: '2026-09-05' }, declaraciones: [] });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/tributos/api/declaraciones', async (req, res) => {
    try {
      const state = await getBankState();
      const mes = req.query.mes || new Date().toISOString().slice(0, 7);
      res.json(calcularContribuyentes(state).map((c) => ({
        id: `DEC-${mes}-${c.id}`, mesPeriodo: mes, contribuyenteId: c.id, contribuyenteNombre: c.nombre,
        patrimonioMedio: c.patrimonio, cuotaIrm: c.cuotaIrm, cuotaIgf: c.cuotaIgf, estado: 'borrador',
      })));
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  /* ── Votaciones / Juntas / Encuestas ────────────────────────────── */
  router.get('/rsp/votaciones/api', (_req, res) => res.json(store.votaciones));
  router.get('/rsp/votaciones/api/:id', (req, res) => {
    const v = store.votaciones.find((x) => x.id === req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    res.json({ ...v, votos: store.votos.filter((r) => r.votacionId === v.id) });
  });
  router.post('/rsp/votaciones/api', (req, res) => {
    const d = req.body || {};
    const v = { id: `VOT-2026-${String(store.votaciones.length + 1).padStart(4, '0')}`, titulo: d.titulo, categoria: d.categoria, descripcion: d.descripcion || '', reunionId: d.reunionId, rango: d.rango || 'ciudadania_plena', opciones: d.opciones || ['A favor', 'En contra', 'Abstención'], estado: 'abierta', resultado: null, aFavor: 0, enContra: 0, abstenciones: 0, totalVotos: 0, creadaEn: AHORA() };
    store.votaciones.unshift(v);
    res.status(201).json(v);
  });
  router.post('/rsp/votaciones/api/:id/cerrar', (req, res) => {
    const v = store.votaciones.find((x) => x.id === req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    v.estado = 'cerrada'; v.cerradaEn = AHORA();
    v.resultado = v.aFavor > v.enContra ? 'aprobada' : 'rechazada';
    res.json({ ok: true });
  });
  router.post('/rsp/votaciones/api/:id/publicar', (req, res) => {
    const v = store.votaciones.find((x) => x.id === req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    v.estado = 'publicada'; v.publicadaEn = AHORA();
    v.bopUrl = `https://bop.laplaceta.org/votaciones.html?codigo=${v.id}`;
    res.json({ ok: true });
  });
  router.get('/rsp/votaciones/api/:id/votos', (req, res) => {
    const ahora = Date.now();
    res.json(store.votos.filter((r) => r.votacionId === req.params.id).map((r) => {
      const anon = !r.esJunta && (ahora - new Date(r.timestamp).getTime()) > 30 * 24 * 3600 * 1000;
      return { ...r, anonimo: anon, dip: anon ? '••••••' : r.dip };
    }));
  });
  router.get('/rsp/juntas/api', (_req, res) => res.json(store.juntas));
  router.get('/rsp/juntas/api/:id', (req, res) => {
    const j = store.juntas.find((x) => x.id === req.params.id);
    if (!j) return res.status(404).json({ error: 'Junta no encontrada' });
    res.json({ ...j, votaciones: j.votaciones.map((vid) => store.votaciones.find((v) => v.id === vid)).filter(Boolean) });
  });
  router.post('/rsp/juntas/api', (req, res) => {
    const d = req.body || {};
    const j = { id: `JUN-2026-${String(store.juntas.length + 1).padStart(4, '0')}`, titulo: d.titulo, fecha: d.fecha || new Date().toISOString().slice(0, 10), asistentes: d.asistentes || [], ordenDelDia: d.ordenDelDia || [], votaciones: d.votaciones || [], acta: '', estado: 'convocada' };
    store.juntas.unshift(j);
    res.status(201).json(j);
  });
  router.post('/rsp/juntas/api/:id/acta', (req, res) => {
    const j = store.juntas.find((x) => x.id === req.params.id);
    if (!j) return res.status(404).json({ error: 'Junta no encontrada' });
    j.acta = req.body?.acta || ''; j.estado = 'acta_emitida';
    j.actaUrl = `https://bop.laplaceta.org/juntas.html?codigo=${j.id}`;
    res.json({ ok: true });
  });
  router.get('/rsp/encuestas/api', (_req, res) => res.json(store.encuestas));
  router.post('/rsp/encuestas/api', (req, res) => {
    const d = req.body || {};
    const e = { id: `ENC-2026-${String(store.encuestas.length + 1).padStart(4, '0')}`, titulo: d.titulo, pregunta: d.pregunta, opciones: d.opciones || [], rango: d.rango || 'todos', estado: 'abierta', respuestas: Object.fromEntries((d.opciones || []).map((o) => [o, 0])), totalRespuestas: 0, creadaEn: AHORA() };
    store.encuestas.unshift(e);
    res.status(201).json(e);
  });
  router.post('/rsp/encuestas/api/:id/publicar', (req, res) => {
    const e = store.encuestas.find((x) => x.id === req.params.id);
    if (!e) return res.status(404).json({ error: 'Encuesta no encontrada' });
    e.estado = 'publicada'; e.publicadaEn = AHORA();
    e.bopUrl = `https://bop.laplaceta.org/encuestas.html?codigo=${e.id}`;
    res.json({ ok: true });
  });

  return router;
}
