/**
 * PLACETA JUNIOR — Retos semanales y juegos educativos
 * 
 * Los retos son distribuidos globalmente desde RSP a todas las instancias de Placeta Junior.
 * Cada semana hay un reto nuevo con actividades: relacionar, clasificar, sopas de letras.
 */

// ── RETOS SEMANALES ───────────────────────────────────────────────────
const RETOS = [
  {
    id: 'reto-2026-01',
    semana: 1,
    titulo: '🌍 Los Servicios Públicos',
    descripcion: 'Aprende cómo funcionan los servicios públicos de La Placeta',
    icono: '🏛️',
    activo: true,
    fechaInicio: '2026-07-27',
    fechaFin: '2026-08-02',
    desdeRSP: true,
    juegos: [
      {
        tipo: 'relacionar',
        titulo: 'Relaciona cada servicio con su entidad',
        instrucciones: 'Arrastra cada servicio a la entidad que corresponde',
        pares: [
          { izquierda: 'Abrir una cuenta', derecha: 'Banco de La Placeta' },
          { izquierda: 'Pagar impuestos', derecha: 'Tributos de La Placeta' },
          { izquierda: 'Votar una ley', derecha: 'Junta de La Placeta' },
          { izquierda: 'Solicitar un trámite', derecha: 'Administración' },
          { izquierda: 'Conectar datos', derecha: 'Red de Servicios (RSP)' }
        ]
      },
      {
        tipo: 'clasificar',
        titulo: 'Clasifica cada concepto',
        instrucciones: 'Coloca cada concepto en su categoría correcta',
        categorias: [
          { nombre: '💰 Ingresos', items: ['Salario', 'Bono bienvenida', 'Intereses'] },
          { nombre: '📊 Impuestos', items: ['IRM', 'IGF', 'IVA'] },
          { nombre: '🏦 Banco', items: ['Cuenta corriente', 'Tarjeta', 'Transferencia'] }
        ]
      },
      {
        tipo: 'sopa',
        titulo: 'Sopa de Letras — Entidades GDLP',
        instrucciones: 'Encuentra las 5 entidades del Grupo de La Placeta',
        letras: [
          ['B','A','N','C','O','P','L','A','Z'],
          ['T','R','I','B','U','T','O','S','X'],
          ['J','U','N','T','A','M','E','N','R'],
          ['A','D','M','I','N','R','S','P','S'],
          ['P','L','A','C','E','T','A','I','D']
        ],
        palabras: ['BANCO', 'TRIBUTOS', 'JUNTA', 'ADMIN', 'RSP']
      }
    ]
  },
  {
    id: 'reto-2026-02',
    semana: 2,
    titulo: '💳 El Dinero y las Placetas',
    descripcion: 'Descubre cómo funcionan las Placetas y el banco',
    icono: '💰',
    activo: true,
    fechaInicio: '2026-08-03',
    fechaFin: '2026-08-09',
    desdeRSP: true,
    juegos: [
      {
        tipo: 'relacionar',
        titulo: 'Relaciona cada concepto financiero',
        pares: [
          { izquierda: 'Placeta', derecha: 'Moneda oficial de GDLP' },
          { izquierda: 'IBAN', derecha: 'Identificador de cuenta' },
          { izquierda: 'DIP', derecha: 'Documento de Identidad' },
          { izquierda: 'EIP', derecha: 'Identificador de Empresa' },
          { izquierda: 'Saldo', derecha: 'Dinero disponible' }
        ]
      },
      {
        tipo: 'sopa',
        titulo: 'Sopa de Letras — Finanzas',
        letras: [
          ['P','L','A','C','E','T','A','S','P'],
          ['I','B','A','N','R','E','D','I','Z'],
          ['D','I','P','M','O','N','E','D','A'],
          ['S','A','L','D','O','T','A','S','A'],
          ['T','A','R','J','E','T','A','S','E']
        ],
        palabras: ['PLACETAS', 'IBAN', 'DIP', 'SALDO', 'TARJETA']
      },
      {
        tipo: 'clasificar',
        titulo: 'Clasifica los tipos de cuenta',
        categorias: [
          { nombre: '👤 Personales', items: ['Corriente', 'Ahorro', 'Infantil'] },
          { nombre: '🏢 Empresas', items: ['Business', 'EIP'] },
          { nombre: '⚙️ Del sistema', items: ['TGLP', 'AGLDP', 'RSP'] }
        ]
      }
    ]
  }
];

/**
 * Obtiene el reto activo de la semana actual
 */
export function getRetoActivo() {
  const ahora = new Date();
  return RETOS.find(r => {
    if (!r.activo) return false;
    const inicio = new Date(r.fechaInicio);
    const fin = new Date(r.fechaFin);
    return ahora >= inicio && ahora <= fin;
  }) || RETOS.find(r => r.activo) || null;
}

/**
 * Obtiene todos los retos
 */
export function getRetos() {
  return RETOS;
}

/**
 * Obtiene un reto por ID
 */
export function getRetoById(id) {
  return RETOS.find(r => r.id === id) || null;
}

/**
 * Obtiene los juegos de un reto
 */
export function getJuegosDelReto(retoId) {
  const reto = getRetoById(retoId);
  return reto?.juegos || [];
}

export default { getRetoActivo, getRetos, getRetoById, getJuegosDelReto };
