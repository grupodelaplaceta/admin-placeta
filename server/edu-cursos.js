/* ── Catálogo base de cursos de EDU (administrable desde RSP) ──
   RSP es la fuente de verdad de los cursos de Placeta EDU. La web EDU
   consume el endpoint público /publico/edu/cursos. Cada curso incluye
   categoría, plazas, estado, fechas y requisitos. */

export const CATALOGO_EDU_BASE = [
  {
    id: 'edu-intro-programacion', titulo: 'Introducción a la Programación', emoji: '💻',
    descripcion: 'Aprende los fundamentos de la programación desde cero con ejercicios prácticos.',
    categoria: 'tech', categoriaLabel: 'Tecnología', plazas: 30, inscritos: 0,
    estado: 'abierta', precio: 'Gratis', duracion: '8 semanas',
    fechaInicio: '2026-09-14', fechaFin: '2026-11-06',
    requisitos: ['Sin conocimientos previos'], activo: true, orden: 1,
  },
  {
    id: 'edu-datos-ia', titulo: 'Datos e Inteligencia Artificial', emoji: '📊',
    descripcion: 'Fundamentos de análisis de datos, machine learning y casos prácticos.',
    categoria: 'data', categoriaLabel: 'Datos & IA', plazas: 25, inscritos: 0,
    estado: 'abierta', precio: 'Gratis', duracion: '10 semanas',
    fechaInicio: '2026-09-14', fechaFin: '2026-11-20',
    requisitos: ['Nociones básicas de hojas de cálculo'], activo: true, orden: 2,
  },
  {
    id: 'edu-negocios', titulo: 'Gestión de Negocios', emoji: '💼',
    descripcion: 'Creación y gestión de empresas en el ecosistema: plan, contabilidad y ventas.',
    categoria: 'business', categoriaLabel: 'Negocios', plazas: 20, inscritos: 0,
    estado: 'abierta', precio: 'Gratis', duracion: '6 semanas',
    fechaInicio: '2026-09-21', fechaFin: '2026-10-30',
    requisitos: ['Ser integrante del Grupo'], activo: true, orden: 3,
  },
  {
    id: 'edu-diseno', titulo: 'Diseño Digital', emoji: '🎨',
    descripcion: 'Fundamentos de diseño visual, identidad y herramientas digitales.',
    categoria: 'design', categoriaLabel: 'Diseño', plazas: 25, inscritos: 0,
    estado: 'abierta', precio: 'Gratis', duracion: '6 semanas',
    fechaInicio: '2026-09-21', fechaFin: '2026-10-30',
    requisitos: ['Sin conocimientos previos'], activo: true, orden: 4,
  },
  {
    id: 'edu-idiomas', titulo: 'Inglés Conversacional', emoji: '🗣️',
    descripcion: 'Práctica de conversación en inglés con grupos reducidos.',
    categoria: 'idiomas', categoriaLabel: 'Idiomas', plazas: 15, inscritos: 0,
    estado: 'abierta', precio: 'Gratis', duracion: '12 semanas',
    fechaInicio: '2026-09-28', fechaFin: '2026-12-18',
    requisitos: ['Nivel básico A2'], activo: true, orden: 5,
  },
];
