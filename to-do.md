PLAN MAESTRO — ADMIN-PLACETA + RSP
FASE 0 — Arquitectura y auditoría previa
0.1 Inventariar todo lo existente
 Banco de La Placeta
 PlacetaID
 PlacetaID Mobile
 Tributos
 Sistema de declaraciones
 Placeta Junior
 PlacetaEDU
 Fundación Banco de La Placeta
 Administración
 Contabilidad
 Documentos
 Firmas
 Sistema normativo/CNIC
 Notificaciones
 Cuentas
 Entidades
 Usuarios
 Permisos

Para cada sistema documentar:

Qué datos posee.
Qué datos genera.
Qué datos consume.
Qué API tiene.
Qué identificadores utiliza.
Qué acciones permite.
Qué documentos genera.
Qué información debe permanecer exclusivamente en ese sistema.
0.2 Definir identificadores globales

Crear una nomenclatura única:

USR-2026-000001
ENT-2026-000001
ACC-2026-000001
TRF-2026-000001
FAC-2026-000001
NOM-2026-000001
EXP-2026-000001
DOC-2026-000001
SIG-2026-000001
DEC-2026-000001
CNIC-FISC-001

Todos los sistemas deben poder relacionarse mediante estos identificadores.

FASE 1 — NUEVO ADMIN-PLACETA
1.1 Rediseñar completamente la UI

Crear una interfaz moderna siguiendo la identidad visual de Grupo de La Placeta.

Estructura principal
┌─────────────────────────────────────────┐
│ Logo La Placeta       Buscar       👤   │
├──────────────┬──────────────────────────┤
│              │                          │
│ Inicio       │                          │
│ Personas     │       CONTENIDO         │
│ Entidades    │                          │
│ Banco        │                          │
│ Tributos     │                          │
│ Educación    │                          │
│ Fundación    │                          │
│ Documentos   │                          │
│ Expedientes  │                          │
│ Normativa    │                          │
│ Contabilidad │                          │
│ Auditoría    │                          │
│ Configuración│                          │
│              │                          │
└──────────────┴──────────────────────────┘
1.2 Dashboard

Mostrar:

Operaciones pendientes.
Firmas pendientes.
Expedientes pendientes.
Alertas.
Incidencias.
Declaraciones.
Pagos.
Cambios normativos pendientes.
Actividad administrativa.

No mostrar datos innecesarios según el rol.

FASE 2 — IDENTIDAD Y ACCESO
2.1 Integración PlacetaID

Admin-Placeta debe consumir:

identidad;
perfiles;
roles;
dispositivos;
autenticación;
2FA;
firmas;
representaciones.
2.2 Gestión de usuarios

Implementar:

 Buscar usuario.
 Ver perfil administrativo.
 Ver cuentas vinculadas.
 Ver representaciones.
 Ver entidades.
 Gestionar permisos.
 Bloquear/desbloquear.
 Ver nivel de verificación.
 Gestionar autorizaciones.
2.3 No duplicar datos

Por ejemplo:

Nombre → PlacetaID

Admin-Placeta consulta el nombre.

No crea otra copia editable.

FASE 3 — BANCO DE LA PLACETA
3.1 Integración bancaria

Conectar:

cuentas;
movimientos;
transferencias;
tarjetas;
beneficiarios;
límites;
operaciones pendientes;
bonificaciones;
incidencias.
3.2 Administración bancaria

Crear herramientas para:

Crear cuenta.
Bloquear cuenta.
Cerrar cuenta.
Modificar límites.
Gestionar titulares.
Gestionar cotitularidades.
Gestionar beneficiarios.
Revisar operaciones.
Revertir operaciones autorizadas.
3.3 Patrimonio

Para cada persona calcular:

Patrimonio financiero =

cuentas individuales
+
% correspondiente de cuentas compartidas
+
otros activos financieros registrados

Nunca contabilizar el 100 % de una cuenta compartida para todos sus titulares.

FASE 4 — MOTOR DE OPERACIONES

Crear un servicio transversal:

Operation Engine

Toda operación deberá pasar por:

CREACIÓN
   ↓
IDENTIFICACIÓN
   ↓
CLASIFICACIÓN
   ↓
VALIDACIÓN
   ↓
REGLAS
   ↓
FISCALIDAD
   ↓
DOCUMENTACIÓN
   ↓
EJECUCIÓN
   ↓
AUDITORÍA
4.1 Clasificación

Analizar:

concepto;
origen;
destino;
importe;
periodicidad;
servicio;
expediente;
documentos;
historial.
4.2 Detección de operaciones inconsistentes

Ejemplo:

Concepto: "Nómina agosto"

Buscar:

NOM-2026-08-XXXX

Si no existe:

RECHAZAR / RETENER / REVERTIR

según el momento de la operación.

FASE 5 — FACTURACIÓN

Crear o integrar el sistema de facturación.

Implementar
 Facturas emitidas.
 Facturas recibidas.
 Rectificativas.
 Abonos.
 IVA.
 Estados.
 Vencimientos.
 Pagos.
 Vinculación con operaciones.

Flujo:

Servicio
 ↓
Factura
 ↓
Pago
 ↓
Contabilidad
 ↓
Fiscalidad
 ↓
Declaración
FASE 6 — NÓMINAS

Integrar el Sistema de Nóminas.

Datos
Trabajador.
Contrato.
Periodo.
Salario.
Complementos.
Deducciones.
Retenciones.
Neto.
Cuenta bancaria.
Automatización
Nómina
 ↓
Cálculo
 ↓
Retenciones
 ↓
Documento
 ↓
Orden bancaria
 ↓
Banco
 ↓
Fiscalidad
 ↓
Declaración

Una transferencia manual con concepto "Nómina" no sustituye este proceso.

FASE 7 — CONTABILIDAD

Implementar/integrar:

Plan contable.
Libro diario.
Libro mayor.
Asientos.
Ingresos.
Gastos.
Activos.
Pasivos.
Patrimonio.
Amortizaciones.
Cierres.
Conciliación automática

Comparar:

Banco
Factura
Nómina
Contabilidad
Fiscalidad

Resultado:

🟢 Conciliado
🟡 Diferencia
🔴 Inconsistencia

FASE 8 — TRIBUTOS
8.1 Motor fiscal

Crear un único motor que reciba datos de:

Banco.
Facturación.
Nóminas.
Contabilidad.
Fundación.
Placeta Junior.
Patrimonio.

Y determine:

IRM.
IGF.
IVA.
Retenciones.
Exenciones.
Bonificaciones.
Deducciones.
Obligaciones.
8.2 Declaraciones
Operaciones
 ↓
Clasificación
 ↓
Motor fiscal
 ↓
Periodo
 ↓
Declaración
 ↓
Liquidación
 ↓
Pago

El usuario no elige manualmente qué impuestos declarar.

FASE 9 — CNIC / MOTOR NORMATIVO

Esta debería ser una de las partes más importantes.

9.1 Registro de CNIC

Cada regla configurable tendrá:

Código.
Nombre.
Descripción.
Tipo.
Valor.
Versión.
Estado.
Fecha de entrada en vigor.
Fecha de finalización.
Sistemas afectados.
Autor.
Aprobadores.

Ejemplo:

CNIC-FISC-001

Bonificación fiscal Junior

v4
100 %

Vigente:
01/07/2026 → 31/08/2026
9.2 Nueva versión

Nunca modificar directamente una versión vigente.

v4
100 %
↓
Nueva versión
↓
v5
80 %

La v4 continúa siendo histórica.

9.3 Publicación
Borrador
 ↓
Validación
 ↓
Aprobación
 ↓
Programado
 ↓
Vigente
 ↓
Histórico
9.4 Reglas críticas

Requerir:

Administrador 1 → propone

Administrador 2 → aprueba

Para:

impuestos;
tipos;
RBU;
bonificaciones;
límites;
menores;
contabilidad;
declaraciones.
9.5 Aplicación automática

Cuando se publica un CNIC:

CNIC
 ↓
Motor normativo
 ├── Banco
 ├── Tributos
 ├── Contabilidad
 ├── Fundación
 ├── Placeta Junior
 ├── Nóminas
 └── Declaraciones

Los sistemas consumen la versión vigente.

9.6 Historial de reglas

Cada operación debe almacenar:

CNIC-FISC-001 v4

No simplemente:

CNIC-FISC-001

Así se puede reconstruir exactamente cómo se calculó algo.

9.7 "¿Qué afecta este CNIC?"

Crear una pantalla que muestre:

Servicios afectados.
Reglas dependientes.
Declaraciones afectadas.
Operaciones potencialmente afectadas.
Fecha de aplicación.
Versiones anteriores.
FASE 10 — PLACETA JUNIOR

Integrar directamente sus datos existentes.

Admin
Actividades.
Categorías.
Edades.
Dificultad.
Premium.
Precios.
Recompensas.
Placetas.
Puntos.
Diplomas.
Colaboradores.
Publicaciones.
Colaboradores

Crear:

Portal de colaboradores

Cada colaborador podrá:

Crear actividad.
Enviarla a revisión.
Elegir gratuita/premium.
Ver estadísticas.
Ver recompensas generadas.
Regla Premium

Si una actividad premium no cumple los requisitos de extensión/calidad:

revisión → retirada de Premium.

Recompensas

Toda recompensa generada por actividades colaboradoras deberá quedar registrada.

Y cuando corresponda:

Venta
 ↓
CAPITALIA
 ↓
Recompensa
 ↓
Registro financiero
FASE 11 — EVENTOS DE FUNDACIÓN

Implementar el sistema de campañas de desvío de fondos que definiste.

Ejemplo:

CAMPAÑA-FUND-2026-01

Inicio: XX
Fin: XX

Durante el periodo:
Ingresos elegibles → Fundación

Si se vende algo por:

10 Pz

el registro debe reflejar:

Venta: 10 Pz
Destino económico: Fundación
IVA: responsabilidad de CAPITALIA

Y permitir que Administración del Grupo pueda decidir posteriormente si subvenciona el IVA a CAPITALIA según las posibilidades disponibles.

Todo debe quedar separado contablemente.

FASE 12 — FUNDACIÓN

Integrar:

RBU.
Ayudas.
Becas.
Programas.
Solicitudes.
Expedientes.
Beneficiarios.
Pagos.
RBU
Solicitud
 ↓
Comprobación automática
 ↓
Resolución
 ↓
Concesión
 ↓
Orden de pago
 ↓
Banco

Y la RSP registra todo el expediente.

FASE 13 — PLACETAEDU

Integrar los datos existentes sin duplicarlos:

Cursos.
Matrículas.
Progreso.
Programas.
Certificados.
Expedientes.
Profesores/tutores.
Plazas.

Certificados:

EDU-2026-000001

con QR verificable.

FASE 14 — EXPEDIENTES

Crear un expediente transversal:

EXP-2026-000001

Puede relacionar:

Persona.
Entidad.
Solicitud.
Operación.
Documentos.
Firmas.
Pagos.
Resoluciones.
Notificaciones.
FASE 15 — DOCUMENTOS

Crear un Archivo Documental Central.

Todo documento:

DOC-2026-000001

con:

propietario;
tipo;
fecha;
servicio;
expediente;
versión;
firma;
hash;
QR;
estado.
FASE 16 — FIRMA

Integrar PlacetaID Mobile.

Flujo:

Documento
 ↓
Firmantes
 ↓
Notificación
 ↓
PlacetaID
 ↓
Firma
 ↓
Registro SIG
 ↓
Documento firmado
FASE 17 — NOTIFICACIONES

Crear centro unificado:

🔴 Requiere acción
🟡 Pendiente
🔵 Información
🟢 Completado

Debe recoger eventos de todos los servicios.

FASE 18 — INCIDENCIAS

Crear:

INC-2026-000001

Con:

origen;
usuario;
servicio;
problema;
documentos;
responsable;
estado;
resolución;
historial.

Estados:

Abierta
 ↓
En revisión
 ↓
En resolución
 ↓
Resuelta
 ↓
Cerrada
FASE 19 — AUDITORÍA

Crear un Audit Log central.

Cada acción:

Usuario
Fecha
Hora
IP/dispositivo
Servicio
Acción
Objeto
Valor anterior
Valor nuevo
Motivo
Autorización

Ejemplo:

ADMIN-0042

Modificación:
CNIC-FISC-001

100 % → 80 %

Motivo:
Actualización normativa

Aprobador:
ADMIN-0007
FASE 20 — ROLES Y PERMISOS

Crear RBAC + permisos granulares.

Permisos:

Ver.
Crear.
Editar.
Aprobar.
Firmar.
Pagar.
Anular.
Exportar.
Auditar.
Administrar.

Y limitar por:

Servicio + entidad + departamento + tipo de dato.

FASE 21 — ACTIVOS Y PATRIMONIO

Integrar activos para alimentar IGF y contabilidad.

Activo
 ↓
Propietario
 ↓
Valor
 ↓
% titularidad
 ↓
Valor fiscal
 ↓
IGF

Especialmente:

Cuentas compartidas

Si hay:

Cuenta = 10.000 Pz
4 titulares

el patrimonio individual será:

2.500 Pz cada uno

salvo que exista otro porcentaje registrado.

FASE 22 — DASHBOARD ECONÓMICO DEL GRUPO

Crear una visión consolidada:

Liquidez.
Ingresos.
Gastos.
Impuestos.
Nóminas.
Patrimonio.
Ayudas.
Educación.
Junior.
Fundación.
Resultado.

Filtros:

Grupo
Entidad
Departamento
Proyecto
Periodo
FASE 23 — SISTEMA NORMATIVO

Crear un Centro Normativo.

Debe permitir:

Consultar CNIC.
Crear versión.
Comparar versiones.
Programar entrada en vigor.
Aprobar.
Publicar.
Ver dependencias.
Ver operaciones afectadas.
Consultar histórico.
Función especialmente importante

"Simular cambio"

Antes de publicar:

¿Qué ocurriría si esta regla cambia?

El sistema calcula:

declaraciones afectadas;
operaciones afectadas;
usuarios afectados;
servicios afectados;
importes que cambiarían.
FASE 24 — SEGURIDAD

Implementar:

2FA.
PlacetaID.
Gestión de sesiones.
Dispositivos autorizados.
Control de acceso.
Cifrado.
Logs.
Alertas.
Rate limiting.
Protección de APIs.
Separación de permisos.
Copias de seguridad.
Recuperación ante desastres.
FASE 25 — API / INTEGRACIÓN

Crear una capa común:

RSP API

No conectar cada aplicación directamente con todas las demás.

Mejor:

                  RSP
                   │
       ┌───────────┼───────────┐
       │           │           │
     Banco      Tributos     EDU
       │           │           │
     Junior     Fundación   PlacetaID

Además, utilizar eventos:

PAYMENT_COMPLETED
INVOICE_CREATED
PAYROLL_CREATED
TAX_UPDATED
DOCUMENT_SIGNED
CNIC_PUBLISHED
GRANT_APPROVED
ACCOUNT_BLOCKED

Esto permite que un cambio en un servicio provoque automáticamente las acciones necesarias en los demás.

FASE 26 — INTEGRIDAD DE DATOS

Reglas fundamentales:

 No duplicar información maestra.
 Un identificador único por objeto.
 No borrar registros económicos.
 Rectificar mediante nuevos registros.
 Versionar documentos.
 Versionar CNIC.
 Guardar la regla aplicada a cada operación.
 Mantener historial.
 Registrar origen de cada dato.
 Registrar última sincronización.
FASE 27 — RECONCILIACIÓN GLOBAL

Crear una herramienta administrativa:

"Comprobación del ecosistema"

Que compruebe automáticamente:

Banco
   ↕
Contabilidad
   ↕
Facturación
   ↕
Nóminas
   ↕
Tributos
   ↕
Declaraciones

Y detecte:

importes que no coinciden;
operaciones sin documento;
documentos sin operación;
facturas sin pago;
pagos sin factura;
nóminas sin transferencia;
transferencias sin nómina;
impuestos sin operación;
operaciones sin clasificación.
FASE 28 — ARCHIVO Y CONSERVACIÓN

Crear políticas de conservación:

Qué se conserva.
Durante cuánto tiempo.
Quién puede acceder.
Cuándo se archiva.
Cuándo se puede eliminar legalmente.
Cómo se conserva la integridad.
FASE 29 — PRUEBAS

Antes de ponerlo en producción:

Pruebas funcionales
Banco.
Tributos.
Junior.
EDU.
Fundación.
Nóminas.
Facturación.
Pruebas de integración

Ejemplo:

Nómina → Banco → Tributos → Declaración

Pruebas normativas

Cambiar un CNIC y comprobar que:

se crea versión;
se mantiene histórico;
se aplica desde la fecha correcta;
los sistemas afectados reciben el cambio;
las operaciones antiguas no cambian.
Pruebas de seguridad

Intentar:

acceder a datos no autorizados;
modificar impuestos;
alterar operaciones;
saltarse una firma;
cambiar un CNIC sin autorización;
borrar registros.
FASE 30 — MIGRACIÓN

Antes de sustituir el Admin-Placeta actual:

Analizar datos actuales.
Crear mapeos.
Migrar usuarios.
Migrar entidades.
Migrar documentos.
Migrar operaciones.
Migrar permisos.
Migrar configuración.
Validar integridad.
Ejecutar sistema antiguo y nuevo en paralelo.
Comparar resultados.
Realizar cambio definitivo.
FASE 31 — PUESTA EN PRODUCCIÓN

Yo lo haría progresivamente:

🟣 Etapa 1

Admin-Placeta + PlacetaID

🟣 Etapa 2

Banco + operaciones

🟣 Etapa 3

Tributos + declaraciones

🟣 Etapa 4

Documentos + expedientes + firma

🟣 Etapa 5

Contabilidad + facturación + nóminas

🟣 Etapa 6

Junior + EDU + Fundación

🟣 Etapa 7

CNIC + motor normativo automático

🟣 Etapa 8

Auditoría + conciliación + dashboard global

🧠 ARQUITECTURA FINAL

La estructura que buscaría sería:

                         ADMIN-PLACETA
                              │
                    ┌─────────┴─────────┐
                    │       RSP         │
                    │                   │
              Motor de reglas      Expedientes
                    │                   │
              Motor normativo      Documentos
                    │                   │
                    └─────────┬─────────┘
                              │
       ┌──────────┬───────────┼────────────┬──────────┐
       │          │           │            │          │
     BANCO     TRIBUTOS   CONTABILIDAD  EDU/JUNIOR FUNDACIÓN
       │          │           │            │          │
       └──────────┴───────────┴────────────┴──────────┘
                              │
                         PLACETAID
                              │
                    Identidad + Firma
                              │
                         AUDITORÍA
Y la regla fundamental de todo el sistema sería:

Cada servicio mantiene sus propios datos y lógica especializada; RSP proporciona la integración, trazabilidad, identidad común, documentos, expedientes, reglas y eventos necesarios para que todo el ecosistema funcione como un único sistema.