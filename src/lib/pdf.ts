/* Generación de PDF con logos reales y fuente Plus Jakarta Sans. */
import type { jsPDF } from 'jspdf';
import type {
  DeclaracionDetalle, TramiteDetalle, SubvencionDetalle, ContextoCiudadano,
  DocumentoCiudadano, FirmaCiudadano, Obligacion, EntidadDetalle,
  Junta, Votacion, VotoRegistro, DiplomaJunior, FacturaEmitida, Nomina,
} from '../types';
import { etiquetaCampo } from '../config/campos-tramite';
import { NORMATIVA_APLICADA } from '../config/normativa-declaracion';

const C = {
  primary: [109, 40, 217] as [number, number, number],
  dark: [30, 27, 46] as [number, number, number],
  muted: [91, 87, 112] as [number, number, number],
  line: [229, 225, 240] as [number, number, number],
  soft: [244, 241, 250] as [number, number, number],
  success: [22, 163, 74] as [number, number, number],
  danger: [220, 38, 38] as [number, number, number],
};

let FONT = 'helvetica';
const cacheFuentes: { regular?: string; bold?: string; fredoka?: string } = {};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(',')[1] ?? '');
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

async function obtenerFuentes() {
  if (cacheFuentes.regular && cacheFuentes.bold) return cacheFuentes;
  const [regular, bold, fredoka] = await Promise.all([
    fetch('/fonts/PlusJakartaSans-Regular.ttf').then((r) => r.blob()).then(blobToBase64),
    fetch('/fonts/PlusJakartaSans-Bold.ttf').then((r) => r.blob()).then(blobToBase64),
    // Variable font oficial de Google Fonts; si no está disponible se usa
    // Jakarta como fallback y el diploma sigue siendo descargable.
    fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf').then((r) => r.ok ? r.blob() : Promise.reject(new Error('Fredoka no disponible'))).then(blobToBase64).catch(() => undefined),
  ]);
  cacheFuentes.regular = regular;
  cacheFuentes.bold = bold;
  cacheFuentes.fredoka = fredoka;
  return cacheFuentes;
}

const LOGOS = {
  tributos: '/img/tributos-logo.png',
  administracion: '/img/administracion.png',
  banco: '/img/logo-banco.png',
  rsp: '/img/logo-rsp.svg',
  junior: 'https://junior.laplaceta.org/img/PJ-BLANCO-LOGO.png',
};

/** Logo de la entidad pública que subvenciona; Administración si es otra. */
function logoDeEntidadEmisora(emisorEip: string): string {
  const map: Record<string, string> = {
    AGLDP: LOGOS.administracion,
    ADM: LOGOS.administracion,
    TGLP: LOGOS.banco,
    FUND_BLP: LOGOS.rsp,
  };
  return map[emisorEip] ?? LOGOS.administracion;
}

async function rasterizar(src: string): Promise<{ url: string; w: number; h: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 200;
    canvas.height = img.naturalHeight || img.height || 48;
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}

async function nuevoDoc(orientation: 'portrait' | 'landscape' = 'portrait'): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  try {
    const f = await obtenerFuentes();
    doc.addFileToVFS('PJS-Regular.ttf', f.regular!);
    doc.addFont('PJS-Regular.ttf', 'PlusJakartaSans', 'normal');
    doc.addFileToVFS('PJS-Bold.ttf', f.bold!);
    doc.addFont('PJS-Bold.ttf', 'PlusJakartaSans', 'bold');
    if (f.fredoka) {
      doc.addFileToVFS('Fredoka.ttf', f.fredoka);
      doc.addFont('Fredoka.ttf', 'Fredoka One', 'normal');
    }
    FONT = 'PlusJakartaSans';
  } catch {
    FONT = 'helvetica';
  }
  return doc;
}

async function cabecera(doc: jsPDF, titulo: string, subtitulo: string, logoSrc: string) {
  const logo = await rasterizar(logoSrc);
  if (logo) {
    const h = 16;
    const w = (logo.w / logo.h) * h;
    doc.addImage(logo.url, 'PNG', 14, 12, Math.min(w, 90), h);
  } else {
    doc.setFillColor(...C.primary);
    doc.roundedRect(14, 12, 16, 16, 3, 3, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('RSP', 22, 22, { align: 'center' });
  }
  doc.setFont(FONT, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...C.dark);
  doc.text(titulo, 14, 40);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(subtitulo, 14, 46);
  doc.setDrawColor(...C.line);
  doc.line(14, 51, 196, 51);
}

function fila(doc: jsPDF, y: number, etiqueta: string, valor: string, anchoEtiqueta = 50): number {
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(etiqueta, 16, y);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...C.dark);
  doc.text(valor, 16 + anchoEtiqueta, y, { maxWidth: 196 - (16 + anchoEtiqueta) });
  return y + 7;
}

function seccion(doc: jsPDF, y: number, titulo: string): number {
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(...C.soft);
  doc.roundedRect(14, y - 4, 182, 8, 2, 2, 'F');
  doc.setFont(FONT, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.primary);
  doc.text(titulo.toUpperCase(), 16, y + 2);
  return y + 12;
}

function pie(doc: jsPDF) {
  const y = 282;
  doc.setDrawColor(...C.line);
  doc.line(14, y, 196, y);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text('Documento generado por RSP · Red de Servicios de La Placeta', 14, y + 6);
  doc.text(`Generado el ${new Date().toLocaleString('es-ES')}`, 196, y + 6, { align: 'right' });
}

function bloqueFirma(doc: jsPDF, y: number): number {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.text('Firma del responsable', 14, y + 10);
  doc.setDrawColor(...C.line);
  doc.line(14, y + 22, 80, y + 22);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text('Nombre, cargo y DIP', 14, y + 26);
  return y + 34;
}

/* ── Declaración (detalladísima, logo de Tributos) ─────────────────────── */
export async function generarPdfDeclaracion(d: DeclaracionDetalle): Promise<void> {
  const doc = await nuevoDoc();
  await cabecera(doc, 'Declaración Tributaria', `${d.id} · Periodo ${d.mesPeriodo}`, LOGOS.tributos);

  const g = d.desglose;
  let y = 64;

  y = seccion(doc, y, 'Contribuyente');
  y = fila(doc, y, 'Nombre', d.contribuyenteNombre);
  y = fila(doc, y, 'Identificador', d.contribuyenteId);
  y = fila(doc, y, 'Cuenta', d.cuentaIdBlp);
  y = fila(doc, y, 'Estado', d.estado);
  y = fila(doc, y, 'Días activos', String(d.diasActivosMes));
  y += 5;

  y = seccion(doc, y, 'Impuesto sobre la Renta (IRM)');
  y = fila(doc, y, 'Base imponible', `${(g?.baseIrm ?? 0).toLocaleString('es-ES')} Pz`);
  y = fila(doc, y, 'Tipo aplicado', `${g?.tipoIrm ?? 0}%`);
  y = fila(doc, y, 'Cuota íntegra', `${d.cuotaIrm} Pz`);
  y = fila(doc, y, 'Retenciones', `−${(g?.retencionesIrm ?? 0)} Pz`);
  y = fila(doc, y, 'Bonificaciones', `−${(g?.bonificacionesIrm ?? 0)} Pz`);
  y = fila(doc, y, 'Cuota IRM final', `${d.cuotaIrm - (g?.retencionesIrm ?? 0) - (g?.bonificacionesIrm ?? 0)} Pz`);
  y += 5;

  y = seccion(doc, y, 'Impuesto sobre el Gran Fortuna (IGF)');
  y = fila(doc, y, 'Patrimonio bruto', `${(g?.patrimonioBruto ?? 0).toLocaleString('es-ES')} Pz`);
  y = fila(doc, y, 'Exento', `${(g?.patrimonioExento ?? 0).toLocaleString('es-ES')} Pz`);
  y = fila(doc, y, 'Base liquidable', `${(g?.baseIgf ?? 0).toLocaleString('es-ES')} Pz`);
  y = fila(doc, y, 'Tipo aplicado', `${g?.tipoIgf ?? 0}%`);
  y = fila(doc, y, 'Cuota IGF', `${d.cuotaIgf} Pz`);
  y += 5;

  y = seccion(doc, y, 'IVA');
  y = fila(doc, y, 'Repercutido', `${(g?.ivaRepercutido ?? 0)} Pz`);
  y = fila(doc, y, 'Soportado', `−${(g?.ivaSoportado ?? 0)} Pz`);
  y = fila(doc, y, 'Resultado', d.ivaExento ? 'Exento (empresa)' : `${(g?.cuotaIva ?? 0)} Pz`);
  y += 5;

  if (d.empleos && d.empleos.length > 0) {
    y = seccion(doc, y, 'Empleos y cotizaciones');
    for (const e of d.empleos) {
      y = fila(doc, y, e.empleadorNombre, `${e.empleadorEip} · Bruto ${e.salarioBruto} Pz · Cotización −${e.cotizacionTrabajador} Pz (${e.cotizacionPct}%) · Neto ${e.salarioNeto} Pz`, 70);
    }
    y += 3;
  }

  y = seccion(doc, y, 'Resumen');
  y = fila(doc, y, 'Exención aplicada', d.exencionAplicada);
  y = fila(doc, y, 'Total a liquidar', `${(d.cuotaIrm + d.cuotaIgf)} Pz`);
  y += 5;

  y = seccion(doc, y, 'Normativa aplicada');
  for (const n of NORMATIVA_APLICADA) {
    y = fila(doc, y, n.codigo, `${n.descripcion} — ${n.valor}`, 60);
  }
  y += 3;

  y = seccion(doc, y, 'Expediente fiscal');
  if (d.documentos.length === 0) {
    y = fila(doc, y, 'Documentos', 'Sin documentos vinculados');
  } else {
    for (const docV of d.documentos) y = fila(doc, y, docV.tipo, docV.nombre);
  }

  bloqueFirma(doc, Math.max(y + 4, 220));
  pie(doc);
  doc.save(`${d.id}.pdf`);
}

/* ── Trámite (logo de Administración) ──────────────────────────────────── */
export async function generarPdfTramite(t: TramiteDetalle, abrir = false): Promise<void> {
  const doc = await nuevoDoc();
  await cabecera(doc, 'Trámite Administrativo', `${t.id} · ${t.servicio ?? t.tipo}`, LOGOS.administracion);

  let y = 64;
  y = seccion(doc, y, 'Datos del trámite');
  y = fila(doc, y, 'Titular', `${t.nombreCiudadano} (${t.dip})`);
  y = fila(doc, y, 'Servicio', t.servicio ?? t.tipo);
  y = fila(doc, y, 'Estado', t.estado);
  y = fila(doc, y, 'Expediente', t.expedienteId ?? '—');
  y = fila(doc, y, 'Plazo', `${t.plazo} días`);
  for (const [k, v] of Object.entries(t.datosEspecificos ?? {})) {
    y = fila(doc, y, etiquetaCampo(t.tipo, k), v || '—');
  }
  y += 5;

  if (t.requisitos.length > 0) {
    y = seccion(doc, y, 'Requisitos');
    for (const r of t.requisitos) {
      doc.setFont(FONT, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...(r.cumplido ? C.success : C.danger));
      doc.text(r.cumplido ? '✓' : '✗', 16, y);
      doc.setTextColor(...C.dark);
      doc.text(r.descripcion, 24, y, { maxWidth: 176 });
      y += 7;
    }
    y += 5;
  }

  y = seccion(doc, y, 'Actuaciones');
  if (t.actuaciones.length === 0) y = fila(doc, y, 'Sin actuaciones', '—');
  else for (const a of t.actuaciones) y = fila(doc, y, `${new Date(a.fecha).toLocaleDateString('es-ES')} · ${a.tipo}`, `${a.descripcion} (${a.autor})`, 60);

  bloqueFirma(doc, Math.max(y + 4, 220));
  pie(doc);
  if (abrir) window.open(doc.output('bloburl') as unknown as string, '_blank');
  else doc.save(`${t.id}.pdf`);
}

/* ── Subvención (logo de la entidad que subvenciona) ───────────────────── */
export async function generarPdfSubvencion(s: SubvencionDetalle): Promise<void> {
  const doc = await nuevoDoc();
  await cabecera(doc, 'Subvención', `${s.id} · ${s.concepto}`, logoDeEntidadEmisora(s.emisorEip));

  let y = 64;
  y = seccion(doc, y, 'Datos de la subvención');
  y = fila(doc, y, 'Entidad emisora', `${s.emisorNombre} (${s.emisorEip})`);
  y = fila(doc, y, 'Beneficiario', `${s.receptorNombre} (${s.receptorEip})`);
  y = fila(doc, y, 'Importe', `${s.importe.toLocaleString('es-ES')} Pz`);
  y = fila(doc, y, 'Restante', `${s.importeRestante.toLocaleString('es-ES')} Pz`);
  y = fila(doc, y, 'Estado', s.estado);
  y = fila(doc, y, 'Fecha concesión', s.fechaConcesion);
  y += 5;

  y = seccion(doc, y, 'Documentos requeridos');
  if (s.documentosRequeridos.length === 0) y = fila(doc, y, 'Documentos', 'Sin documentos requeridos');
  else {
    for (const d of s.documentosRequeridos) {
      doc.setFont(FONT, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...(d.aportado ? C.success : C.danger));
      doc.text(d.aportado ? '✓' : '✗', 16, y);
      doc.setTextColor(...C.dark);
      doc.text(`${d.nombre} (${d.tipo})`, 24, y, { maxWidth: 176 });
      y += 7;
    }
  }
  y += 5;

  y = seccion(doc, y, 'Justificación de pagos vía Banco de La Placeta');
  if (s.justificaciones.length === 0) y = fila(doc, y, 'Pagos', 'Aún no se ha ejecutado ningún pago');
  else for (const j of s.justificaciones) y = fila(doc, y, `Transferencia ${j.transferenciaId}`, `${j.importe} Pz · ${j.fecha}`, 70);
  y += 4;
  for (const g of s.gastos) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...(g.justificado ? C.success : C.muted));
    doc.text(g.justificado ? '✓' : '·', 16, y);
    doc.text(`${g.concepto} — ${g.importe} Pz (${g.fecha})${g.justificado ? ' · justificado' : ''}`, 22, y, { maxWidth: 178 });
    y += 6;
  }

  bloqueFirma(doc, Math.max(y + 4, 220));
  pie(doc);
  doc.save(`${s.id}.pdf`);
}

/* ── Ficha completa de ciudadano ───────────────────────────────────────── */
export async function generarPdfFichaCiudadano(
  ctx: ContextoCiudadano, docs: DocumentoCiudadano[], firmas: FirmaCiudadano[], obligs: Obligacion[],
): Promise<void> {
  const doc = await nuevoDoc();
  await cabecera(doc, 'Ficha de ciudadano', `${ctx.nombre} · ${ctx.dip}`, LOGOS.administracion);

  let y = 64;
  y = seccion(doc, y, 'Contexto único');
  for (const b of ctx.bloques) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.primary);
    doc.text(b.etiqueta, 16, y);
    y += 6;
    for (const it of b.items) y = fila(doc, y, it.etiqueta, String(it.valor), 46);
    y += 2;
  }
  y += 4;

  y = seccion(doc, y, 'Documentos');
  if (docs.length === 0) y = fila(doc, y, 'Documentos', 'Sin documentos');
  else for (const d of docs) y = fila(doc, y, d.estado, `${d.nombre} (${d.tipo}) · ${d.fecha}`);
  y += 4;

  y = seccion(doc, y, 'Firmas');
  if (firmas.length === 0) y = fila(doc, y, 'Firmas', 'Sin firmas');
  else for (const f of firmas) y = fila(doc, y, f.estado, `${f.documento} — ${f.firmante}${f.fecha ? ` · ${f.fecha}` : ''}`);
  y += 4;

  y = seccion(doc, y, 'Obligaciones');
  if (obligs.length === 0) y = fila(doc, y, 'Obligaciones', 'Sin obligaciones');
  else for (const o of obligs) y = fila(doc, y, o.tipo, `${o.titulo} · ${o.estado}${o.plazo ? ` · vence ${o.plazo}` : ''}`);

  pie(doc);
  doc.save(`ficha-${ctx.dip}.pdf`);
}

/* ── Ficha completa de entidad ─────────────────────────────────────────── */
export async function generarPdfFichaEntidad(e: EntidadDetalle): Promise<void> {
  const doc = await nuevoDoc();
  await cabecera(doc, 'Ficha de entidad', `${e.nombre} · ${e.eip}`, LOGOS.administracion);

  // Valor en tipografía mono (courier) para códigos EIP/DIP/cuentas.
  const filaCodigo = (doc: jsPDF, y: number, etiqueta: string, valor: string, ancho = 50) => {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.muted);
    doc.text(etiqueta, 16, y);
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.text(valor, 16 + ancho, y, { maxWidth: 196 - (16 + ancho) });
    doc.setFont(FONT, 'normal');
    return y + 7;
  };

  let y = 64;
  y = seccion(doc, y, 'Datos registrales');
  y = fila(doc, y, 'Tipo', e.tipo);
  y = fila(doc, y, 'Estado', e.estado);
  y = fila(doc, y, 'Cumplimiento', e.cumplimiento ?? '—');
  y += 5;

  y = seccion(doc, y, 'Representantes legales');
  if (e.representantes.length === 0) y = fila(doc, y, 'Representantes', 'Sin representantes');
  else for (const r of e.representantes) y = filaCodigo(doc, y, r.cargo, `${r.nombre} · ${r.dip}`, 44);
  y += 4;

  y = seccion(doc, y, 'Participación');
  if (e.participacion.length === 0) y = fila(doc, y, 'Titulares', 'Sin % registrado');
  else for (const p of e.participacion) y = filaCodigo(doc, y, `${p.pct}%`, `${p.nombre} · ${p.dip}`, 20);
  y += 4;

  y = seccion(doc, y, 'Cuentas bancarias');
  if (e.cuentas.length === 0) y = fila(doc, y, 'Cuentas', 'Sin cuentas');
  else for (const c of e.cuentas) {
    y = filaCodigo(doc, y, c.tipo, c.id, 34);
    y = fila(doc, y, 'Saldo', `${c.saldo.toLocaleString('es-ES')} Pz · ${c.estado}`, 34);
    for (const p of c.participaciones ?? []) y = filaCodigo(doc, y, `  ${p.pct}%`, `${p.nombre} · ${p.dip}`, 34);
  }
  y += 4;

  y = seccion(doc, y, 'Facturas emitidas');
  if (e.facturasEmitidas.length === 0) y = fila(doc, y, 'Facturas', 'Sin facturas emitidas');
  else for (const f of e.facturasEmitidas) {
    y = filaCodigo(doc, y, f.estado, f.numero, 30);
    y = fila(doc, y, 'Concepto', `${f.concepto} · ${f.importe.toLocaleString('es-ES')} Pz`, 30);
    if (f.receptorId) y = filaCodigo(doc, y, 'Receptor', `${f.receptor || f.receptorId} · ${f.receptorId} · ${f.fecha}`, 30);
  }
  y += 4;

  y = seccion(doc, y, 'Trámites');
  if (e.tramites.length === 0) y = fila(doc, y, 'Trámites', 'Sin trámites');
  else for (const t of e.tramites) y = filaCodigo(doc, y, t.estado, `${t.id} · ${t.titulo} (${t.servicio ?? 'RSP'})`, 30);
  y += 4;

  y = seccion(doc, y, 'Documentos');
  if (e.documentos.length === 0) y = fila(doc, y, 'Documentos', 'Sin documentos');
  else for (const d of e.documentos) y = fila(doc, y, d.estado, `${d.nombre} (${d.tipo}) · ${d.fecha}`);
  y += 4;

  y = seccion(doc, y, 'Obligaciones');
  if (e.obligaciones.length === 0) y = fila(doc, y, 'Obligaciones', 'Sin obligaciones');
  else for (const o of e.obligaciones) y = fila(doc, y, o.tipo, `${o.titulo} · ${o.estado}${o.plazo ? ` · vence ${o.plazo}` : ''}`);

  pie(doc);
  doc.save(`ficha-${e.eip}.pdf`);
}

/* ── Acta de junta ─────────────────────────────────────────────────────── */
export async function generarPdfActa(j: Omit<Junta, 'votaciones'> & { votaciones: Votacion[] }): Promise<void> {
  const doc = await nuevoDoc();
  await cabecera(doc, 'Acta de la Junta', `${j.id} · ${j.fecha}`, LOGOS.administracion);

  let y = 64;
  y = seccion(doc, y, 'Sesión');
  y = fila(doc, y, 'Título', j.titulo);
  y = fila(doc, y, 'Fecha', j.fecha);
  y = fila(doc, y, 'Estado', j.estado);
  y += 5;

  y = seccion(doc, y, 'Asistentes');
  if (j.asistentes.length === 0) y = fila(doc, y, 'Asistentes', 'Sin asistentes');
  else j.asistentes.forEach((a) => { y = fila(doc, y, 'DIP', a); });
  y += 5;

  y = seccion(doc, y, 'Orden del día');
  if (j.ordenDelDia.length === 0) y = fila(doc, y, 'Puntos', 'Sin puntos');
  else j.ordenDelDia.forEach((p, i) => { y = fila(doc, y, `${i + 1}.`, p, 12); });
  y += 5;

  y = seccion(doc, y, 'Votaciones vinculadas');
  if (j.votaciones.length === 0) y = fila(doc, y, 'Votaciones', 'Sin votaciones');
  else for (const v of j.votaciones) y = fila(doc, y, v.id, `${v.titulo} — ${v.estado}${v.resultado ? ` (${v.resultado})` : ''}`, 36);
  y += 5;

  y = seccion(doc, y, 'Acta');
  const texto = j.acta || 'Acta pendiente de redacción.';
  const lineas = doc.splitTextToSize(texto, 180);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  for (const l of lineas) {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.text(l, 16, y);
    y += 5.5;
  }

  bloqueFirma(doc, Math.max(y + 6, 230));
  pie(doc);
  doc.save(`${j.id}-acta.pdf`);
}

/* ── Resumen de votación (con anonimato) ──────────────────────────────── */
export async function generarPdfResumenVotacion(v: Votacion, votos: VotoRegistro[]): Promise<void> {
  const doc = await nuevoDoc();
  await cabecera(doc, 'Resumen de votación', `${v.id} · ${v.titulo}`, LOGOS.rsp);

  let y = 64;
  y = seccion(doc, y, 'Datos');
  y = fila(doc, y, 'Categoría', v.categoria);
  y = fila(doc, y, 'Rango democrático', v.rango);
  y = fila(doc, y, 'Estado', v.estado);
  y = fila(doc, y, 'Resultado', v.resultado ?? '—');
  if (v.bopUrl) y = fila(doc, y, 'Publicada en BOP', v.bopUrl);
  y += 5;

  y = seccion(doc, y, 'Resultado');
  for (const o of v.opciones) {
    const n = o === 'A favor' ? v.aFavor : o === 'En contra' ? v.enContra : o === 'Abstención' ? v.abstenciones : 0;
    y = fila(doc, y, o, String(n), 90);
  }
  y = fila(doc, y, 'Participación', `${v.totalVotos} votos`, 90);
  y += 5;

  y = seccion(doc, y, 'Registro de votos (anonimato)');
  if (votos.length === 0) y = fila(doc, y, 'Votos', 'Sin registros');
  else for (const r of votos) {
    y = fila(doc, y, r.dip, `${r.voto} · ${r.timestamp.slice(0, 10)}${r.esJunta ? ' · junta (nunca anónimo)' : r.anonimo ? ' · anonimizado' : ''}`, 30);
  }

  pie(doc);
  doc.save(`${v.id}-resumen.pdf`);
}

/* ── Informe genérico (para el módulo de Informes) ────────────────────── */
export async function generarPdfInforme(opts: {
  titulo: string;
  subtitulo: string;
  secciones: { titulo: string; filas: [string, string][] }[];
  logoSrc?: string;
}): Promise<void> {
  const doc = await nuevoDoc();
  await cabecera(doc, opts.titulo, opts.subtitulo, opts.logoSrc ?? LOGOS.rsp);
  let y = 64;
  for (const s of opts.secciones) {
    y = seccion(doc, y, s.titulo);
    if (s.filas.length === 0) y = fila(doc, y, 'Datos', 'Sin datos');
    else for (const [k, v] of s.filas) y = fila(doc, y, k, v);
    y += 5;
  }
  pie(doc);
  const nombre = `${opts.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
  doc.save(nombre);
}

/* ── Factura emitida (PDF) ─────────────────────────────────────────────── */
export async function generarPdfFactura(f: FacturaEmitida): Promise<void> {
  const doc = await nuevoDoc();
  await cabecera(doc, 'Factura', `${f.numero} · ${f.fecha}`, LOGOS.banco);
  let y = 64;
  y = seccion(doc, y, 'Datos de la factura');
  y = fila(doc, y, 'Número', f.numero);
  y = fila(doc, y, 'Concepto', f.concepto);
  y = fila(doc, y, 'Importe', `${f.importe.toLocaleString('es-ES')} Pz`);
  y = fila(doc, y, 'Estado', f.estado);
  y = fila(doc, y, 'Fecha', f.fecha);
  y += 5;
  y = seccion(doc, y, 'Receptor');
  y = fila(doc, y, 'Receptor', f.receptor || '—');
  y = fila(doc, y, 'Identificador', f.receptorId || '—');
  pie(doc);
  doc.save(`${f.numero}.pdf`);
}

/* ── Nómina (PDF) ──────────────────────────────────────────────────────── */
export async function generarPdfNomina(n: Nomina): Promise<void> {
  const doc = await nuevoDoc();
  await cabecera(doc, 'Nómina', `${n.id} · ${n.periodo}`, LOGOS.banco);
  let y = 64;
  y = seccion(doc, y, 'Trabajador');
  y = fila(doc, y, 'Nombre', n.nombre);
  y = fila(doc, y, 'DIP', n.dip);
  y = fila(doc, y, 'Periodo', n.periodo);
  y = fila(doc, y, 'Cuenta banco', n.cuentaBanco || '—');
  y += 5;
  y = seccion(doc, y, 'Devengos y deducciones');
  y = fila(doc, y, 'Bruto', `${n.bruto.toLocaleString('es-ES')} Pz`);
  y = fila(doc, y, 'Retenciones', `−${n.retenciones.toLocaleString('es-ES')} Pz`);
  y = fila(doc, y, 'Neto', `${n.neto.toLocaleString('es-ES')} Pz`);
  y = fila(doc, y, 'Estado', n.estado);
  pie(doc);
  doc.save(`${n.id}.pdf`);
}

/* ── Diploma de Placeta Junior (verificable vía URL pública) ───────────── */
export async function generarPdfDiplomaJunior(d: DiplomaJunior): Promise<void> {
  const doc = await nuevoDoc('landscape');
  const W = 297; const H = 210;
  const colores = [[239, 68, 68], [249, 115, 22], [59, 130, 246], [34, 197, 94]] as [number, number, number][];
  const urlVerificacion = `${window.location.origin}/publico/diplomas/verificar/${encodeURIComponent(d.id)}`;

  // Marco y banda alegre con los cuatro colores de Placeta Junior.
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, H, 'F');
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(1.2); doc.roundedRect(8, 8, W - 16, H - 16, 5, 5, 'S');
  colores.forEach((c, i) => { doc.setFillColor(...c); doc.rect(8 + i * ((W - 16) / 4), 8, (W - 16) / 4 + 1, 8, 'F'); });
  doc.setFillColor(109, 40, 217); doc.rect(8, H - 18, W - 16, 10, 'F');
  const logo = await rasterizar('https://junior.laplaceta.org/img/PJ-COLOR-LOGO.png');
  if (logo) { const h = 18; doc.addImage(logo.url, 'PNG', 22, 25, Math.min((logo.w / logo.h) * h, 72), h); }
  else { doc.setFont(FONT, 'bold'); doc.setFontSize(16); doc.setTextColor(...C.primary); doc.text('PLACETA JUNIOR', 22, 38); }
  const diplomaFont = cacheFuentes.fredoka ? 'Fredoka One' : FONT;
  doc.setFont(diplomaFont, 'normal'); doc.setFontSize(28); doc.setTextColor(...C.primary); doc.text('DIPLOMA', W / 2, 48, { align: 'center' });
  doc.setFont(diplomaFont, 'normal'); doc.setFontSize(11); doc.setTextColor(...C.muted); doc.text('POR APRENDER JUGANDO', W / 2, 56, { align: 'center' });
  // Medallones decorativos.
  colores.forEach((c, i) => { doc.setFillColor(...c); doc.circle(26 + i * 16, 70, 3, 'F'); });
  doc.setFont(FONT, 'normal'); doc.setFontSize(12); doc.setTextColor(...C.muted); doc.text('Se reconoce a', W / 2, 76, { align: 'center' });
  doc.setFont(diplomaFont, 'normal'); doc.setFontSize(25); doc.setTextColor(...C.dark); doc.text(doc.splitTextToSize(d.nombre || 'Alumno/a', 210), W / 2, 91, { align: 'center' });
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(.5); doc.line(62, 101, W - 62, 101);
  doc.setFont(FONT, 'normal'); doc.setFontSize(11); doc.setTextColor(...C.muted); doc.text('por completar satisfactoriamente la actividad', W / 2, 113, { align: 'center' });
  doc.setFont(diplomaFont, 'normal'); doc.setFontSize(17); doc.setTextColor(...C.primary); doc.text(doc.splitTextToSize(d.actividad || 'Actividad educativa', 210), W / 2, 126, { align: 'center' });
  doc.setFont(FONT, 'normal'); doc.setFontSize(10); doc.setTextColor(...C.muted); doc.text(`Fecha: ${d.fecha || '—'}   ·   DIP: ${d.dip || '—'}`, W / 2, 140, { align: 'center' });
  doc.setFillColor(240, 253, 244); doc.setDrawColor(187, 247, 208); doc.roundedRect(W / 2 - 37, 148, 74, 16, 4, 4, 'FD');
  doc.setFont(FONT, 'bold'); doc.setFontSize(11); doc.setTextColor(...C.success); doc.text('¡RETO SUPERADO!', W / 2, 158, { align: 'center' });
  doc.setFont(FONT, 'normal'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255); doc.text(`Código verificable: ${d.id}`, 18, H - 11); doc.text('Placeta Junior · Grupo de La Placeta', W - 18, H - 11, { align: 'right' });
  doc.setFont(FONT, 'normal'); doc.setFontSize(7); doc.setTextColor(...C.muted); doc.text(`Verificación: ${urlVerificacion}`, W / 2, 177, { align: 'center', maxWidth: 240 });
  doc.save(`diploma-${d.id}.pdf`);
}
