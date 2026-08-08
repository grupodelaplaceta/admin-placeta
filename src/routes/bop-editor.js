/**
 * BOP Editor API — /api/bop/*
 *
 * Permite al Boletín Oficial de La Placeta (bop.laplaceta.org) EDITAR y AÑADIR
 * contenido en Supabase (bop_documentos, bop_versiones, bop_cnic).
 *
 * Escritura: requiere la clave de administrador (admin-master-key-2026) o una
 * sesión RSP válida. La lectura de documentos/CNIC es pública (igual que RLS).
 *
 * Versionado: cada edición guarda la versión anterior en bop_versiones y
 * aumenta la versión del documento en bop_documentos.
 */

import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

const ADMIN_MASTER_KEY = process.env.ADMIN_MASTER_KEY || 'admin-master-key-2026';

/** Autorización: clave de administrador o sesión RSP */
function verificarBopAdmin(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key && key === ADMIN_MASTER_KEY) {
    req.bopAuth = { metodo: 'key', usuario: { nombre: 'Administración BOP', dip: null } };
    return next();
  }
  if (req.session?.usuario) {
    req.bopAuth = {
      metodo: 'sesion',
      usuario: {
        nombre: req.session.usuario.nombre || req.session.usuario.dip,
        dip: req.session.usuario.dip || null
      }
    };
    return next();
  }
  return res.status(401).json({ error: 'No autorizado. Usa la clave de administrador del BOP o inicia sesión en RSP.' });
}

/** Datos del usuario autenticado (para que el editor sepa si puede guardar) */
router.get('/estado', (req, res) => {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key && key === ADMIN_MASTER_KEY) {
    return res.json({ autorizado: true, metodo: 'key', usuario: null });
  }
  if (req.session?.usuario) {
    return res.json({
      autorizado: true,
      metodo: 'sesion',
      usuario: { nombre: req.session.usuario.nombre || req.session.usuario.dip, dip: req.session.usuario.dip || null }
    });
  }
  return res.json({ autorizado: false });
});

// ═══ DOCUMENTOS (bop_documentos + bop_versiones) ══════════════════════════

/** Listar todos los documentos (lectura pública) */
router.get('/documentos', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });
  try {
    const { data, error } = await supabase
      .from('bop_documentos')
      .select('*')
      .order('codigo', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Error al listar documentos: ' + (e.message || e) });
  }
});

/** Obtener un documento por código (lectura pública) */
router.get('/documentos/:codigo', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });
  try {
    const { data, error } = await supabase
      .from('bop_documentos')
      .select('*')
      .eq('codigo', String(req.params.codigo).toUpperCase())
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Documento no encontrado' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Error al leer documento: ' + (e.message || e) });
  }
});

/** Historial de versiones de un documento (lectura pública) */
router.get('/documentos/:codigo/versiones', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });
  try {
    const { data: doc } = await supabase
      .from('bop_documentos')
      .select('id')
      .eq('codigo', String(req.params.codigo).toUpperCase())
      .maybeSingle();
    if (!doc) return res.json([]);
    const { data, error } = await supabase
      .from('bop_versiones')
      .select('*')
      .eq('documento_id', doc.id)
      .order('version', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Error al leer versiones: ' + (e.message || e) });
  }
});

/** Crear documento nuevo (versión 1) o actualizar (versionado) */
router.post('/documentos', verificarBopAdmin, guardarDocumento);

/** Actualizar documento por código (misma lógica de versionado) */
router.put('/documentos/:codigo', verificarBopAdmin, (req, res) => {
  if (!req.body.codigo) req.body.codigo = req.params.codigo;
  return guardarDocumento(req, res);
});

async function guardarDocumento(req, res) {
  if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });
  const b = req.body || {};
  const codigo = String(b.codigo || '').trim().toUpperCase();
  const titulo = String(b.titulo || '').trim();
  if (!codigo || !titulo) {
    return res.status(400).json({ error: 'Código y título son obligatorios.' });
  }

  const autor = req.bopAuth?.usuario || {};
  const contenidoMd = b.contenido_md ?? b.contenido ?? '';

  // CNIC vinculados (referencias cruzadas del documento)
  const cnicRefs = Array.isArray(b.cnic_refs)
    ? b.cnic_refs
        .map(r => (typeof r === 'string' ? { codigo: r } : r))
        .map(r => ({
          codigo: String(r.codigo || '').trim().toUpperCase(),
          etiqueta: r.etiqueta || String(r.codigo || '').trim().toUpperCase()
        }))
        .filter(r => r.codigo)
    : [];
  const fechas = {
    fecha_aplicacion: b.fecha_aplicacion || null,
    fecha_propuesta: b.fecha_propuesta || null,
    fecha_aprobacion_junta: b.fecha_aprobacion_junta || null,
    aprobada_en_junta: !!b.aprobada_en_junta
  };

  try {
    // ¿Ya existe?
    const { data: existente } = await supabase
      .from('bop_documentos')
      .select('*')
      .eq('codigo', codigo)
      .maybeSingle();

    if (!existente) {
      // ── NUEVO DOCUMENTO (versión 1) ──────────────────────────────
      const { data: nuevo, error: errNew } = await supabase
        .from('bop_documentos')
        .insert({
          codigo,
          titulo,
          tipo: b.tipo || 'cni',
          categoria: b.categoria || 'capitulo',
          estado: b.estado || 'proyecto',
          contenido_md: contenidoMd,
          cnic_refs: cnicRefs,
          version: 1,
          ...fechas,
          autor_dip: b.autor_dip || autor.dip || null,
          autor_nombre: b.autor_nombre || autor.nombre || null,
          notas_cambio: b.notas_cambio || b.notas || null,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (errNew) throw errNew;

      // Registro inicial en el historial
      await supabase.from('bop_versiones').insert({
        documento_id: nuevo.id,
        version: 1,
        estado: nuevo.estado,
        contenido_md: contenidoMd,
        autor_dip: nuevo.autor_dip,
        autor_nombre: nuevo.autor_nombre,
        notas_cambio: nuevo.notas_cambio,
        fecha_propuesta: nuevo.fecha_propuesta,
        fecha_aprobacion_junta: nuevo.fecha_aprobacion_junta,
        aprobada_en_junta: nuevo.aprobada_en_junta
      });

      return res.status(201).json({ ...nuevo, creado: true });
    }

    // ── DOCUMENTO EXISTENTE → guardar versión anterior + aumentar ──
    const versionNueva = Math.max((existente.version || 1) + 1, Number(b.version) || 1);
    const notasCambio = b.notas_cambio || b.notas || null;

    // 1. Mover la versión actual al historial (upsert: si la versión ya está
    //    registrada —p.ej. al crear el documento ya se insertó la v1— no duplica)
    const { error: errVer } = await supabase.from('bop_versiones').upsert({
      documento_id: existente.id,
      version: existente.version || 1,
      estado: existente.estado,
      contenido_md: existente.contenido_md || '',
      autor_dip: existente.autor_dip,
      autor_nombre: existente.autor_nombre,
      notas_cambio: existente.notas_cambio,
      fecha_propuesta: existente.fecha_propuesta,
      fecha_aprobacion_junta: existente.fecha_aprobacion_junta,
      aprobada_en_junta: existente.aprobada_en_junta
    }, { onConflict: 'documento_id,version' });
    if (errVer) throw errVer;

    // 2. Actualizar el documento
    const { data: actualizado, error: errUpd } = await supabase
      .from('bop_documentos')
      .update({
        titulo,
        tipo: b.tipo || existente.tipo,
        categoria: b.categoria || existente.categoria,
        estado: b.estado || existente.estado,
        contenido_md: contenidoMd,
        cnic_refs: cnicRefs,
        version: versionNueva,
        ...fechas,
        autor_dip: b.autor_dip || autor.dip || existente.autor_dip,
        autor_nombre: b.autor_nombre || autor.nombre || existente.autor_nombre,
        notas_cambio: notasCambio,
        updated_at: new Date().toISOString()
      })
      .eq('codigo', codigo)
      .select()
      .single();
    if (errUpd) throw errUpd;

    return res.json({ ...actualizado, creado: false });
  } catch (e) {
    res.status(500).json({ error: 'Error al guardar documento: ' + (e.message || e) });
  }
}

// ═══ CNIC (valores complementarios variables) ═════════════════════════════

/** Listar CNIC (lectura pública) */
router.get('/cnic', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });
  try {
    const { data, error } = await supabase
      .from('bop_cnic')
      .select('*')
      .order('codigo', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Error al listar CNIC: ' + (e.message || e) });
  }
});

/** Crear o actualizar un CNIC (con historial de valores) */
router.post('/cnic', verificarBopAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });
  const b = req.body || {};
  const codigo = String(b.codigo || '').trim().toUpperCase();
  if (!codigo) {
    return res.status(400).json({ error: 'El código CNIC es obligatorio.' });
  }
  const autor = req.bopAuth?.usuario || {};

  try {
    const { data: existente } = await supabase
      .from('bop_cnic')
      .select('*')
      .eq('codigo', codigo)
      .maybeSingle();

    if (!existente) {
      const { data: nuevo, error: errNew } = await supabase
        .from('bop_cnic')
        .insert({
          codigo,
          etiqueta: b.etiqueta || codigo,
          descripcion: b.descripcion || null,
          tipo_valor: b.tipo_valor || 'texto',
          valor: String(b.valor ?? '').trim(),
          unidad: b.unidad || (b.tipo_valor === 'placeta' ? 'Pz' : (b.tipo_valor === 'porcentaje' ? '%' : '')),
          vigente: b.vigente !== false,
          articulo: b.articulo || null,
          historial: [{ valor: String(b.valor ?? '').trim(), desde: new Date().toISOString().slice(0, 10), autor_dip: autor.dip, notas: b.notas || 'Valor inicial.' }],
          autor_dip: autor.dip || null,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (errNew) throw errNew;
      return res.status(201).json({ ...nuevo, creado: true });
    }

    // Actualizar: empujar el valor anterior al historial
    const historial = Array.isArray(existente.historial) ? existente.historial : [];
    historial.push({
      valor: existente.valor,
      desde: new Date().toISOString().slice(0, 10),
      autor_dip: autor.dip || existente.autor_dip,
      notas: b.notas || 'Cambio de valor.'
    });

    const { data: actualizado, error: errUpd } = await supabase
      .from('bop_cnic')
      .update({
        etiqueta: b.etiqueta || existente.etiqueta,
        descripcion: b.descripcion !== undefined ? b.descripcion : existente.descripcion,
        tipo_valor: b.tipo_valor || existente.tipo_valor,
        valor: String(b.valor ?? existente.valor).trim(),
        unidad: b.unidad !== undefined ? b.unidad : existente.unidad,
        vigente: b.vigente !== undefined ? !!b.vigente : existente.vigente,
        articulo: b.articulo !== undefined ? b.articulo : existente.articulo,
        historial,
        autor_dip: autor.dip || existente.autor_dip,
        updated_at: new Date().toISOString()
      })
      .eq('codigo', codigo)
      .select()
      .single();
    if (errUpd) throw errUpd;
    return res.json({ ...actualizado, creado: false });
  } catch (e) {
    res.status(500).json({ error: 'Error al guardar CNIC: ' + (e.message || e) });
  }
});

/** Actualizar metadatos de un CNIC (etiqueta, descripción, artículo, unidad,
 *  tipo de valor, vigente). Solo si cambia `valor` se registra historial. */
router.patch('/cnic/:codigo', verificarBopAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });
  const codigo = String(req.params.codigo).toUpperCase();
  const b = req.body || {};
  try {
    const { data: existente } = await supabase
      .from('bop_cnic')
      .select('*')
      .eq('codigo', codigo)
      .maybeSingle();
    if (!existente) return res.status(404).json({ error: 'CNIC no encontrado' });

    const valorNuevo = b.valor !== undefined ? String(b.valor).trim() : existente.valor;
    const cambiaValor = String(existente.valor) !== valorNuevo;

    const update = {
      etiqueta: b.etiqueta !== undefined ? b.etiqueta : existente.etiqueta,
      descripcion: b.descripcion !== undefined ? b.descripcion : existente.descripcion,
      tipo_valor: b.tipo_valor || existente.tipo_valor,
      valor: valorNuevo,
      unidad: b.unidad !== undefined ? b.unidad : existente.unidad,
      vigente: b.vigente !== undefined ? !!b.vigente : existente.vigente,
      articulo: b.articulo !== undefined ? b.articulo : existente.articulo,
      updated_at: new Date().toISOString()
    };

    if (cambiaValor) {
      const historial = Array.isArray(existente.historial) ? existente.historial : [];
      historial.push({
        valor: existente.valor,
        desde: new Date().toISOString().slice(0, 10),
        autor_dip: existente.autor_dip,
        notas: b.notas || 'Cambio de valor.'
      });
      update.historial = historial;
    }

    const { data: actualizado, error: errUpd } = await supabase
      .from('bop_cnic')
      .update(update)
      .eq('codigo', codigo)
      .select()
      .single();
    if (errUpd) throw errUpd;
    res.json(actualizado);
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar CNIC: ' + (e.message || e) });
  }
});

/** Eliminar un documento (solo administrador) */
router.delete('/documentos/:codigo', verificarBopAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });
  const codigo = String(req.params.codigo).toUpperCase();
  try {
    const { data: existente } = await supabase
      .from('bop_documentos')
      .select('id')
      .eq('codigo', codigo)
      .maybeSingle();
    if (!existente) return res.status(404).json({ error: 'Documento no encontrado' });
    const { error } = await supabase.from('bop_documentos').delete().eq('codigo', codigo);
    if (error) throw error;
    // Las versiones se borran en cascada (on delete cascade)
    res.json({ success: true, codigo });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar documento: ' + (e.message || e) });
  }
});

/** Eliminar un CNIC (solo administrador) */
router.delete('/cnic/:codigo', verificarBopAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Base de datos no disponible' });
  const codigo = String(req.params.codigo).toUpperCase();
  try {
    const { data: existente } = await supabase
      .from('bop_cnic')
      .select('id')
      .eq('codigo', codigo)
      .maybeSingle();
    if (!existente) return res.status(404).json({ error: 'CNIC no encontrado' });
    const { error } = await supabase.from('bop_cnic').delete().eq('codigo', codigo);
    if (error) throw error;
    res.json({ success: true, codigo });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar CNIC: ' + (e.message || e) });
  }
});

export default router;
