# PLAN DE IMPLEMENTACIÓN — RSP (v3)
### Con Seguridad de datos, el nuevo Banco de La Placeta web, y gdlp-crm como portal público

> Reemplaza versiones anteriores. Base: `RSP-vs-pais-inventado.md` (sección 8 = redlines).
> **Novedades de esta versión (seguridad):**
> - **Incidente de exposición de datos resuelto**: la web del banco con la brecha (todas las cuentas visibles desde un perfil vía "inspeccionar elemento") **ya fue eliminada**.
> - **gdlp-crm = solo portal público del RSP**: NO tendrá APIs con datos sensibles ni almacenará datos bancarios/fiscales. Solo contenido público y enlaces a los servicios reales.
> - **Nuevo: Banco de La Placeta web** — banco en línea ciudadano, seguro y funcional, **igualito a la app** (banco-app Android).

Cada paso: **archivos/rutas**, **qué hacer**, **criterio de aceptación**. `[x]` = hecho.

---

## FASE 0 — Fundamento: Modelo de expediente + fuentes de verdad (P0 transversal)
- [ ] **0.1 Modelo de 4 niveles**: `SERVICIO → TRÁMITE → EXPEDIENTE → ACTUACIONES` (`tramites.js` + `expedientes.js`). Cada trámite declara su `servicio`; al presentar se crea `EXP` con `actuaciones[]`.
- [ ] **0.2 Expediente = objeto central**: enlaza `documentos`, `actuaciones`, `firmas`, `notificaciones`, `pagos`, `validaciones`, `auditoría` (referencias, no duplicar).
- [ ] **0.3 Fuentes de verdad por dominio** (`docs/`): PlacetaID=identidad · **backend-banco (MongoDB)=cuentas/operaciones** · Supabase RSP=expedientes/patrimonio/fiscalidad · **Banco web=interfaz ciudadano (lee API)** · gdlp-crm=portal público (sin datos).
- [x] **0.4 "Contexto Único" del ciudadano (federado)**: `GET /rsp/api/contexto/:dip` agrega Identidad+Bancario+Fiscalidad+Patrimonio+Expedientes+Documentos+Firmas+Notificaciones vía APIs (sin mega-DB). ✅ hecha (12/08): `src/config/contexto.js` + `src/routes/rsp.js`; verificado con producción (todas las fuentes OK, saldo correcto).

## FASE 1 — SEGURIDAD DE DATOS (P0, transversal) 🔴
**Objetivo:** ningún dato sensible fuera de su dominio; nada de "todas las cuentas" en el DOM ni en APIs de un usuario normal.

- [x] **1.1 gdlp-crm = portal público (sin datos sensibles)** ✅ hecha (12/06)
  - Eliminar en gdlp-crm: `bancario-proxy.js` y cualquier endpoint/`SELECT *` de `cuentas_bancarias`, `transacciones`, `solicitantes` con datos sensibles; no guardar `CRM_READ_KEY`/claves del banco.
  - Quedar solo: contenido público (normativa, convocatorias, noticias), redirecciones a **Banco web**, **PlacetaID**, **RSP admin**.
  - Criterio: desde gdlp-crm NO se puede obtener cuentas/usuarios/transacciones; el código no contiene la key del banco. ✅ verificado: `bancario-proxy` → 404, key fuera del repo, enlaces bancarios retirados del sidebar. Pendiente FASE 6: migrar a RSP las funciones admin del banco que aún viven en gdlp-crm (audit-bancario, tributos, junior).
- [x] **1.2 Regla global: scoping por propietario** ✅ auditado (12/06)
  - Todo endpoint que devuelva cuentas/expedientes/documentos filtra **server-side por `req.session.usuario`** (nunca filtro client-side de un dataset completo).
  - Criterio: auditoría automática de endpoints con "SELECT sin WHERE de propietario" → se corrigen. ✅ auditoría manual: endpoints ciudadanos (bancario, ocio, publico, fiscal) acotados por sesión; bulk (admin, audit, junior-admin) fail-closed con `verificarRol`. Se añadirá auditoría automática en FASE 11.
- [x] **1.3 Nada de bulk data en el DOM** ✅ hecha (12/06)
  - Prohibido embeber listados completos (JSON, datalist, selects) de datos de terceros en páginas de usuario; solo lo del usuario.
  - Criterio: "inspeccionar elemento" en una sesión normal solo muestra datos propios. ✅ al eliminar el proxy, el buscador universal del CRM ya no recibe datos (devuelve `[]`); vistas públicas acotadas. Pendiente: rehacer buscador universal con búsqueda scoped server-side (FASE 2.3).
- [~] **1.4 RBAC y 2FA** ⏳ RBAC revisado (fail-cerrado en gdlp-crm: `verificarRol` comprueba `roles.includes(rol)`, 403 si no). 2FA (PlacetaID) para acciones críticas → se implementa con FASE 8 (firma múltiple + 2FA).
  - Revisar `verificarRol`/permisos en todos los repos (fallar-cerrado). **2FA** (PlacetaID) para acciones críticas.
  - Criterio: un rol sin permiso recibe 403; acción crítica exige 2FA.
- [x] **1.5 Cabeceras y cache** ✅ hecha (12/06)
  - `CSP`, `X-Content-Type-Options`, `no-store` en respuestas sensibles; `Cache-Control` en APIs.
  - Criterio: respuestas sensibles sin cache; cabeceras presentes. ✅ en gdlp-crm: `Cache-Control: no-store` en todas las `/api/` + HTML; `X-Content-Type-Options: nosniff` (helmet). CSP diferido (EJS con inline scripts; re-evaluar en FASE 12).
- [x] **1.6 Auditoría de acceso a datos personales** ✅ parcial (12/06)
  - Registrar quién accede/consulta datos de un tercero; consultable por el propio interesado.
  - Criterio: toda lectura de datos ajenos queda en auditoría. ✅ en gdlp-crm: las lecturas de IRM ajeno por gestores se registran en `logs_auditoria` (accion `lectura_irm_ajeno`). Pendiente: auditoría de más lecturas ajenas y consulta por el interesado (RSP, FASE 9).

## FASE 2 — BANCO DE LA PLACETA WEB (nuevo, P0) 🔴
**Objetivo:** banco en línea ciudadano, seguro y funcional, **igualito a la app** (banco-app Android).

- [ ] **2.1 Nuevo proyecto `banco-web`**
  - App web standalone (Express/Vite + backend en Vercel) que consume **solo la API real** `api.banco.laplaceta.org` (backend-banco, fuente de verdad).
  - Criterio: proyecto creado con estructura y arranque local.
- [ ] **2.2 Autenticación PlacetaID + 2FA**
  - Login con PlacetaID (verificar JWT con `PLACETA_ID_JWT_SECRET`) + segundo factor; sesión segura con token corto y `no-store`.
  - Criterio: solo el titular (o autorizado) accede; el JWT se valida y expira.
- [ ] **2.3 APIs scoped del banco (para el web)**
  - Añadir al backend-banco endpoints **por DIP autenticado**: `GET /web/cuenta`, `GET /web/movimientos`, `GET /web/tarjetas`, `GET /web/gestores`, `POST /web/transferencia` (firmada).
  - **Nunca** devuelven datos de otros usuarios; el backend valida que el `placetaId` del token = dueño.
  - Criterio: un usuario solo recibe sus cuentas/movimientos/tarjetas.
- [ ] **2.4 Funcionalidades = a la app**
  - Cuentas y saldo · Movimientos · Transferencias (con confirmación/2FA) · Tarjetas (ver/bloquear) · Gestores y cotitulares (asignar %, ver ciudadanos) · Cumplimiento (estado del titular) · Perfil.
  - Criterio: cada pantalla de la app tiene su equivalente web.
- [ ] **2.5 Sin datos ajenos en el DOM**
  - El web solo pinta lo del usuario autenticado; sin selects/datalists con cuentas de otros; IBAN/datos enmascarados donde aplique.
  - Criterio: inspeccionar elemento no muestra datos de terceros.
- [x] **2.6 Integración con RSP (Contexto Único)**
  - El `contexto/:dip` del RSP (0.4) lee del Banco web/API para el bloque "Bancario" de cada ciudadano.
  - Criterio: el admin RSP ve el bloque bancario vía la API del banco (no duplicada). ✅ hecha (12/08): el bloque `bancario` del Contexto Único lee de la API real (backend-banco) acotado al titular.

## FASE 3 — SLA y plazos configurables (P0)
- [x] **3.1 Plazos por estado/tipo** en `tramites.js` (`plazos: { revision:15, subsanacion:10, firma:7, justificacion:20 }`). ✅ hecha (12/08)
- [x] **3.2 Fecha límite + efecto de vencimiento configurable** (`silencio_positivo|negativo|escalado|prorroga|intervencion`) por procedimiento — **sin silencio positivo por defecto**. ✅ hecha (12/08): `getSilencioTipo` (negativo por defecto), aplicado en `avanzarTramite`/`revisarVencimientos`.
- [x] **3.3 UI de plazo** en `detalle.ejs` ("Vence en X/vencido") y `trabajo.ejs` (chips; vencidos arriba). ✅ hecha (12/08): chips vencido/vence en detalle y bandeja de trabajo.
- [x] **3.4 Recordatorios y escalado** (`revisarVencimientos()` al 70% y al vencer). ✅ hecha (12/08): `revisarVencimientos()` periódico (15 min) + endpoint `POST /rsp/tramites/api/revisar-vencimientos`.

## FASE 4 — Registro maestro de identidad (P0)
- [x] **4.1** Tabla `rsp_ciudadanos` (dip, placetaId, nombre, estado, nivel N1–N3, cuenta_principal, canal_preferido) en `docs/migrar-rsp-core.sql`. ✅ hecha (12/08)
- [x] **4.2** Sincronización event-driven (`upsertCiudadanoMaestro(dip)` al crear PlacetaID/banco_user). ✅ hecha (12/08): conectada en `placetaid-sincronizacion.js`.
- [x] **4.3** Helper `resolverCiudadano(dip)` usado por trámites, patrimonio, fiscalidad, contexto. ✅ hecha (12/08): usado por el Contexto Único.
- [x] **4.4** Niveles de verificación N1→N3 con beneficios (límites, firma, subvenciones) — **sin biometría**. ✅ hecha (12/08): `NIVELES` en `registro-maestro.js`.

## FASE 5 — Normativa dinámica desde el BOP (P1) 🟠
**Objetivo:** el BOP (Boletín Oficial) es la fuente de la normativa. Un cambio publicado en un CNIC (`bop_cnic`: porcentajes, precios, límites, plazos, con `vigente` e `historial`) actualiza automáticamente tarifas, tipos, límites, exenciones y plazos del RSP **hacia el futuro, sin tocar código**.

- [x] **5.1 Servicio de parámetros** — nuevo `admin-placeta/src/config/normativa.js` que lee de `bop_cnic` (Supabase, lectura pública) los valores vigentes por código (`tipo_valor`, `valor`, `vigente`, `historial`). Criterio: `getParametro('CNIC-4.10-01')` devuelve el valor vigente tipado. ✅ hecha (12/08): `src/config/normativa-dinamica.js` (`getParametro`, `getParametroValor`, `cargarSnapshot`).
- [x] **5.2 Catálogo RSP → CNIC** — mapa de códigos para cada valor hoy hardcodeado: IVA, tope retribución (250 Pz), tarifa consulta/modificación, exención IGF (empresa <20k), límites compliance (empresa 10M / personal 500k), plazos de trámites, sanciones. Criterio: cada constante tiene su código CNIC. ✅ hecha (12/08): `CATALOGO` con fallback seguro.
- [~] **5.3 Sustituir hardcodes** — reemplazar en `fiscalidad-ampliada.js`, `normativa.js`, `rsp.js` (tarifas), `empresas.js` (compliance), `patrimonio.js`, `tramites.js` (plazos) por `getParametro(...)`. Criterio: los cálculos usan el BOP, no constantes. ✅ parcial (12/08): `rsp.js` tarifas+IVA y `tramites.js` plazos cableados. Pendiente: `fiscalidad-ampliada.js`, `empresas.js`, `patrimonio.js` (siguiente iteración).
- [x] **5.4 Sincronización/refresh** — caché con TTL + `POST /api/normativa/refresh` (o webhook del BOP) al publicar un CNIC; el `bop-editor` avisa al publicar. Criterio: al actualizar un CNIC y refrescar, tarifas/tipos cambian sin deploy. ✅ hecha (12/08): `POST /rsp/api/normativa/refresh` + caché TTL + warm al arranque.
- [x] **5.5 Vigencia por fecha (histórico)** — aplicar el valor vigente en la fecha del periodo (declaraciones pasadas) usando `historial` + `fecha_aplicacion`. Criterio: una declaración de un mes anterior usa el tipo vigente de ese mes. ✅ hecha (12/08): `getParametro(codigo,{fecha})`.
- [~] **5.6 Trazabilidad** — registrar en cada operación/declaración la **versión de CNIC aplicada** (auditoría fiscal). Criterio: cada cálculo sabe qué valor CNIC usó. ✅ parcial (12/08): `getParametro` devuelve `codigo`+`version`; pendiente registrar la versión en cada operación/declaración.

## FASE 6 — Interfaces separadas (P0)
- [ ] **5.1** 👤 **Ciudadano** → usa **Banco web** (FASE 2) + PlacetaID + portal público (gdlp-crm, sin datos). Pregunta: "¿Tengo que hacer algo?"
- [ ] **5.2** 🏢 **Entidad** → sección entidad en el Banco web / portal: Expedientes, Obligaciones, Contabilidad, Documentos, Representantes, Notificaciones.
- [ ] **5.3** 🛠️ **RSP admin-only**: Bandeja de trabajo → Expedientes → Ciudadanos → Entidades → Operaciones → Auditoría → Configuración.
- [x] **5.4** **Mi bandeja ciudadana** (`GET /rsp/tramites/api/bandeja/:dip`) consumida por el Banco web/portal. ✅ hecha (12/08).

## FASE 7 — Notificaciones multicanal + acuse (P1)
- [x] **6.1** Modelo ampliado (`canal`, `acuse_recibido`, `leida_en`) en `notificaciones.js`. ✅ hecha (12/08): columnas aplicadas en Supabase.
- [x] **6.2** Email (SendGrid/SMTP) con fallback silencioso. ✅ hecha (12/08): `enviarEmail` (Resend) con fallback silencioso si no hay `EMAIL_API_KEY`.
- [x] **6.3** Acuse abre plazos (integra FASE 3). ✅ hecha (12/08): `marcarAcuse` (acuse_recibido/acuse_en).
- [x] **6.4** Preferencias de canal en `rsp_ciudadanos`. ✅ hecha (12/08): `preferenciaCanal` lee `canal_preferido` del registro maestro.

## FASE 8 — Subsanación guiada + firma múltiple + 2FA (P1)
- [x] **7.1** Subsanación con `requisitos_pendientes[]` (checklist exacta). ✅ hecha (12/08): pestaña Subsanación con checklist en el detalle.
- [ ] **7.2** Firma múltiple (`firmantes[]`; webhook espera a todos; "1/2 firmas"). ⏳ pendiente (campo `firmantes[]`/`firmas_completas` preparado en trámites).
- [x] **7.3** 2FA admin en acciones críticas (pagar, resolver, anular). ✅ hecha (12/08): `src/config/dosfa.js` fail-closed + `POST /rsp/tramites/api/2fa/verificar`; verificado 403 sin 2FA.

## FASE 9 — Borrador fiscal + auditoría ciudadana (P1)
- [x] **8.1** `GET /rsp/tributos/api/borrador/:dip` + estado `borrador|confirmada|corregida|presentada`; confirmar desde el Banco web/portal. ✅ hecha (12/08): `GET/POST /rsp/api/borrador-fiscal/:dip` con trazabilidad CNIC.
- [x] **8.2** Auditoría ciudadana (quién vio/alteró mis datos) visible en la ficha (0.4). ✅ hecha (12/08): `GET /rsp/api/auditoria/:dip`.

## FASE 10 — Sucesiones automáticas (P2)
- [x] **9.1** Herederos y % en `herencias.js`. ✅ hecha (12/08): ya existía en el modelo.
- [x] **9.2** Reparto automático de patrimonio (reusa `setParticipacion` dedupe). ✅ hecha (12/08): `repartirPatrimonioAutomatico`.
- [x] **9.3** Certificado `DOC` + notificaciones a herederos. ✅ hecha (12/08): certificado + notificación a cada heredero.

## FASE 11 — Transparencia, observabilidad y tests (P2)
- [ ] **10.1** Portal de transparencia público (CNIC vigente, presupuestos, subvenciones otorgadas) — sin datos personales.
- [ ] **10.2** Observabilidad: request-id + logs JSON + métricas + alerta 5xx.
- [ ] **10.3** Tests (`node --test`) de motores (tramites, fiscalidad, patrimonio) **+ tests de seguridad** (scoping: un usuario no ve datos de otro).
- [ ] **10.4** Migraciones en CI (GitHub Actions con `SUPABASE_DB_CONNECTION` secret).

## FASE 12 — Seguridad avanzada e i18n (P3)
- [ ] **11.1** Secretos centralizados en Vercel + rotación (`SUPABASE_DB_CONNECTION`, `PASSWORD_DEFAULT_SECRET`, claves banco/web).
- [ ] **11.2** i18n (EN mínimo) y accesibilidad WCAG (contraste, foco, teclado).
- [ ] **11.3** Rate limiting en login/APIs + reCAPTCHA si procede.

---

## Orden de ejecución
1. **FASE 1 (Seguridad)** — cerrar la brecha de datos y dejar gdlp-crm como portal. **Primero**, porque es un incidente.
2. **FASE 2 (Banco web)** — el nuevo banco en línea seguro del ciudadano.
3. **FASE 0 (modelo expediente)** — fundamento del RSP.
4. **FASE 3–4** (SLA, registro maestro).
5. **FASE 5 (Normativa dinámica desde el BOP)** — los valores CNIC alimentan tarifas/tipos/límites/plazos (ideal justo tras el registro maestro).
6. **FASE 6 (interfaces)** → depende de 2.
7. **FASE 7–10** (notificaciones, subsanación/firma/2FA, borrador, sucesiones).
8. **FASE 11** (transparencia/observabilidad/tests).
9. **FASE 12** (seguridad avanzada/i18n).

**Regla:** cada fase = commit+push separado, con **test de seguridad** (scoping) y migración antes del push si toca motor/BD. La FASE 1 es **urgente** (incidente de datos).
