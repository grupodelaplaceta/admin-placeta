/**
 * PLANTILLAS DOCUMENTALES BANCO DE LA PLACETA
 * Documentos BLP-B-001 a BLP-B-010
 * Basado en Código Normativo Interno del Grupo de La Placeta
 * 
 * Cada función recibe (datos, L, cf, sf, tx, ln, hoy) y devuelve L
 * L = array de objetos {seccion, campo, texto, linea, nota}
 */

// ── Helper: bloque de firma ──────────────────────────────────────────────
function firma(L, cf, ln, sf, cargo, datos = {}) {
  ln(); sf(`FIRMA — ${cargo}`);
  cf('Nombre', datos.nombre || '______________________');
  if (datos.dip) cf('DIP', datos.dip || '______________________');
  if (datos.cargo) cf('Cargo', datos.cargo);
  if (datos.numEmpleado) cf('Número de empleado', datos.numEmpleado);
  cf('Firma electrónica PlacetaID', '______________________');
  cf('Fecha', datos.fecha || '____ / ____ / ______');
}

// ── Helper: validación del documento ──────────────────────────────────────
function validacion(L, cf, ln, sf, uuid, hash, csv) {
  ln(); sf('VALIDACIÓN DEL DOCUMENTO');
  cf('Identificador único (UUID)', uuid || '______________________');
  cf('Hash SHA-256', hash || '______________________');
  cf('Código Seguro de Verificación (CSV)', csv || '______________________');
  L.push({nota: 'Código QR de autenticidad: (Área reservada para QR)'});
}

// ── Helper: pie de documento ──────────────────────────────────────────────
function pie(L, sf, tx, codigo, titulo) {
  ln(); sf('PIE DE DOCUMENTO');
  tx('BANCO DE LA PLACETA');
  tx(`Documento Oficial ${codigo} – ${titulo}`);
  L.push({nota: `El presente documento ha sido generado electrónicamente por el Banco de La Placeta. Su autenticidad podrá verificarse mediante el Código Seguro de Verificación (CSV) o el código QR incorporado. Solo tendrá plena validez jurídica cuando conste en estado OFICIAL, figure inscrito en el Registro Electrónico del Banco de La Placeta y esté firmado electrónicamente mediante PlacetaID.`});
}

// ── Helper: protección de datos ───────────────────────────────────────────
function proteccionDatos(L, sf, tx) {
  ln(); sf('PROTECCIÓN DE DATOS');
  tx('Los datos personales contenidos en este expediente serán tratados por el Banco de La Placeta con la finalidad de gestionar la relación bancaria, ejecutar las operaciones solicitadas, cumplir las obligaciones legales y mantener los registros de auditoría y seguridad.');
  tx('El tratamiento se realizará conforme al Reglamento (UE) 2016/679 (RGPD), la Ley Orgánica 3/2018 (LOPDGDD) y el Código Normativo Interno del Grupo de La Placeta. El titular podrá ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y demás derechos reconocidos por la normativa aplicable mediante solicitud dirigida a la Administración de La Placeta.');
}

// ── Helper: recursos ──────────────────────────────────────────────────────
function recursos(L, sf, tx) {
  ln(); sf('RECURSOS');
  tx('Contra la presente resolución podrá interponerse reclamación administrativa ante el Banco de La Placeta en los términos establecidos por el Código Normativo Interno. La interposición del recurso no suspenderá por sí misma los efectos de la resolución, salvo resolución expresa en contrario.');
}

// ═══════════════════════════════════════════════════════════════════════════
// BLP-B-001: CONTRATO DE APERTURA DE CUENTA BANCARIA
// ═══════════════════════════════════════════════════════════════════════════
export function plantillaAperturaCuenta(datos, L, cf, sf, tx, ln, hoy) {
  sf('DATOS DEL TITULAR');
  sf('Persona física');
  cf('Nombre y apellidos', datos.titular || datos.nombre || '______________________');
  cf('Número DIP', datos.dip || '______________________');
  cf('PlacetaID', datos.placeid || datos.placetaId || '______________________');
  cf('Fecha de nacimiento', datos.fechaNacimiento || '______________________');
  cf('Edad', datos.edad ? String(datos.edad) : '______________________');
  cf('Correo electrónico', datos.email || '______________________');
  cf('Teléfono', datos.telefono || '______________________');
  ln();
  sf('Persona jurídica (si procede)');
  cf('Razón social', datos.razonSocial || '—');
  cf('Número EIP', datos.eip || '—');
  cf('Representante', datos.representante || '—');
  cf('DIP del representante', datos.dipRepresentante || '—');
  ln();
  sf('DATOS DE LA CUENTA');
  cf('Número IBAN', datos.iban || `PLXX XXXX XXXX XXXX XXXX XXXX`);
  cf('Tipo de cuenta', datos.tipoCuenta || datos.tipo || 'Particular');
  cf('Régimen', datos.regimen || 'General');
  cf('Fecha de apertura', datos.fechaApertura || hoy);
  cf('Estado', datos.estado || 'Activa');
  ln();
  sf('EXPONE');
  tx('Comparece el solicitante anteriormente identificado solicitando la apertura de una cuenta bancaria en el Banco de La Placeta.');
  tx('La solicitud ha sido presentada mediante autenticación electrónica utilizando PlacetaID, quedando acreditada la identidad del interesado mediante su Documento de Identidad de La Placeta (DIP) o, en el caso de personas jurídicas, mediante su Identificador de Empresa de La Placeta (EIP).');
  tx('Realizadas las comprobaciones automáticas previstas por el Banco de La Placeta y verificándose que el solicitante cumple los requisitos establecidos por el Código Normativo Interno para la apertura de cuentas bancarias, procede iniciar el presente expediente administrativo.');
  ln();
  sf('FUNDAMENTOS JURÍDICOS');
  tx('La presente resolución se fundamenta en:');
  cf('Artículo 5', 'PlacetaID como sistema oficial de autenticación.');
  cf('Artículo 6', 'Documento de Identidad de La Placeta (DIP).');
  cf('Artículo 7', 'Tipos de cuentas bancarias.');
  cf('Artículo 8', 'Bono de bienvenida.');
  cf('Artículo 4.1', 'Límites máximos de capital.');
  cf('Artículo 4.2', 'Régimen de descubiertos.');
  cf('Artículo 4.3', 'Tasas bancarias.');
  cf('Artículo 4.4', 'IVA.');
  cf('Artículo 4.10', 'Impuesto de Regulación Monetaria.');
  cf('Artículo 4.13', 'Impuesto de Grandes Fortunas.');
  tx('Todo ello conforme al Código Normativo Interno del Grupo de La Placeta.');
  ln();
  sf('RESUELVE');
  tx('Primero. Autorizar la apertura de la cuenta bancaria anteriormente identificada.');
  tx('Segundo. Asignar el IBAN indicado en este documento como identificador único de la cuenta.');
  tx('Tercero. Vincular la cuenta al DIP o EIP indicado.');
  tx('Cuarto. Aplicar automáticamente el régimen bancario correspondiente según la edad del titular o el tipo de entidad.');
  tx('Quinto. Aplicar las limitaciones económicas previstas por la normativa vigente.');
  tx('Sexto. En caso de tratarse de una alta inicial, abonar automáticamente el bono de bienvenida correspondiente, siempre que se cumplan los requisitos establecidos por la normativa.');
  tx('Séptimo. Registrar la apertura en el Registro Bancario Oficial.');
  ln();
  sf('DERECHOS DEL TITULAR');
  tx('El titular podrá:');
  tx('• Consultar su saldo. • Realizar operaciones autorizadas. • Contratar nuevos productos. • Solicitar certificados. • Presentar reclamaciones. • Solicitar el bloqueo voluntario. • Solicitar el cierre de la cuenta.');
  ln();
  sf('OBLIGACIONES DEL TITULAR');
  tx('El titular se obliga a:');
  tx('• Mantener actualizados sus datos. • Custodiar sus credenciales PlacetaID. • Cumplir la normativa bancaria. • Cumplir la normativa tributaria. • No utilizar la cuenta para operaciones fraudulentas. • Comunicar cualquier uso indebido.');
  proteccionDatos(L, sf, tx);
  firma(L, cf, ln, sf, 'Gestor Bancario', { nombre: datos.gestorNombre, dip: datos.gestorDip });
  firma(L, cf, ln, sf, 'Administrador (si procede)', { nombre: datos.adminNombre, cargo: datos.adminCargo });
  firma(L, cf, ln, sf, 'Titular', { nombre: datos.titular || datos.nombre });
  validacion(L, cf, ln, sf, datos.uuid, datos.hash, datos.csv);
  pie(L, sf, tx, 'BLP-B-001', 'Contrato de Apertura de Cuenta Bancaria');
  return L;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLP-B-002: CONTRATO DE MODIFICACIÓN DE CUENTA BANCARIA
// ═══════════════════════════════════════════════════════════════════════════
export function plantillaModificacionCuenta(datos, L, cf, sf, tx, ln, hoy) {
  sf('DATOS DEL TITULAR');
  sf('Persona física');
  cf('Nombre y apellidos', datos.titular || datos.nombre || '______________________');
  cf('DIP', datos.dip || '______________________');
  cf('PlacetaID', datos.placeid || datos.placetaId || '______________________');
  cf('Correo electrónico', datos.email || '______________________');
  cf('Teléfono', datos.telefono || '______________________');
  ln(); sf('Persona jurídica (si procede)');
  cf('Razón social', datos.razonSocial || '—');
  cf('Número EIP', datos.eip || '—');
  cf('Representante legal', datos.representante || '—');
  cf('DIP del representante', datos.dipRepresentante || '—');
  ln(); sf('DATOS DE LA CUENTA');
  cf('IBAN', datos.iban || '______________________');
  cf('Tipo actual', datos.tipoCuenta || datos.tipo || 'Particular');
  cf('Estado actual', datos.estado || 'Activa');
  cf('Fecha de apertura', datos.fechaApertura || hoy);
  ln(); sf('MODIFICACIONES SOLICITADAS');
  const mods = datos.modificaciones || [];
  ['Cambio de titular','Cambio de cotitulares','Modificación EIP','Cambio de régimen','Conversión a ahorro','Cambio clasificación','Actualización datos personales','Actualización domicilio','Actualización email','Actualización teléfono','Modificación autorizados','Modificación límites'].forEach(m => {
    cf(`☐ ${m}`, mods.includes(m) ? '✓' : '');
  });
  if (datos.otrasModificaciones) cf('Otras modificaciones', datos.otrasModificaciones);
  ln(); sf('EXPONE');
  tx('Comparece la persona identificada en el presente expediente solicitando la modificación de los datos asociados a la cuenta bancaria anteriormente indicada.');
  tx('La identidad del solicitante ha sido verificada mediante el sistema oficial de autenticación PlacetaID. El Banco de La Placeta ha comprobado la titularidad de la cuenta, la legitimación para solicitar la modificación y el cumplimiento de los requisitos establecidos en el Código Normativo Interno.');
  tx('Las modificaciones únicamente producirán efectos una vez aprobadas por el órgano competente y registradas en el Sistema Bancario Oficial.');
  ln(); sf('INFORME DE COMPROBACIONES');
  ['Verificación autenticidad PlacetaID','Vigencia DIP/EIP','Titularidad de la cuenta','Bloqueos administrativos','Régimen bancario aplicable','Procedimientos tributarios','Límites legales de capital','Incidencias abiertas'].forEach(c => cf('☑ ' + c, 'Automática'));
  ln(); sf('FUNDAMENTOS JURÍDICOS');
  tx('La presente modificación se fundamenta en las disposiciones del Código Normativo Interno relativas a la identificación mediante PlacetaID, la gestión de cuentas bancarias, los tipos de cuentas, la vinculación de titulares y empresas, así como las facultades de administración y control del Banco de La Placeta.');
  ln(); sf('RESUELVE');
  tx('Primero. Autorizar la modificación de los datos de la cuenta bancaria descritos en el presente expediente.');
  tx('Segundo. Actualizar el Registro Bancario Oficial con las modificaciones aprobadas.');
  tx('Tercero. Mantener inalteradas todas aquellas condiciones contractuales que no hayan sido expresamente modificadas.');
  tx('Cuarto. Registrar automáticamente esta actuación en el historial de auditoría del Banco de La Placeta.');
  tx('Quinto. Notificar electrónicamente la resolución al titular mediante PlacetaID.');
  proteccionDatos(L, sf, tx);
  firma(L, cf, ln, sf, 'Gestor Bancario', { nombre: datos.gestorNombre, dip: datos.gestorDip });
  firma(L, cf, ln, sf, 'Administrador del Banco (cuando proceda)', { nombre: datos.adminNombre, cargo: datos.adminCargo });
  firma(L, cf, ln, sf, 'Titular de la cuenta', { nombre: datos.titular || datos.nombre });
  validacion(L, cf, ln, sf, datos.uuid, datos.hash, datos.csv);
  pie(L, sf, tx, 'BLP-B-002', 'Contrato de Modificación de Cuenta Bancaria');
  return L;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLP-B-003: CAMBIO DE TITULARIDAD
// ═══════════════════════════════════════════════════════════════════════════
export function plantillaCambioTitularidad(datos, L, cf, sf, tx, ln, hoy) {
  sf('DATOS DE LA CUENTA');
  cf('IBAN', datos.iban || '______________________');
  cf('Tipo de cuenta', datos.tipoCuenta || datos.tipo || 'Particular');
  cf('Fecha de apertura', datos.fechaApertura || hoy);
  cf('Estado', datos.estado || 'Activa');
  ln(); sf('TITULAR ACTUAL');
  cf('Nombre y apellidos', datos.titularSaliente || '______________________');
  cf('Número DIP', datos.dipSaliente || '______________________');
  cf('Correo electrónico', datos.emailSaliente || '______________________');
  ln(); sf('NUEVO TITULAR');
  cf('Nombre y apellidos', datos.titularEntrante || '______________________');
  cf('Número DIP', datos.dipEntrante || '______________________');
  cf('Correo electrónico', datos.emailEntrante || '______________________');
  ln(); sf('MOTIVO DEL CAMBIO');
  cf('Motivo', datos.motivo || 'Cesión voluntaria');
  if (datos.descripcionMotivo) tx(datos.descripcionMotivo);
  ln(); sf('EXPONE');
  tx('Comparecen las personas anteriormente identificadas manifestando su voluntad de modificar la titularidad de la cuenta bancaria descrita en este expediente.');
  tx('El Banco de La Placeta ha verificado la identidad de todas las partes mediante el sistema oficial de autenticación PlacetaID y ha comprobado que la solicitud cumple los requisitos establecidos por el Código Normativo Interno.');
  ln(); sf('EFECTOS DEL CAMBIO');
  tx('• El nuevo titular asumirá todos los derechos derivados de la cuenta.');
  tx('• El nuevo titular asumirá todas las obligaciones futuras derivadas de la utilización de la cuenta.');
  tx('• El historial de operaciones permanecerá íntegro.');
  tx('• El Banco conservará la trazabilidad histórica de la titularidad.');
  tx('• El cambio no alterará el número IBAN salvo resolución expresa.');
  ln(); sf('FUNDAMENTOS JURÍDICOS');
  tx('La presente resolución se adopta de conformidad con las disposiciones del Código Normativo Interno reguladoras del sistema PlacetaID, la identificación mediante DIP y EIP, la gestión de cuentas bancarias y las facultades del Banco de La Placeta para modificar la titularidad de las cuentas.');
  ln(); sf('RESUELVE');
  tx('Primero. Autorizar el cambio de titularidad de la cuenta bancaria.');
  tx('Segundo. Dar de baja como titular principal al anterior titular, manteniendo el registro histórico.');
  tx('Tercero. Inscribir como nuevo titular al ciudadano identificado en este documento.');
  tx('Cuarto. Actualizar automáticamente los sistemas bancarios, tributarios y administrativos.');
  tx('Quinto. Notificar electrónicamente la resolución a todas las personas afectadas mediante PlacetaID.');
  proteccionDatos(L, sf, tx);
  recursos(L, sf, tx);
  firma(L, cf, ln, sf, 'Titular saliente', { nombre: datos.titularSaliente, dip: datos.dipSaliente });
  firma(L, cf, ln, sf, 'Nuevo titular', { nombre: datos.titularEntrante, dip: datos.dipEntrante });
  firma(L, cf, ln, sf, 'Gestor Bancario', { nombre: datos.gestorNombre, dip: datos.gestorDip });
  firma(L, cf, ln, sf, 'Administrador del Banco (cuando proceda)', { nombre: datos.adminNombre, cargo: datos.adminCargo });
  validacion(L, cf, ln, sf, datos.uuid, datos.hash, datos.csv);
  pie(L, sf, tx, 'BLP-B-003', 'Contrato de Cambio de Titularidad de Cuenta Bancaria');
  return L;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLP-B-004: INCORPORACIÓN DE COTITULAR
// ═══════════════════════════════════════════════════════════════════════════
export function plantillaIncorporacionCotitular(datos, L, cf, sf, tx, ln, hoy) {
  sf('DATOS DE LA CUENTA');
  cf('IBAN', datos.iban || '______________________');
  cf('Tipo de cuenta', datos.tipoCuenta || datos.tipo || 'Particular');
  cf('Fecha de apertura', datos.fechaApertura || hoy);
  cf('Estado', datos.estado || 'Activa');
  ln(); sf('TITULAR PRINCIPAL');
  cf('Nombre', datos.titular || '______________________');
  cf('DIP', datos.dip || '______________________');
  cf('Correo electrónico', datos.email || '______________________');
  ln(); sf('NUEVO COTITULAR');
  cf('Nombre', datos.cotitular || '______________________');
  cf('DIP', datos.dipCotitular || '______________________');
  cf('Correo electrónico', datos.emailCotitular || '______________________');
  cf('Fecha de nacimiento', datos.fechaNacimientoCotitular || '______________________');
  ln(); sf('TIPO DE COTITULARIDAD');
  const tipos = ['Plenos derechos','Autorizado sin cierre','Autorización limitada','Temporal','Administrativo'];
  (datos.tipoCotitularidad || ['Plenos derechos']).forEach(t => cf(`☐ ${t}`, ''));
  ln(); sf('FACULTADES DEL COTITULAR');
  const facultades = datos.facultades || ['Consultar saldo','Consultar movimientos'];
  ['Consultar saldo','Consultar movimientos','Realizar transferencias','Emitir pagos','Recibir ingresos','Solicitar certificados','Contratar productos','Solicitar tarjetas','Modificar límites','Solicitar bloqueo','Firmar operaciones'].forEach(f => {
    cf(`☐ ${f}`, facultades.includes(f) ? '✓' : '');
  });
  ln(); sf('EXPONE');
  tx('Comparece el titular principal de la cuenta bancaria solicitando la incorporación de un nuevo cotitular.');
  tx('La solicitud ha sido presentada mediante autenticación electrónica utilizando PlacetaID por ambas partes, quedando acreditada su identidad mediante el DIP.');
  ln(); sf('FUNDAMENTOS JURÍDICOS');
  tx('La incorporación de un cotitular se realiza al amparo de las disposiciones del Código Normativo Interno relativas a la identificación electrónica mediante PlacetaID, la gestión de cuentas bancarias y la vinculación de personas físicas y jurídicas.');
  ln(); sf('RESUELVE');
  tx('Primero. Autorizar la incorporación del ciudadano identificado como cotitular de la cuenta bancaria.');
  tx('Segundo. Inscribir la modificación en el Registro Bancario Oficial.');
  tx('Tercero. Asignar al nuevo cotitular las facultades expresamente autorizadas.');
  tx('Cuarto. Registrar electrónicamente la presente actuación en el historial permanente de la cuenta.');
  proteccionDatos(L, sf, tx);
  firma(L, cf, ln, sf, 'Titular principal', { nombre: datos.titular, dip: datos.dip });
  firma(L, cf, ln, sf, 'Nuevo cotitular', { nombre: datos.cotitular, dip: datos.dipCotitular });
  firma(L, cf, ln, sf, 'Gestor Bancario', { nombre: datos.gestorNombre });
  validacion(L, cf, ln, sf, datos.uuid, datos.hash, datos.csv);
  pie(L, sf, tx, 'BLP-B-004', 'Contrato de Incorporación de Cotitular de Cuenta Bancaria');
  return L;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLP-B-005: DESVINCULACIÓN DE COTITULAR
// ═══════════════════════════════════════════════════════════════════════════
export function plantillaDesvinculacionCotitular(datos, L, cf, sf, tx, ln, hoy) {
  sf('DATOS DE LA CUENTA');
  cf('IBAN', datos.iban || '______________________');
  cf('Tipo de cuenta', datos.tipoCuenta || datos.tipo || 'Particular');
  cf('Estado', datos.estado || 'Activa');
  cf('Fecha de apertura', datos.fechaApertura || hoy);
  ln(); sf('TITULAR PRINCIPAL');
  cf('Nombre', datos.titular || '______________________');
  cf('DIP', datos.dip || '______________________');
  ln(); sf('COTITULAR A DESVINCULAR');
  cf('Nombre', datos.cotitular || '______________________');
  cf('DIP', datos.dipCotitular || '______________________');
  cf('Fecha de incorporación', datos.fechaIncorporacion || '______________________');
  ln(); sf('MOTIVO DE LA DESVINCULACIÓN');
  cf('Motivo', datos.motivo || 'Solicitud voluntaria');
  if (datos.descripcionMotivo) tx(datos.descripcionMotivo);
  ln(); sf('EXPONE');
  tx('Comparece la persona legitimada para promover el presente procedimiento solicitando la desvinculación del cotitular anteriormente identificado respecto de la cuenta bancaria indicada.');
  tx('La desvinculación no afectará a la validez de las operaciones realizadas con anterioridad a la fecha de efectividad de la presente resolución.');
  ln(); sf('FUNDAMENTOS JURÍDICOS');
  tx('La presente actuación se fundamenta en las disposiciones del Código Normativo Interno relativas a la identificación mediante PlacetaID, la gestión de cuentas bancarias, la modificación de la titularidad y cotitularidad de cuentas, y las facultades de administración del Banco de La Placeta.');
  ln(); sf('RESUELVE');
  tx('Primero. Autorizar la desvinculación del cotitular identificado.');
  tx('Segundo. Cancelar sus facultades de actuación sobre la cuenta bancaria.');
  tx('Tercero. Mantener íntegro el historial de operaciones realizadas con anterioridad.');
  tx('Cuarto. Actualizar el Registro Bancario Oficial y los permisos asociados al PlacetaID.');
  tx('Quinto. Notificar electrónicamente la presente resolución mediante PlacetaID.');
  proteccionDatos(L, sf, tx);
  recursos(L, sf, tx);
  firma(L, cf, ln, sf, 'Titular principal', { nombre: datos.titular, dip: datos.dip });
  firma(L, cf, ln, sf, 'Cotitular (cuando proceda)', { nombre: datos.cotitular, dip: datos.dipCotitular });
  firma(L, cf, ln, sf, 'Gestor Bancario', { nombre: datos.gestorNombre });
  validacion(L, cf, ln, sf, datos.uuid, datos.hash, datos.csv);
  pie(L, sf, tx, 'BLP-B-005', 'Contrato de Desvinculación de Cotitular de Cuenta Bancaria');
  return L;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLP-B-006: VINCULACIÓN DE EMPRESA (EIP) A CUENTA BANCARIA
// ═══════════════════════════════════════════════════════════════════════════
export function plantillaVinculacionEIP(datos, L, cf, sf, tx, ln, hoy) {
  sf('DATOS DE LA CUENTA BANCARIA');
  cf('IBAN', datos.iban || '______________________');
  cf('Tipo de cuenta', datos.tipoCuenta || 'Empresa');
  cf('Estado', datos.estado || 'Activa');
  cf('Fecha de apertura', datos.fechaApertura || hoy);
  ln(); sf('DATOS DE LA EMPRESA');
  cf('Denominación social', datos.razonSocial || datos.nombre || '______________________');
  cf('Número EIP', datos.eip || '______________________');
  cf('Actividad económica', datos.actividad || '______________________');
  cf('Fecha de constitución', datos.fechaConstitucion || '______________________');
  cf('Estado registral', datos.estadoRegistral || 'Activa');
  ln(); sf('REPRESENTANTE LEGAL');
  cf('Nombre', datos.representante || '______________________');
  cf('DIP', datos.dipRepresentante || '______________________');
  cf('Cargo', datos.cargoRepresentante || '______________________');
  ln(); sf('TIPO DE VINCULACIÓN');
  cf('Tipo', datos.tipoVinculacion || 'Titular principal');
  ln(); sf('EXPONE');
  tx('Comparece el representante legal anteriormente identificado, actuando en nombre y representación de la empresa indicada, solicitando la vinculación de la entidad al Banco de La Placeta mediante la cuenta bancaria descrita.');
  tx('Realizadas las comprobaciones reglamentarias, el Banco de La Placeta considera que concurren los requisitos necesarios para proceder a la vinculación empresarial.');
  ln(); sf('FUNDAMENTOS JURÍDICOS');
  tx('La presente vinculación empresarial se autoriza conforme a las disposiciones del Código Normativo Interno reguladoras del Registro Empresarial mediante EIP, la representación legal de personas jurídicas, la contratación de productos bancarios por empresas y las obligaciones tributarias y financieras asociadas.');
  ln(); sf('RÉGIMEN FISCAL');
  cf('Tipo', datos.regimenFiscal || 'General');
  cf('IVA declarado', datos.ivaDeclarado ? 'Sí' : 'No');
  cf('Periodicidad', datos.periodicidad || 'Mensual');
  ln(); sf('RESUELVE');
  tx('Primero. Autorizar la vinculación de la empresa identificada mediante EIP a la cuenta bancaria descrita.');
  tx('Segundo. Inscribir la empresa como titular o entidad autorizada en el Registro Bancario Oficial.');
  tx('Tercero. Vincular automáticamente los productos bancarios seleccionados.');
  tx('Cuarto. Notificar electrónicamente la resolución al representante legal mediante PlacetaID.');
  proteccionDatos(L, sf, tx);
  recursos(L, sf, tx);
  firma(L, cf, ln, sf, 'Representante legal de la empresa', { nombre: datos.representante, dip: datos.dipRepresentante });
  firma(L, cf, ln, sf, 'Gestor Bancario', { nombre: datos.gestorNombre });
  firma(L, cf, ln, sf, 'Administrador del Banco', { nombre: datos.adminNombre, cargo: datos.adminCargo });
  validacion(L, cf, ln, sf, datos.uuid, datos.hash, datos.csv);
  pie(L, sf, tx, 'BLP-B-006', 'Contrato de Vinculación de Empresa (EIP) a Cuenta Bancaria');
  return L;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLP-B-007: MODIFICACIÓN DE EMPRESA VINCULADA (EIP)
// ═══════════════════════════════════════════════════════════════════════════
export function plantillaModificacionEIP(datos, L, cf, sf, tx, ln, hoy) {
  sf('DATOS DE LA CUENTA');
  cf('IBAN', datos.iban || '______________________');
  cf('Tipo de cuenta', datos.tipoCuenta || 'Empresa');
  cf('Estado', datos.estado || 'Activa');
  ln(); sf('EMPRESA ACTUALMENTE VINCULADA');
  cf('Denominación social', datos.empresaAnterior || '______________________');
  cf('Número EIP', datos.eipAnterior || '______________________');
  cf('Representante legal', datos.representanteAnterior || '______________________');
  ln(); sf('NUEVA EMPRESA VINCULADA');
  cf('Denominación social', datos.empresaNueva || '______________________');
  cf('Número EIP', datos.eipNuevo || '______________________');
  cf('Representante legal', datos.representanteNuevo || '______________________');
  ln(); sf('MOTIVO DE LA MODIFICACIÓN');
  cf('Motivo', datos.motivo || 'Cambio de titularidad empresarial');
  ln(); sf('EXPONE');
  tx('Comparece el representante legal de la empresa solicitando la modificación de la entidad jurídica vinculada a la cuenta bancaria.');
  tx('Realizadas las comprobaciones reglamentarias, el Banco de La Placeta considera acreditada la legitimación para efectuar la modificación solicitada.');
  ln(); sf('FUNDAMENTOS JURÍDICOS');
  tx('La presente actuación se fundamenta en las disposiciones del Código Normativo Interno reguladoras de la identificación mediante PlacetaID, la gestión de empresas identificadas mediante EIP y la representación legal de personas jurídicas.');
  ln(); sf('RESUELVE');
  tx('Primero. Autorizar la modificación de la empresa vinculada a la cuenta bancaria.');
  tx('Segundo. Actualizar el EIP, los datos societarios y la representación legal en el Registro Bancario Oficial.');
  tx('Tercero. Mantener la continuidad jurídica de la cuenta bancaria.');
  tx('Cuarto. Conservar el historial completo de la empresa anteriormente vinculada.');
  proteccionDatos(L, sf, tx);
  recursos(L, sf, tx);
  firma(L, cf, ln, sf, 'Representante legal empresa saliente', { nombre: datos.representanteAnterior });
  firma(L, cf, ln, sf, 'Representante legal empresa entrante', { nombre: datos.representanteNuevo });
  firma(L, cf, ln, sf, 'Gestor Bancario', { nombre: datos.gestorNombre });
  validacion(L, cf, ln, sf, datos.uuid, datos.hash, datos.csv);
  pie(L, sf, tx, 'BLP-B-007', 'Contrato de Modificación de Empresa Vinculada (EIP)');
  return L;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLP-B-008: RESOLUCIÓN DE BLOQUEO DE CUENTA BANCARIA
// ═══════════════════════════════════════════════════════════════════════════
export function plantillaBloqueoCuenta(datos, L, cf, sf, tx, ln, hoy) {
  sf('DATOS DE LA CUENTA');
  cf('IBAN', datos.iban || '______________________');
  cf('Tipo de cuenta', datos.tipoCuenta || 'Particular');
  cf('Estado actual', datos.estado || 'Activa');
  cf('Fecha de apertura', datos.fechaApertura || hoy);
  ln(); sf('TITULAR PRINCIPAL');
  cf('Nombre', datos.titular || datos.nombre || '______________________');
  cf('DIP/EIP', datos.dip || datos.eip || '______________________');
  cf('Correo electrónico', datos.email || '______________________');
  ln(); sf('ORIGEN DEL PROCEDIMIENTO');
  cf('Origen', datos.origen || 'Detección automática del Sistema Antifraude');
  if (datos.numReferencia) cf('Número de referencia', datos.numReferencia);
  ln(); sf('MOTIVO DEL BLOQUEO');
  cf('Motivo', datos.motivo || 'Sospecha de fraude');
  if (datos.descripcionMotivo) tx(datos.descripcionMotivo);
  ln(); sf('ALCANCE DEL BLOQUEO');
  const alcances = datos.alcance || ['Bloqueo total de la cuenta'];
  ['Bloqueo total','Bloqueo retiradas','Bloqueo transferencias','Bloqueo ingresos','Bloqueo tarjetas','Bloqueo domiciliaciones'].forEach(a => {
    cf(`☐ ${a}`, alcances.includes(a) || alcances.includes('Bloqueo total') ? '✓' : '');
  });
  ln(); sf('EXPONE');
  tx('Como consecuencia de las comprobaciones realizadas por los sistemas automáticos del Banco de La Placeta y/o de las actuaciones desarrolladas por los órganos competentes, se han detectado circunstancias que pueden comprometer la seguridad de la cuenta bancaria o el cumplimiento de la normativa aplicable.');
  tx('Con el fin de preservar la integridad del sistema financiero, evitar posibles perjuicios económicos y garantizar el correcto desarrollo de las actuaciones inspectoras, procede acordar el bloqueo cautelar o definitivo de la cuenta bancaria.');
  ln(); sf('FUNDAMENTOS JURÍDICOS');
  tx('La presente resolución se adopta al amparo de las competencias atribuidas al Banco de La Placeta en materia de control bancario, prevención del fraude, protección del sistema financiero, cumplimiento tributario y supervisión de operaciones económicas, conforme al Código Normativo Interno.');
  ln(); sf('RESUELVE');
  tx('Primero. Acordar el bloqueo de la cuenta bancaria identificada en el presente expediente.');
  tx('Segundo. Aplicar las limitaciones operativas especificadas en esta resolución.');
  tx('Tercero. Mantener la custodia íntegra de los fondos existentes, salvo resolución administrativa o judicial en contrario.');
  tx('Cuarto. Registrar automáticamente la presente resolución en el Registro Electrónico.');
  tx('Quinto. Notificar electrónicamente al titular mediante PlacetaID, salvo que dicha notificación deba diferirse por motivos de investigación.');
  ln(); sf('DURACIÓN DEL BLOQUEO');
  cf('Tipo', datos.duracion || 'Temporal');
  cf('Fecha de inicio', datos.fechaInicio || hoy);
  cf('Fecha prevista de revisión', datos.fechaRevision || '______________________');
  proteccionDatos(L, sf, tx);
  recursos(L, sf, tx);
  firma(L, cf, ln, sf, 'Inspector de Cumplimiento Normativo', { nombre: datos.inspectorNombre, dip: datos.inspectorDip });
  firma(L, cf, ln, sf, 'Administrador del Banco', { nombre: datos.adminNombre, cargo: datos.adminCargo });
  firma(L, cf, ln, sf, 'Presidente del Banco (cuando proceda)', { nombre: datos.presidenteNombre });
  validacion(L, cf, ln, sf, datos.uuid, datos.hash, datos.csv);
  pie(L, sf, tx, 'BLP-B-008', 'Resolución de Bloqueo de Cuenta Bancaria');
  return L;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLP-B-009: RESOLUCIÓN DE DESBLOQUEO DE CUENTA BANCARIA
// ═══════════════════════════════════════════════════════════════════════════
export function plantillaDesbloqueoCuenta(datos, L, cf, sf, tx, ln, hoy) {
  sf('DATOS DE LA CUENTA');
  cf('IBAN', datos.iban || '______________________');
  cf('Tipo de cuenta', datos.tipoCuenta || 'Particular');
  cf('Estado anterior', 'Bloqueada');
  cf('Estado tras la resolución', datos.estadoFinal || 'Activa');
  cf('Expediente de bloqueo asociado', datos.expBloqueo || '______________________');
  ln(); sf('DATOS DEL TITULAR');
  cf('Nombre', datos.titular || datos.nombre || '______________________');
  cf('DIP/EIP', datos.dip || datos.eip || '______________________');
  cf('Correo electrónico', datos.email || '______________________');
  ln(); sf('ORIGEN DE LA SOLICITUD');
  cf('Origen', datos.origen || 'Solicitud del titular');
  ln(); sf('MOTIVO DEL DESBLOQUEO');
  cf('Motivo', datos.motivo || 'Investigación finalizada');
  if (datos.descripcionMotivo) tx(datos.descripcionMotivo);
  ln(); sf('COMPROBACIONES PREVIAS');
  ['Expediente de bloqueo','Historial auditoría','Incidencias pendientes','Embargos','Procedimientos tributarios','Autenticidad PlacetaID','Estado del titular'].forEach(c => cf('☑ ' + c, 'Realizada'));
  ln(); sf('LIMITACIONES POSTERIORES');
  cf('Seguimiento', datos.seguimiento || 'Ninguna');
  if (datos.limitesPosteriores) tx(datos.limitesPosteriores);
  ln(); sf('EXPONE');
  tx('Examinado el expediente de bloqueo asociado y realizadas las comprobaciones previstas por el Banco de La Placeta, se constata que han desaparecido o han sido subsanadas las circunstancias que motivaron el bloqueo de la cuenta bancaria.');
  ln(); sf('FUNDAMENTOS JURÍDICOS');
  tx('La presente resolución se dicta en ejercicio de las competencias atribuidas al Banco de La Placeta para revisar, modificar o dejar sin efecto las medidas cautelares adoptadas sobre cuentas bancarias cuando desaparezcan las causas que las motivaron, de conformidad con el Código Normativo Interno.');
  ln(); sf('RESUELVE');
  tx('Primero. Levantar el bloqueo impuesto sobre la cuenta bancaria identificada.');
  tx('Segundo. Restablecer las facultades operativas correspondientes.');
  tx('Tercero. Aplicar, cuando proceda, las limitaciones o medidas de seguimiento indicadas.');
  tx('Cuarto. Actualizar el estado de la cuenta en el Registro Bancario Oficial.');
  tx('Quinto. Notificar la presente resolución al titular mediante PlacetaID.');
  proteccionDatos(L, sf, tx);
  recursos(L, sf, tx);
  firma(L, cf, ln, sf, 'Inspector de Cumplimiento Normativo', { nombre: datos.inspectorNombre, dip: datos.inspectorDip });
  firma(L, cf, ln, sf, 'Administrador del Banco', { nombre: datos.adminNombre, cargo: datos.adminCargo });
  validacion(L, cf, ln, sf, datos.uuid, datos.hash, datos.csv);
  pie(L, sf, tx, 'BLP-B-009', 'Resolución de Desbloqueo de Cuenta Bancaria');
  return L;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLP-B-010: RESOLUCIÓN DE BAJA DEFINITIVA DE CUENTA BANCARIA
// ═══════════════════════════════════════════════════════════════════════════
export function plantillaBajaCuenta(datos, L, cf, sf, tx, ln, hoy) {
  sf('DATOS DE LA CUENTA');
  cf('IBAN', datos.iban || '______________________');
  cf('Tipo de cuenta', datos.tipoCuenta || datos.tipo || 'Particular');
  cf('Fecha de apertura', datos.fechaApertura || hoy);
  cf('Fecha prevista de baja', datos.fechaBaja || hoy);
  cf('Estado actual', datos.estado || 'Activa');
  ln(); sf('TITULAR');
  cf('Nombre / Razón Social', datos.titular || datos.nombre || '______________________');
  cf('DIP / EIP', datos.dip || datos.eip || '______________________');
  cf('Correo electrónico', datos.email || '______________________');
  ln(); sf('ORIGEN DEL PROCEDIMIENTO');
  cf('Origen', datos.origen || 'Solicitud voluntaria del titular');
  ln(); sf('MOTIVO DE LA BAJA');
  cf('Motivo', datos.motivo || 'Cierre voluntario');
  if (datos.descripcionMotivo) tx(datos.descripcionMotivo);
  ln(); sf('LIQUIDACIÓN DE LA CUENTA');
  cf('Saldo disponible', datos.saldo !== undefined ? datos.saldo.toLocaleString() + ' Pz' : '______________________');
  cf('Destino del saldo', datos.destinoSaldo || 'Transferencia a otra cuenta');
  if (datos.cuentaDestino) cf('Cuenta de destino', datos.cuentaDestino);
  ln(); sf('PRODUCTOS A CANCELAR');
  const productos = datos.productos || ['Tarjetas', 'Domiciliaciones'];
  ['Tarjetas','Depósitos','Cuenta ahorro','Créditos','Nóminas','Pagos automáticos','Cobros automáticos'].forEach(p => {
    cf(`☐ ${p}`, productos.includes(p) ? '✓' : '');
  });
  ln(); sf('EXPONE');
  tx('Instruido el expediente correspondiente y realizadas las comprobaciones automáticas previstas por el Banco de La Placeta, se acredita que concurren los requisitos necesarios para proceder a la cancelación definitiva de la cuenta bancaria.');
  tx('Consta igualmente que la liquidación económica previa ha sido efectuada conforme al Código Normativo Interno y que no existen impedimentos legales para acordar el cierre definitivo de la cuenta.');
  ln(); sf('FUNDAMENTOS JURÍDICOS');
  tx('La presente resolución se dicta conforme a las disposiciones del Código Normativo Interno reguladoras de la cancelación de cuentas bancarias, la liquidación de saldos, la gestión de cuentas de personas físicas y jurídicas y las competencias atribuidas al Banco de La Placeta para autorizar la baja definitiva de cuentas bancarias.');
  ln(); sf('RESUELVE');
  tx('Primero. Autorizar la baja definitiva de la cuenta bancaria identificada.');
  tx('Segundo. Cancelar el IBAN y todos los productos bancarios asociados.');
  tx('Tercero. Liquidar el saldo existente conforme al procedimiento indicado.');
  tx('Cuarto. Actualizar el Registro Bancario Oficial.');
  tx('Quinto. Conservar el expediente y el historial económico durante el período de conservación documental previsto.');
  tx('Sexto. Revocar automáticamente los permisos bancarios asociados al PlacetaID del titular.');
  tx('Séptimo. Notificar electrónicamente la presente resolución mediante PlacetaID.');
  ln(); sf('EFECTOS');
  tx('A partir de la fecha efectiva de cancelación:');
  tx('• El IBAN dejará de existir. • No podrán recibirse ingresos ni emitirse transferencias. • Quedarán canceladas las tarjetas asociadas. • Se eliminarán las domiciliaciones. • Finalizarán los pagos automáticos. • El expediente pasará al Archivo Histórico Bancario.');
  proteccionDatos(L, sf, tx);
  recursos(L, sf, tx);
  firma(L, cf, ln, sf, 'Gestor Bancario', { nombre: datos.gestorNombre });
  firma(L, cf, ln, sf, 'Inspector de Cumplimiento (cuando proceda)', { nombre: datos.inspectorNombre });
  firma(L, cf, ln, sf, 'Administrador del Banco', { nombre: datos.adminNombre, cargo: datos.adminCargo });
  firma(L, cf, ln, sf, 'Titular / Representante legal (cuando proceda)', { nombre: datos.titular || datos.nombre });
  validacion(L, cf, ln, sf, datos.uuid, datos.hash, datos.csv);
  pie(L, sf, tx, 'BLP-B-010', 'Resolución de Baja Definitiva de Cuenta Bancaria');
  return L;
}

// ── Mapa de tipos a funciones ──────────────────────────────────────────────
export const PLANTILLAS_BANCO = {
  'contrato-apertura': plantillaAperturaCuenta,
  'contrato-modificacion': plantillaModificacionCuenta,
  'cambio-titularidad': plantillaCambioTitularidad,
  'incorporacion-cotitular': plantillaIncorporacionCotitular,
  'desvinculacion-cotitular': plantillaDesvinculacionCotitular,
  'vinculacion-eip': plantillaVinculacionEIP,
  'modificacion-eip': plantillaModificacionEIP,
  'bloqueo-cuenta': plantillaBloqueoCuenta,
  'desbloqueo-cuenta': plantillaDesbloqueoCuenta,
  'baja-cuenta': plantillaBajaCuenta,
};
