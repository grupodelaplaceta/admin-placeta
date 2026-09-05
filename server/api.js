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
import { randomBytes, randomUUID } from 'crypto';
import { calcularContribuyentes } from './tributos.js';
import { calcularCicloFacturacion, planCierreMes, seleccionarPagoIva, pagosIvaExternosDeEmpresa, CUENTA_TRIBUTOS } from './facturacion.js';
import { coleccion } from './db.js';
import { crearYEnviarFirma, estadoFirma, enviarVotacionPlacetaID, cerrarVotacionPlacetaID } from './firmas.js';
import { CATALOGO_BASE } from './tramites-catalogo.js';
import { CATALOGO_EDU_BASE } from './edu-cursos.js';
import PDFDocument from 'pdfkit';
import { supabase } from './supabase.js';
import * as valoresBop from './valores-bop.js';

const AHORA = () => new Date().toISOString();
const BOP_URL = (process.env.BOP_URL || 'https://bop.laplaceta.org').replace(/\/+$/, '');
const round2 = (n) => Math.round(n * 100) / 100;
const limpiar = (s = '') => String(s).replace(/\s*\(.*\)\s*$/, '').trim();

export function createApiRouter({ getBankState, mutarBanco }) {
  const router = Router();

  // El catálogo oficial vive en BOP (API nueva /api/valores?todo=1 vía
  // valores-bop.js). RSP solo lo cachea para resiliencia: nunca mezcla
  // rsp_cnic ni genera una copia normativa propia.
  async function cargarCnicOficial() {
    const vigentes = await valoresBop.cargarVigentes();
    if (!vigentes) return null;
    return vigentes.map((r) => ({
      ...r,
      version: ((r.historial || []).length || 0) + 1,
      autor: r.autor || 'BOP',
    }));
  }

  /* ── Almacén persistente (Supabase) con respaldo en memoria ────────── */
  // Cada colección lee/escribe en Supabase (Postgres). Si Supabase no está
  // configurado (SUPABASE_SERVICE_KEY), opera en memoria sin persistencia.
  const store = {
    ciudadanos: [],   // derivados del banco en `ciudadanosDelBanco()`
    entidades: [],    // derivadas del banco en `entidadesDelBanco()`
    expedientes: coleccion('rsp_expedientes'),
    tramites: coleccion('rsp_tramites'),
    tramitesCatalogo: coleccion('rsp_tramites_catalogo'),
    eduCursos: coleccion('rsp_edu_cursos'),
    subvenciones: coleccion('rsp_subvenciones'),
    bonos: coleccion('rsp_bonos'),
    operaciones: coleccion('rsp_operaciones'),
    auditoria: coleccion('rsp_auditoria'),
    notificaciones: coleccion('rsp_notificaciones'),
    cnic: coleccion('rsp_cnic'),
    bopCnic: coleccion('bop_cnic'),
    bopDocumentos: coleccion('bop_documentos'),
    bopVersiones: coleccion('bop_versiones'),
    juniorActividadesDb: coleccion('junior_actividades', { orderCol: 'creado_en' }),
    juniorColaboradoresDb: coleccion('junior_colaboradores', { orderCol: 'creado_en' }),
    juniorDiplomasDb: coleccion('junior_diplomas', { orderCol: 'creado_en' }),
    juniorCodigosDb: coleccion('junior_codigos', { orderCol: 'creado_en' }),
    juniorSubapartadosDb: coleccion('junior_subapartados', { orderCol: 'orden' }),
    juniorCategoriasDb: coleccion('junior_categorias', { orderCol: 'orden' }),
    juniorBundlesDb: coleccion('junior_bundles', { orderCol: 'creado_en' }),
    juniorEstadisticasDb: coleccion('junior_estadisticas', { orderCol: 'fecha' }),
    juniorFinanzasDb: coleccion('junior_finanzas', { orderCol: 'fecha' }),
    votaciones: coleccion('rsp_votaciones'),
    votos: coleccion('rsp_registro_votos'),
    juntas: coleccion('rsp_reuniones'),
    propuestas: coleccion('rsp_propuestas'),
    encuestas: coleccion('rsp_encuestas'),
    nominas: coleccion('rsp_nominas'),
    // Facturación central (RSP + Banco): ciclo mensual de recibos/facturas.
    facturacion: coleccion('rsp_facturacion'),
    // En memoria (sesión): detalle de subvenciones/bonos y estado 2FA.
    subvencionesDetalle: {},
    bonosDetalle: {},
    juniorActividades: [],
    juniorColaboradores: [],
    juniorDiplomas: [],
    solicitudes2fa: new Map(),
    documentosPublicos: new Map(),
  };

  // Fachada pública para integraciones de confianza (GDLP Web). La clave
  // evita que cualquiera pueda crear trámites en nombre de otra persona.
  const gdlpKey = process.env.GDLP_RSP_API_KEY || '';
  const esGdlp = (req) => Boolean(gdlpKey) && req.headers['x-gdlp-api-key'] === gdlpKey;
  const pdfEnvio = (tramite) => new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 52 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(20).fillColor('#3f00d8').text('RED DE SERVICIOS DE LA PLACETA', { align: 'center' });
    doc.moveDown().fontSize(16).fillColor('#111').text('Justificante de envío');
    doc.moveDown().fontSize(11).text(`Número: ${tramite.id}`);
    doc.text(`Trámite: ${tramite.titulo}`);
    doc.text(`Identidad: ${tramite.dip}`);
    doc.text(`Fecha: ${tramite.actualizadoEn}`);
    doc.text(`Estado: ${tramite.estado}`);
    doc.moveDown().text('Datos declarados:');
    doc.fontSize(10).text(JSON.stringify(tramite.datosEspecificos || {}, null, 2));
    doc.end();
  });

  router.get('/publico/oportunidades', async (_req, res) => {
    const [subvenciones, bonos] = await Promise.all([store.subvenciones.listar(), store.bonos.listar()]);
    res.json({
      subvenciones: subvenciones.filter((s) => s.publicada === true && !['cerrada', 'agotada'].includes(s.estado)),
      bonos: bonos.filter((b) => b.publicada === true && !['cerrado', 'agotado'].includes(b.estado)),
    });
  });

  router.get('/publico/oportunidades/:tipo/:id', async (req, res) => {
    const collection = req.params.tipo === 'bono' ? store.bonos : store.subvenciones;
    const item = await collection.obtener(req.params.id);
    if (!item || item.publicada !== true) return res.status(404).json({ error: 'Oportunidad no encontrada o no publicada' });
    res.json({ ...item, ...(req.params.tipo === 'bono' ? (store.bonosDetalle[item.id] || {}) : (store.subvencionesDetalle[item.id] || {})) });
  });

  router.post('/publico/tramites', async (req, res) => {
    if (!esGdlp(req)) return res.status(401).json({ error: 'Integración GDLP no autorizada' });
    const d = req.body || {};
    const dip = String(d.dip || '').trim().toUpperCase();
    if (!dip || !d.tipo) return res.status(400).json({ error: 'Identidad y tipo de trámite requeridos' });
    if (d.oportunidadId) {
      const collection = d.tipo === 'bono' ? store.bonos : store.subvenciones;
      const oportunidad = await collection.obtener(d.oportunidadId);
      if (!oportunidad || oportunidad.publicada !== true) return res.status(404).json({ error: 'La convocatoria no está publicada o ya no está disponible' });
    }
    const t = { id: `TR-${Date.now()}`, tipo: d.tipo, titulo: d.titulo || d.tipo, dip, nombreCiudadano: d.nombre || dip, estado: 'inicio', plazo: Number(d.plazo) || 10, servicio: 'GDLP / RSP', actualizadoEn: AHORA(), datosEspecificos: d.datos || {}, oportunidadId: d.oportunidadId || null };
    await store.tramites.insertar(t);
    const pdf = await pdfEnvio(t);
    const pdfToken = `${t.id}-${Math.random().toString(36).slice(2)}`;
    store.documentosPublicos.set(pdfToken, pdf);
    res.status(201).json({ ok: true, tramite: t, pdf_url: `/publico/documentos/${encodeURIComponent(pdfToken)}` });
  });

  router.get('/publico/documentos/:token', (req, res) => {
    const pdf = store.documentosPublicos.get(req.params.token);
    if (!pdf) return res.status(404).json({ error: 'Documento no encontrado' });
    res.type('application/pdf').set('Content-Disposition', 'inline; filename="justificante-rsp.pdf"').send(pdf);
  });

  // CNIC reales del BOP (fallback si la tabla rsp_cnic aún no está migrada).
  const CNIC_BASE = [
    { codigo: 'CNIC-IGF-PF-TIPO-3', etiqueta: 'Tipo IGF personas físicas tramo 3', tipoValor: 'porcentaje', valor: 30, unidad: '%', version: 1, estado: 'vigente', autor: 'Tributos', fuente: 'BOP' },
    { codigo: 'CNIC-IGF-EMPRESA-TIPO-4', etiqueta: 'Tipo IGF empresas tramo 4', tipoValor: 'porcentaje', valor: 85, unidad: '%', version: 1, estado: 'vigente', autor: 'Tributos', fuente: 'BOP' },
  ];

  // Adapta una fila de bop_cnic (Supabase) al contrato CNICRegla del SPA.
  function normalizarBopCnic(row) {
    const historial = Array.isArray(row.historial) ? row.historial : [];
    const valor = Number(row.valor);
    return {
      codigo: row.codigo,
      etiqueta: row.etiqueta || row.codigo,
      tipoValor: row.tipoValor || 'porcentaje',
      valor: Number.isNaN(valor) ? (row.valor ?? '') : valor,
      unidad: row.unidad || '%',
      version: historial.length + 1,
      estado: row.estado || (row.vigente ? 'vigente' : 'borrador'),
      autor: row.autorDip || 'BOP',
      fuente: 'BOP',
      bopUrl: `https://bop.laplaceta.org/cnic.html?codigo=${encodeURIComponent(row.codigo)}`,
      historial: historial.map((h, i) => ({ version: i + 1, valor: h.valor, desde: h.desde, notas: h.notas })),
    };
  }

  // Cachea los CNIC vigentes del BOP (bop_cnic) para el motor fiscal.
  let cnicCache = { t: 0, data: null };
  async function cargarCnicVigentes() {
    const oficial = await cargarCnicOficial();
    if (oficial) return oficial.filter((r) => r.estado === 'vigente');
    if (cnicCache.data && Date.now() - cnicCache.t < 60000) return cnicCache.data;
    try {
      const bop = (await store.bopCnic.listar()) || [];
      cnicCache = { t: Date.now(), data: bop.filter((r) => r.vigente).map(normalizarBopCnic) };
    } catch {
      cnicCache = { t: Date.now(), data: null };
    }
    return cnicCache.data;
  }

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
  // PlacetaID es la fuente canónica del censo. El banco solo aporta cuentas
  // personales que todavía no estén reflejadas en el registro de identidad.
  async function identidadesPlacetaID() {
    const base = process.env.PLACETAID_API_URL || process.env.PLACETAID_URL || 'https://id.laplaceta.org/api';
    const key = process.env.PLACETAID_ADMIN_KEY || process.env.PLACETAID_CRM_CLIENT_KEY || '';
    try {
      const r = await fetch(`${base}/admin/registros`, { headers: key ? { 'X-API-Key': key } : {} });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  // Ciudadanos REALES: PlacetaID manda (incluidos juniors) y el banco
  // completa únicamente personas con cuentas personales sin duplicarlas.
  async function ciudadanosDelBanco() {
    const cuentas = await listarCuentas();
    const DIP = /^[XYZ0-9][0-9]{7,8}[A-Z]$/;
    const map = new Map();
    for (const r of await identidadesPlacetaID()) {
      const dip = String(r.dip || r.placeid || r.placetaId || '').trim().toUpperCase();
      if (!dip) continue;
      const nombre = [r.nombre, r.apellidos].filter(Boolean).join(' ').trim() || r.empresaNombre || dip;
      map.set(dip, {
        dip,
        nombre,
        nivel: r.bloqueado || r.activo === false ? 'N1' : 'N3',
        cuentas: 0,
        expedientesActivos: 0,
        estado: r.bloqueado || r.activo === false ? 'inactivo' : 'activo',
        junior: Number(r.edad) < 18 || r.rol === 'junior',
      });
    }
    for (const c of cuentas) {
      const dip = String(c.dip || '').trim().toUpperCase();
      if (!DIP.test(dip) || c.esFundacion || c.tipo === 'Business' || c.tipo === 'Investment') continue;
      const e = map.get(dip) || { dip, nombre: c.nombre, nivel: 'N1', cuentas: 0, expedientesActivos: 0, estado: 'activo', junior: c.tipo === 'Child' };
      e.cuentas += 1;
      if (!e.nombre || e.nombre === e.dip) e.nombre = c.nombre;
      if (c.tipo === 'Child') e.junior = true;
      map.set(dip, e);
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
  router.get('/rsp/tramites/api', async (req, res) => {
    const q = String(req.query.q || '').toLowerCase();
    const estado = req.query.estado;
    let lista = await store.tramites.listar();
    if (q) lista = lista.filter((t) => t.titulo.toLowerCase().includes(q) || t.dip.toLowerCase().includes(q));
    if (estado) lista = lista.filter((t) => t.estado === estado);
    res.json(lista);
  });
  router.get('/rsp/tramites/api/bandeja', async (_req, res) => {
    const lista = await store.tramites.listar();
    res.json(lista.filter((t) => t.asignadoA || t.vencido));
  });
  router.get('/rsp/tramites/api/:id', async (req, res) => {
    const t = await store.tramites.obtener(req.params.id);
    if (!t) return res.status(404).json({ error: 'Trámite no encontrado' });
    res.json({ ...t, requisitos: [], documentos: [], actuaciones: [] });
  });
  router.post('/rsp/tramites/api', async (req, res) => {
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
    await store.tramites.insertar(t);
    res.status(201).json(t);
  });
  router.post('/rsp/tramites/api/:id/accion', async (req, res) => {
    const t = await store.tramites.obtener(req.params.id);
    if (!t) return res.status(404).json({ error: 'Trámite no encontrado' });
    const accion = req.body?.accion;
    const estado = accion === 'resolver' ? 'resolucion' : accion || t.estado;
    await store.tramites.actualizar(req.params.id, { estado, actualizadoEn: AHORA() });

    // Al emitir firma, se crea y envía el documento a PlacetaID Móvil.
    let firma = null;
    if (accion === 'emitir_firma') {
      try {
        firma = await crearYEnviarFirma({
          titulo: t.titulo || `Firma de ${req.params.id}`,
          tipo: 'resolucion',
          dip: t.dip,
          tramiteId: t.id,
          accion,
        });
      } catch { /* la firma es best-effort: no bloquea el avance del trámite */ }
    }
    res.json({ ...t, estado, actualizadoEn: AHORA(), firma });
  });

  /* ── Catálogo de trámites públicos (administrable desde RSP) ─────────── */
  async function asegurarCatalogo() {
    const existentes = await store.tramitesCatalogo.listar();
    if ((existentes || []).length > 0) return;
    for (const t of CATALOGO_BASE) await store.tramitesCatalogo.insertar({ ...t });
  }
  router.get('/rsp/tramites-catalogo/api', async (_req, res) => {
    await asegurarCatalogo();
    const lista = await store.tramitesCatalogo.listar();
    res.json([...lista].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)));
  });
  router.post('/rsp/tramites-catalogo/api', async (req, res) => {
    const d = req.body || {};
    if (!d.id || !d.nombre) return res.status(400).json({ error: 'id y nombre requeridos' });
    const item = {
      id: String(d.id).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      nombre: String(d.nombre),
      descripcion: String(d.descripcion || ''),
      icono: String(d.icono || '📋'),
      seccion: String(d.seccion || 'identidad'),
      ambito: String(d.ambito || 'ecosistema'),
      tipoEnlace: d.tipoEnlace === 'ruta' ? 'ruta' : 'accion',
      ruta: String(d.ruta || ''),
      accion: String(d.accion || d.id),
      requisitos: Array.isArray(d.requisitos) ? d.requisitos.map(String) : [],
      documentacion: Array.isArray(d.documentacion) ? d.documentacion.map(String) : [],
      plazo: Number(d.plazo || 15),
      activo: d.activo !== false,
      orden: Number(d.orden ?? 99),
      actualizadoEn: AHORA(),
    };
    const prev = await store.tramitesCatalogo.obtener(d.id);
    if (prev) await store.tramitesCatalogo.actualizar(d.id, item);
    else await store.tramitesCatalogo.insertar(item);
    res.json({ ok: true, id: item.id });
  });
  router.post('/rsp/tramites-catalogo/api/:id/estado', async (req, res) => {
    const t = await store.tramitesCatalogo.obtener(req.params.id);
    if (!t) return res.status(404).json({ error: 'Trámite del catálogo no encontrado' });
    const activo = req.body?.activo !== undefined ? !!req.body.activo : !t.activo;
    await store.tramitesCatalogo.actualizar(req.params.id, { activo, actualizadoEn: AHORA() });
    res.json({ ok: true, id: req.params.id, activo });
  });

  /* ── Cursos de Placeta EDU (RSP como sistema central) ─────────────────── */
  async function asegurarCursosEdu() {
    const existentes = await store.eduCursos.listar();
    if ((existentes || []).length > 0) return;
    for (const c of CATALOGO_EDU_BASE) await store.eduCursos.insertar({ ...c, creadoEn: AHORA() });
  }
  router.get('/rsp/edu/api/cursos', async (_req, res) => {
    await asegurarCursosEdu();
    const lista = await store.eduCursos.listar();
    res.json([...lista].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)));
  });
  router.post('/rsp/edu/api/cursos', async (req, res) => {
    const d = req.body || {};
    if (!d.id || !d.titulo) return res.status(400).json({ error: 'id y titulo requeridos' });
    const curso = {
      id: String(d.id).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      titulo: String(d.titulo),
      descripcion: String(d.descripcion || ''),
      categoria: String(d.categoria || 'general'),
      categoriaLabel: String(d.categoriaLabel || d.categoria || 'General'),
      plazas: Number(d.plazas || 0),
      inscritos: Number(d.inscritos || 0),
      estado: String(d.estado || 'abierta'),
      precio: String(d.precio || 'Gratis'),
      duracion: String(d.duracion || ''),
      fechaInicio: d.fechaInicio || '',
      fechaFin: d.fechaFin || '',
      emoji: String(d.emoji || '📚'),
      requisitos: Array.isArray(d.requisitos) ? d.requisitos.map(String) : [],
      orden: Number(d.orden ?? 99),
      activo: d.activo !== false,
      actualizadoEn: AHORA(),
    };
    const prev = await store.eduCursos.obtener(curso.id);
    if (prev) await store.eduCursos.actualizar(curso.id, curso);
    else await store.eduCursos.insertar(curso);
    res.json({ ok: true, id: curso.id });
  });
  router.post('/rsp/edu/api/cursos/:id/estado', async (req, res) => {
    const c = await store.eduCursos.obtener(req.params.id);
    if (!c) return res.status(404).json({ error: 'Curso no encontrado' });
    const activo = req.body?.activo !== undefined ? !!req.body.activo : c.activo !== false;
    await store.eduCursos.actualizar(req.params.id, { activo, actualizadoEn: AHORA() });
    res.json({ ok: true, id: req.params.id, activo });
  });

  /* ── Firma vía PlacetaID Móvil ────────────────────────────────────── */
  router.post('/api/firmas/crear', async (req, res) => {
    const d = req.body || {};
    try {
      const firma = await crearYEnviarFirma({
        titulo: d.titulo || `Firma de ${d.accion || 'trámite'}`,
        tipo: d.tipo || 'resolucion',
        dip: d.dip,
        tramiteId: d.tramiteId || d.objetoId,
        accion: d.accion,
      });
      res.status(201).json({ id: firma.id, estado: firma.enviado ? 'enviada' : 'pendiente', enviado: firma.enviado });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.get('/api/firmas/estado/:id', async (req, res) => {
    res.json(await estadoFirma(req.params.id));
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
  router.get('/rsp/expedientes/api', async (_req, res) => {
    res.json(await store.expedientes.listar());
  });
  router.get('/rsp/expedientes/api/:id', async (req, res) => {
    const e = await store.expedientes.obtener(req.params.id);
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
      const dip = String(req.params.dip || '').trim().toUpperCase();
      const c = (await ciudadanosDelBanco()).find((x) => x.dip === dip);
      if (!c) return res.status(404).json({ error: 'Ciudadano no encontrado' });
      const identidad = (await identidadesPlacetaID()).find((x) => String(x.dip || x.placeid || x.placetaId || '').toUpperCase() === dip) || {};
      const cuentas = (await listarCuentas()).filter((x) => String(x.dip || '').toUpperCase() === dip);
      const nombre = [identidad.nombre, identidad.apellidos].filter(Boolean).join(' ').trim() || c.nombre;
      const cuentaItems = cuentas.flatMap((x, i) => [
        { clave: `cuenta-${i}`, etiqueta: `Cuenta ${i + 1}`, valor: x.id || '—' },
        { clave: `iban-${i}`, etiqueta: 'IBAN', valor: x.iban || '—' },
        { clave: `saldo-${i}`, etiqueta: 'Saldo', valor: `${Number(x.saldo ?? x.balancePz ?? 0)} Pz` },
      ]);
      res.json({ ...c, nombre, email: identidad.email || `${dip.toLowerCase()}@laplaceta.org`, telefono: identidad.telefono || identidad.phone || '', bloques: [
        { clave: 'identidad', etiqueta: 'Identidad', icono: 'user', items: [
          { clave: 'dip', etiqueta: 'DIP', valor: dip }, { clave: 'nombre', etiqueta: 'Nombre completo', valor: nombre },
          { clave: 'nivel', etiqueta: 'Nivel', valor: c.nivel }, { clave: 'rol', etiqueta: 'Rol', valor: identidad.rol || (c.junior ? 'Junior' : 'Ciudadano') },
        ] },
        ...(cuentaItems.length ? [{ clave: 'banco', etiqueta: 'Banco de La Placeta', icono: 'wallet', items: cuentaItems }] : []),
      ] });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.post('/rsp/api/ciudadanos/:dip', async (req, res) => {
    try {
      const dip = String(req.params.dip || '').toUpperCase();
      const datos = req.body || {};
      const cuentas = await listarCuentas();
      const propias = cuentas.filter((c) => c.dip === dip);
      if (propias.length === 0) return res.status(404).json({ error: 'Ciudadano no encontrado' });
      let nombre = propias[0].nombre;
      if (datos.nombre) {
        nombre = String(datos.nombre).trim();
        if (!nombre) return res.status(400).json({ error: 'Nombre inválido' });
        for (const c of propias) mutarCuenta(c.id, { nombre });
      }
      res.json({ ok: true, dip, nombre });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.get('/rsp/api/ciudadanos/:dip/documentos', async (req, res) => {
    try {
      if (!supabase) return res.json([]);
      const dip = String(req.params.dip || '').trim().toUpperCase();
      const { data, error } = await supabase.from('junior_documentos_firmados').select('id,documento_id,version,firmado_en,tutor_nombre').eq('dip_menor', dip).order('firmado_en', { ascending: false });
      if (error) return res.json([]);
      res.json((data || []).map(d => ({ id: d.id, nombre: d.documento_id, tipo: 'Placeta Junior', estado: 'firmado', fecha: d.firmado_en, version: d.version, tutor: d.tutor_nombre || '' })));
    } catch { res.json([]); }
  });
  // Administración de PlacetaID desde RSP: el backend nunca expone claves ni
  // hashes, solo el registro oficial necesario para su gestión.
  router.get('/rsp/api/placetaid/registros', async (_req, res) => {
    try {
      const registros = await identidadesPlacetaID();
      res.json(registros.map((r) => ({
        dip: r.dip || r.placeid || r.placetaId || '',
        nombre: [r.nombre, r.apellidos].filter(Boolean).join(' ').trim() || r.empresaNombre || '',
        edad: r.edad ?? null, rol: r.rol || 'miembro', activo: r.activo !== false,
        bloqueado: !!r.bloqueado, creadoEn: r.creadoEn || r.createdAt || null,
      })));
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  // Restablecimiento administrativo de credenciales PlacetaID. Nunca se
  // devuelve ni se almacena la contraseña en RSP; PlacetaID aplica sus
  // propias reglas, invalida sesiones y conserva el hash en su dominio.
  router.post('/rsp/api/placetaid/:dip/password', async (req, res) => {
    try {
      const dip = String(req.params.dip || '').trim().toUpperCase();
      const password = String(req.body?.password || '');
      if (!dip || password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres, letras y números' });
      const base = process.env.PLACETAID_API_URL || process.env.PLACETAID_URL || 'https://id.laplaceta.org/api';
      const key = process.env.PLACETAID_ADMIN_KEY || process.env.PLACETAID_CRM_CLIENT_KEY || '';
      if (!key) return res.status(503).json({ error: 'El backend no tiene PLACETAID_ADMIN_KEY: no se puede cambiar la contraseña de PlacetaID desde RSP.' });
      // El cambio lo aplica SIEMPRE el servidor de PlacetaID (guarda el hash en
      // su dominio). RSP solo reenvía la nueva contraseña; nunca la almacena.
      const response = await fetch(`${base}/admin/cambiar-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': key }, body: JSON.stringify({ dip, passwordNueva: password }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return res.status(response.status).json({ error: payload.error || payload.mensaje || `PlacetaID no pudo cambiar la contraseña (HTTP ${response.status})` });
      res.json({ success: true, dip });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/api/ciudadanos/:dip/firmas', async (req, res) => {
    try {
      if (!supabase) return res.json([]);
      const dip = String(req.params.dip || '').trim().toUpperCase();
      const { data, error } = await supabase.from('junior_documentos_firmados').select('id,documento_id,version,firmado_en,tutor_nombre,texto').eq('dip_menor', dip).order('firmado_en', { ascending: false });
      if (error) return res.json([]);
      res.json((data || []).map(d => ({ id: d.id, documento: d.documento_id, firmante: d.tutor_nombre || 'Tutor legal', estado: 'completada', fecha: d.firmado_en, version: d.version, texto: d.texto })));
    } catch { res.json([]); }
  });
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
      const tramites = (await store.tramites.listar()).filter((t) => t.dip === eip);

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

  // POST /rsp/api/entidades/:eip — editar nombre y participaciones.
  // Las participaciones se sincronizan con las cuentas del banco (overlay),
  // de modo que RSP y Banco muestran exactamente los mismos titulares.
  router.post('/rsp/api/entidades/:eip', async (req, res) => {
    try {
      const eip = req.params.eip;
      const d = req.body || {};
      const cuentas = await listarCuentas();
      const propias = cuentas.filter((c) => eipDeCuenta(c) === eip);
      if (propias.length === 0) return res.status(404).json({ error: 'Entidad no encontrada' });
      if (d.nombre) {
        const nombre = String(d.nombre).trim();
        if (!nombre) return res.status(400).json({ error: 'Nombre inválido' });
        for (const c of propias) mutarCuenta(c.id, { nombre });
      }
      if (Array.isArray(d.participaciones)) {
        const parts = d.participaciones
          .map((p) => ({ dip: String(p.dip || '').toUpperCase(), nombre: p.nombre || p.dip || '', pct: Number(p.pct) || 0 }))
          .filter((p) => p.dip && p.pct > 0);
        const total = parts.reduce((s, p) => s + p.pct, 0);
        if (parts.length > 0 && Math.abs(total - 100) > 0.01) {
          return res.status(400).json({ error: `La suma de participaciones debe ser 100% (actual ${Math.round(total * 10) / 10}%)` });
        }
        for (const c of propias) mutarCuenta(c.id, { participaciones: parts });
      }
      res.json({ ok: true, eip });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // GET /rsp/api/entidades/:eip/facturas — facturas emitidas por la entidad
  router.get('/rsp/api/entidades/:eip/facturas', async (req, res) => {
    try {
      const eip = req.params.eip;
      const cuentas = await listarCuentas();
      const state = await getBankState();
      res.json(facturasDe(eip, state, cuentas));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  /* ── Nóminas del banco ──────────────────────────────────────────── */
  router.get('/rsp/nominas/api', async (_req, res) => res.json(await store.nominas.listar()));
  router.post('/rsp/nominas/api', async (req, res) => {
    const d = req.body || {};
    if (!d.dip || !Number(d.bruto)) return res.status(400).json({ error: 'DIP y bruto requeridos' });
    const bruto = Number(d.bruto);
    const retenciones = Number(d.retenciones) || 0;
    const n = {
      id: `NOM-${Date.now()}`,
      dip: String(d.dip).toUpperCase(),
      nombre: d.nombre || d.dip,
      periodo: d.periodo || new Date().toISOString().slice(0, 7),
      bruto,
      retenciones,
      neto: Number(d.neto) || (bruto - retenciones),
      cuentaBanco: d.cuentaBanco || '',
      estado: 'pendiente',
      actualizadoEn: AHORA(),
    };
    await store.nominas.insertar(n);
    res.status(201).json(n);
  });

  /* ── Fundaciones (detección automática) ──────────────────────────── */
  router.get('/rsp/api/fundaciones', async (_req, res) => {
    try {
      const cuentas = await listarCuentas();
      res.json(cuentas.filter((c) => c.esFundacion).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        dip: c.dip || '',
        eip: c.eip || '',
        saldo: c.saldo,
        estado: c.estado,
        regimen: 'Exenta de IGF y de reparto; patrimonio afecto a fines sociales (CNIC-FUND-001)',
      })));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  /* ── Subvenciones ────────────────────────────────────────────────── */
  const CATEGORIA_GASTO_VALIDA = new Set(['factura', 'iva', 'tributos', 'irm_igf', 'operacion', 'otro']);
  // Clasifica un tipo de transacción del banco en categoría de gasto.
  const CATEGORIA_POR_KIND = {
    TAX: 'tributos', IRMCHARGE: 'irm_igf', IRM: 'irm_igf', IGF: 'irm_igf',
    IVAADJUSTMENT: 'iva', FORCEDVATREGULARIZATION: 'iva', LATETAXINTEREST: 'tributos',
    CONSUMPTION: 'operacion', PLACEZUM: 'operacion', OPERATIONALFEE: 'operacion', SERVICE: 'operacion',
  };
  const clasificarCategoria = (g) => {
    if (g && CATEGORIA_GASTO_VALIDA.has(g.categoria)) return g.categoria;
    const k = String(g?.kind || '').toUpperCase();
    if (CATEGORIA_POR_KIND[k]) return CATEGORIA_POR_KIND[k];
    if (g?.facturaId) return 'factura';
    return 'otro';
  };

  // Persistencia del detalle de subvenciones en `rsp_subvenciones.detalle`
  // (JSONB). Al primer uso se hidrata el detalle desde la BD; cada mutación
  // guarda el detalle completo para que no se pierda entre reinicios.
  let _detSubPromise = null;
  async function asegurarDetalleSubvenciones() {
    if (!_detSubPromise) {
      _detSubPromise = (async () => {
        try {
          const filas = await store.subvenciones.listar();
          for (const f of filas || []) {
            if (!f.detalle || typeof f.detalle !== 'object') continue;
            const { id, detalle, createdAt, updatedAt, ...resto } = f;
            store.subvencionesDetalle[f.id] = { ...resto, ...detalle, id: f.id };
          }
        } catch { /* sin Supabase: queda en memoria */ }
      })();
    }
    return _detSubPromise;
  }
  async function guardarDetalleSubvencion(id) {
    const d = store.subvencionesDetalle[id];
    if (!d) return;
    try {
      await store.subvenciones.actualizar(id, {
        importeRestante: d.importeRestante,
        estado: d.estado,
        emisorNombre: d.emisorNombre,
        receptorNombre: d.receptorNombre,
        detalle: d,
      });
    } catch { /* sin persistencia */ }
  }

  router.get('/rsp/subvenciones/api', async (_req, res) => {
    const filas = await store.subvenciones.listar();
    // El listado omite el detalle operativo (gastos/justificaciones/…) para
    // mantener ligera la respuesta; el detalle se carga por id (GET /:id).
    res.json((filas || []).map(({ detalle, ...f }) => f));
  });
  router.get('/rsp/subvenciones/api/:id', async (req, res, next) => {
    if (req.params.id === 'beneficiarios') return next(); // ruta propia más abajo
    try {
      await asegurarDetalleSubvenciones();
      const s = store.subvencionesDetalle[req.params.id];
      if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
      res.json(s);
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.post('/rsp/subvenciones/api/conceder', async (req, res) => {
    const d = req.body || {};
    const s = {
      id: `SUB-${Date.now()}`,
      emisorEip: d.emisorEip, emisorNombre: d.emisorEip,
      receptorEip: d.receptorEip, receptorNombre: d.receptorEip,
      importe: d.importe, importeRestante: d.importe,
      concepto: d.concepto, estado: 'concedida', fechaConcesion: AHORA().slice(0, 10),
      publicada: d.publicada ?? false,
    };
    const detalle = {
      ...s, documentosRequeridos: [], gastos: [], justificaciones: [], reversiones: [],
      excluirTipos: ['Tax', 'IrmCharge', 'IvaAdjustment'],
      tiposAptos: d.tiposAptos || [],
      // Categorías que cubre la subvención (vacío = todas). Permite subvenciones
      // para pagar IVA (p.ej. de inversiones), tributos, IRM/IGF, facturas…
      categoriasCubiertas: d.categoriasCubiertas || [],
      baremos: d.baremos || [],
      publicadaEn: d.publicada ? AHORA() : undefined,
      bopUrl: d.publicada ? `https://gdlp.laplaceta.org/subvenciones.html?codigo=${s.id}` : undefined,
    };
    await store.subvenciones.insertar({ ...s, detalle });
    store.subvencionesDetalle[s.id] = detalle;
    res.status(201).json(s);
  });
  router.post('/rsp/subvenciones/api/:id/requerir-documentos', async (req, res) => {
    try { await asegurarDetalleSubvenciones(); } catch { /* memoria */ }
    const s = store.subvencionesDetalle[req.params.id];
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    s.documentosRequeridos = (req.body?.documentos || []).map((nombre, i) => ({ id: `DOC-${i}`, nombre, tipo: 'anexo', aportado: false }));
    await guardarDetalleSubvencion(s.id);
    res.json({ ok: true });
  });

  // Registra gastos justificables del receptor. Pueden ser OPERACIONES del
  // banco (con kind) o FACTURAS (con facturaId/base/iva); cada gasto se
  // clasifica en factura/iva/tributos/irm_igf/operacion/otro.
  router.post('/rsp/subvenciones/api/:id/gastos', async (req, res) => {
    try { await asegurarDetalleSubvenciones(); } catch { /* memoria */ }
    const s = store.subvencionesDetalle[req.params.id];
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    const lista = Array.isArray(req.body?.gastos) ? req.body.gastos : [];
    let añadidos = 0;
    for (const g of lista) {
      const id = String(g.id || `G-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      if (s.gastos.some((x) => x.id === id)) continue;
      s.gastos.push({
        id,
        concepto: String(g.concepto || 'Gasto'),
        importe: Number(g.importe) || 0,
        fecha: String(g.fecha || AHORA().slice(0, 10)),
        categoria: clasificarCategoria(g),
        ...(g.base != null ? { base: Number(g.base) } : {}),
        ...(g.iva != null ? { iva: Number(g.iva) } : {}),
        ...(g.facturaId ? { facturaId: String(g.facturaId) } : {}),
        ...(g.transaccionId ? { transaccionId: String(g.transaccionId) } : {}),
        ...(g.kind ? { kind: String(g.kind) } : {}),
        excluido: false,
        justificado: false,
      });
      añadidos += 1;
    }
    await guardarDetalleSubvencion(s.id);
    res.json({ ok: true, añadidos, total: s.gastos.length });
  });

  // Justifica los gastos seleccionados (se ejecuta tras confirmar 2FA). Solo
  // son aptos los que la subvención cubre (categorías y tipos), nunca superan
  // el importe restante y no están excluidos. Devuelve el desglose por categoría.
  router.post('/rsp/subvenciones/api/:id/justificar', async (req, res) => {
    try { await asegurarDetalleSubvenciones(); } catch { /* memoria */ }
    const s = store.subvencionesDetalle[req.params.id];
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    const gastoIds = Array.isArray(req.body?.gastoIds) ? req.body.gastoIds.map(String) : [];
    if (!gastoIds.length) return res.status(400).json({ error: 'Selecciona al menos un gasto' });
    const cubiertas = s.categoriasCubiertas || [];
    const seleccion = s.gastos.filter((g) => gastoIds.includes(g.id) && !g.justificado && !g.excluido);
    const noApto = gastoIds.find((id) => {
      const g = s.gastos.find((x) => x.id === id);
      if (!g) return true;
      if (g.justificado || g.excluido) return false;
      if (cubiertas.length && !cubiertas.includes(g.categoria)) return true;
      if (s.tiposAptos?.length && g.kind && !s.tiposAptos.includes(g.kind)) return true;
      return false;
    });
    if (noApto) {
      const g = s.gastos.find((x) => x.id === noApto);
      return res.status(409).json({ error: `El gasto ${noApto} (${g?.categoria || '?'}) no está cubierto por esta subvención o no existe` });
    }
    if (!seleccion.length) return res.status(400).json({ error: 'No hay gastos seleccionables' });
    const total = round2(seleccion.reduce((sum, g) => sum + (Number(g.importe) || 0), 0));
    if (total > s.importeRestante) {
      return res.status(409).json({ error: `La justificación (${total} Pz) supera el importe restante (${s.importeRestante} Pz)` });
    }
    const fecha = AHORA().slice(0, 10);
    const porCategoria = new Map();
    const justificaciones = [];
    seleccion.forEach((g, i) => {
      g.justificado = true;
      porCategoria.set(g.categoria, round2((porCategoria.get(g.categoria) || 0) + (Number(g.importe) || 0)));
      const jid = `J-${s.id}-${Date.now()}-${i}`;
      justificaciones.push({
        id: jid, gastoId: g.id, importe: Number(g.importe) || 0, fecha, transferenciaId: `TRF-SUB-${jid}`,
        categorias: [{ categoria: g.categoria, importe: Number(g.importe) || 0 }],
      });
    });
    s.justificaciones.push(...justificaciones);
    s.importeRestante = round2(Math.max(0, s.importeRestante - total));
    s.estado = s.importeRestante === 0 ? 'justificada' : 'concedida';
    await guardarDetalleSubvencion(s.id);
    res.json({
      ok: true, importe: total, importeRestante: s.importeRestante, estado: s.estado,
      categorias: Array.from(porCategoria.entries()).map(([categoria, importe]) => ({ categoria, importe })),
      justificaciones: justificaciones.map((j) => j.id),
    });
  });

  // Reversión/devolución: si se detecta que una justificación no corresponde
  // al fin de la subvención (fraude / no conforme), se revierte el gasto y el
  // importe vuelve a la EMPRESA EIP que la concedió (emisor) — el beneficiario
  // no retiene el cobro indebido. Se restituye también el importeRestante del
  // fondo. (Registro contable con devueltoA=emisorEip; si se quiere el retorno
  // real por el Banco se ejecuta con la API bancaria aparte.)
  router.post('/rsp/subvenciones/api/:id/revertir', async (req, res) => {
    try { await asegurarDetalleSubvenciones(); } catch { /* memoria */ }
    const s = store.subvencionesDetalle[req.params.id];
    if (!s) return res.status(404).json({ error: 'Subvención no encontrada' });
    const gastoId = String(req.body?.gastoId || '');
    const motivo = String(req.body?.motivo || 'No corresponde al fin de la subvención');
    const gasto = s.gastos.find((g) => g.id === gastoId);
    if (!gasto || !gasto.justificado) return res.status(409).json({ error: 'El gasto no está justificado o no existe' });
    const importe = Number(gasto.importe) || 0;
    gasto.justificado = false;
    gasto.excluido = true; // no se puede volver a justificar
    const jids = s.justificaciones.filter((j) => j.gastoId === gastoId).map((j) => j.id);
    s.justificaciones = s.justificaciones.filter((j) => j.gastoId !== gastoId);
    const fecha = AHORA().slice(0, 10);
    const revId = `REV-${s.id}-${Date.now()}`;
    s.reversiones.push({ id: revId, gastoId, justificacionId: jids[0], importe, fecha, motivo, devueltoA: s.emisorEip });
    s.importeRestante = round2(Math.max(0, s.importeRestante + importe));
    s.estado = 'concedida';
    await guardarDetalleSubvencion(s.id);
    res.json({ ok: true, reversionId: revId, importe, importeRestante: s.importeRestante, justificacionIds: jids, devueltoA: s.emisorEip });
  });

  // Trazabilidad por beneficiario: cada empresa y cada particular subvencionado
  // con todas sus operaciones justificadas (para control y detección de fraude).
  router.get('/rsp/subvenciones/api/beneficiarios', async (_req, res) => {
    try {
      await asegurarDetalleSubvenciones();
      const filas = await store.subvenciones.listar();
      const mapa = new Map();
      const aporta = (id) => store.subvencionesDetalle[id];
      for (const f of filas || []) {
        const det = aporta(f.id);
        const receptor = String(det?.receptorEip || f.receptorEip || '');
        if (!receptor) continue;
        const nombre = det?.receptorNombre || f.receptorNombre || receptor;
        const tipo = /^EIP-/i.test(receptor) ? 'empresa' : 'particular';
        let b = mapa.get(receptor);
        if (!b) { b = { id: receptor, nombre, tipo, concedido: 0, justificado: 0, devuelto: 0, pendienteJustificar: 0, subvenciones: 0, operaciones: [] }; mapa.set(receptor, b); }
        b.subvenciones += 1;
        b.concedido = round2(b.concedido + (Number(det?.importe ?? f.importe) || 0));
        const jus = det?.justificaciones || [];
        const rev = det?.reversiones || [];
        b.justificado = round2(b.justificado + jus.reduce((s, j) => s + (Number(j.importe) || 0), 0));
        b.devuelto = round2(b.devuelto + rev.reduce((s, r) => s + (Number(r.importe) || 0), 0));
        b.pendienteJustificar = round2(Math.max(0, (Number(det?.importeRestante ?? f.importeRestante) || 0)));
        for (const j of jus) {
          const gasto = det.gastos.find((g) => g.id === j.gastoId);
          b.operaciones.push({
            subvencionId: det.id, concepto: gasto?.concepto || det.concepto || '—',
            gastoId: j.gastoId, categoria: gasto?.categoria || 'otro',
            importe: Number(j.importe) || 0, fecha: j.fecha, justificacionId: j.id,
          });
        }
      }
      const lista = Array.from(mapa.values()).map(({ operaciones, ...b }) => ({ ...b, operaciones }));
      res.json({
        ok: true, total: lista.length,
        resumen: {
          concedido: round2(lista.reduce((s, b) => s + b.concedido, 0)),
          justificado: round2(lista.reduce((s, b) => s + b.justificado, 0)),
          devuelto: round2(lista.reduce((s, b) => s + b.devuelto, 0)),
          pendiente: round2(lista.reduce((s, b) => s + b.pendienteJustificar, 0)),
        },
        beneficiarios: lista,
      });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  /* ── Bonificaciones (bonos) ──────────────────────────────────────── */
  router.get('/rsp/bonos/api', async (_req, res) => res.json(await store.bonos.listar()));
  router.get('/rsp/bonos/api/:id', (req, res) => {
    const b = store.bonosDetalle[req.params.id];
    if (!b) return res.status(404).json({ error: 'Bono no encontrado' });
    res.json(b);
  });
  router.post('/rsp/bonos/api', async (req, res) => {
    const d = req.body || {};
    const b = {
      id: `BONO-${Date.now()}`, nombre: d.nombre, emisorEip: d.emisorEip, emisorNombre: d.emisorEip,
      presupuesto: d.presupuesto, maxPorPersona: d.maxPorPersona, baremos: d.baremos || [],
      requisitos: d.requisitos || [],
      fechaLimite: d.fechaLimite, presupuestoUsado: 0, adscritos: 0, estado: 'activo', publicada: d.publicada ?? false, publicadaEn: d.publicada ? AHORA() : undefined,
    };
    await store.bonos.insertar(b);
    store.bonosDetalle[b.id] = { ...b, adscripciones: [], justificaciones: [] };
    res.status(201).json(b);
  });
  router.post('/rsp/bonos/api/:id/adscribir', async (req, res) => {
    const b = await store.bonos.obtener(req.params.id);
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

    const detalle = store.bonosDetalle[b.id] || { ...b, adscripciones: [], justificaciones: [] };
    if (!detalle.adscripciones.some((a) => a.dip === dip)) {
      detalle.adscripciones.push({ dip, nombre: dip, fechaAdscripcion: AHORA().slice(0, 10), justificado: 0 });
      store.bonosDetalle[b.id] = detalle;
      await store.bonos.actualizar(b.id, { adscritos: (b.adscritos || 0) + 1, presupuestoUsado: Math.min(b.presupuesto, (b.presupuestoUsado || 0) + b.maxPorPersona) });
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
    // Fuente real: Supabase (junior_actividades), sin depender del proxy HTTP.
    const rows = await store.juniorActividadesDb.listar();
    if (rows && rows.length) {
      return res.json(rows.map((a) => {
        const rango = String(a.edadRecomendada || '6-17').split('-').map((x) => parseInt(x, 10));
        return {
          id: a.id,
          titulo: a.titulo || 'Actividad',
          edadMin: Number.isFinite(rango[0]) ? rango[0] : 6,
          edadMax: Number.isFinite(rango[1]) ? rango[1] : 17,
          complejidad: a.dificultad || 'Media',
          precio: (a.subvencionada === true || a.contenido?.subvencionada === true) ? 0 : Number(a.precioLicencia || 0) + Number(a.precioIntento || 0),
          precioLicencia: (a.subvencionada === true || a.contenido?.subvencionada === true) ? 0 : Number(a.precioLicencia || 0), precioIntento: (a.subvencionada === true || a.contenido?.subvencionada === true) ? 0 : Number(a.precioIntento || 0),
          recompensa: Number(a.recompensa || a.contenido?.recompensa || 0),
          subvencionada: a.subvencionada === true || a.contenido?.subvencionada === true,
          descripcion: a.descripcion || '', categoria: a.categoria || 'General', portadaUrl: a.portadaUrl || a.portada_url || a.contenido?.__rspPortadaUrl || '', fechaPublicacion: a.fechaPublicacion || a.contenido?.__rspFechaPublicacion || null, tipo: a.tipo || 'test', contenido: a.contenido || {},
          estado: a.publica ? 'aprobada' : (a.estado === 'rechazada' ? 'rechazada' : 'en_revision'),
          colaborador: a.autorNombre || '—',
        };
      }));
    }
    const live = await juniorLive('actividades?solo_publicas=1');
    if (live && live.length) return res.json(live.map((a) => ({
      id: a.id, titulo: a.titulo || a.nombre || 'Actividad', edadMin: a.edadMin ?? a.edad_min ?? 6, edadMax: a.edadMax ?? a.edad_max ?? 17,
      complejidad: a.complejidad || 'Media', precio: a.precio_total ?? a.precio ?? 5.6, recompensa: a.recompensa ?? 10, estado: a.estado || 'aprobada', colaborador: a.colaborador || '—',
    })));
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
    const rows = await store.juniorColaboradoresDb.listar();
    if (rows && rows.length) {
      return res.json(rows.map((c) => ({
        dip: c.dip || c.placetaId || '',
        nombre: c.nombre || c.nombreReal || 'Colaborador',
        acuerdoFirmado: c.acuerdoFirmado !== false,
        actividades: Number(c.actividades || c.numActividades || 0),
        puntos: Number(c.puntos || 0),
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
    const rows = await store.juniorDiplomasDb.listar();
    if (rows && rows.length) {
      return res.json(rows.map((d) => ({
        id: d.id ?? `DIP-${d.juniorDip}-${d.fecha}`,
        dip: d.juniorDip || '',
        nombre: d.juniorNombre || '',
        actividad: d.actividadTitulo || '—',
        fecha: d.fecha || '',
      })));
    }
    res.json(store.juniorDiplomas);
  });

  // POST /rsp/junior/api/actividades/:id/estado — moderación de actividades
  router.post('/rsp/junior/api/actividades/:id/estado', async (req, res) => {
    const estado = req.body?.estado;
    if (!['aprobada', 'rechazada', 'en_revision'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    try {
      const actual = await store.juniorActividadesDb.obtener(req.params.id);
      const publica = estado === 'aprobada' && (!actual?.fechaPublicacion || new Date(actual.fechaPublicacion) <= new Date());
      await store.juniorActividadesDb.actualizar(req.params.id, { estado, publica });
      res.json({ success: true, id: req.params.id, estado, publica });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ── Códigos Junior (recarga + actividades) ─────────────────────── */
  function genCodigo() {
    return `GDLP-${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  router.get('/rsp/junior/api/codigos', async (_req, res) => {
    res.json(await store.juniorCodigosDb.listar());
  });

  router.post('/rsp/junior/api/codigos', async (req, res) => {
    const d = req.body || {};
    const tipo = ['recarga', 'un_uso', 'actividades'].includes(d.tipo) ? d.tipo : 'actividades';
    if (tipo === 'recarga' && !Number(d.valor)) return res.status(400).json({ error: 'Valor de recarga requerido' });
    if (['un_uso', 'actividades'].includes(tipo) && (!Array.isArray(d.actividadIds) || d.actividadIds.length === 0)) return res.status(400).json({ error: 'Selecciona al menos una actividad' });
    const codigoSolicitado = String(d.codigo || '').trim().toUpperCase();
    if (codigoSolicitado && !/^GDLP-[A-Z0-9-]{4,40}$/.test(codigoSolicitado)) return res.status(400).json({ error: 'Formato de código inválido' });
    const existentes = await store.juniorCodigosDb.listar();
    const codigoFinal = codigoSolicitado || genCodigo();
    if (existentes.some((c) => String(c.codigo).toUpperCase() === codigoFinal)) return res.status(409).json({ error: 'Ese código ya existe' });
    const codigo = {
      id: `COD-${Date.now()}`,
      codigo: codigoFinal,
      tipo,
      valor: tipo === 'recarga' ? Number(d.valor) : 0,
      actividadIds: ['un_uso', 'actividades'].includes(tipo) ? [...new Set(d.actividadIds.map(String))] : [],
      estado: 'disponible',
      dipVinculado: null,
      creadoEn: AHORA(),
      canjeadoEn: null,
      demo: d.demo === true,
    };
    await store.juniorCodigosDb.insertar(codigo);
    res.status(201).json(codigo);
  });

  router.post('/rsp/junior/api/codigos/:id/accion', async (req, res) => {
    const c = await store.juniorCodigosDb.obtener(req.params.id);
    if (!c) return res.status(404).json({ error: 'Código no encontrado' });
    const accion = req.body?.accion;
    if (accion === 'eliminar') {
      if (c.demo !== true) return res.status(400).json({ error: 'Solo se pueden eliminar códigos demo' });
      const resultado = await store.juniorCodigosDb.borrar(req.params.id);
      if (resultado?.ok === false) return res.status(500).json({ error: resultado.error });
    } else if (accion === 'revocar') await store.juniorCodigosDb.actualizar(req.params.id, { estado: 'revocado' });
    else if (accion === 'desvincular') {
      if (c.tipo !== 'actividades') return res.status(400).json({ error: 'Los códigos de un uso no se pueden desvincular' });
      await store.juniorCodigosDb.actualizar(req.params.id, { estado: 'disponible', dipVinculado: null, canjeadoEn: null, desvinculadoEn: AHORA() });
    }
    else return res.status(400).json({ error: 'Acción inválida' });
    res.json({ success: true, id: req.params.id, accion });
  });

  /* ── Subapartados de actividades (diapositivas progresivas) ──────── */
  router.get('/rsp/junior/api/actividades/:id/subapartados', async (req, res) => {
    const lista = await store.juniorSubapartadosDb.listar({ filtros: { actividadId: req.params.id } });
    res.json(lista.sort((a, b) => Number(a.orden) - Number(b.orden)));
  });

  router.post('/rsp/junior/api/actividades/:id/subapartados', async (req, res) => {
    const d = req.body || {};
    if (!d.titulo) return res.status(400).json({ error: 'Título requerido' });
    const lista = await store.juniorSubapartadosDb.listar({ filtros: { actividadId: req.params.id } });
    const sub = {
      id: `SUB-${Date.now()}`,
      actividadId: req.params.id,
      titulo: String(d.titulo).trim(),
      orden: (lista.reduce((m, s) => Math.max(m, Number(s.orden) || 0), 0) || 0) + 1,
      tipo: String(d.tipo || 'diapositiva'),
      desbloqueado: false,
      recompensa: Number(d.recompensa) || 0,
      contenido: d.contenido && typeof d.contenido === 'object' ? d.contenido : { version: 2, bloques: [] },
      desbloqueo: String(d.desbloqueo || 'completar_anterior'),
    };
    await store.juniorSubapartadosDb.insertar(sub);
    res.status(201).json(sub);
  });

  router.post('/rsp/junior/api/actividades/:id/subapartados/:subId/desbloquear', async (req, res) => {
    const sub = await store.juniorSubapartadosDb.obtener(req.params.subId);
    if (!sub) return res.status(404).json({ error: 'Subapartado no encontrado' });
    await store.juniorSubapartadosDb.actualizar(req.params.subId, { desbloqueado: true });
    res.json({ success: true, id: req.params.subId });
  });

  /* ── Operaciones / auditoría / notificaciones ────────────────────── */
  router.get('/rsp/operaciones/api', async (_req, res) => res.json(await store.operaciones.listar()));
  router.post('/rsp/operaciones/api/:id/revertir', async (req, res) => {
    const o = await store.operaciones.obtener(req.params.id);
    if (!o) return res.status(404).json({ error: 'Operación no encontrada' });
    if (o.estado !== 'retenida') return res.status(400).json({ error: 'Solo se pueden revertir operaciones retenidas' });
    await store.operaciones.actualizar(req.params.id, { estado: 'rechazada' });
    res.json({ ok: true });
  });
  router.get('/rsp/auditoria/api', async (_req, res) => res.json(await store.auditoria.listar()));
  router.get('/api/notificaciones/mis', async (_req, res) => res.json(await store.notificaciones.listar()));
  router.post('/api/notificaciones/:id/leida', async (req, res) => {
    const n = await store.notificaciones.obtener(req.params.id);
    if (!n) return res.status(404).json({ error: 'Notificación no encontrada' });
    await store.notificaciones.actualizar(req.params.id, { leida: true });
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
    const [expedientes, notificaciones, cnic, bopCnic, operaciones, nominas] = await Promise.all([
      store.expedientes.listar(), store.notificaciones.listar(), store.cnic.listar(), store.bopCnic.listar(), store.operaciones.listar(), store.nominas.listar(),
    ]);
    const cnicVigentes = Math.max(cnic.filter((c) => c.estado === 'vigente').length, (bopCnic || []).filter((c) => c.vigente).length, CNIC_BASE.length);
    const comprobaciones = await comprobacionesCumplimiento();
    let fundaciones = 0;
    try {
      const cuentas = await listarCuentas();
      fundaciones = cuentas.filter((c) => c.esFundacion).length;
    } catch { /* banco offline */ }
    res.json({
      expedientes: expedientes.length,
      incidencias: 0,
      incidenciasAbiertas: 0,
      notificacionesNoLeidas: notificaciones.filter((n) => !n.leida).length,
      cnicVigentes,
      nominas: nominas.length,
      facturas: 0,
      fundaciones,
      bloqueos500k,
      retribucionesPendientes: 0,
      operacionesRetenidas: operaciones.filter((o) => o.estado === 'retenida').length,
      comprobaciones: comprobaciones.length,
      comprobacionesInconsistencia: comprobaciones.filter((c) => c.estado === 'inconsistencia').length,
    });
  });

  /* ── Normativa (CNIC) ────────────────────────────────────────────── */
  router.get('/rsp/normativo/api', async (_req, res) => {
    // El editor necesita ver también borradores. La API pública de BOP
    // solo expone vigentes, por lo que aquí se consulta la tabla compartida
    // directamente y se conserva el estado real de cada versión.
    const bop = await store.bopCnic.listar();
    if (bop?.length) return res.json(bop.map(normalizarBopCnic));
    const oficial = await cargarCnicOficial();
    if (!oficial) return res.status(503).json({ error: 'bop_no_disponible', message: 'No se puede cargar el catálogo oficial de CNIC' });
    res.json(oficial);
  });

  // Gestión de catálogo desde RSP. Las fechas futuras se guardan como
  // programadas y no se publican hasta que llegue la fecha indicada.
  router.post('/rsp/junior/api/actividades', async (req, res) => {
    const d = req.body || {};
    if (!String(d.titulo || '').trim()) return res.status(400).json({ error: 'Título requerido' });
    const fecha = d.fechaPublicacion || d.fecha_publicacion || null;
    const publica = d.estado === 'aprobada' && (!fecha || new Date(fecha) <= new Date());
    const contenido = { ...(d.contenido && typeof d.contenido === 'object' ? d.contenido : {}), ...(fecha ? { __rspFechaPublicacion: fecha } : {}), ...(d.portadaUrl ? { __rspPortadaUrl: d.portadaUrl } : {}), subvencionada: d.subvencionada === true };
    const subvencionada = d.subvencionada === true;
    const a = { id: randomUUID(), titulo: String(d.titulo).trim(), descripcion: String(d.descripcion || ''), categoria: String(d.categoria || 'General'), tipo: String(d.tipo || 'test'), contenido, edadRecomendada: `${Number(d.edadMin) || 6}-${Number(d.edadMax) || 17}`, dificultad: String(d.complejidad || d.dificultad || 'Media'), precioLicencia: subvencionada ? 0 : Number(d.precioLicencia) || 0, precioIntento: subvencionada ? 0 : Number(d.precioIntento) || 0, recompensa: Number(d.recompensa) || 0, portadaUrl: d.portadaUrl || null, estado: publica ? 'aprobada' : (d.estado || 'en_revision'), publica, autorNombre: d.colaborador || req.user?.dip || 'RSP', creadoEn: AHORA() };
    const insertado = await store.juniorActividadesDb.insertar(a);
    if (insertado?.__dbError) return res.status(500).json({ error: insertado.__dbError });
    res.status(201).json(a);
  });
  router.post('/rsp/junior/api/actividades/:id', async (req, res) => {
    const a = await store.juniorActividadesDb.obtener(req.params.id);
    if (!a) return res.status(404).json({ error: 'Actividad no encontrada' });
    const d = req.body || {};
    const contenido = d.contenido && typeof d.contenido === 'object' ? d.contenido : a.contenido || {};
    if (d.fechaPublicacion !== undefined) contenido.__rspFechaPublicacion = d.fechaPublicacion || null;
    const patch = {};
    ['titulo', 'descripcion', 'categoria', 'tipo', 'dificultad', 'recompensa', 'destacada', 'precioLicencia', 'precioIntento'].forEach((key) => { if (d[key] !== undefined) patch[key] = d[key]; });
    if (d.subvencionada !== undefined) contenido.subvencionada = d.subvencionada === true;
    if (d.portadaUrl !== undefined) { contenido.__rspPortadaUrl = d.portadaUrl || null; patch.portadaUrl = d.portadaUrl || null; }
    if (d.edadMin !== undefined || d.edadMax !== undefined) patch.edadRecomendada = `${Number(d.edadMin ?? a.edadMin ?? 6)}-${Number(d.edadMax ?? a.edadMax ?? 17)}`;
    patch.contenido = contenido;
    if (d.fechaPublicacion !== undefined) patch.publica = a.estado === 'aprobada' && (!d.fechaPublicacion || new Date(d.fechaPublicacion) <= new Date());
    let resultado = await store.juniorActividadesDb.actualizar(req.params.id, patch);
    // Compatibilidad con instalaciones cuyo esquema aún no tiene
    // `portada_url`: el valor queda igualmente disponible en contenido.
    if (resultado?.ok === false && d.portadaUrl !== undefined) {
      const { portadaUrl: _portadaUrl, ...patchSinColumna } = patch;
      resultado = await store.juniorActividadesDb.actualizar(req.params.id, patchSinColumna);
    }
    if (resultado?.ok === false) return res.status(500).json({ error: resultado.error });
    res.json({ success: true });
  });

  router.get('/rsp/junior/api/categorias', async (_req, res) => res.json(await store.juniorCategoriasDb.listar()));
  router.post('/rsp/junior/api/categorias', async (req, res) => {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const actual = await store.juniorCategoriasDb.listar();
    const c = { id: `CAT-${Date.now()}`, nombre, descripcion: String(req.body?.descripcion || ''), activa: true, orden: actual.length + 1, creadoEn: AHORA() };
    await store.juniorCategoriasDb.insertar(c); res.status(201).json(c);
  });
  router.get('/rsp/junior/api/bundles', async (_req, res) => res.json(await store.juniorBundlesDb.listar()));
  router.post('/rsp/junior/api/bundles', async (req, res) => {
    const d = req.body || {}; if (!String(d.nombre || '').trim()) return res.status(400).json({ error: 'Nombre requerido' });
    const b = { id: `BUN-${Date.now()}`, nombre: String(d.nombre).trim(), descripcion: String(d.descripcion || ''), actividadIds: Array.isArray(d.actividadIds) ? d.actividadIds.map(String) : [], precioLicencia: Number(d.precioLicencia) || 0, precioIntento: Number(d.precioIntento) || 0, publica: d.publica !== false, fechaPublicacion: d.fechaPublicacion || null, creadoEn: AHORA() };
    await store.juniorBundlesDb.insertar(b); res.status(201).json(b);
  });
  router.post('/rsp/junior/api/bundles/:id', async (req, res) => { if (!await store.juniorBundlesDb.obtener(req.params.id)) return res.status(404).json({ error: 'Bundle no encontrado' }); await store.juniorBundlesDb.actualizar(req.params.id, req.body || {}); res.json({ success: true }); });
  router.get('/rsp/junior/api/estadisticas', async (_req, res) => res.json(await store.juniorEstadisticasDb.listar()));
  router.get('/rsp/junior/api/finanzas', async (_req, res) => res.json(await store.juniorFinanzasDb.listar()));
  router.post('/rsp/normativo/api/refresh', async (_req, res) => {
    valoresBop.limpiarCache();
    const oficial = await cargarCnicOficial();
    if (oficial) return res.json({ sincronizado: true, total: oficial.length, fuente: 'BOP · API oficial' });
    const bop = await store.bopCnic.listar();
    if (!(bop || []).length) return res.status(503).json({ error: 'bop_no_disponible' });
    res.json({ sincronizado: true, total: bop.length, fuente: 'BOP · Supabase compartido' });
  });

  // Estado de la fuente de valores del BOP (API nueva) para diagnóstico.
  router.get('/rsp/valores/api/diagnostico', async (_req, res) => {
    try {
      const d = await valoresBop.diagnostico({ fuerza: true });
      res.json({ success: true, servicio: 'valores-bop', ...d });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
  router.post('/rsp/normativo/api/version', async (req, res) => {
    const d = req.body || {};
    const codigo = String(d.codigo || '').trim().toUpperCase();
    const valor = d.valor;
    const motivo = String(d.motivo || '').trim();
    if (!/^CNIC-[A-Z0-9-]+$/.test(codigo) || valor === undefined || !motivo) return res.status(400).json({ error: 'codigo, valor y motivo son obligatorios' });
    const actual = await store.bopCnic.obtener(codigo);
    const historial = Array.isArray(actual?.historial) ? actual.historial : [];
    const regla = {
      ...(actual || {}), codigo, etiqueta: actual?.etiqueta || codigo,
      tipoValor: actual?.tipoValor || 'porcentaje', valor: String(valor), unidad: actual?.unidad || '%',
      vigente: false, estado: 'borrador', autorDip: req.user?.dip || 'RSP',
      historial: [...historial, ...(actual ? [{ valor: actual.valor, desde: actual.updatedAt || null, autorDip: actual.autorDip || 'BOP', notas: 'Valor anterior' }] : []), { valor: String(valor), desde: AHORA(), autorDip: req.user?.dip || 'RSP', notas: motivo }],
    };
    if (actual) await store.bopCnic.actualizar(codigo, regla);
    else await store.bopCnic.insertar(regla);
    valoresBop.limpiarCache();
    res.status(201).json(normalizarBopCnic(regla));
  });
  router.post('/rsp/normativo/api/:codigo/aprobar', async (req, res) => {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();
    const actual = await store.bopCnic.obtener(codigo);
    if (!actual) return res.status(404).json({ error: 'CNIC no encontrado' });
    await store.bopCnic.actualizar(codigo, { vigente: true, estado: 'vigente', autorDip: req.user?.dip || actual.autorDip || 'RSP', updatedAt: AHORA() });
    valoresBop.limpiarCache();
    cnicCache = { t: 0, data: null };
    res.json({ success: true });
  });

  const normalizarBopDocumento = (d) => ({
    id: d.id || d.codigo, codigo: d.codigo, titulo: d.titulo, tipo: d.tipo || 'cni',
    categoria: d.categoria || 'capitulo', estado: d.estado || 'proyecto',
    contenidoMd: d.contenidoMd || '', version: Number(d.version || 1),
    aprobadaEnJunta: Boolean(d.aprobadaEnJunta), autorDip: d.autorDip,
    notasCambio: d.notasCambio, cnicRefs: d.cnicRefs || [],
  });
  router.get('/rsp/normativo/documentos', async (_req, res) => {
    res.json((await store.bopDocumentos.listar()).map(normalizarBopDocumento));
  });
  router.post('/rsp/normativo/documentos', async (req, res) => {
    const d = req.body || {};
    const codigo = String(d.codigo || '').trim().toUpperCase();
    const titulo = String(d.titulo || '').trim();
    const contenidoMd = String(d.contenidoMd || '');
    if (!codigo || !titulo || !contenidoMd.trim()) return res.status(400).json({ error: 'codigo, titulo y contenidoMd son obligatorios' });
    const anterior = (await store.bopDocumentos.listar()).find((x) => x.codigo === codigo);
    const cnicRefs = Array.isArray(d.cnicRefs) ? d.cnicRefs.filter((r) => r && r.codigo).map((r) => ({ codigo: String(r.codigo).trim().toUpperCase(), etiqueta: String(r.etiqueta || r.codigo).trim() })) : [];
    const documento = { ...(anterior || {}), id: anterior?.id || `BOP-${Date.now()}`, codigo, titulo, tipo: d.tipo || 'cni', categoria: d.categoria || 'capitulo', estado: 'proyecto', contenidoMd, version: Number(anterior?.version || 0) + 1, aprobadaEnJunta: false, autorDip: req.user?.dip || 'RSP', notasCambio: String(d.notasCambio || ''), cnicRefs };
    if (anterior) { await store.bopVersiones.insertar({ documentoId: documento.id, version: anterior.version, estado: anterior.estado, contenidoMd: anterior.contenidoMd, autorDip: anterior.autorDip, notasCambio: anterior.notasCambio }); await store.bopDocumentos.actualizar(anterior.id, documento); }
    else await store.bopDocumentos.insertar(documento);
    res.status(201).json(normalizarBopDocumento(documento));
  });
  router.post('/rsp/normativo/documentos/:id/aprobar', async (req, res) => {
    const id = String(req.params.id);
    const documento = await store.bopDocumentos.obtener(id);
    if (!documento) return res.status(404).json({ error: 'Documento BOP no encontrado' });
    await store.bopDocumentos.actualizar(id, { estado: 'vigente', aprobadaEnJunta: true, updatedAt: AHORA() });
    res.json({ success: true });
  });

  /* ── Cumplimiento normativo (comprobaciones automáticas) ──────────── */
  // Comprobaciones automáticas derivadas del banco vivo. Cada incidencia
  // referencia su CNIC / fuente BOP para trazabilidad normativa.
  async function comprobacionesCumplimiento() {
    let cuentas = [];
    try { cuentas = await listarCuentas(); } catch { cuentas = []; }
    const checks = [];

    // 1) Límite de capital personal (500.000 Pz) → bloqueo preventivo.
    cuentas
      .filter((c) => c.tipo !== 'Business' && Number(c.saldo) > 500000)
      .forEach((c) => checks.push({
        id: `CMP-${c.id}-limite`,
        codigo: 'cumplimiento.limite_capital',
        titulo: `Cuenta ${c.id} supera el límite de capital personal`,
        dip: c.dip || '',
        servicio: 'Banco',
        severidad: 'critica',
        estado: 'inconsistencia',
        cnic: 'CNIC-LIMITE-CAPITAL-001',
        fuente: 'BOP',
        detalle: `Saldo ${c.saldo} Pz supera el límite ordinario de 500.000 Pz (bloqueo preventivo y justificación en 15 días).`,
        fecha: AHORA(),
      }));

    // 2) Menores sin tutor legal vinculado.
    cuentas
      .filter((c) => c.tipo === 'Child' && !c.tutorDip && !c.cotitular)
      .forEach((c) => checks.push({
        id: `CMP-${c.id}-tutor`,
        codigo: 'cumplimiento.menor_sin_tutor',
        titulo: `Menor ${c.dip || c.id} sin tutor legal vinculado`,
        dip: c.dip || '',
        servicio: 'Placeta Junior',
        severidad: 'critica',
        estado: 'inconsistencia',
        cnic: 'CNIC-MENOR-TUTOR-001',
        fuente: 'BOP',
        detalle: 'La cuenta Junior requiere tutor legal y documentación firmada antes de activarse.',
        fecha: AHORA(),
      }));

    // 3) Documentación / consentimiento obligatorio pendiente.
    cuentas
      .filter((c) => c.cumplimiento && c.cumplimiento !== 'al_dia' && c.cumplimiento !== 'Al día')
      .forEach((c) => checks.push({
        id: `CMP-${c.id}-docs`,
        codigo: 'cumplimiento.documentacion_pendiente',
        titulo: `Documentación pendiente en la cuenta ${c.id}`,
        dip: c.dip || '',
        servicio: 'Cumplimiento',
        severidad: 'alta',
        estado: 'pendiente',
        cnic: 'CNIC-DOCUMENTACION-001',
        fuente: 'BOP',
        detalle: `Estado de cumplimiento: ${c.cumplimiento}. La cuenta no puede activarse por completo.`,
        fecha: AHORA(),
      }));

    return checks;
  }

  // GET /rsp/normativo/api/comprobaciones — listado de comprobaciones
  router.get('/rsp/normativo/api/comprobaciones', async (_req, res) => {
    res.json(await comprobacionesCumplimiento());
  });

  // POST /rsp/normativo/api/migrar-junior — fuerza la migración de un
  // usuario a Placeta Junior y genera el trámite/sentencia de Justicia que
  // documenta el cambio (cerrable sin firma cuando lo permite la norma).
  // Requiere el DIP del tutor legal cuando se trata de un menor.
  router.post('/rsp/normativo/api/migrar-junior', async (req, res) => {
    const d = req.body || {};
    const dip = String(d.dip || '').trim().toUpperCase();
    if (!dip) return res.status(400).json({ error: 'DIP requerido' });
    const nombre = d.nombre || dip;
    const tutorDip = String(d.tutorDip || '').trim().toUpperCase();

    const requisitos = [
      { descripcion: 'Autorización del tutor legal (PlacetaID)', cumplido: !!tutorDip },
      { descripcion: 'Documentación de identidad del menor', cumplido: true },
      { descripcion: 'Consentimiento informado del tutor', cumplido: !!tutorDip },
    ];
    const completo = tutorDip !== '';

    // 1) Trámite/sentencia de Justicia que documenta el cambio.
    const tramite = {
      id: `TR-${Date.now()}`,
      tipo: 'sentencia_justicia',
      titulo: `Migración a Placeta Junior — ${dip}`,
      dip,
      nombreCiudadano: nombre,
      estado: completo ? 'pendiente_firma' : 'pendiente_tutor',
      cerrarSinFirma: false,
      firmaRequerida: true,
      servicio: 'Justicia',
      normativa: 'CNIC-MENOR-TUTOR-001',
      fuenteNormativa: 'BOP',
      actualizadoEn: AHORA(),
      requisitos,
      datosEspecificos: {
        motivo: d.motivo || 'Cumplimiento normativo: usuario menor de edad o con requerimiento de Placeta Junior.',
        aplicadaPor: d.aplicadaPor || 'RSP',
        tutorDip: tutorDip || null,
      },
    };
    await store.tramites.insertar(tramite);

    // 2) Expediente asociado.
    const documentoFirma = {
      id: `DOC-${Date.now()}`,
      tipo: 'consentimiento_migracion_junior',
      dip,
      tutorDip: tutorDip || null,
      estado: 'pendiente_firma',
      tramiteId: tramite.id,
      creadoEn: AHORA(),
    };
    const expediente = {
      id: `EXP-${Date.now()}`,
      dip,
      tipo: 'migracion_junior',
      tramiteId: tramite.id,
      estado: 'abierto',
      actualizadoEn: AHORA(),
      documentos: [tramite.id, documentoFirma.id],
      firma: documentoFirma,
    };
    await store.expedientes.insertar(expediente);

    // El alta de un menor requiere dos consentimientos independientes. Se
    // envían al tutor como documentos separados para que pueda leerlos y
    // firmarlos por separado desde PlacetaID Móvil.
    let firmas = [];
    if (completo) {
      const sujetoFirma = tutorDip || dip;
      const datosTutor = tutorDip ? `Tutor legal identificado con DIP ${tutorDip}` : 'Tutor legal identificado en PlacetaID';
      const base = { dip: sujetoFirma, tramiteId: tramite.id, accion: 'alta_menor' };
      firmas = await Promise.all([
        crearYEnviarFirma({
          ...base,
          tipo: 'autorizacion_parental',
          titulo: `Autorización parental para el alta de ${nombre}`,
          contenido: [
            'AUTORIZACIÓN PARENTAL — ALTA EN PLACETA JUNIOR',
            '',
            `Menor: ${nombre} · DIP: ${dip}`,
            datosTutor,
            '',
            'La persona firmante declara que ejerce la tutela legal del menor y autoriza su alta en Placeta Junior, así como la vinculación de su perfil con el tutor indicado. La autorización permite gestionar el acceso educativo, el progreso y las funciones de cuenta previstas para menores.',
            '',
            'La autorización se presta para este alta y queda registrada con la versión, fecha, CSV y huella del documento. Podrá solicitarse su revisión o retirada conforme a la normativa aplicable.',
          ].join('\\n'),
        }),
        crearYEnviarFirma({
          ...base,
          tipo: 'consentimiento_informado_menor',
          titulo: `Consentimiento informado y condiciones de ${nombre}`,
          contenido: [
            'CONSENTIMIENTO INFORMADO Y CONDICIONES DE USO — MENOR',
            '',
            `Menor: ${nombre} · DIP: ${dip}`,
            datosTutor,
            '',
            'La persona firmante declara haber leído la información sobre privacidad, seguridad, actividades educativas, progreso, recompensas y gestión de la cuenta Junior. Confirma que ha explicado al menor las normas de uso y que supervisará su utilización.',
            '',
            'Los datos se tratarán únicamente para prestar el servicio, mantener la cuenta, registrar el progreso y cumplir las obligaciones legales. El tutor podrá ejercer los derechos que correspondan y solicitar la baja conforme a la política de privacidad vigente.',
          ].join('\\n'),
        }),
      ]);
    }
    await store.auditoria.insertar({
      id: `AUD-${Date.now()}`, usuario: req.user?.dip || 'RSP', servicio: 'Placeta Junior',
      accion: 'migrar_usuario', objetoTipo: 'expediente', objetoId: expediente.id,
      motivo: tramite.datosEspecificos.motivo, fecha: AHORA(),
    });

    // 3) Marcar la cuenta como Child y vincular tutor (overlay en memoria;
    //    en producción se aplica vía postBanco / crm-state).
    try {
      const cuentas = await listarCuentas();
      const cuenta = cuentas.find((c) => String(c.dip || '').toUpperCase() === dip);
      if (cuenta) mutarCuenta(cuenta.id, { tipo: 'Child', tutorDip: tutorDip || null, migradoAJunior: true, migradoEn: AHORA() });
    } catch { /* banco offline */ }

    res.status(201).json({ success: true, tramite, expediente, firmas, requiereTutor: !completo, requiereFirma: true });
  });

  /* ── Tributos: censo + declaraciones con cálculo DETALLADO y trazable ── */
  const declaracionesEstado = new Map(); // id de declaración -> estado (sesión)
  const mesActual = () => new Date().toISOString().slice(0, 7);
  const proximoPago = () => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-05`;
  };
  function declaracionDe(c, mes) {
    const id = `DEC-${mes}-${c.id}`;
    return {
      id,
      mesPeriodo: mes,
      contribuyenteId: c.id,
      contribuyenteNombre: c.nombre,
      patrimonioMedio: c.patrimonioMedio ?? c.patrimonio,
      cuotaIrm: c.cuotaIrm,
      cuotaIgf: c.cuotaIgf,
      estado: declaracionesEstado.get(id) || 'borrador',
    };
  }

  router.get('/rsp/tributos/api/contribuyentes', async (req, res) => {
    try {
      const state = await getBankState();
      const cnic = await cargarCnicVigentes();
      const lista = calcularContribuyentes(state, undefined, cnic);
      const q = String(req.query.q || '').toLowerCase();
      res.json(lista.filter((c) => !q || c.nombre.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)));
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/tributos/api/contribuyentes/:id', async (req, res) => {
    try {
      const state = await getBankState();
      const mes = req.query.mes || mesActual();
      const cnic = await cargarCnicVigentes();
      const c = calcularContribuyentes(state, undefined, cnic).find((x) => x.id === req.params.id);
      if (!c) return res.status(404).json({ error: 'Contribuyente no encontrado' });
      res.json({
        ...c,
        estimado: { cuotaIrm: c.cuotaIrm, cuotaIgf: c.cuotaIgf, proximoPago: proximoPago() },
        declaraciones: [declaracionDe(c, mes)],
      });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/tributos/api/declaraciones', async (req, res) => {
    try {
      const state = await getBankState();
      const mes = req.query.mes || mesActual();
      const cnic = await cargarCnicVigentes();
      res.json(calcularContribuyentes(state, undefined, cnic).map((c) => declaracionDe(c, mes)));
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.get('/rsp/tributos/api/declaraciones/:id', async (req, res) => {
    try {
      const state = await getBankState();
      const mes = req.query.mes || mesActual();
      const id = req.params.id;
      const cnic = await cargarCnicVigentes();
      const c = calcularContribuyentes(state, undefined, cnic).find((x) => `DEC-${mes}-${x.id}` === id || x.id === id);
      if (!c) return res.status(404).json({ error: 'Declaración no encontrada' });
      const exentoIgf = await valoresBop.leerNumero('CNIC-IGF-PF-TRAMO-1', 5000);
      const base = declaracionDe(c, mes);
      res.json({
        ...base,
        cuentaIdBlp: c.desglose?.cuentas?.[0]?.id ?? c.id,
        exencionAplicada: c.igfExentoReducida
          ? 'IGF exento — empresa de reducida dimensión (CNI Art. 4.15)'
          : c.ivaExento ? 'IVA exento (empresa — CNI Art. 4.4)' : 'Ninguna',
        diasActivosMes: c.diasActivos ?? 30,
        ivaExento: c.ivaExento,
        indiceAcumulacion: c.indiceAcumulacion ?? 0,
        ingresosMes: c.ingresosMes ?? 0,
        pagosMes: c.pagosMes ?? 0,
        documentos: [],
        desglose: {
          baseIrm: c.patrimonioMedio ?? c.patrimonio,
          tipoIrm: c.desglose.irm.tramos[0]?.tipoPct ?? 0,
          retencionesIrm: 0,
          bonificacionesIrm: 0,
          patrimonioBruto: c.patrimonio,
          patrimonioExento: exentoIgf,
          baseIgf: Math.max(0, (c.patrimonioMedio ?? c.patrimonio) - exentoIgf),
          tipoIgf: c.desglose.igf.tramos[0]?.tipoPct ?? 0,
          ivaRepercutido: c.ivaRepercutido ?? 0,
          ivaSoportado: c.ivaSoportado ?? 0,
          cuotaIva: c.ivaExento ? 0 : (c.ivaRepercutido ?? 0),
          ia: c.indiceAcumulacion ?? 0,
          ingresosMes: c.ingresosMes ?? 0,
          pagosMes: c.pagosMes ?? 0,
          acumulacionNeta: c.incrementoActivos ?? 0,
          tramoIA: c.desglose.irm.tramoIA ?? 0,
          tramosIrm: c.desglose.irm.tramos,
          tramosIgf: c.desglose.igf.tramos,
          escalaIrm: c.desglose.irm.escala,
          escalaIgf: c.desglose.igf.escala,
          cuentas: c.desglose.cuentas,
          movimientos: c.desglose.movimientos,
          patrimonioMedio: c.patrimonioMedio ?? c.patrimonio,
          diasActivos: c.diasActivos,
          saldosDiarios: c.desglose.saldosDiarios,
        },
      });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });
  router.post('/rsp/tributos/api/declaraciones/:id/:accion', async (req, res) => {
    const { id, accion } = req.params;
    const estados = { publicar: 'pendiente_aprobacion', aprobar: 'aprobada', rechazar: 'borrador', emitir: 'emitida', cobrar: 'cobrada' };
    const siguiente = estados[accion];
    if (!siguiente) return res.status(400).json({ error: `Acción desconocida: ${accion}` });

    // Empresas: «cobrar» se resuelve a través de su recibo de facturación
    // central (una única vía de dinero hacia Tributos/TGLP). Si el recibo ya
    // está abonado solo se refleja; si está pendiente se domicilia en la
    // cuenta BLP (la acción es crítica y ya pasa por 2FA en el panel).
    const empresa = /^DEC-(\d{4})-(\d{2})-(EIP-.+)$/.exec(id);
    if (empresa && accion === 'cobrar') {
      try {
        const mes = `${empresa[1]}-${empresa[2]}`;
        const r = await cobrarReciboEmpresa(empresa[3], mes);
        declaracionesEstado.set(id, r.estadoDeclaracion);
        return res.json({ ok: true, estado: r.estadoDeclaracion, aviso: r.aviso, cobro: r.cobro || undefined });
      } catch (e) {
        return res.status(e.status || 409).json({ error: e.message });
      }
    }

    declaracionesEstado.set(id, siguiente);
    res.json({ ok: true, estado: siguiente });
  });

  /* ── Facturación central (RSP + Banco) ────────────────────────────
     Ciclo mensual automático por empresa: recibo de Tributos (IRM+IGF)
     + facturas de venta/servicio. Cobro a fin de mes con cargo en la
     cuenta BLP (domiciliación) hacia Tributos/TGLP; si no hay saldo,
     queda impagada. La ejecución bancaria solo ocurre si el BFF tiene
     `mutarBanco` (misma llave CRM que Junior) y se pide `ejecutar`. */
  const ESTADOS_TERMINALES_RECIBO = ['pagada', 'cobrada', 'impagada', 'anulada', 'pendiente_cargo'];

  async function cicloFacturacionConPersistencia(mes) {
    const state = await getBankState();
    const cnic = await cargarCnicVigentes();
    const contribuyentes = calcularContribuyentes(state, mes, cnic);
    const ciclo = calcularCicloFacturacion({ state, contribuyentes, mes, cnic });
    const rows = await store.facturacion.listar({ filtros: { mes } });
    const recibos = new Map((rows || []).filter((r) => r.documento === 'recibo').map((r) => [r.id, r]));
    const filasFactura = new Map((rows || []).filter((r) => r.documento === 'factura').map((r) => [r.id, r]));
    let conciliados = 0;
    for (const e of ciclo.empresas) {
      // IVA por factura: si una factura ya se ingresó a TGLP, se refleja como
      // pagada (nunca se vuelve a cobrar).
      for (const f of e.facturas) {
        const fr = filasFactura.get(f.id);
        if (!fr || !fr.ivaPagado) continue;
        f.ivaPagado = true;
        f.fechaPagoIva = fr.fechaPagoIva || null;
        f.transaccionPagoIva = fr.transaccionPagoIva || null;
      }
      // Conciliación del IVA pagado por el CIUDADANO (Banco web/APP o manual):
      // una transferencia real Settled a TGLP que referencia facturas marca
      // esas facturas como pagadas (idempotente), aunque no haya pasado por el
      // panel. Así nunca se vuelve a ofrecer ni a cobrar ese IVA.
      const pagosIva = pagosIvaExternosDeEmpresa(state, e);
      for (const [fid, pago] of pagosIva) {
        const f = e.facturas.find((x) => x.id === fid);
        if (!f || f.ivaPagado) continue;
        const patch = { ivaPagado: true, fechaPagoIva: pago.fecha || null, transaccionPagoIva: pago.transaccionId };
        const fila = filasFactura.get(fid);
        if (fila) await store.facturacion.actualizar(fid, patch);
        else await store.facturacion.insertar({
          id: f.id, documento: 'factura', tipo: f.tipo, eip: e.eip, nombre: e.nombre, mes: f.mes,
          concepto: f.concepto, cliente: f.cliente, importe: f.bruto, base: f.base, iva: f.iva,
          transaccionId: f.transaccionId, fecha: f.fecha, estado: 'abonada', ...patch,
        });
        filasFactura.set(fid, { id: fid, ...patch });
        f.ivaPagado = true;
        f.fechaPagoIva = patch.fechaPagoIva;
        f.transaccionPagoIva = patch.transaccionPagoIva;
        conciliados += 1;
      }
      e.ivaAIngresar = round2(e.facturas.reduce((s, f) => s + (f.ivaPagado ? 0 : f.iva), 0));
      e.totalIvaPagado = round2(e.facturas.reduce((s, f) => s + (f.ivaPagado ? f.iva : 0), 0));
      const row = recibos.get(e.recibo.id);
      if (!row) continue;
      // Conciliación diaria: si el recibo estaba «pendiente de cargo» o
      // «impagado» pero el Banco ya refleja un pago que lo cubre, se
      // reconcilia a «pagada» automáticamente (sin mover dinero).
      const cubierto = (e.recibo.totalPagado || 0) >= e.recibo.importe - 0.01;
      if ((row.estado === 'pendiente_cargo' || row.estado === 'impagada') && cubierto) {
        await store.facturacion.actualizar(row.id, { estado: 'pagada', aviso: null, cobro: null });
        row.estado = 'pagada';
        conciliados += 1;
      }
      e.persistido = true;
      if (ESTADOS_TERMINALES_RECIBO.includes(row.estado)) e.recibo.estado = row.estado;
      if (row.cobro) e.recibo.cobro = row.cobro;
      if (row.aviso) e.recibo.aviso = row.aviso;
      if (Array.isArray(row.pagos) && row.pagos.length) {
        e.recibo.pagos = row.pagos;
        e.recibo.totalPagado = row.pagos.reduce((s, p) => s + Number(p.importe || 0), 0);
      }
    }
    // Totales de IVA a ingresar tras reflejar lo ya pagado por factura.
    ciclo.resumen.totalIvaAIngresar = round2(ciclo.empresas.reduce((s, e) => s + e.ivaAIngresar, 0));
    ciclo.resumen.totalIvaPagado = round2(ciclo.empresas.reduce((s, e) => s + e.totalIvaPagado, 0));
    return { state, cnic, ciclo, conciliados };
  }

  // Guarda un documento del ciclo sin rebajar recibos ya cerrados.
  async function guardarDocumento(row) {
    const existe = await store.facturacion.obtener(row.id);
    const cerrado = existe && ['cobrada', 'impagada', 'anulada'].includes(existe.estado);
    if (existe) {
      if (cerrado && !['cobrada', 'impagada', 'anulada'].includes(row.estado)) {
        return { ...existe, actualizado: false }; // no rebajar
      }
      const patch = { ...row };
      delete patch.id;
      await store.facturacion.actualizar(row.id, patch);
      return { ...row, actualizado: true };
    }
    await store.facturacion.insertar(row);
    return { ...row, actualizado: true, creado: true };
  }

  // Aviso del ciclo (recibo emitido / cobrado / impagado) al panel RSP.
  // Los avisos nunca rompen la operación principal (best-effort).
  async function avisoFacturacion({ nivel, titulo, mensaje, dip = '' }) {
    try {
      await store.notificaciones.insertar({
        id: `NTF-${randomUUID().slice(0, 8).toUpperCase()}`,
        nivel,
        titulo,
        mensaje,
        destinatarioDip: dip,
        leida: false,
        acuseRecibido: false,
        creadaEn: AHORA(),
      });
    } catch { /* best-effort */ }
  }

  // Cobra el recibo de Tributos de una EMPRESA. Es la ÚNICA vía de dinero
  // de una declaración hacia Tributos/TGLP: si el recibo ya está abonado lo
  // refleja, si está pendiente domicilia en la cuenta BLP (2FA ya confirmado
  // por el cliente en el panel) y si no hay saldo lo deja impagado. Evita
  // cobrar dos veces el mismo recibo (las personas conservan el estado
  // declarativo, sin cargo automático).
  async function cobrarReciboEmpresa(eip, mes) {
    const { ciclo } = await cicloFacturacionConPersistencia(mes);
    const ent = (ciclo.empresas || []).find((x) => x.eip === eip);
    if (!ent) return { estadoDeclaracion: 'cobrada', aviso: 'Sin recibo del mes para esta empresa (0 Pz).' };
    const r = ent.recibo;
    if (r.importe <= 0 || r.estado === 'sin_cuota') {
      return { estadoDeclaracion: 'cobrada', aviso: 'Sin cuota del mes (0 Pz).' };
    }
    if (r.estado === 'cobrada' || r.estado === 'pagada') {
      return { estadoDeclaracion: 'cobrada', aviso: `Recibo ${r.id} ya abonado (${r.estado}).`, cobro: r.cobro };
    }
    if (r.estado === 'anulada') {
      const err = new Error(`El recibo ${r.id} está anulado. Reviértelo desde Facturación antes de cobrar la declaración.`);
      err.status = 409;
      throw err;
    }
    // emitida / parcial / vencida / pendiente_cargo / impagada → se cobra (o se
    // reintenta si antes quedó impagado y ahora hay saldo) contra la cuenta BLP.
    const base = {
      id: r.id, documento: 'recibo', tipo: r.tipo, eip, nombre: r.nombre, mes: r.mes,
      importe: r.importe, irm: r.irm, igf: r.igf, iva: r.iva, ivaExento: !!r.ivaExento,
      estadoFiscal: r.estadoFiscal, vencimiento: r.vencimiento,
      cuentaDebito: r.cuentaDebito || null, pagos: r.pagos || [],
    };
    const hoy = new Date().toISOString().slice(0, 10);
    if (!mutarBanco) {
      await guardarDocumento({ ...base, estado: 'pendiente_cargo', aviso: { fecha: hoy, motivo: 'sin_acceso_banco' } });
      return { estadoDeclaracion: 'cobrada', aviso: 'Sin acceso de escritura al Banco: recibo en «pendiente de cargo». Completa el cobro desde Facturación.' };
    }
    const restante = round2(Math.max(0, r.importe - (r.totalPagado || 0)));
    const saldo = Number(r.cuentaDebito?.saldo) || 0;
    if (!r.cuentaDebito?.id || saldo < restante - 0.01) {
      await guardarDocumento({ ...base, estado: 'impagada', aviso: { fecha: hoy, motivo: 'saldo_insuficiente', saldo, cuenta: r.cuentaDebito?.id } });
      const err = new Error(`Saldo insuficiente en ${r.cuentaDebito?.id || 'cuenta BLP'} (${saldo} Pz) para domiciliar ${restante} Pz del recibo ${r.id}.`);
      err.status = 409;
      throw err;
    }
    try {
      const banco = await mutarBanco('transferir', {
        from: r.cuentaDebito.id, to: CUENTA_TRIBUTOS, cantidad: restante,
        concepto: `Domiciliación Tributos ${r.mes} · ${r.id}`, ref: r.id, mes: r.mes,
      });
      const txId = (banco && (banco.transactionId || banco.id || banco.txId)) || `TX-${Date.now()}`;
      const cobro = { fecha: hoy, transaccionId: txId, importe: restante, via: 'domiciliacion' };
      await guardarDocumento({ ...base, estado: 'cobrada', cobro, aviso: null });
      await avisoFacturacion({
        nivel: 'completado',
        titulo: 'Declaración cobrada (recibo domiciliado)',
        mensaje: `${r.nombre} (${eip}): cobrado ${restante} Pz de ${r.id} (tx ${txId}).`,
      });
      return { estadoDeclaracion: 'cobrada', aviso: `Cobrado ${restante} Pz (tx ${txId}).`, cobro };
    } catch (err) {
      await guardarDocumento({ ...base, estado: 'impagada', aviso: { fecha: hoy, motivo: 'cargo_fallido', detalle: String(err?.message || err) } });
      await avisoFacturacion({ nivel: 'pendiente', titulo: 'Recibo impagado (cargo fallido)', mensaje: `${r.nombre} (${eip}): ${restante} Pz de ${r.id}.` });
      const e2 = new Error(`Cargo fallido: ${String(err?.message || err)}`);
      e2.status = 409;
      throw e2;
    }
  }

  // Pago de IVA POR FACTURAS (empresa → TGLP). El IVA de cada factura de
  // venta se ingresa cuando la empresa lo decide: selecciona facturas
  // (facturaIds) o las paga TODAS de golpe. Es SIEMPRE una transferencia del
  // Banco (nunca PlaceZum) y deja las facturas «pagadas» en RSP para que no
  // se vuelvan a cobrar. Idempotente: las facturas con IVA ya ingresado se
  // ignoran y nunca se paga dos veces la misma.
  router.post('/rsp/facturacion/api/pagar-iva', async (req, res) => {
    try {
      const b = req.body || {};
      const mes = String(b.mes || mesActual());
      const eip = String(b.eip || '').toUpperCase();
      const facturaIds = Array.isArray(b.facturaIds) ? b.facturaIds.map((x) => String(x)) : undefined;
      if (!eip) return res.status(400).json({ error: 'eip_requerido' });
      const { ciclo } = await cicloFacturacionConPersistencia(mes);
      const emp = (ciclo.empresas || []).find((x) => x.eip === eip);
      if (!emp) return res.status(404).json({ error: 'empresa_no_en_ciclo', eip, mes });
      const sel = seleccionarPagoIva(emp, facturaIds);
      if (!sel.totalIva || sel.pendientes.length === 0) {
        return res.json({ ok: true, mes, eip, pagadas: 0, importe: 0, nadaQuePagar: true });
      }
      if (!mutarBanco) {
        return res.status(502).json({ error: 'Sin acceso de escritura al Banco (CRM): no se puede pagar el IVA.' });
      }
      const cuenta = emp.recibo.cuentaDebito?.id || (emp.cuentas && emp.cuentas[0]);
      const saldo = Number(emp.recibo.cuentaDebito?.saldo ?? emp.saldoTotal ?? 0);
      if (!cuenta || saldo < sel.totalIva - 0.01) {
        return res.status(409).json({
          error: `Saldo insuficiente en ${cuenta || 'cuenta BLP'} (${saldo} Pz) para ingresar IVA ${sel.totalIva} Pz`,
          saldo, importe: sel.totalIva,
        });
      }
      const hoy = new Date().toISOString().slice(0, 10);
      const banco = await mutarBanco('transferir', {
        from: cuenta, to: CUENTA_TRIBUTOS, cantidad: sel.totalIva, iva: 0,
        concepto: `Pago IVA facturas ${mes} · ${emp.nombre} · ${sel.pendientes.length} facturas`,
        refs: sel.pendientes.map((f) => f.id), mes, eip,
      });
      const txId = (banco && (banco.transactionId || banco.id || banco.txId)) || `TX-${Date.now()}`;
      for (const f of sel.pendientes) {
        const fila = await store.facturacion.obtener(f.id);
        const patch = { ivaPagado: true, fechaPagoIva: hoy, transaccionPagoIva: txId };
        if (fila) await store.facturacion.actualizar(f.id, patch);
        else await store.facturacion.insertar({
          id: f.id, documento: 'factura', tipo: f.tipo, eip, nombre: f.nombre, mes: f.mes,
          concepto: f.concepto, cliente: f.cliente, importe: f.bruto, base: f.base, iva: f.iva,
          transaccionId: f.transaccionId, fecha: f.fecha, estado: 'abonada', ...patch,
        });
      }
      await avisoFacturacion({
        nivel: 'completado',
        titulo: 'IVA ingresado a Tributos (pago de facturas)',
        mensaje: `${emp.nombre} (${eip}): ${sel.totalIva} Pz de IVA por ${sel.pendientes.length} facturas (tx ${txId}).`,
      });
      res.json({ ok: true, mes, eip, pagadas: sel.pendientes.length, importe: sel.totalIva, transaccionId: txId, facturas: sel.pendientes.map((f) => f.id) });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  router.get('/rsp/facturacion/api/ciclo', async (req, res) => {
    try {
      const mes = String(req.query.mes || mesActual());
      const { ciclo, conciliados } = await cicloFacturacionConPersistencia(mes);
      res.json(conciliados > 0 ? { ...ciclo, conciliados } : ciclo);
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  router.post('/rsp/facturacion/api/conciliar', async (req, res) => {
    try {
      const mes = String((req.body || {}).mes || mesActual());
      const { conciliados } = await cicloFacturacionConPersistencia(mes);
      res.json({ ok: true, mes, conciliados });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  router.post('/rsp/facturacion/api/emitir', async (req, res) => {
    try {
      const mes = String((req.body || {}).mes || mesActual());
      const { ciclo } = await cicloFacturacionConPersistencia(mes);
      const persistidos = [];
      for (const e of ciclo.empresas) {
        const r = e.recibo;
        const guardado = await guardarDocumento({
          id: r.id, documento: 'recibo', tipo: r.tipo, eip: e.eip, nombre: e.nombre, mes: r.mes,
          importe: r.importe, irm: r.irm, igf: r.igf, iva: r.iva,
          ivaExento: !!r.ivaExento, estadoFiscal: r.estadoFiscal,
          vencimiento: r.vencimiento, estado: r.estado,
          cuentaDebito: r.cuentaDebito || null, pagos: r.pagos || [],
        });
        persistidos.push(guardado);
        if (guardado.creado && r.importe > 0 && ['emitida', 'vencida', 'parcial'].includes(r.estado)) {
          await avisoFacturacion({
            nivel: 'accion',
            titulo: 'Recibo de Tributos emitido',
            mensaje: `${e.nombre} (${e.eip}): recibo ${r.id} por ${r.importe} Pz, vence el ${r.vencimiento}.`, ref: r.id,
          });
        }
        for (const f of e.facturas || []) {
          persistidos.push(await guardarDocumento({
            id: f.id, documento: 'factura', tipo: f.tipo, eip: e.eip, nombre: e.nombre, mes: f.mes,
            concepto: f.concepto, cliente: f.cliente, importe: f.bruto, base: f.base, iva: f.iva,
            transaccionId: f.transaccionId, fecha: f.fecha, estado: f.estado,
            ivaPagado: !!f.ivaPagado, fechaPagoIva: f.fechaPagoIva || null, transaccionPagoIva: f.transaccionPagoIva || null,
          }));
        }
      }
      res.json({ ok: true, mes, persistidos: persistidos.length });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  router.post('/rsp/facturacion/api/cierre', async (req, res) => {
    try {
      const b = req.body || {};
      const mes = String(b.mes || mesActual());
      const ejecutar = b.ejecutar === true;
      const { ciclo } = await cicloFacturacionConPersistencia(mes);
      const plan = planCierreMes(ciclo, { hoy: b.hoy });
      const resultados = [];
      for (const c of plan.cobros) {
        const fila = { ...c, documento: 'recibo', mes };
        if (ejecutar && mutarBanco) {
          try {
            const banco = await mutarBanco('transferir', {
              from: c.from, to: c.to, cantidad: c.cantidad, concepto: c.concepto,
              ref: c.reciboId, mes,
            });
            const txId = (banco && (banco.transactionId || banco.id || banco.txId)) || `TX-${Date.now()}`;
            const cobro = { fecha: c.fecha, transaccionId: txId, importe: c.cantidad, via: 'domiciliacion' };
            await guardarDocumento({ ...fila, estado: 'cobrada', cobro, pagos: [], aviso: null });
            await avisoFacturacion({
              nivel: 'completado',
              titulo: 'Recibo cobrado por domiciliación',
              mensaje: `${c.nombre} (${c.eip}): cobrado ${c.cantidad} Pz de ${c.reciboId} (tx ${txId}).`, ref: c.reciboId,
            });
            resultados.push({ ...c, ejecutado: true, transaccionId: txId });
          } catch (err) {
            await guardarDocumento({ ...fila, estado: 'impagada', aviso: { fecha: c.fecha, motivo: 'cargo_fallido', detalle: String(err?.message || err) } });
            await avisoFacturacion({
              nivel: 'pendiente',
              titulo: 'Recibo impagado (cargo fallido)',
              mensaje: `${c.nombre} (${c.eip}): no se pudo domiciliar ${c.cantidad} Pz de ${c.reciboId}.`, ref: c.reciboId,
            });
            resultados.push({ ...c, ejecutado: false, error: String(err?.message || err) });
          }
        } else {
          await guardarDocumento({ ...fila, estado: 'pendiente_cargo', aviso: { fecha: c.fecha, motivo: ejecutar ? 'sin_acceso_banco' : 'simulacion' } });
          resultados.push({ ...c, ejecutado: false, simulado: !ejecutar });
        }
      }
      for (const im of plan.impagados) {
        const fila = await store.facturacion.obtener(im.reciboId);
        const aviso = { fecha: plan.fecha, motivo: im.motivo, saldo: im.saldo, cuenta: im.cuenta };
        if (fila) await store.facturacion.actualizar(im.reciboId, { estado: 'impagada', aviso });
        else await store.facturacion.insertar({ id: im.reciboId, documento: 'recibo', mes, eip: im.eip, nombre: im.nombre, importe: im.importe, estado: 'impagada', aviso });
        await avisoFacturacion({
          nivel: 'pendiente',
          titulo: 'Recibo impagado (saldo insuficiente)',
          mensaje: `${im.nombre} (${im.eip}): ${im.importe} Pz pendientes de ${im.reciboId}; saldo ${im.saldo} Pz en ${im.cuenta}.`, ref: im.reciboId,
        });
      }
      res.json({ ok: true, mes, ejecutar, accesoBanco: !!mutarBanco, plan, resultados });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  router.post('/rsp/facturacion/api/:id/estado', async (req, res) => {
    try {
      const id = req.params.id;
      const estado = String((req.body || {}).estado || '');
      if (!['anulada', 'pagada', 'cobrada', 'impagada'].includes(estado)) {
        return res.status(400).json({ error: `Estado no permitido: ${estado}` });
      }
      const existe = await store.facturacion.obtener(id);
      const patch = { estado };
      if (estado === 'anulada') patch.aviso = { fecha: new Date().toISOString().slice(0, 10), motivo: 'anulada_manual' };
      if (existe) await store.facturacion.actualizar(id, patch);
      else await store.facturacion.insertar({ id, documento: 'recibo', estado, mes: mesActual() });
      res.json({ ok: true, id, estado });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  /* ── Votaciones / Juntas / Encuestas ────────────────────────────── */
  router.get('/rsp/votaciones/api', async (_req, res) => res.json(await store.votaciones.listar()));
  router.get('/rsp/votaciones/api/:id', async (req, res) => {
    const v = await store.votaciones.obtener(req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    const votos = (await store.votos.listar({ filtros: { votacionId: v.id } }));
    res.json({ ...v, votos });
  });
  router.post('/rsp/votaciones/api', async (req, res) => {
    const d = req.body || {};
    const n = (await store.votaciones.listar()).length;
    const v = { id: `VOT-2026-${String(n + 1).padStart(4, '0')}`, titulo: d.titulo, categoria: d.categoria, descripcion: d.descripcion || '', reunionId: d.reunionId, rango: d.rango || 'ciudadania_plena', opciones: d.opciones || ['A favor', 'En contra', 'Abstención'], estado: 'abierta', resultado: null, aFavor: 0, enContra: 0, abstenciones: 0, totalVotos: 0, creadaEn: AHORA() };
    await store.votaciones.insertar(v);
    res.status(201).json(v);
  });
  // POST /rsp/votaciones/api/:id — editar (solo abiertas o en borrador)
  router.post('/rsp/votaciones/api/:id', async (req, res) => {
    const v = await store.votaciones.obtener(req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    if (v.estado === 'cerrada' || v.estado === 'publicada') return res.status(400).json({ error: 'Solo se pueden editar votaciones abiertas o en borrador' });
    const d = req.body || {};
    const patch = {};
    if (d.titulo) patch.titulo = String(d.titulo).trim();
    if (d.descripcion !== undefined) patch.descripcion = String(d.descripcion);
    if (d.categoria) patch.categoria = d.categoria;
    if (d.rango) patch.rango = d.rango;
    if (Array.isArray(d.opciones)) {
      const ops = d.opciones.map((o) => String(o).trim()).filter(Boolean);
      if (ops.length < 2) return res.status(400).json({ error: 'Se necesitan al menos 2 opciones' });
      patch.opciones = ops;
    }
    await store.votaciones.actualizar(req.params.id, patch);
    res.json({ ok: true, id: req.params.id });
  });
  router.post('/rsp/votaciones/api/:id/cerrar', async (req, res) => {
    const v = await store.votaciones.obtener(req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    const resultado = v.aFavor > v.enContra ? 'aprobada' : 'rechazada';
    await store.votaciones.actualizar(req.params.id, { estado: 'cerrada', cerradaEn: AHORA(), resultado });
    // Cierra también en PlacetaID Móvil (notifica el resultado a los destinatarios).
    const placetaid = await cerrarVotacionPlacetaID(v.id);
    res.json({ ok: true, placetaid: placetaid.enviado });
  });
  router.post('/rsp/votaciones/api/:id/publicar', async (req, res) => {
    const v = await store.votaciones.obtener(req.params.id);
    if (!v) return res.status(404).json({ error: 'Votación no encontrada' });
    await store.votaciones.actualizar(req.params.id, { estado: 'publicada', publicadaEn: AHORA(), bopUrl: `https://bop.laplaceta.org/votaciones.html?codigo=${v.id}` });
    // La abre también en PlacetaID Móvil (aparece en la app y notifica al grupo).
    const placetaid = await enviarVotacionPlacetaID(v);
    res.json({ ok: true, placetaid: placetaid.enviado });
  });
  router.get('/rsp/votaciones/api/:id/votos', async (req, res) => {
    const ahora = Date.now();
    const votos = await store.votos.listar({ filtros: { votacionId: req.params.id } });
    res.json(votos.map((r) => {
      const anon = !r.esJunta && (ahora - new Date(r.timestamp).getTime()) > 30 * 24 * 3600 * 1000;
      return { ...r, anonimo: anon, dip: anon ? '••••••' : r.dip };
    }));
  });
  router.get('/rsp/juntas/api', async (_req, res) => res.json(await store.juntas.listar()));
  router.get('/rsp/juntas/api/:id', async (req, res) => {
    const j = await store.juntas.obtener(req.params.id);
    if (!j) return res.status(404).json({ error: 'Junta no encontrada' });
    const votaciones = await store.votaciones.listar();
    res.json({ ...j, votaciones: (j.votaciones || []).map((vid) => votaciones.find((v) => v.id === vid)).filter(Boolean) });
  });
  router.post('/rsp/juntas/api', async (req, res) => {
    const d = req.body || {};
    const n = (await store.juntas.listar()).length;
    const j = { id: `JUN-2026-${String(n + 1).padStart(4, '0')}`, titulo: d.titulo, fecha: d.fecha || new Date().toISOString().slice(0, 10), asistentes: d.asistentes || [], ordenDelDia: d.ordenDelDia || [], votaciones: d.votaciones || [], acta: '', estado: 'convocada' };
    await store.juntas.insertar(j);
    res.status(201).json(j);
  });
  router.post('/rsp/juntas/api/:id/acta', async (req, res) => {
    const j = await store.juntas.obtener(req.params.id);
    if (!j) return res.status(404).json({ error: 'Junta no encontrada' });
    await store.juntas.actualizar(req.params.id, { acta: req.body?.acta || '', estado: 'acta_emitida', actaUrl: `https://bop.laplaceta.org/juntas.html?codigo=${j.id}` });
    res.json({ ok: true });
  });

  /* ── Propuestas normativas (Departamento → RSP → Junta → BOLP) ────── */
  // Una propuesta es el borrador institucional de una norma/enmienda. Flujo:
  //   borrador → en_revision → pendiente_junta → en_votacion → (aprobada
  //   → publicada en BOP) | rechazada. Al aprobarse, el BFF crea la versión
  //   en bop_documentos/bop_versiones (norma consultable en bop.laplaceta.org).
  const SIGUIENTE_ESTADO_PROPUESTA = { borrador: 'en_revision', en_revision: 'pendiente_junta' };

  function normalizarPropuesta(p) {
    return {
      id: p.id, titulo: p.titulo, tipo: p.tipo || 'norma',
      departamento: p.departamento || '', descripcion: p.descripcion || '',
      contenidoMd: p.contenidoMd || '',
      cnicRefs: Array.isArray(p.cnicRefs) ? p.cnicRefs : [],
      codigoDocumento: p.codigoDocumento || null,
      estado: p.estado || 'borrador', version: Number(p.version || 1),
      votacionId: p.votacionId || null, codigoBop: p.codigoBop || null,
      bopUrl: p.bopUrl || null, autorDip: p.autorDip || 'RSP',
      notasCambio: p.notasCambio || '',
      fechaPropuesta: p.fechaPropuesta || null,
      fechaAprobacionJunta: p.fechaAprobacionJunta || null,
      historial: Array.isArray(p.historial) ? p.historial : [],
      creadoEn: p.creadoEn || AHORA(), actualizadoEn: p.actualizadoEn || AHORA(),
    };
  }

  // Publica (o versiona) la propuesta aprobada en bop_documentos + bop_versiones.
  async function publicarPropuestaEnBop(prop) {
    const codigo = String(prop.codigoDocumento || prop.codigoBop || '').trim().toUpperCase();
    if (!codigo) throw new Error('codigo_documento_requerido: indica la norma que se crea o enmienda');
    const existentes = (await store.bopDocumentos.listar()) || [];
    const anterior = existentes.find((x) => x.codigo === codigo);
    const doc = {
      ...(anterior || {}),
      id: anterior?.id || `BOP-${Date.now()}`,
      codigo, titulo: prop.titulo, tipo: prop.tipo || anterior?.tipo || 'cni',
      categoria: anterior?.categoria || 'capitulo', estado: 'vigente',
      contenidoMd: prop.contenidoMd || '',
      version: Number(anterior?.version || 0) + 1,
      aprobadaEnJunta: true, autorDip: prop.autorDip,
      notasCambio: prop.notasCambio || '',
      cnicRefs: Array.isArray(prop.cnicRefs) ? prop.cnicRefs : [],
      fechaAprobacionJunta: prop.fechaAprobacionJunta || AHORA(),
      fechaPublicacion: AHORA().slice(0, 10), updatedAt: AHORA(),
    };
    if (anterior) {
      await store.bopVersiones.insertar({
        documentoId: anterior.id, version: anterior.version, estado: anterior.estado,
        contenidoMd: anterior.contenidoMd, autorDip: anterior.autorDip, notasCambio: anterior.notasCambio,
      });
      await store.bopDocumentos.actualizar(anterior.id, doc);
    } else {
      await store.bopDocumentos.insertar(doc);
    }
    return doc;
  }

  router.get('/rsp/propuestas/api', async (_req, res) => {
    res.json(((await store.propuestas.listar()) || []).map(normalizarPropuesta));
  });
  router.get('/rsp/propuestas/api/:id', async (req, res) => {
    const p = await store.propuestas.obtener(req.params.id);
    if (!p) return res.status(404).json({ error: 'Propuesta no encontrada' });
    res.json(normalizarPropuesta(p));
  });
  router.post('/rsp/propuestas/api', async (req, res) => {
    const d = req.body || {};
    const titulo = String(d.titulo || '').trim();
    if (!titulo) return res.status(400).json({ error: 'Título requerido' });
    const n = (await store.propuestas.listar()).length;
    const p = {
      id: `PRP-2026-${String(n + 1).padStart(4, '0')}`,
      titulo, tipo: String(d.tipo || 'norma'), departamento: String(d.departamento || ''),
      descripcion: String(d.descripcion || ''), contenidoMd: String(d.contenidoMd || ''),
      cnicRefs: (Array.isArray(d.cnicRefs) ? d.cnicRefs : []).filter((r) => r && r.codigo).map((r) => ({ codigo: String(r.codigo).trim().toUpperCase(), etiqueta: String(r.etiqueta || r.codigo).trim() })),
      codigoDocumento: String(d.codigoDocumento || '').trim().toUpperCase() || null,
      estado: 'borrador', version: 1, votacionId: null, codigoBop: null, bopUrl: null,
      autorDip: req.user?.dip || 'RSP', notasCambio: String(d.notasCambio || ''),
      fechaPropuesta: AHORA().slice(0, 10), fechaAprobacionJunta: null,
      historial: [], creadoEn: AHORA(), actualizadoEn: AHORA(),
    };
    await store.propuestas.insertar(p);
    res.status(201).json(normalizarPropuesta(p));
  });
  // Edición: solo en borrador o en revisión. Si cambia el contenido se crea
  // una versión nueva (el historial nunca se pierde).
  router.post('/rsp/propuestas/api/:id', async (req, res) => {
    const p = await store.propuestas.obtener(req.params.id);
    if (!p) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (!['borrador', 'en_revision'].includes(p.estado)) return res.status(400).json({ error: 'Solo se editan propuestas en borrador o en revisión' });
    const d = req.body || {};
    const contenidoNuevo = d.contenidoMd !== undefined ? String(d.contenidoMd) : (p.contenidoMd || '');
    const historial = Array.isArray(p.historial) ? p.historial.slice() : [];
    let version = Number(p.version || 1);
    if (contenidoNuevo !== (p.contenidoMd || '')) {
      historial.push({ version, contenidoMd: p.contenidoMd || '', notas: String(p.notasCambio || ''), desde: p.actualizadoEn || AHORA(), autorDip: p.autorDip });
      version += 1;
    }
    const patch = {
      ...(d.titulo !== undefined ? { titulo: String(d.titulo).trim() || p.titulo } : {}),
      ...(d.tipo !== undefined ? { tipo: String(d.tipo) } : {}),
      ...(d.departamento !== undefined ? { departamento: String(d.departamento) } : {}),
      ...(d.descripcion !== undefined ? { descripcion: String(d.descripcion) } : {}),
      ...(d.codigoDocumento !== undefined ? { codigoDocumento: String(d.codigoDocumento || '').trim().toUpperCase() || null } : {}),
      contenidoMd: contenidoNuevo, version, historial,
      ...(d.notasCambio !== undefined ? { notasCambio: String(d.notasCambio) } : {}),
      actualizadoEn: AHORA(),
    };
    await store.propuestas.actualizar(req.params.id, patch);
    res.json(normalizarPropuesta({ ...p, ...patch }));
  });
  router.post('/rsp/propuestas/api/:id/avanzar', async (req, res) => {
    const p = await store.propuestas.obtener(req.params.id);
    if (!p) return res.status(404).json({ error: 'Propuesta no encontrada' });
    const destino = SIGUIENTE_ESTADO_PROPUESTA[p.estado];
    if (!destino) return res.status(400).json({ error: `No se puede avanzar desde «${p.estado}»` });
    await store.propuestas.actualizar(req.params.id, { estado: destino, actualizadoEn: AHORA() });
    res.json(normalizarPropuesta({ ...p, estado: destino, actualizadoEn: AHORA() }));
  });
  // Lleva la propuesta a votación: crea la votación y la vincula.
  router.post('/rsp/propuestas/api/:id/votacion', async (req, res) => {
    const p = await store.propuestas.obtener(req.params.id);
    if (!p) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (p.estado !== 'pendiente_junta' && p.estado !== 'en_revision') {
      return res.status(400).json({ error: 'Solo se votan propuestas en pendiente de junta o en revisión' });
    }
    const d = req.body || {};
    const n = (await store.votaciones.listar()).length;
    const v = {
      id: `VOT-2026-${String(n + 1).padStart(4, '0')}`, titulo: `Aprobar propuesta: ${p.titulo}`,
      categoria: 'junta', descripcion: p.descripcion || '', reunionId: d.reunionId || null,
      rango: d.rango || 'junta', opciones: ['A favor', 'En contra', 'Abstención'],
      estado: 'abierta', resultado: null, aFavor: 0, enContra: 0, abstenciones: 0,
      totalVotos: 0, propuestaId: p.id, creadaEn: AHORA(),
    };
    await store.votaciones.insertar(v);
    await store.propuestas.actualizar(p.id, { estado: 'en_votacion', votacionId: v.id, actualizadoEn: AHORA() });
    res.status(201).json(normalizarPropuesta({ ...p, estado: 'en_votacion', votacionId: v.id, actualizadoEn: AHORA() }));
  });
  // Resuelve la propuesta según el resultado de su votación. Si se aprueba,
  // publica la norma en el BOLP (nueva versión de bop_documentos).
  router.post('/rsp/propuestas/api/:id/resolver', async (req, res) => {
    const p = await store.propuestas.obtener(req.params.id);
    if (!p) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (p.estado !== 'en_votacion' || !p.votacionId) {
      return res.status(400).json({ error: 'La propuesta no tiene una votación activa' });
    }
    const v = await store.votaciones.obtener(p.votacionId);
    if (!v || v.estado === 'abierta') {
      return res.status(400).json({ error: 'La votación aún está abierta o no se encontró' });
    }
    const resultado = v.resultado || (v.aFavor > v.enContra ? 'aprobada' : 'rechazada');
    if (resultado !== 'aprobada') {
      await store.propuestas.actualizar(p.id, { estado: 'rechazada', actualizadoEn: AHORA() });
      return res.json({ ok: true, estado: 'rechazada' });
    }
    const aprobada = normalizarPropuesta({ ...p, estado: 'aprobada', fechaAprobacionJunta: AHORA().slice(0, 10) });
    let doc;
    try {
      doc = await publicarPropuestaEnBop(aprobada);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    await store.propuestas.actualizar(p.id, {
      estado: 'publicada', fechaAprobacionJunta: aprobada.fechaAprobacionJunta,
      codigoBop: doc.codigo, bopUrl: `https://bop.laplaceta.org/documento?codigo=${encodeURIComponent(doc.codigo)}`,
      actualizadoEn: AHORA(),
    });
    res.json({
      ok: true, estado: 'publicada',
      documento: { codigo: doc.codigo, version: doc.version, bopUrl: `https://bop.laplaceta.org/documento?codigo=${encodeURIComponent(doc.codigo)}` },
    });
  });

  router.get('/rsp/encuestas/api', async (_req, res) => res.json(await store.encuestas.listar()));
  router.post('/rsp/encuestas/api', async (req, res) => {
    const d = req.body || {};
    const n = (await store.encuestas.listar()).length;
    const e = { id: `ENC-2026-${String(n + 1).padStart(4, '0')}`, titulo: d.titulo, pregunta: d.pregunta, opciones: d.opciones || [], rango: d.rango || 'todos', estado: 'abierta', respuestas: Object.fromEntries((d.opciones || []).map((o) => [o, 0])), totalRespuestas: 0, creadaEn: AHORA() };
    await store.encuestas.insertar(e);
    res.status(201).json(e);
  });
  router.post('/rsp/encuestas/api/:id/publicar', async (req, res) => {
    const e = await store.encuestas.obtener(req.params.id);
    if (!e) return res.status(404).json({ error: 'Encuesta no encontrada' });
    await store.encuestas.actualizar(req.params.id, { estado: 'publicada', publicadaEn: AHORA(), bopUrl: `https://bop.laplaceta.org/encuestas.html?codigo=${e.id}` });
    // Se envía a PlacetaID Móvil con el mismo sistema que las votaciones
    // (la app la muestra como consulta a los destinatarios del rango).
    const placetaid = await enviarVotacionPlacetaID({ id: e.id, titulo: e.titulo, pregunta: e.pregunta, descripcion: e.pregunta, categoria: 'encuesta' });
    res.json({ ok: true, placetaid: placetaid.enviado });
  });

  return router;
}
