/* ── Catálogo de trámites públicos (fuente única administrable desde RSP) ──
   Cada trámite describe nombre, descripción, icono, sección (legales /
   identidad / fiscal), ámbito (legal real vs ecosistema), cómo se abre
   (ruta o acción JS), requisitos, documentación y plazo.
   GDLP Web consume este catálogo para renderizar el panel público. */

export const CATALOGO_BASE = [
  {
    id: 'control-parental', nombre: 'Control Parental', icono: '👨‍👩‍👧‍👦',
    descripcion: 'Registro oficial de tutor legal para menores de 16. Genera código de vinculación.',
    seccion: 'legales', ambito: 'legal', tipoEnlace: 'accion', accion: 'control-parental',
    requisitos: ['Ser tutor/a legal del menor', 'Tener el DNI del menor'], documentacion: ['DNI del tutor', 'Documento acreditativo de la tutela'], plazo: 15, activo: true, orden: 1,
  },
  {
    id: 'recuperar-codigo', nombre: 'Recuperar Código', icono: '🔍',
    descripcion: 'Recupera el código de vinculación de un menor usando tu DNI.',
    seccion: 'legales', ambito: 'legal', tipoEnlace: 'accion', accion: 'recuperar-codigo',
    requisitos: ['Ser el tutor/a registrado'], documentacion: ['DNI del tutor'], plazo: 5, activo: true, orden: 2,
  },
  {
    id: 'quejas', nombre: 'Quejas y Sugerencias', icono: '💬',
    descripcion: 'Canal oficial con la Junta Directiva. Registro y respuesta en plazo legal.',
    seccion: 'legales', ambito: 'legal', tipoEnlace: 'accion', accion: 'quejas',
    requisitos: ['Identificarse con PlacetaID'], documentacion: [], plazo: 20, activo: true, orden: 3,
  },
  {
    id: 'alta-dip', nombre: 'Alta DIP', icono: '🪪',
    descripcion: 'Solicita tu Documento de Identidad de La Placeta.',
    seccion: 'identidad', ambito: 'ecosistema', tipoEnlace: 'accion', accion: 'alta-dip',
    requisitos: ['Ser integrante del Grupo', 'No tener ya un DIP'], documentacion: [], plazo: 10, activo: true, orden: 1,
  },
  {
    id: 'alta-placetid', nombre: 'Alta PlacetaID', icono: '🔑',
    descripcion: 'Activa tu identidad digital con un DIP provisional.',
    seccion: 'identidad', ambito: 'ecosistema', tipoEnlace: 'accion', accion: 'alta-placetid',
    requisitos: ['DIP vigente'], documentacion: [], plazo: 10, activo: true, orden: 2,
  },
  {
    id: 'alta-entidad', nombre: 'Alta Entidad (EIP)', icono: '🏢',
    descripcion: 'Registra tu empresa simulada y obtén tu EIP.',
    seccion: 'identidad', ambito: 'ecosistema', tipoEnlace: 'accion', accion: 'alta-entidad',
    requisitos: ['DIP del representante'], documentacion: ['Nombre y objeto de la entidad'], plazo: 10, activo: true, orden: 3,
  },
  {
    id: 'alta-tributos', nombre: 'Alta en Tributos', icono: '🧾',
    descripcion: 'Regístrate en el censo de contribuyentes. Obligatorio para operar con tu cuenta bancaria.',
    seccion: 'fiscal', ambito: 'ecosistema', tipoEnlace: 'accion', accion: 'alta-tributos',
    requisitos: ['DIP vigente'], documentacion: [], plazo: 10, activo: true, orden: 1,
  },
  {
    id: 'solicitar-factura', nombre: 'Solicitar Factura', icono: '📄',
    descripcion: 'Emite una factura con IVA del 12% y recibe tu CSV de verificación único.',
    seccion: 'fiscal', ambito: 'ecosistema', tipoEnlace: 'accion', accion: 'solicitar-factura',
    requisitos: ['Estar en el censo de contribuyentes'], documentacion: ['Datos de emisor y receptor', 'Concepto y líneas de factura'], plazo: 5, activo: true, orden: 2,
  },
  {
    id: 'consulta-tributos', nombre: 'Consulta Tributaria', icono: '📊',
    descripcion: 'Revisa tu estado fiscal, declaraciones pendientes e historial de pagos.',
    seccion: 'fiscal', ambito: 'ecosistema', tipoEnlace: 'ruta', ruta: '/tramites/consulta-tributos',
    requisitos: ['Estar en el censo de contribuyentes'], documentacion: [], plazo: 0, activo: true, orden: 3,
  },
];
