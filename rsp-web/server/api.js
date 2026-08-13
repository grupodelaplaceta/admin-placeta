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

  /* ── Almacén en memoria (referencia) ─────────────────────────────── */
  const store = {
    ciudadanos: [
      { dip: '23749931M', nombre: 'Mikel Alegre Marcos', nivel: 'N3', cuentas: 2, expedientesActivos: 1, estado: 'activo' },
      { dip: '72583347U', nombre: 'Unai García Almazán', nivel: 'N2', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
      { dip: '20521220S', nombre: 'Salma El Harrak', nivel: 'N2', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
      { dip: '86209131P', nombre: 'Pablo Ruiz', nivel: 'N1', cuentas: 1, expedientesActivos: 0, estado: 'activo' },
    ],
    entidades: [
      { eip: 'EIP-X4NGQU', nombre: 'Red del Grupo de La Placeta S.P.', tipo: 'sociedad', representantes: ['23749931M'], estado: 'activa' },
      { eip: 'EIP-XJETNL', nombre: 'Unhiro S.PV.', tipo: 'sociedad', representantes: ['23749931M', '20521220S'], estado: 'activa' },
    ],
    expedientes: [
      { id: 'EXP-2026-000088', titulo: 'Sucesión · Cuenta compartida', dip: '23749931M', nombreCiudadano: 'Mikel Alegre Marcos', servicio: 'Sucesiones', estado: 'firma', numActuaciones: 3, documentos: 3, creadoEn: AHORA() },
    ],
    tramites: [
      { id: 'TR-2026-000121', tipo: 'cambio_titularidad', titulo: 'Cambio de titularidad — Cuenta compartida', dip: '23749931M', nombreCiudadano: 'Mikel Alegre Marcos', estado: 'firma', plazo: 7, servicio: 'Patrimonio', firmasCompletas: 1, firmasRequeridas: 2, actualizadoEn: AHORA(), datosEspecificos: { porcentaje: '50' } },
    ],
    subvenciones: [],
    subvencionesDetalle: {},
    bonos: [],
    bonosDetalle: {},
    juniorActividades: [
      { id: 'ACT-1', titulo: 'Matemáticas básicas', edadMin: 6, edadMax: 12, complejidad: 'Fácil', precio: 5.6, recompensa: 10, estado: 'aprobada', colaborador: 'Mikel Alegre Marcos' },
    ],
    juniorColaboradores: [
      { dip: '23749931M', nombre: 'Mikel Alegre Marcos', acuerdoFirmado: true, actividades: 2, puntos: 180 },
    ],
    juniorDiplomas: [
      { id: 'DIP-1', dip: '86209131P', nombre: 'Pablo Ruiz', actividad: 'Matemáticas básicas', fecha: '2026-07-20' },
    ],
    operaciones: [
      { id: 'OP-2026-0001', concepto: 'Nómina agosto', importe: 150, origen: 'EIP-X4NGQU', destino: '23749931M', clasificacion: 'nomina', estado: 'procesada', fecha: AHORA() },
    ],
    auditoria: [
      { id: 'AUD-2026-0001', usuario: 'Mikel Alegre Marcos', servicio: 'Patrimonio', accion: 'avanzar', objetoTipo: 'tramite', objetoId: 'TR-2026-000121', fecha: AHORA() },
    ],
    notificaciones: [
      { id: 'NOTIF-1', nivel: 'accion', titulo: 'Firma pendiente', mensaje: 'Falta 1 de 2 firmas en la sucesión EXP-2026-000088.', destinatarioDip: '23749931M', leida: false, acuseRecibido: true, creadaEn: AHORA() },
    ],
    cnic: [
      { codigo: 'CNIC-IGF-PF-TIPO-3', etiqueta: 'Tipo IGF personas físicas tramo 3', tipoValor: 'porcentaje', valor: 30, unidad: '%', version: 1, estado: 'vigente', autor: 'Tributos', fuente: 'BOP' },
      { codigo: 'CNIC-IGF-EMPRESA-TIPO-4', etiqueta: 'Tipo IGF empresas tramo 4', tipoValor: 'porcentaje', valor: 85, unidad: '%', version: 1, estado: 'vigente', autor: 'Tributos', fuente: 'BOP' },
    ],
    solicitudes2fa: new Map(),
  };

  let nuevaCuentaSeq = 0;
  const nuevasCuentas = [];
  const overlayCuentas = new Map();
  const overlayTarjetas = new Map();

  function mapearCuenta(a) {
    const nombre = limpiar(a.displayName || a.name || a.id);
    return {
      id: a.id,
      nombre,
      tipo: a.type || 'Current',
      dip: (a.placetaId || '').toUpperCase(),
      saldo: Number(a.balancePz || 0),
      estado: a.closedAt ? 'cerrada' : 'activa',
      esFundacion: /fundacion|fundación/i.test(nombre) || /^FUND-/.test(a.id || ''),
      participaciones: [],
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
  router.get('/rsp/api/ciudadanos', (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    const lista = q ? store.ciudadanos.filter((c) => c.nombre.toLowerCase().includes(q) || c.dip.toLowerCase().includes(q)) : store.ciudadanos;
    res.json(lista);
  });
  router.get('/rsp/api/contexto/:dip', (req, res) => {
    const c = store.ciudadanos.find((x) => x.dip === req.params.dip);
    if (!c) return res.status(404).json({ error: 'Ciudadano no encontrado' });
    res.json({ ...c, email: `${c.dip.toLowerCase()}@laplaceta.org`, bloques: [{ clave: 'identidad', etiqueta: 'Identidad', icono: 'user', items: [{ clave: 'nivel', etiqueta: 'Nivel', valor: c.nivel }] }] });
  });
  router.post('/rsp/api/ciudadanos/:dip', (req, res) => {
    const c = store.ciudadanos.find((x) => x.dip === req.params.dip);
    if (!c) return res.status(404).json({ error: 'Ciudadano no encontrado' });
    res.json({ ok: true });
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
  router.get('/rsp/api/entidades', (_req, res) => res.json(store.entidades));
  router.get('/rsp/api/entidades/:eip', (req, res) => {
    const e = store.entidades.find((x) => x.eip === req.params.eip);
    if (!e) return res.status(404).json({ error: 'Entidad no encontrada' });
    res.json({ ...e, documentos: [], obligaciones: [], representantes: e.representantes.map((dip) => ({ dip, nombre: dip, cargo: 'representante' })) });
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
    };
    store.subvenciones.unshift(s);
    store.subvencionesDetalle[s.id] = { ...s, documentosRequeridos: [], gastos: [], justificaciones: [], excluirTipos: ['impuestos', 'comisiones'] };
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
      fechaLimite: d.fechaLimite, presupuestoUsado: 0, adscritos: 0, estado: 'activo',
    };
    store.bonos.unshift(b);
    store.bonosDetalle[b.id] = { ...b, adscripciones: [], justificaciones: [] };
    res.status(201).json(b);
  });
  router.post('/rsp/bonos/api/:id/adscribir', (req, res) => {
    const b = store.bonos.find((x) => x.id === req.params.id);
    if (!b) return res.status(404).json({ error: 'Bono no encontrado' });
    const dip = req.body?.dip;
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
  router.get('/rsp/junior/api/actividades', (_req, res) => res.json(store.juniorActividades));
  router.get('/rsp/junior/api/colaboradores', (_req, res) => res.json(store.juniorColaboradores));
  router.get('/rsp/junior/api/diplomas', (_req, res) => res.json(store.juniorDiplomas));

  /* ── Operaciones / auditoría / notificaciones ────────────────────── */
  router.get('/rsp/operaciones/api', (_req, res) => res.json(store.operaciones));
  router.get('/rsp/auditoria/api', (_req, res) => res.json(store.auditoria));
  router.get('/api/notificaciones/mis', (_req, res) => res.json(store.notificaciones));
  router.post('/api/notificaciones/:id/leida', (req, res) => {
    const n = store.notificaciones.find((x) => x.id === req.params.id);
    if (!n) return res.status(404).json({ error: 'Notificación no encontrada' });
    n.leida = true;
    res.json({ ok: true });
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

  return router;
}
