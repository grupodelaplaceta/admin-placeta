/**
 * Base de datos de cuestionarios — Placeta Junior
 * 10 niveles (1-10) por cada rango de edad y materia
 * Generación programática para mantener consistencia
 */

function generarPreguntas(edad, materia, nivel) {
  const d = nivel; // dificultad = nivel
  const recompensaBase = 5 + (nivel - 1) * 3;

  const bancos = {
    matematicas: bancosMatematicas(edad, d),
    calculo_mental: bancosCalculoMental(edad, d),
    lengua: bancosLengua(edad, d),
    medio: bancosMedio(edad, d),
    geografia: bancosGeografia(edad, d)
  };

  const preguntas = bancos[materia] || bancosMatematicas(edad, d);
  // Mezclar y tomar 6 preguntas por nivel
  return shuffle(preguntas).slice(0, 6).map((p, i) => ({
    ...p,
    dificultad: d,
    placetas_recompensa: recompensaBase
  }));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MATEMÁTICAS
// ═══════════════════════════════════════════════════════════════════════════

function bancosMatematicas(edad, d) {
  if (edad <= 8) return matematicas_6_8(d);
  if (edad <= 11) return matematicas_9_11(d);
  return matematicas_12_15(d);
}

function matematicas_6_8(d) {
  const todas = [
    // Nivel 1 (d=1)
    { pregunta: '¿Cuánto es 2 + 3?', opciones: ['4', '5', '6', '7'], correcta: 1 },
    { pregunta: '¿Cuánto es 10 - 4?', opciones: ['5', '6', '7', '8'], correcta: 1 },
    { pregunta: '¿Cuánto es 3 × 2?', opciones: ['5', '6', '7', '8'], correcta: 1 },
    { pregunta: '¿Cuántas patas tiene un perro?', opciones: ['2', '3', '4', '5'], correcta: 2 },
    { pregunta: '¿Cuánto es 8 + 1?', opciones: ['7', '8', '9', '10'], correcta: 2 },
    { pregunta: '¿Cuánto es 7 - 3?', opciones: ['3', '4', '5', '6'], correcta: 1 },
    { pregunta: '¿Cuántos dedos tienes en una mano?', opciones: ['4', '5', '6', '10'], correcta: 1 },
    { pregunta: '¿Cuánto es 6 + 4?', opciones: ['8', '9', '10', '12'], correcta: 2 },
    { pregunta: '¿Cuánto es 9 - 5?', opciones: ['3', '4', '5', '6'], correcta: 1 },
    { pregunta: '¿Cuánto es 1 + 1?', opciones: ['1', '2', '3', '4'], correcta: 1 },
    // Nivel 2 (d=2)
    { pregunta: '¿Cuánto es 12 + 5?', opciones: ['15', '16', '17', '18'], correcta: 2 },
    { pregunta: '¿Cuánto es 20 - 8?', opciones: ['10', '11', '12', '13'], correcta: 2 },
    { pregunta: '¿Cuánto es 4 × 3?', opciones: ['10', '11', '12', '13'], correcta: 2 },
    { pregunta: '¿Cuánto es 15 + 7?', opciones: ['20', '21', '22', '23'], correcta: 2 },
    { pregunta: '¿Cuánto es 18 - 9?', opciones: ['7', '8', '9', '10'], correcta: 2 },
    { pregunta: '¿Cuánto es 5 × 2?', opciones: ['8', '9', '10', '12'], correcta: 2 },
    // Nivel 3 (d=3)
    { pregunta: '¿Cuánto es 25 + 13?', opciones: ['36', '37', '38', '39'], correcta: 2 },
    { pregunta: '¿Cuánto es 30 - 12?', opciones: ['16', '17', '18', '19'], correcta: 2 },
    { pregunta: '¿Cuánto es 6 × 4?', opciones: ['22', '23', '24', '26'], correcta: 2 },
    { pregunta: '¿Cuánto es 20 + 15?', opciones: ['33', '34', '35', '36'], correcta: 2 },
    { pregunta: '¿Cuánto es 25 - 7?', opciones: ['16', '17', '18', '19'], correcta: 2 },
    { pregunta: '¿Cuánto es 3 × 5?', opciones: ['13', '14', '15', '16'], correcta: 2 },
    // Nivel 4 (d=4)
    { pregunta: '¿Cuánto es 40 + 25?', opciones: ['63', '64', '65', '66'], correcta: 2 },
    { pregunta: '¿Cuánto es 50 - 18?', opciones: ['30', '31', '32', '33'], correcta: 2 },
    { pregunta: '¿Cuánto es 7 × 3?', opciones: ['19', '20', '21', '22'], correcta: 2 },
    { pregunta: '¿Cuánto es 33 + 27?', opciones: ['58', '59', '60', '61'], correcta: 2 },
    // Placetas (Pz) — misma lógica decimal que el EURO (2 decimales)
    { pregunta: 'Si un chicle cuesta 0,50 Pz y compras 2, ¿cuánto pagas?', opciones: ['0,50 Pz','1,00 Pz','1,50 Pz','2,00 Pz'], correcta: 1 },
    { pregunta: 'Tienes 5,00 Pz y gastas 2,50 Pz, ¿cuánto te queda?', opciones: ['2,00 Pz','2,50 Pz','3,00 Pz','3,50 Pz'], correcta: 1 },
    { pregunta: 'Ahorras 1,00 Pz al día. ¿Cuánto en 7 días?', opciones: ['5,00 Pz','6,00 Pz','7,00 Pz','8,00 Pz'], correcta: 2 },
    { pregunta: '¿Cuánto es 45 - 19?', opciones: ['24', '25', '26', '27'], correcta: 2 },
    { pregunta: '¿Cuánto es 8 × 2?', opciones: ['14', '15', '16', '18'], correcta: 2 },
    // Nivel 5 (d=5)
    { pregunta: '¿Cuánto es 60 + 35?', opciones: ['93', '94', '95', '96'], correcta: 2 },
    { pregunta: '¿Cuánto es 100 - 37?', opciones: ['61', '62', '63', '64'], correcta: 2 },
    { pregunta: '¿Cuánto es 9 × 4?', opciones: ['34', '35', '36', '37'], correcta: 2 },
    { pregunta: '¿Cuánto es 55 + 28?', opciones: ['81', '82', '83', '84'], correcta: 2 },
    { pregunta: '¿Cuánto es 72 - 35?', opciones: ['35', '36', '37', '38'], correcta: 2 },
    { pregunta: '¿Cuánto es 6 × 6?', opciones: ['34', '35', '36', '37'], correcta: 2 },
    // Nivel 6 (d=6)
    { pregunta: '¿Cuánto es 125 + 75?', opciones: ['190', '195', '200', '205'], correcta: 2 },
    { pregunta: '¿Cuánto es 200 - 86?', opciones: ['112', '114', '116', '118'], correcta: 1 },
    { pregunta: '¿Cuánto es 7 × 8?', opciones: ['54', '56', '58', '62'], correcta: 1 },
    { pregunta: '¿Cuánto es 150 + 90?', opciones: ['230', '235', '240', '245'], correcta: 2 },
    { pregunta: '¿Cuánto es 180 - 95?', opciones: ['83', '84', '85', '86'], correcta: 2 },
    { pregunta: '¿Cuánto es 12 × 3?', opciones: ['34', '35', '36', '37'], correcta: 2 },
    // Nivel 7 (d=7)
    { pregunta: '¿Cuánto es 250 + 180?', opciones: ['420', '425', '430', '435'], correcta: 2 },
    { pregunta: '¿Cuánto es 300 - 145?', opciones: ['145', '150', '155', '160'], correcta: 2 },
    { pregunta: '¿Cuánto es 9 × 7?', opciones: ['61', '62', '63', '64'], correcta: 2 },
    { pregunta: '¿Cuánto es 220 + 135?', opciones: ['345', '350', '355', '360'], correcta: 2 },
    { pregunta: '¿Cuánto es 400 - 268?', opciones: ['130', '132', '134', '136'], correcta: 1 },
    { pregunta: '¿Cuánto es 15 × 4?', opciones: ['55', '58', '60', '62'], correcta: 2 },
    // Nivel 8 (d=8)
    { pregunta: '¿Cuánto es 350 + 275?', opciones: ['615', '620', '625', '630'], correcta: 2 },
    { pregunta: '¿Cuánto es 500 - 237?', opciones: ['253', '257', '261', '263'], correcta: 2 },
    { pregunta: '¿Cuánto es 8 × 9?', opciones: ['70', '71', '72', '73'], correcta: 2 },
    { pregunta: '¿Cuánto es 450 + 180?', opciones: ['620', '625', '630', '635'], correcta: 2 },
    { pregunta: '¿Cuánto es 600 - 375?', opciones: ['215', '220', '225', '230'], correcta: 2 },
    { pregunta: '¿Cuánto es 20 × 5?', opciones: ['90', '95', '100', '105'], correcta: 2 },
    // Nivel 9 (d=9)
    { pregunta: '¿Cuánto es 500 + 450?', opciones: ['930', '940', '950', '960'], correcta: 2 },
    { pregunta: '¿Cuánto es 1000 - 475?', opciones: ['515', '520', '525', '530'], correcta: 2 },
    { pregunta: '¿Cuánto es 12 × 8?', opciones: ['94', '95', '96', '97'], correcta: 2 },
    { pregunta: '¿Cuánto es 750 + 275?', opciones: ['1015', '1020', '1025', '1030'], correcta: 2 },
    { pregunta: '¿Cuánto es 900 - 548?', opciones: ['342', '348', '352', '358'], correcta: 2 },
    { pregunta: '¿Cuánto es 25 × 4?', opciones: ['90', '95', '100', '105'], correcta: 2 },
    // Nivel 10 (d=10)
    { pregunta: '¿Cuánto es 1000 + 999?', opciones: ['1899', '1900', '1999', '2000'], correcta: 2 },
    { pregunta: '¿Cuánto es 1500 - 685?', opciones: ['805', '810', '815', '820'], correcta: 2 },
    { pregunta: '¿Cuánto es 15 × 15?', opciones: ['215', '220', '225', '230'], correcta: 2 },
    { pregunta: '¿Cuánto es 2000 - 1250?', opciones: ['650', '700', '750', '800'], correcta: 2 },
    { pregunta: '¿Cuánto es 30 × 3?', opciones: ['80', '85', '90', '95'], correcta: 2 },
    { pregunta: '¿Cuánto es 1000 - 1?', opciones: ['989', '998', '999', '1001'], correcta: 2 }
  ];
  return filtrarPorNivel(todas, d);
}

function matematicas_9_11(d) {
  const todas = [
    // Nivel 1
    { pregunta: '¿Cuánto es 15 × 3?', opciones: ['35', '45', '55', '65'], correcta: 1 },
    { pregunta: '¿Cuánto es 100 ÷ 4?', opciones: ['15', '20', '25', '30'], correcta: 2 },
    { pregunta: '¿Cuál es el área de un cuadrado de 5cm?', opciones: ['20cm²', '25cm²', '30cm²', '10cm²'], correcta: 1 },
    { pregunta: 'Si un tren viaja a 60km/h, ¿km en 3h?', opciones: ['120', '150', '180', '200'], correcta: 2 },
    { pregunta: '3/4 + 1/4', opciones: ['2/4', '1', '3/8', '4/4'], correcta: 1 },
    { pregunta: '¿Cuánto es 12 × 4?', opciones: ['44', '46', '48', '52'], correcta: 2 },
    // Nivel 2
    { pregunta: '¿Cuánto es 25 × 6?', opciones: ['140', '145', '150', '155'], correcta: 2 },
    { pregunta: '¿Cuánto es 144 ÷ 12?', opciones: ['10', '11', '12', '13'], correcta: 2 },
    { pregunta: 'Perímetro de rectángulo 8×3cm', opciones: ['22cm', '24cm', '26cm', '28cm'], correcta: 0 },
    { pregunta: '¿Cuánto es 2/5 de 50?', opciones: ['15', '20', '25', '30'], correcta: 1 },
    { pregunta: '¿Cuánto es 18 × 5?', opciones: ['80', '85', '90', '95'], correcta: 2 },
    { pregunta: '300 ÷ 6?', opciones: ['45', '50', '55', '60'], correcta: 1 },
    // Nivel 3-10
    { pregunta: '¿Cuánto es 125 × 4?', opciones: ['400', '450', '500', '550'], correcta: 2 },
    { pregunta: '¿Cuánto es 360 ÷ 12?', opciones: ['25', '28', '30', '32'], correcta: 2 },
    { pregunta: 'Área de triángulo base 10 altura 6', opciones: ['30', '40', '50', '60'], correcta: 0 },
    { pregunta: '¿Cuánto es 3/5 + 2/5?', opciones: ['1', '5/5', '6/5', '1/5'], correcta: 0 },
    { pregunta: '¿Cuánto es 250 × 3?', opciones: ['650', '700', '750', '800'], correcta: 2 },
    { pregunta: '480 ÷ 8?', opciones: ['50', '55', '60', '65'], correcta: 2 },
    { pregunta: '¿Cuánto es 85 × 7?', opciones: ['565', '575', '585', '595'], correcta: 2 },
    { pregunta: '¿Cuánto es 1000 ÷ 25?', opciones: ['35', '38', '40', '42'], correcta: 2 },
    { pregunta: 'Volumen cubo 4cm', opciones: ['64cm³', '48cm³', '32cm³', '16cm³'], correcta: 0 },
    { pregunta: '¿25% de 200?', opciones: ['25', '40', '50', '60'], correcta: 2 },
    { pregunta: '¿Cuánto es 320 × 5?', opciones: ['1500', '1550', '1600', '1650'], correcta: 2 },
    { pregunta: '840 ÷ 14?', opciones: ['55', '60', '65', '70'], correcta: 1 },
    { pregunta: 'Área círculo r=7 (π=3.14)', opciones: ['143.86', '153.86', '163.86', '173.86'], correcta: 1 },
    { pregunta: '¿Cuánto es 7! ÷ 6!?', opciones: ['6', '7', '8', '42'], correcta: 1 },
    { pregunta: '¿Cuánto es 625 × 8?', opciones: ['4800', '4900', '5000', '5100'], correcta: 2 },
    { pregunta: '1500 ÷ 30', opciones: ['45', '50', '55', '60'], correcta: 1 },
    { pregunta: '√225', opciones: ['13', '14', '15', '16'], correcta: 2 },
    { pregunta: '¿30% de 450?', opciones: ['120', '125', '130', '135'], correcta: 3 },
    { pregunta: '¿Cuánto es 1000 × 12?', opciones: ['10000', '11000', '12000', '13000'], correcta: 2 },
    { pregunta: '2500 ÷ 50', opciones: ['40', '45', '50', '55'], correcta: 2 },
    { pregunta: '¿Área trapecio B=8 b=5 h=4?', opciones: ['24', '26', '28', '30'], correcta: 1 },
    { pregunta: '¿Cuánto es 500 × 25?', opciones: ['10000', '11500', '12000', '12500'], correcta: 3 },
    { pregunta: '3600 ÷ 60', opciones: ['50', '55', '60', '65'], correcta: 2 },
    { pregunta: '-12 + 25', opciones: ['11', '12', '13', '14'], correcta: 2 },
    { pregunta: '¿Cuánto es 2000 × 5?', opciones: ['8000', '9000', '10000', '11000'], correcta: 2 },
    { pregunta: '5000 ÷ 125', opciones: ['30', '35', '40', '45'], correcta: 2 },
    { pregunta: '¿Perímetro círculo d=10?', opciones: ['31.4', '41.4', '51.4', '61.4'], correcta: 0 },
    { pregunta: '¿75% de 800?', opciones: ['500', '550', '600', '650'], correcta: 2 },
    // 💰 Placetas (Pz) — 2 decimales como el EURO
    { pregunta: 'Una libreta cuesta 3,75 Pz y pagas con 5,00 Pz. ¿Cuánto te devuelven?', opciones: ['1,15 Pz','1,25 Pz','1,35 Pz','2,25 Pz'], correcta: 1 },
    { pregunta: 'Ahorras 2,50 Pz cada semana. ¿Cuánto en 8 semanas?', opciones: ['18,00 Pz','20,00 Pz','22,00 Pz','25,00 Pz'], correcta: 1 },
    { pregunta: 'Si 4 amigos juntan 15,20 Pz cada uno, ¿cuánto tienen en total?', opciones: ['58,80 Pz','60,80 Pz','62,80 Pz','64,80 Pz'], correcta: 1 },
  ];
  return filtrarPorNivel(todas, d);
}

function matematicas_12_15(d) {
  const todas = [
    // Nivel 1-2
    { pregunta: '2x + 5 = 15, x = ?', opciones: ['3', '5', '7', '10'], correcta: 1 },
    { pregunta: '√144', opciones: ['10', '11', '12', '13'], correcta: 2 },
    { pregunta: '(-5) × (-3)', opciones: ['-15', '-8', '8', '15'], correcta: 3 },
    { pregunta: '15% de 200', opciones: ['20', '25', '30', '35'], correcta: 2 },
    { pregunta: '62 × 3', opciones: ['180', '184', '186', '188'], correcta: 2 },
    { pregunta: '3² + 4²', opciones: ['25', '20', '15', '10'], correcta: 0 },
    // Nivel 3-4
    { pregunta: '5x - 3 = 2x + 9, x = ?', opciones: ['2', '3', '4', '5'], correcta: 2 },
    { pregunta: 'Área círculo r=10cm', opciones: ['251', '264', '285', '314'], correcta: 3 },
    { pregunta: '7! (7 factorial)', opciones: ['5040', '720', '2520', '40320'], correcta: 0 },
    { pregunta: '2⁵', opciones: ['8', '16', '32', '64'], correcta: 2 },
    { pregunta: '35% de 400', opciones: ['120', '130', '140', '150'], correcta: 2 },
    // Nivel 5-6
    { pregunta: 'Hipotenusa catetos 5 y 12', opciones: ['10', '13', '15', '17'], correcta: 1 },
    { pregunta: '-(-8) + (-3)', opciones: ['-11', '-5', '5', '11'], correcta: 2 },
    { pregunta: '3x² - 4 = 71, x>0', opciones: ['3', '4', '5', '6'], correcta: 2 },
    { pregunta: '2/3 de 360', opciones: ['210', '220', '230', '240'], correcta: 3 },
    { pregunta: '√(25+144)', opciones: ['10', '11', '12', '13'], correcta: 3 },
    // Nivel 7-8
    { pregunta: 'x² + 5x + 6 = 0, x negativo', opciones: ['-2', '-3', '-1', '-4'], correcta: 1 },
    { pregunta: 'Área esfera r=7cm (π=3.14)', opciones: ['515.44', '615.44', '715.44', '815.44'], correcta: 1 },
    { pregunta: 'log₁₀(10000)', opciones: ['2', '3', '4', '5'], correcta: 2 },
    { pregunta: '0.25 de 800', opciones: ['150', '175', '200', '225'], correcta: 2 },
    { pregunta: '6! / 3!', opciones: ['60', '90', '120', '150'], correcta: 2 },
    // Nivel 9-10
    { pregunta: 'Pendiente recta: (2,5) a (6,13)', opciones: ['1', '2', '3', '4'], correcta: 1 },
    { pregunta: '3⁴', opciones: ['27', '54', '81', '108'], correcta: 2 },
    { pregunta: '√(169)', opciones: ['11', '12', '13', '14'], correcta: 2 },
    { pregunta: '¿Cuánto es (8+2) × 3?', opciones: ['26', '28', '30', '32'], correcta: 2 },
    { pregunta: '62.5% de 800', opciones: ['400', '450', '500', '550'], correcta: 2 },
    { pregunta: 'Área total cubo arista 5', opciones: ['100', '125', '150', '175'], correcta: 2 },
    { pregunta: 'x/4 + 2 = 7, x = ?', opciones: ['16', '18', '20', '24'], correcta: 2 },
    { pregunta: 'Perímetro círculo r=14', opciones: ['87.92', '97.92', '107.92', '117.92'], correcta: 0 },
    // 💰 Placetas avanzado — interés, IVA, ahorro (2 decimales)
    { pregunta: 'Inviertes 100,00 Pz al 5% anual. ¿Interés en 1 año?', opciones: ['4,00 Pz','5,00 Pz','6,00 Pz','10,00 Pz'], correcta: 1 },
    { pregunta: 'Una compra de 50,00 Pz tiene 12% IVA. ¿Total a pagar?', opciones: ['54,00 Pz','55,00 Pz','56,00 Pz','60,00 Pz'], correcta: 2 },
    { pregunta: 'Ahorras 500 Pz al 3% compuesto 2 años. ¿aprox?', opciones: ['515,00 Pz','530,45 Pz','545,00 Pz','560,00 Pz'], correcta: 1 },
  ];
  return filtrarPorNivel(todas, d);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CÁLCULO MENTAL
// ═══════════════════════════════════════════════════════════════════════════

function bancosCalculoMental(edad, d) {
  if (edad <= 8) return calculo_6_8(d);
  if (edad <= 11) return calculo_9_11(d);
  return calculo_12_15(d);
}

function calculo_6_8(d) {
  const todas = [
    // Muy fáciles (nivel 1-2)
    { pregunta: '2 + 1 = ?', opciones: ['2', '3', '4', '5'], correcta: 1 },
    { pregunta: '3 + 2 = ?', opciones: ['4', '5', '6', '7'], correcta: 1 },
    { pregunta: '1 + 4 = ?', opciones: ['4', '5', '6', '7'], correcta: 1 },
    { pregunta: '3 - 1 = ?', opciones: ['1', '2', '3', '4'], correcta: 1 },
    { pregunta: '5 - 2 = ?', opciones: ['2', '3', '4', '5'], correcta: 1 },
    { pregunta: '2 + 2 = ?', opciones: ['3', '4', '5', '6'], correcta: 1 },
    { pregunta: '4 + 3 = ?', opciones: ['5', '6', '7', '8'], correcta: 2 },
    { pregunta: '6 - 3 = ?', opciones: ['2', '3', '4', '5'], correcta: 1 },
    // Intermedio (nivel 3-6)
    { pregunta: '8 + 7 = ?', opciones: ['13', '14', '15', '16'], correcta: 2 },
    { pregunta: '15 - 6 = ?', opciones: ['7', '8', '9', '10'], correcta: 2 },
    { pregunta: 'Dobla 3 → 3 × 2 = ?', opciones: ['5', '6', '7', '8'], correcta: 1 },
    { pregunta: 'Mitad de 10 → 10 ÷ 2 = ?', opciones: ['4', '5', '6', '7'], correcta: 1 },
    { pregunta: '2 Placetas/día × 3 días = ?', opciones: ['5', '6', '7', '8'], correcta: 1 },
    { pregunta: '9 + 9 = ?', opciones: ['16', '17', '18', '19'], correcta: 2 },
    { pregunta: 'Dobla 7 = ?', opciones: ['12', '13', '14', '15'], correcta: 2 },
    { pregunta: '20 + 11 = ?', opciones: ['29', '30', '31', '32'], correcta: 2 },
    { pregunta: 'Mitad de 20 = ?', opciones: ['8', '9', '10', '12'], correcta: 2 },
    // Avanzado (nivel 7+)
    { pregunta: '25 + 14 = ?', opciones: ['37', '38', '39', '40'], correcta: 2 },
    { pregunta: '30 - 11 = ?', opciones: ['17', '18', '19', '20'], correcta: 2 },
    { pregunta: '33 + 27 = ?', opciones: ['55', '58', '60', '62'], correcta: 2 },
    { pregunta: 'Dobla 12 = ?', opciones: ['22', '24', '26', '28'], correcta: 1 },
    { pregunta: '45 + 36 = ?', opciones: ['79', '81', '83', '85'], correcta: 1 },
    { pregunta: 'Mitad de 50 = ?', opciones: ['20', '25', '30', '35'], correcta: 1 },
    { pregunta: '60 + 38 = ?', opciones: ['96', '97', '98', '99'], correcta: 2 },
    { pregunta: 'Dobla 25 = ?', opciones: ['45', '48', '50', '52'], correcta: 2 },
    { pregunta: '75 + 45 = ?', opciones: ['110', '115', '120', '125'], correcta: 2 },
    { pregunta: 'Mitad de 100 = ?', opciones: ['40', '45', '50', '55'], correcta: 2 }
  ];
  return filtrarPorNivel(todas, d);
}

function calculo_9_11(d) {
  return filtrarPorNivel([
    { pregunta: '25 × 4 (mental)', opciones: ['80', '90', '100', '110'], correcta: 2 },
    { pregunta: '12/día × 5 días', opciones: ['50', '60', '70', '80'], correcta: 1 },
    { pregunta: '115 - 38', opciones: ['73', '77', '83', '87'], correcta: 1 },
    { pregunta: 'Dobla 48 - 10', opciones: ['76', '86', '96', '106'], correcta: 1 },
    { pregunta: '42 + 39', opciones: ['79', '81', '83', '85'], correcta: 1 },
    { pregunta: '35 × 2', opciones: ['60', '65', '70', '75'], correcta: 2 },
    { pregunta: '150 ÷ 5', opciones: ['25', '30', '35', '40'], correcta: 1 },
    { pregunta: '60 × 3', opciones: ['160', '170', '180', '190'], correcta: 2 },
    { pregunta: '250 + 350', opciones: ['550', '580', '600', '620'], correcta: 2 },
    { pregunta: 'Dobla 75', opciones: ['140', '145', '150', '155'], correcta: 2 },
    { pregunta: '30% de 200', opciones: ['50', '55', '60', '65'], correcta: 2 },
    { pregunta: '125 × 8', opciones: ['900', '950', '1000', '1100'], correcta: 2 },
    { pregunta: '15 × 15', opciones: ['200', '215', '220', '225'], correcta: 3 },
    { pregunta: '450 × 2', opciones: ['800', '850', '900', '950'], correcta: 2 },
    { pregunta: 'Mitad de 250', opciones: ['115', '120', '125', '130'], correcta: 2 },
    { pregunta: '75% de 400', opciones: ['250', '275', '300', '325'], correcta: 2 },
    { pregunta: '18 × 3', opciones: ['48', '50', '52', '54'], correcta: 3 },
    { pregunta: '25 × 25', opciones: ['500', '575', '600', '625'], correcta: 3 },
    { pregunta: '3⁵ (mental)', opciones: ['125', '159', '218', '243'], correcta: 3 },
    { pregunta: 'Dobla 125', opciones: ['225', '240', '250', '260'], correcta: 2 },
    { pregunta: '88 × 5', opciones: ['400', '420', '440', '460'], correcta: 2 },
    { pregunta: '20% de 450', opciones: ['70', '75', '80', '90'], correcta: 3 },
    { pregunta: '250 × 6', opciones: ['1200', '1300', '1400', '1500'], correcta: 2 },
    { pregunta: 'Mitad de 750', opciones: ['325', '350', '375', '400'], correcta: 2 }
  ], d);
}

function calculo_12_15(d) {
  return filtrarPorNivel([
    { pregunta: '37 + 58 (mental)', opciones: ['85', '95', '105', '115'], correcta: 1 },
    { pregunta: '15% de 80', opciones: ['10', '12', '14', '16'], correcta: 1 },
    { pregunta: '143 ÷ 11', opciones: ['11', '12', '13', '14'], correcta: 2 },
    { pregunta: '8/día × 45 días', opciones: ['320', '340', '360', '380'], correcta: 2 },
    { pregunta: '65 + 47', opciones: ['102', '108', '112', '118'], correcta: 2 },
    { pregunta: '30 × 40', opciones: ['1000', '1100', '1200', '1300'], correcta: 2 },
    { pregunta: '450 - 186', opciones: ['254', '258', '264', '268'], correcta: 2 },
    { pregunta: '12.5 × 4', opciones: ['45', '48', '50', '52'], correcta: 2 },
    { pregunta: '35% de 200', opciones: ['60', '65', '70', '75'], correcta: 2 },
    { pregunta: '√144 + √25', opciones: ['15', '17', '19', '21'], correcta: 1 },
    { pregunta: '7 × 12', opciones: ['72', '78', '84', '96'], correcta: 2 },
    { pregunta: '500 - 236', opciones: ['254', '256', '262', '264'], correcta: 2 },
    { pregunta: '2⁶', opciones: ['32', '48', '56', '64'], correcta: 3 },
    { pregunta: '25 × 12', opciones: ['250', '280', '300', '320'], correcta: 2 },
    { pregunta: 'Dobla 85', opciones: ['155', '160', '165', '170'], correcta: 3 },
    { pregunta: '18% de 500', opciones: ['70', '80', '90', '100'], correcta: 2 },
    { pregunta: '999 + 999', opciones: ['1898', '1998', '2000', '2098'], correcta: 1 },
    { pregunta: '√400', opciones: ['15', '18', '20', '25'], correcta: 2 },
    { pregunta: '60% de 350', opciones: ['180', '190', '200', '210'], correcta: 3 },
    { pregunta: '1500 ÷ 0.5', opciones: ['750', '1500', '3000', '4500'], correcta: 2 },
    { pregunta: '0.12 × 5000', opciones: ['400', '500', '600', '700'], correcta: 2 },
    { pregunta: '3⁴ + 2⁴', opciones: ['80', '84', '97', '112'], correcta: 2 },
    { pregunta: '√(36+64)', opciones: ['8', '9', '10', '11'], correcta: 2 },
    { pregunta: '88 + 77', opciones: ['155', '165', '175', '185'], correcta: 1 },
    { pregunta: '0.5% de 10000', opciones: ['5', '20', '50', '100'], correcta: 2 },
    { pregunta: 'Dobla 250', opciones: ['450', '480', '500', '520'], correcta: 2 },
    { pregunta: '4² + 5² + 6²', opciones: ['57', '67', '77', '87'], correcta: 2 },
    { pregunta: '75 × 8', opciones: ['500', '550', '600', '650'], correcta: 2 }
  ], d);
}

// ═══════════════════════════════════════════════════════════════════════════
//  LENGUA
// ═══════════════════════════════════════════════════════════════════════════

function bancosLengua(edad, d) {
  if (edad <= 8) return lengua_6_8(d);
  if (edad <= 11) return lengua_9_11(d);
  return lengua_12_15(d);
}

function lengua_6_8(d) {
  const todas = [
    { pregunta: 'Primera letra del abecedario', opciones: ['A', 'B', 'C', 'D'], correcta: 0 },
    { pregunta: 'Palabra bien escrita', opciones: ['Casa', 'Kasa', 'Caza', 'Cassa'], correcta: 0 },
    { pregunta: 'Plural de "sol"', opciones: ['Sols', 'Soles', 'Sole', 'Solis'], correcta: 1 },
    { pregunta: 'Completa: El ___ es amarillo', opciones: ['sol', 'sal', 'sul', 'sel'], correcta: 0 },
    { pregunta: 'Letra después de la M', opciones: ['L', 'N', 'O', 'P'], correcta: 1 },
    { pregunta: '¿Cuál es una fruta?', opciones: ['Mesa', 'Manzana', 'Silla', 'Cama'], correcta: 1 },
    { pregunta: 'Completa: La ___ brilla en el cielo', opciones: ['sol', 'luna', 'lápiz', 'agua'], correcta: 1 },
    { pregunta: '¿Cuántas letras tiene "gato"?', opciones: ['3', '4', '5', '6'], correcta: 1 },
    { pregunta: 'Palabra que rima con "pan"', opciones: ['sol', 'flan', 'mar', 'luz'], correcta: 1 },
    { pregunta: 'Mayúscula de "a"', opciones: ['B', 'A', 'C', 'D'], correcta: 1 },
    { pregunta: 'Artículo correcto: ___ casa', opciones: ['El', 'La', 'Los', 'Las'], correcta: 1 },
    { pregunta: 'Verbo: Yo ___ feliz', opciones: ['soy', 'eres', 'es', 'son'], correcta: 0 },
    { pregunta: 'Antónimo de "grande"', opciones: ['Alto', 'Gordo', 'Pequeño', 'Largo'], correcta: 2 },
    { pregunta: 'Sinónimo de "alegre"', opciones: ['Triste', 'Feliz', 'Enojado', 'Cansado'], correcta: 1 },
    { pregunta: 'Completa: Los pájaros ___ volar', opciones: ['saben', 'sabes', 'sabemos', 'sabéis'], correcta: 0 },
    { pregunta: '¿Cuál es un color?', opciones: ['Coche', 'Rojo', 'Mesa', 'Agua'], correcta: 1 },
    { pregunta: 'Plural de "lápiz"', opciones: ['Lápizes', 'Lápices', 'Lapiz', 'Lápicis'], correcta: 1 },
    { pregunta: 'Completa: María ___ a la escuela', opciones: ['vas', 'van', 'va', 'vamos'], correcta: 2 },
    { pregunta: '¿Cuál es un animal?', opciones: ['Pelota', 'Elefante', 'Silla', 'Puerta'], correcta: 1 },
    { pregunta: 'Letra vocal', opciones: ['B', 'E', 'F', 'G'], correcta: 1 },
    { pregunta: 'Sinónimo de "bonito"', opciones: ['Feo', 'Hermoso', 'Grande', 'Rápido'], correcta: 1 },
    { pregunta: 'Completa: Ellos ___ jugando', opciones: ['están', 'está', 'estoy', 'estamos'], correcta: 0 },
    { pregunta: '¿Cuántas sílabas tiene "mariposa"?', opciones: ['3', '4', '5', '6'], correcta: 1 },
    { pregunta: 'Antónimo de "rápido"', opciones: ['Veloz', 'Lento', 'Ágil', 'Pronto'], correcta: 1 },
    { pregunta: 'Completa: Ayer ___ al parque', opciones: ['voy', 'fui', 'iré', 'iba'], correcta: 1 },
    { pregunta: '¿Qué es un sustantivo?', opciones: ['Acción', 'Persona/lugar/cosa', 'Cualidad', 'Idea'], correcta: 1 },
    { pregunta: 'Aguda, llana o esdrújula: "camión"', opciones: ['Aguda', 'Llana', 'Esdrújula', 'Sobreesdrújula'], correcta: 0 },
    { pregunta: 'Completa: Si ___ bien, te ___ bien', opciones: ['comes/sientes', 'haces/sientes', 'estudias/sientes', 'estudias/sabes'], correcta: 2 }
  ];
  return filtrarPorNivel(todas, d);
}

function lengua_9_11(d) {
  return filtrarPorNivel([
    { pregunta: '¿Qué es un sustantivo?', opciones: ['Acción', 'Persona/animal/cosa', 'Cualidad', 'Lugar'], correcta: 1 },
    { pregunta: 'Sinónimo de "rápido"', opciones: ['Lento', 'Veloz', 'Pesado', 'Tarde'], correcta: 1 },
    { pregunta: 'Completa: "Si ___ bien..."', opciones: ['comes/sientes', 'haces/sientes', 'estudias/sientes', 'estudias/sabes'], correcta: 2 },
    { pregunta: '¿Tipo de palabra "bellamente"?', opciones: ['Adjetivo', 'Sustantivo', 'Adverbio', 'Verbo'], correcta: 2 },
    { pregunta: 'Tiempo verbal: "cantaba"', opciones: ['Presente', 'Futuro', 'Pret. imperfecto', 'Pret. perfecto'], correcta: 2 },
    { pregunta: '¿Cuál es un diptongo?', opciones: ['León', 'País', 'Cielo', 'Raíz'], correcta: 2 },
    { pregunta: 'Sujeto: "El perro ladra"', opciones: ['Ladra', 'Perro', 'El perro', 'El'], correcta: 2 },
    { pregunta: '¿Qué es un adjetivo?', opciones: ['Acción', 'Cualidad', 'Nombre', 'Enlace'], correcta: 1 },
    { pregunta: 'Palabra aguda con tilde', opciones: ['árbol', 'café', 'mármol', 'lámpara'], correcta: 1 },
    { pregunta: 'Familia de "pan"', opciones: ['Panadero', 'Panal', 'Pantera', 'Panel'], correcta: 0 },
    { pregunta: '¿Qué es una metáfora?', opciones: ['Comparación con "como"', 'Identificación', 'Pregunta', 'Exageración'], correcta: 1 },
    { pregunta: 'Complemento directo: "Veo a María"', opciones: ['Veo', 'a', 'María', 'No tiene'], correcta: 2 },
    { pregunta: 'Oración impersonal', opciones: ['Juan corre', 'Hace frío', 'Ella canta', 'Nosotros vamos'], correcta: 1 },
    { pregunta: 'Correcta: "Había muchas personas"', opciones: ['Habían muchas', 'Había muchas', 'Habían mucha', 'Había mucha'], correcta: 1 },
    { pregunta: 'Campo semántico de "ropa"', opciones: ['Mesa', 'Camisa', 'Coche', 'Libro'], correcta: 1 },
    { pregunta: 'Prefijo: "deshacer"', opciones: ['hacer', 'des', 'deshacer', 'des-'], correcta: 1 },
    { pregunta: 'Sufijo: "panadero"', opciones: ['pan', 'ero', 'pana', 'adero'], correcta: 1 },
    { pregunta: 'Palabra esdrújula', opciones: ['Cantante', 'Música', 'Árbol', 'Jardín'], correcta: 1 },
    { pregunta: 'Perífrasis: "Tengo que estudiar"', opciones: ['Obligación', 'Duda', 'Deseo', 'Futuro'], correcta: 0 },
    { pregunta: 'Conector: "___ llueve, no saldremos"', opciones: ['Porque', 'Si', 'Aunque', 'Y'], correcta: 1 },
    { pregunta: 'Anáfora', opciones: ['Repetir al inicio', 'Comparar', 'Preguntar', 'Exagerar'], correcta: 0 },
    { pregunta: 'Antónimo de "efímero"', opciones: ['Corto', 'Duradero', 'Rápido', 'Breve'], correcta: 1 },
    { pregunta: '¿Qué es una oración compuesta?', opciones: ['1 verbo', '2+ verbos', 'Sin verbo', 'Interrogación'], correcta: 1 },
    { pregunta: 'Palabra parónima de "actitud"', opciones: ['Altitud', 'Aptitud', 'Activo', 'Actor'], correcta: 1 }
  ], d);
}

function lengua_12_15(d) {
  return filtrarPorNivel([
    { pregunta: '¿Qué es una metáfora?', opciones: ['Comparación con "como"', 'Identificación de términos', 'Pregunta', 'Exageración'], correcta: 1 },
    { pregunta: 'Pret. perfecto de "cantar"', opciones: ['Cantaba', 'Cantó', 'Ha cantado', 'Cantaría'], correcta: 2 },
    { pregunta: 'Oración correcta', opciones: ['Habían muchas personas', 'Había muchas personas', 'Habían mucha personas', 'Había mucha personas'], correcta: 1 },
    { pregunta: '"Tus ojos son dos luceros"', opciones: ['Símil', 'Metáfora', 'Personificación', 'Hipérbole'], correcta: 1 },
    { pregunta: 'Sujeto elíptico', opciones: ['Juan corre', 'Corremos', 'El perro', 'Llegó Juan'], correcta: 1 },
    { pregunta: 'Oración subordinada', opciones: ['Juan y María', 'El que vino', 'Casa grande', 'Corre rápido'], correcta: 1 },
    { pregunta: 'Complemento indirecto', opciones: ['CD', 'CI', 'CC', 'Atributo'], correcta: 1 },
    { pregunta: 'Figura: "El tiempo vuela"', opciones: ['Símil', 'Metáfora', 'Personificación', 'Ironía'], correcta: 2 },
    { pregunta: 'Palabra con hiato', opciones: ['Cielo', 'Cuento', 'Poeta', 'Cuando'], correcta: 2 },
    { pregunta: 'Subjuntivo: "Ojalá ___"', opciones: ['llueve', 'llueva', 'llovía', 'lloverá'], correcta: 1 },
    { pregunta: 'Perífrasis: "Debe de estar"', opciones: ['Obligación', 'Probabilidad', 'Duda', 'Futuro'], correcta: 1 },
    { pregunta: 'Preposición: "Voy ___ casa"', opciones: ['en', 'a', 'de', 'por'], correcta: 1 },
    { pregunta: 'Oración pasiva', opciones: ['Juan come', 'La casa es vendida', 'Corre rápido', 'Llegó tarde'], correcta: 1 },
    { pregunta: 'Complemento agente', opciones: ['Por Juan', 'A Juan', 'De Juan', 'Con Juan'], correcta: 0 },
    { pregunta: 'Figura: "tristes guerras"', opciones: ['Aliteración', 'Paronomasia', 'Hipérbaton', 'Asíndeton'], correcta: 2 },
    { pregunta: 'Tipo de "mesa" por sílabas', opciones: ['Aguda', 'Llana', 'Esdrújula', 'Sobreesdrújula'], correcta: 1 },
    { pregunta: 'Coordinada copulativa', opciones: ['Juan come y María canta', 'Juan corre pero llora', 'O vamos o venimos', 'Ni come ni duerme'], correcta: 0 },
    { pregunta: 'Valor de "se" en "Se comió todo"', opciones: ['Reflexivo', 'Recíproco', 'Dativo ético', 'Impersonal'], correcta: 2 },
    { pregunta: 'Derivada de "flor"', opciones: ['Florecer', 'Florido', 'Floristería', 'Todas'], correcta: 3 },
    { pregunta: 'Figura: "Andábase el amor..."', opciones: ['Hipérbaton', 'Símil', 'Anáfora', 'Epíteto'], correcta: 0 },
    { pregunta: 'Oración: "Se alquila pisos" - correcta', opciones: ['Se alquila', 'Se alquilan', 'Se alquilar', 'Alquilan'], correcta: 1 },
    { pregunta: 'Polisemia de "banco"', opciones: ['Homónimos', 'Polisemia', 'Sinónimos', 'Antónimos'], correcta: 1 },
    { pregunta: 'Perífrasis ingresiva', opciones: ['Va a llover', 'Está lloviendo', 'Ha llovido', 'Suele llover'], correcta: 0 },
    { pregunta: 'Figura: "Por ti el silencio..."', opciones: ['Hipérbole', 'Ironía', 'Paradoja', 'Antítesis'], correcta: 0 }
  ], d);
}

// ═══════════════════════════════════════════════════════════════════════════
//  MEDIO
// ═══════════════════════════════════════════════════════════════════════════

function bancosMedio(edad, d) {
  if (edad <= 8) return medio_6_8(d);
  if (edad <= 11) return medio_9_11(d);
  return medio_12_15(d);
}

function medio_6_8(d) {
  const todas = [
    { pregunta: 'Planeta más cercano al Sol', opciones: ['Venus', 'Mercurio', 'Marte', 'Tierra'], correcta: 1 },
    { pregunta: 'Color de las hojas de árboles', opciones: ['Azul', 'Rojo', 'Verde', 'Amarillo'], correcta: 2 },
    { pregunta: '¿Qué necesitan las plantas?', opciones: ['Solo agua', 'Solo sol', 'Agua y sol', 'Nada'], correcta: 2 },
    { pregunta: 'Estaciones del año', opciones: ['2', '3', '4', '5'], correcta: 2 },
    { pregunta: '¿Qué animal vive en el agua?', opciones: ['Perro', 'Gato', 'Pez', 'Pájaro'], correcta: 2 },
    { pregunta: '¿De qué color es el cielo?', opciones: ['Verde', 'Rojo', 'Azul', 'Amarillo'], correcta: 2 },
    { pregunta: '¿Qué órgano usa para ver?', opciones: ['Orejas', 'Ojos', 'Nariz', 'Manos'], correcta: 1 },
    { pregunta: '¿Cuándo sale el sol?', opciones: ['Noche', 'Día', 'Tarde', 'Nunca'], correcta: 1 },
    { pregunta: '¿Qué es un volcán?', opciones: ['Montaña que echa fuego', 'Río', 'Árbol', 'Casa'], correcta: 0 },
    { pregunta: 'Agua del mar', opciones: ['Dulce', 'Salada', 'Sucia', 'Helada'], correcta: 1 },
    { pregunta: '¿Qué planeta es el más grande?', opciones: ['Marte', 'Venus', 'Júpiter', 'Saturno'], correcta: 2 },
    { pregunta: '¿Qué animal pone huevos?', opciones: ['Perro', 'Gato', 'Gallina', 'Vaca'], correcta: 2 },
    { pregunta: '¿Cómo se llama al bebé del caballo?', opciones: ['Cachorro', 'Potro', 'Ternero', 'Pollito'], correcta: 1 },
    { pregunta: '¿Cuántos días tiene una semana?', opciones: ['5', '6', '7', '8'], correcta: 2 },
    { pregunta: '¿Qué gas respiramos?', opciones: ['Helio', 'Oxígeno', 'CO2', 'Hidrógeno'], correcta: 1 },
    { pregunta: '¿Qué órgano bombea sangre?', opciones: ['Pulmón', 'Corazón', 'Cerebro', 'Estómago'], correcta: 1 },
    { pregunta: 'Parte del día después de la tarde', opciones: ['Mañana', 'Noche', 'Mediodía', 'Madrugada'], correcta: 1 },
    { pregunta: '¿Qué instrumento mide temperatura?', opciones: ['Regla', 'Reloj', 'Termómetro', 'Báscula'], correcta: 2 },
    { pregunta: '¿Dónde viven los osos polares?', opciones: ['Selva', 'Desierto', 'Polo Norte', 'Montaña'], correcta: 2 },
    { pregunta: '¿Cuántas fases tiene la luna?', opciones: ['2', '4', '6', '8'], correcta: 1 },
    { pregunta: 'Mayor océano del mundo', opciones: ['Atlántico', 'Índico', 'Pacífico', 'Ártico'], correcta: 2 },
    { pregunta: '¿Qué produce la abeja?', opciones: ['Leche', 'Miel', 'Huevos', 'Lana'], correcta: 1 },
    { pregunta: 'Movimiento de la Tierra alrededor del Sol', opciones: ['Rotación', 'Traslación', 'Gravedad', 'Órbita'], correcta: 1 },
    { pregunta: '¿Cómo se llama nuestro satélite?', opciones: ['Sol', 'Luna', 'Estrella', 'Cometa'], correcta: 1 },
    { pregunta: '¿Cuánto dura la rotación terrestre?', opciones: ['12h', '24h', '48h', '365d'], correcta: 1 },
    { pregunta: '¿Qué animal tiene el cuello más largo?', opciones: ['Elefante', 'Jirafa', 'León', 'Tigre'], correcta: 1 },
    { pregunta: '¿Qué capa del planeta nos protege?', opciones: ['Agua', 'Aire', 'Atmósfera', 'Suelo'], correcta: 2 },
    { pregunta: '¿De qué están hechas las nubes?', opciones: ['Humo', 'Algodón', 'Agua', 'Aire'], correcta: 2 }
  ];
  return filtrarPorNivel(todas, d);
}

function medio_9_11(d) {
  return filtrarPorNivel([
    { pregunta: 'Océano más grande', opciones: ['Atlántico', 'Índico', 'Pacífico', 'Ártico'], correcta: 2 },
    { pregunta: 'Gas que respiramos', opciones: ['Oxígeno', 'Nitrógeno', 'CO₂', 'Helio'], correcta: 1 },
    { pregunta: 'Tiempo orbita Tierra al Sol', opciones: ['24h', '30d', '365d', '7d'], correcta: 2 },
    { pregunta: 'Órgano que bombea sangre', opciones: ['Pulmón', 'Corazón', 'Cerebro', 'Hígado'], correcta: 1 },
    { pregunta: '¿Qué es la fotosíntesis?', opciones: ['Respiración', 'Crear alimento vegetal', 'Descomposición', 'Erosión'], correcta: 1 },
    { pregunta: 'Río más largo del mundo', opciones: ['Amazonas', 'Nilo', 'Misisipi', 'Ebro'], correcta: 1 },
    { pregunta: 'Montaña más alta del mundo', opciones: ['K2', 'Everest', 'Mont Blanc', 'Aconcagua'], correcta: 1 },
    { pregunta: '¿Qué causa las estaciones?', opciones: ['Luna', 'Inclinación Tierra', 'Sol', 'Viento'], correcta: 1 },
    { pregunta: '¿Qué son los fósiles?', opciones: ['Restos antiguos', 'Minerales', 'Rocas', 'Plantas'], correcta: 0 },
    { pregunta: 'Capas de la Tierra', opciones: ['2', '3', '4', '5'], correcta: 1 },
    { pregunta: '¿Qué es un ecosistema?', opciones: ['Sistema vivo', 'Comunidad+entorno', 'Solo animales', 'Solo plantas'], correcta: 1 },
    { pregunta: '¿Qué célula no tiene núcleo?', opciones: ['Animal', 'Procariota', 'Vegetal', 'Humana'], correcta: 1 },
    { pregunta: '¿Dónde está la capa de ozono?', opciones: ['Troposfera', 'Estratosfera', 'Mesosfera', 'Termosfera'], correcta: 1 },
    { pregunta: '¿Qué animal está en peligro?', opciones: ['Perro', 'Oso panda', 'Gato', 'Vaca'], correcta: 1 },
    { pregunta: '¿Energía renovable?', opciones: ['Petróleo', 'Solar', 'Gas', 'Carbón'], correcta: 1 },
    { pregunta: '¿Cuántos huesos tiene un adulto?', opciones: ['106', '206', '306', '406'], correcta: 1 },
    { pregunta: '¿Qué órgano filtra la sangre?', opciones: ['Corazón', 'Riñón', 'Hígado', 'Pulmón'], correcta: 1 },
    { pregunta: '¿Cuál es el país más grande?', opciones: ['China', 'EEUU', 'Rusia', 'Canadá'], correcta: 2 },
    { pregunta: '¿Qué causa los terremotos?', opciones: ['Viento', 'Placas tectónicas', 'Lluvia', 'Sol'], correcta: 1 },
    { pregunta: '¿Qué animal es mamífero?', opciones: ['Tiburón', 'Delfín', 'Cocodrilo', 'Aguila'], correcta: 1 },
    { pregunta: '¿Cuál es el metal más abundante?', opciones: ['Oro', 'Hierro', 'Cobre', 'Plata'], correcta: 1 },
    { pregunta: '¿Qué gas causa efecto invernadero?', opciones: ['O₂', 'CO₂', 'N₂', 'He'], correcta: 1 },
    { pregunta: '¿Cuántos continentes hay?', opciones: ['5', '6', '7', '8'], correcta: 2 },
    { pregunta: '¿Qué es la gravedad?', opciones: ['Fuerza que atrae', 'Viento', 'Luz', 'Calor'], correcta: 0 }
  ], d);
}

function medio_12_15(d) {
  return filtrarPorNivel([
    { pregunta: '¿Qué es la fotosíntesis?', opciones: ['Respiración animal', 'Proceso plantas crear alimento', 'Descomposición', 'Erosión'], correcta: 1 },
    { pregunta: 'Teoría de la evolución', opciones: ['Newton', 'Einstein', 'Darwin', 'Galileo'], correcta: 2 },
    { pregunta: '¿Qué hacen los glóbulos rojos?', opciones: ['Defensa', 'Transportar O₂', 'Coagular', 'Digestión'], correcta: 1 },
    { pregunta: 'Capa de ozono en...', opciones: ['Troposfera', 'Estratosfera', 'Mesosfera', 'Termosfera'], correcta: 1 },
    { pregunta: '¿Qué es el ADN?', opciones: ['Proteína', 'Ácido nucleico', 'Lípido', 'Carbohidrato'], correcta: 1 },
    { pregunta: 'Ley de Newton: F = ?', opciones: ['mv', 'ma', 'm/a', 'm+v'], correcta: 1 },
    { pregunta: '¿Qué es una célula eucariota?', opciones: ['Sin núcleo', 'Con núcleo', 'Solo bacterias', 'Solo virus'], correcta: 1 },
    { pregunta: 'Elemento más abundante en aire', opciones: ['Oxígeno (21%)', 'Nitrógeno (78%)', 'CO₂ (0.04%)', 'Argón (1%)'], correcta: 1 },
    { pregunta: '¿Qué separa las placas tectónicas?', opciones: ['Ríos', 'Fallas', 'Montañas', 'Valles'], correcta: 1 },
    { pregunta: '¿Qué es el pH?', opciones: ['Presión', 'Acidez', 'Temperatura', 'Densidad'], correcta: 1 },
    { pregunta: 'Velocidad de la luz (km/s)', opciones: ['300.000', '150.000', '500.000', '100.000'], correcta: 0 },
    { pregunta: '¿Qué es un quark?', opciones: ['Planeta', 'Partícula subatómica', 'Estrella', 'Asteroide'], correcta: 1 },
    { pregunta: '¿Cuánto dura la mitosis?', opciones: ['Minutos', '1-2 horas', '24 horas', '7 días'], correcta: 1 },
    { pregunta: 'Enlace por compartición de electrones', opciones: ['Iónico', 'Covalente', 'Metálico', 'Puente H'], correcta: 1 },
    { pregunta: 'Ecuación: 6CO₂ + H₂O →', opciones: ['Respiración', 'Fotosíntesis', 'Combustión', 'Fermentación'], correcta: 1 },
    { pregunta: '¿Qué descubrió Fleming?', opciones: ['Vacuna', 'Penicilina', 'ADN', 'Relatividad'], correcta: 1 },
    { pregunta: 'Mayor desierto del mundo', opciones: ['Sahara', 'Antártida', 'Gobi', 'Kalahari'], correcta: 1 },
    { pregunta: '¿Qué es una enzima?', opciones: ['Vitamina', 'Catalizador biológico', 'Hormona', 'Mineral'], correcta: 1 },
    { pregunta: '¿Cuántos planetas en Sistema Solar?', opciones: ['7', '8', '9', '10'], correcta: 1 },
    { pregunta: '¿Qué es el ARN mensajero?', opciones: ['Transporta proteínas', 'Copia ADN', 'Metaboliza', 'Almacena'], correcta: 1 },
    { pregunta: 'Órgano más grande del cuerpo', opciones: ['Hígado', 'Piel', 'Cerebro', 'Pulmón'], correcta: 1 },
    { pregunta: '¿Qué mide la escala Richter?', opciones: ['Viento', 'Terremotos', 'Lluvia', 'Temperatura'], correcta: 1 },
    { pregunta: '¿Qué es la energía nuclear?', opciones: ['Química', 'Del núcleo atómico', 'Solar', 'Hidráulica'], correcta: 1 },
    { pregunta: 'Teoría del Big Bang explica...', opciones: ['El origen del universo', 'El fin del mundo', 'La gravedad', 'Las estaciones'], correcta: 0 }
  ], d);
}

// ═══════════════════════════════════════════════════════════════════════════
//  FILTRO POR NIVEL — 8 preguntas por nivel. Niveles altos: recicla + harder
// ═══════════════════════════════════════════════════════════════════════════

function filtrarPorNivel(todas, nivel) {
  const preguntasPorNivel = 8;
  const inicio = (nivel - 1) * preguntasPorNivel;
  const fin = inicio + preguntasPorNivel;
  let seleccionadas = todas.slice(inicio, fin);

  // If not enough questions, recycle from higher-level pool with difficulty scaling
  if (seleccionadas.length < preguntasPorNivel) {
    const allAvailable = todas.slice(Math.max(0, inicio - preguntasPorNivel * 3));
    while (seleccionadas.length < preguntasPorNivel) {
      const idx = nivel * 7 + seleccionadas.length * 13;
      const src = allAvailable[idx % allAvailable.length];
      if (src) {
        // Create harder variant by increasing numbers
        const scale = Math.floor(nivel / 5) + 1;
        const harder = { ...src,
          pregunta: src.pregunta.replace(/(\d+[.,]?\d*)/g, (m) => {
            const n = parseFloat(m.replace(',', '.'));
            if (isNaN(n)) return m;
            const scaled = Math.round(n * (1 + scale * 0.3) * 100) / 100;
            return String(scaled).replace('.', ',');
          }),
          placetas_recompensa: nivel * 3
        };
        seleccionadas.push(harder);
      } else {
        // Fallback: generate synthetic question
        seleccionadas.push({
          pregunta: `Nivel ${nivel}: Calcula ${nivel * 7} + ${nivel * 11}`,
          opciones: [`${nivel*7+nivel*11-2}`, `${nivel*7+nivel*11-1}`, `${nivel*7+nivel*11}`, `${nivel*7+nivel*11+1}`],
          correcta: 2,
          dificultad: nivel,
          placetas_recompensa: nivel * 4
        });
      }
    }
  }

  return shuffle(seleccionadas.slice(0, preguntasPorNivel));
}

// ═══════════════════════════════════════════════════════════════════════════
//  GENERAR CUESTIONARIOS — Exportable
// ═══════════════════════════════════════════════════════════════════════════

export function generarCuestionarios(edad, nivel) {
  const materias = ['matematicas', 'calculo_mental', 'lengua', 'medio', 'geografia'];
  const resultado = {};

  for (const materia of materias) {
    resultado[materia] = generarPreguntas(edad, materia, nivel);
  }

  return resultado;
}

/*
 * Costo de desbloqueo para cada nivel (Nivel 2-10)
 */
// ═══════════════════════════════════════════════════════════════════════════
//  GEOGRAFÍA — Países, continentes, CCAA, ríos, islas
// ═══════════════════════════════════════════════════════════════════════════

function bancosGeografia(edad, d) {
  if (edad <= 8) return geo_6_8(d);
  if (edad <= 11) return geo_9_11(d);
  return geo_12_15(d);
}

function geo_6_8(d) {
  return [
    { pregunta:'¿Cuántos continentes hay en el mundo?', opciones:['5','6','7','8'], correcta:2 },
    { pregunta:'¿En qué continente está España?', opciones:['Asia','África','Europa','América'], correcta:2 },
    { pregunta:'¿Cuál es el océano más grande?', opciones:['Atlántico','Pacífico','Índico','Ártico'], correcta:1 },
    { pregunta:'¿Cómo se llama la capital de España?', opciones:['Barcelona','Madrid','Sevilla','Valencia'], correcta:1 },
    { pregunta:'¿Qué país tiene forma de bota?', opciones:['Francia','Italia','España','Grecia'], correcta:1, imagen:'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Italy_topographic_map-blank.svg/320px-Italy_topographic_map-blank.svg.png', fuente:'Wikimedia Commons' },
    { pregunta:'¿Cuántas comunidades autónomas tiene España?', opciones:['15','17','19','21'], correcta:1 },
    { pregunta:'¿Dónde viven los pingüinos?', opciones:['Polo Norte','Polo Sur','Madagascar','Australia'], correcta:1, imagen:'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Emperor_Penguin_Manchot_empereur.jpg/320px-Emperor_Penguin_Manchot_empereur.jpg', fuente:'Wikimedia Commons' },
    { pregunta:'¿Qué río pasa por Zaragoza?', opciones:['Tajo','Duero','Ebro','Guadalquivir'], correcta:2 },
    { pregunta:'¿Qué mar baña la costa este de España?', opciones:['Cantábrico','Mediterráneo','Atlántico','Báltico'], correcta:1 },
    { pregunta:'¿Cuál es la isla más grande de Baleares?', opciones:['Ibiza','Menorca','Formentera','Mallorca'], correcta:3 },
    { pregunta:'¿En qué continente viven los canguros?', opciones:['Asia','África','Oceanía','América'], correcta:2 },
    { pregunta:'¿Qué océano baña las costas de Galicia?', opciones:['Mediterráneo','Cantábrico','Atlántico','Pacífico'], correcta:2 },
    { pregunta:'¿Cuál es la montaña más alta de España?', opciones:['Mulhacén','Aneto','Teide','Veleta'], correcta:2 },
    { pregunta:'¿Qué país tiene la Gran Muralla?', opciones:['Japón','India','China','Corea'], correcta:2 },
    { pregunta:'¿Dónde está la Estatua de la Libertad?', opciones:['Londres','París','Nueva York','Roma'], correcta:2 },
    { pregunta:'¿Qué río es el más largo del mundo?', opciones:['Amazonas','Nilo','Yangtsé','Misisipi'], correcta:1 },
    { pregunta:'¿Cuál es la capital de Francia?', opciones:['Londres','París','Madrid','Berlín'], correcta:1 },
    { pregunta:'¿Las Islas Canarias están en el océano...?', opciones:['Mediterráneo','Cantábrico','Atlántico','Pacífico'], correcta:2 },
    // Niveles 2-3
    { pregunta:'¿Qué país tiene más habitantes?', opciones:['India','China','EEUU','Brasil'], correcta:0 },
    { pregunta:'¿Cuál es el país más grande del mundo?', opciones:['Canadá','China','Rusia','EEUU'], correcta:2 },
    { pregunta:'¿Qué es una península?', opciones:['Tierra rodeada de agua','Tierra unida por un istmo','Una isla pequeña','Un río grande'], correcta:1 },
    { pregunta:'¿Qué comunidad autónoma es la más grande?', opciones:['Andalucía','Castilla y León','Cataluña','Aragón'], correcta:1 },
    { pregunta:'¿Qué lengua se habla en Brasil?', opciones:['Español','Portugués','Inglés','Francés'], correcta:1 },
    { pregunta:'¿Dónde están las pirámides de Egipto?', opciones:['El Cairo','Giza','Alejandría','Luxor'], correcta:1 },
    { pregunta:'¿Qué río pasa por Sevilla?', opciones:['Tajo','Duero','Ebro','Guadalquivir'], correcta:3 },
    { pregunta:'¿Cuál es la capital de Reino Unido?', opciones:['Dublín','Londres','Edimburgo','Cardiff'], correcta:1 },
  ].filter(q => Math.abs(d - (q.correcta <= 2 ? 1 : q.correcta <= 3 ? 2 : 3)) <= 1);
}

function geo_9_11(d) {
  return [
    { pregunta:'¿Cuál es la cordillera más larga del mundo?', opciones:['Alpes','Andes','Himalaya','Rocosas'], correcta:1 },
    { pregunta:'¿Qué estrecho separa España de Marruecos?', opciones:['Bósforo','Gibraltar','Dardanelos','Malaca'], correcta:1 },
    { pregunta:'¿Cuál es la capital de Australia?', opciones:['Sídney','Canberra','Melbourne','Perth'], correcta:1 },
    { pregunta:'¿Cuántos países hay en Sudamérica?', opciones:['10','12','13','15'], correcta:1 },
    { pregunta:'¿Qué río atraviesa Londres?', opciones:['Sena','Támesis','Danubio','Rin'], correcta:1 },
    { pregunta:'¿En qué comunidad autónoma está el Parque Nacional de Doñana?', opciones:['Andalucía','Extremadura','Castilla-La Mancha','Murcia'], correcta:0 },
    { pregunta:'¿Cuál es el desierto más grande del mundo?', opciones:['Sáhara','Gobi','Antártida','Kalahari'], correcta:2 },
    { pregunta:'¿Qué país NO tiene costa?', opciones:['Suiza','Italia','España','Portugal'], correcta:0 },
    { pregunta:'¿Dónde nace el río Ebro?', opciones:['Pirineos','Sierra Nevada','Cordillera Cantábrica','Sistema Ibérico'], correcta:2 },
    { pregunta:'¿Qué archipiélago pertenece a Portugal?', opciones:['Canarias','Azores','Baleares','Cabo Verde'], correcta:1 },
    { pregunta:'¿Cuál es el lago más grande de África?', opciones:['Tanganica','Malaui','Victoria','Chad'], correcta:2 },
    { pregunta:'¿Qué país europeo tiene más islas?', opciones:['Grecia','Suecia','Noruega','Finlandia'], correcta:1 },
    { pregunta:'¿Cuál es la capital de Japón?', opciones:['Osaka','Kioto','Tokio','Hiroshima'], correcta:2 },
    { pregunta:'¿Qué río es frontera entre España y Portugal?', opciones:['Guadiana','Tajo','Duero','Miño'], correcta:2 },
    { pregunta:'¿Qué país tiene el Canal de Panamá?', opciones:['Panamá','Colombia','Costa Rica','Nicaragua'], correcta:0 },
    { pregunta:'¿Cuál es el pico más alto de los Pirineos?', opciones:['Aneto','Monte Perdido','Posets','Vignemale'], correcta:0 },
    { pregunta:'¿Qué comunidad autónoma tiene dos provincias?', opciones:['Madrid','Murcia','La Rioja','Navarra'], correcta:0 },
    { pregunta:'¿Dónde está el Mar Muerto?', opciones:['Egipto-Israel','Jordania-Israel','Líbano-Siria','Irak-Irán'], correcta:1 },
    // Niveles 4-6
    { pregunta:'¿Qué clima predomina en la España mediterránea?', opciones:['Oceánico','Continental','Mediterráneo','Subtropical'], correcta:2 },
    { pregunta:'¿Cuál es la densidad de población de Mongolia?', opciones:['Muy alta','Alta','Media','Muy baja'], correcta:3 },
    { pregunta:'¿Qué país es el mayor productor de café?', opciones:['Colombia','Brasil','Vietnam','Etiopía'], correcta:1 },
    { pregunta:'¿Qué río europeo pasa por más países?', opciones:['Danubio','Rin','Volga','Sena'], correcta:0 },
    { pregunta:'¿Dónde está la selva del Congo?', opciones:['África central','Sudamérica','Sudeste asiático','Oceanía'], correcta:0 },
    { pregunta:'¿Cuál es la provincia más poblada de España?', opciones:['Madrid','Barcelona','Valencia','Sevilla'], correcta:0 },
  ].filter(q => Math.abs(d - (d <= 3 ? d : d <= 6 ? 4 : 7)) <= 2);
}

function geo_12_15(d) {
  return [
    { pregunta:'¿Qué país tiene el PIB más alto del mundo?', opciones:['China','EEUU','Japón','Alemania'], correcta:1 },
    { pregunta:'¿Cuál es la capital de Burkina Faso?', opciones:['Uagadugú','Bamako','Niamey','Dakar'], correcta:0 },
    { pregunta:'¿Qué es la dorsal mesoatlántica?', opciones:['Una montaña','Cordillera submarina','Un desierto','Un tipo de clima'], correcta:1 },
    { pregunta:'¿Qué país alberga el mayor número de refugiados?', opciones:['Turquía','Alemania','Pakistán','Uganda'], correcta:0 },
    { pregunta:'¿Cuál es la región más septentrional de España?', opciones:['Galicia','Asturias','Cantabria','País Vasco'], correcta:0 },
    { pregunta:'¿Qué tipo de clima tiene la mayor parte de Rusia?', opciones:['Mediterráneo','Continental','Desértico','Tropical'], correcta:1 },
    { pregunta:'¿Dónde se encuentra el Triángulo de las Bermudas?', opciones:['Pacífico Sur','Atlántico Norte','Índico','Mar Caribe'], correcta:1 },
    { pregunta:'¿Cuál es el país con más husos horarios?', opciones:['EEUU','Rusia','Francia','Reino Unido'], correcta:2 },
    { pregunta:'¿Qué es un fiordo?', opciones:['Un río','Valle glaciar inundado','Una isla','Un tipo de costa'], correcta:1 },
    { pregunta:'¿Cuál es la cuenca hidrográfica más grande de España?', opciones:['Ebro','Duero','Tajo','Guadalquivir'], correcta:1 },
    { pregunta:'¿Qué país NO forma parte del G7?', opciones:['Canadá','Italia','España','Japón'], correcta:2 },
    { pregunta:'¿Cuál es la capital de Bután?', opciones:['Timbu','Katmandú','Daca','Naypyidaw'], correcta:0 },
    { pregunta:'¿Qué es la Línea Verde en Chipre?', opciones:['Un parque','Zona desmilitarizada','Un río','Una carretera'], correcta:1 },
    { pregunta:'¿Qué estrecho comunica el Mar Negro con el Mediterráneo?', opciones:['Gibraltar','Bósforo','Ormuz','Malaca'], correcta:1 },
    { pregunta:'¿Dónde se encuentra la taiga?', opciones:['África','Sudamérica','Siberia y Canadá','Oceanía'], correcta:2 },
    { pregunta:'¿Qué comunidad autónoma tiene lengua cooficial distinta al castellano?', opciones:['Andalucía','Murcia','Galicia','Castilla y León'], correcta:2 },
    { pregunta:'¿Qué tipo de relieve predomina en la Meseta Central?', opciones:['Montañoso','Costero','Llanura elevada','Valle fluvial'], correcta:2 },
    { pregunta:'¿Qué porcentaje de agua dulce tiene el planeta?', opciones:['0.5%','2.5%','5%','10%'], correcta:1 },
  ].filter(q => Math.abs(d - (d <= 5 ? d : d <= 8 ? 6 : 9)) <= 2);
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXÁMENES FINALES — Niveles 15 (6-11 años) / 35 (12-15 años)
// ═══════════════════════════════════════════════════════════════════════════

export const EXAMENES_FINALES = {
  matematicas: {
    nombre: 'Matemáticas',
    nivel_requerido: { '6-8': 10, '9-11': 10, '12-15': 10 },
    examen_nivel: { '6-8': 15, '9-11': 15, '12-15': 35 },
    preguntas: 15,
    aprobado_min: 70
  },
  calculo_mental: {
    nombre: 'Cálculo Mental',
    nivel_requerido: { '6-8': 8, '9-11': 8, '12-15': 10 },
    examen_nivel: { '6-8': 15, '9-11': 20, '12-15': 35 },
    preguntas: 10,
    aprobado_min: 80
  },
  lengua: {
    nombre: 'Lengua',
    nivel_requerido: { '6-8': 10, '9-11': 10, '12-15': 10 },
    examen_nivel: { '6-8': 15, '9-11': 20, '12-15': 35 },
    preguntas: 15,
    aprobado_min: 70
  },
  medio: {
    nombre: 'Medio',
    nivel_requerido: { '6-8': 10, '9-11': 10, '12-15': 10 },
    examen_nivel: { '6-8': 15, '9-11': 20, '12-15': 35 },
    preguntas: 15,
    aprobado_min: 70
  },
  geografia: {
    nombre: 'Geografía',
    nivel_requerido: { '6-8': 8, '9-11': 10, '12-15': 10 },
    examen_nivel: { '6-8': 15, '9-11': 20, '12-15': 35 },
    preguntas: 15,
    aprobado_min: 70
  }
};

/**
 * Rango de edad para adaptar dificultad
 */
export function getRangoEdad(edad) {
  if (edad <= 8) return '6-8';
  if (edad <= 11) return '9-11';
  return '12-15';
}

/**
 * Costo de desbloqueo por nivel (2 al 35)
 */
export const COSTO_DESBLOQUEO_POR_NIVEL = {
  2:10, 3:25, 4:50, 5:75, 6:100, 7:150, 8:200, 9:300, 10:500,
  11:750, 12:1000, 13:1500, 14:2000, 15:3000, 16:4000, 17:5000,
  18:6000, 19:7500, 20:9000, 21:10000, 22:12000, 23:14000,
  24:16000, 25:18000, 26:20000, 27:22000, 28:25000, 29:28000,
  30:30000, 31:35000, 32:40000, 33:45000, 34:50000, 35:60000
};
