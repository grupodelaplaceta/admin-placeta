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
- [ ] **0.4 "Contexto Único" del ciudadano (federado)**: `GET /rsp/api/contexto/:dip` agrega Identidad+Bancario+Fiscalidad+Patrimonio+Expedientes+Documentos+Firmas+Notificaciones vía APIs (sin mega-DB).

## FASE 1 — SEGURIDAD DE DATOS (P0, transversal) 🔴
**Objetivo:** ningún dato sensible fuera de su dominio; nada de "todas las cuentas" en el DOM ni en APIs de un usuario normal.

- [ ] **1.1 gdlp-crm = portal público (sin datos sensibles)**
  - Eliminar en gdlp-crm: `bancario-proxy.js` y cualquier endpoint/`SELECT *` de `cuentas_bancarias`, `transacciones`, `solicitantes` con datos sensibles; no guardar `CRM_READ_KEY`/claves del banco.
  - Quedar solo: contenido público (normativa, convocatorias, noticias), redirecciones a **Banco web**, **PlacetaID**, **RSP admin**.
  - Criterio: desde gdlp-crm NO se puede obtener cuentas/usuarios/transacciones; el código no contiene la key del banco.
- [ ] **1.2 Regla global: scoping por propietario**
  - Todo endpoint que devuelva cuentas/expedientes/documentos filtra **server-side por `req.session.usuario`** (nunca filtro client-side de un dataset completo).
  - Criterio: auditoría automática de endpoints con "SELECT sin WHERE de propietario" → se corrigen.
- [ ] **1.3 Nada de bulk data en el DOM**
  - Prohibido embeber listados completos (JSON, datalist, selects) de datos de terceros en páginas de usuario; solo lo del usuario.
  - Criterio: "inspeccionar elemento" en una sesión normal solo muestra datos propios.
- [ ] **1.4 RBAC y 2FA**
  - Revisar `verificarRol`/permisos en todos los repos (fallar-cerrado). **2FA** (PlacetaID) para acciones críticas.
  - Criterio: un rol sin permiso recibe 403; acción crítica exige 2FA.
- [ ] **1.5 Cabeceras y cache**
  - `CSP`, `X-Content-Type-Options`, `no-store` en respuestas sensibles; `Cache-Control` en APIs.
  - Criterio: respuestas sensibles sin cache; cabeceras presentes.
- [ ] **1.6 Auditoría de acceso a datos personales**
  - Registrar quién accede/consulta datos de un tercero; consultable por el propio interesado.
  - Criterio: toda lectura de datos ajenos queda en auditoría.

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
- [ ] **2.6 Integración con RSP (Contexto Único)**
  - El `contexto/:dip` del RSP (0.4) lee del Banco web/API para el bloque "Bancario" de cada ciudadano.
  - Criterio: el admin RSP ve el bloque bancario vía la API del banco (no duplicada).

## FASE 3 — SLA y plazos configurables (P0)
- [ ] **3.1 Plazos por estado/tipo** en `tramites.js` (`plazos: { revision:15, subsanacion:10, firma:7, justificacion:20 }`).
- [ ] **3.2 Fecha límite + efecto de vencimiento configurable** (`silencio_positivo|negativo|escalado|prorroga|intervencion`) por procedimiento — **sin silencio positivo por defecto**.
- [ ] **3.3 UI de plazo** en `detalle.ejs` ("Vence en X/vencido") y `trabajo.ejs` (chips; vencidos arriba).
- [ ] **3.4 Recordatorios y escalado** (`revisarVencimientos()` al 70% y al vencer).

## FASE 4 — Registro maestro de identidad (P0)
- [ ] **4.1** Tabla `rsp_ciudadanos` (dip, placetaId, nombre, estado, nivel N1–N3, cuenta_principal, canal_preferido) en `docs/migrar-rsp-core.sql`.
- [ ] **4.2** Sincronización event-driven (`upsertCiudadanoMaestro(dip)` al crear PlacetaID/banco_user).
- [ ] **4.3** Helper `resolverCiudadano(dip)` usado por trámites, patrimonio, fiscalidad, contexto.
- [ ] **4.4** Niveles de verificación N1→N3 con beneficios (límites, firma, subvenciones) — **sin biometría**.

## FASE 5 — Normativa dinámica desde el BOP (P1) 🟠
**Objetivo:** el BOP (Boletín Oficial) es la fuente de la normativa. Un cambio publicado en un CNIC (`bop_cnic`: porcentajes, precios, límites, plazos, con `vigente` e `historial`) actualiza automáticamente tarifas, tipos, límites, exenciones y plazos del RSP **hacia el futuro, sin tocar código**.

- [ ] **5.1 Servicio de parámetros** — nuevo `admin-placeta/src/config/normativa.js` que lee de `bop_cnic` (Supabase, lectura pública) los valores vigentes por código (`tipo_valor`, `valor`, `vigente`, `historial`). Criterio: `getParametro('CNIC-4.10-01')` devuelve el valor vigente tipado.
- [ ] **5.2 Catálogo RSP → CNIC** — mapa de códigos para cada valor hoy hardcodeado: IVA, tope retribución (250 Pz), tarifa consulta/modificación, exención IGF (empresa <20k), límites compliance (empresa 10M / personal 500k), plazos de trámites, sanciones. Criterio: cada constante tiene su código CNIC.
- [ ] **5.3 Sustituir hardcodes** — reemplazar en `fiscalidad-ampliada.js`, `normativa.js`, `rsp.js` (tarifas), `empresas.js` (compliance), `patrimonio.js`, `tramites.js` (plazos) por `getParametro(...)`. Criterio: los cálculos usan el BOP, no constantes.
- [ ] **5.4 Sincronización/refresh** — caché con TTL + `POST /api/normativa/refresh` (o webhook del BOP) al publicar un CNIC; el `bop-editor` avisa al publicar. Criterio: al actualizar un CNIC y refrescar, tarifas/tipos cambian sin deploy.
- [ ] **5.5 Vigencia por fecha (histórico)** — aplicar el valor vigente en la fecha del periodo (declaraciones pasadas) usando `historial` + `fecha_aplicacion`. Criterio: una declaración de un mes anterior usa el tipo vigente de ese mes.
- [ ] **5.6 Trazabilidad** — registrar en cada operación/declaración la **versión de CNIC aplicada** (auditoría fiscal). Criterio: cada cálculo sabe qué valor CNIC usó.

## FASE 6 — Interfaces separadas (P0)
- [ ] **5.1** 👤 **Ciudadano** → usa **Banco web** (FASE 2) + PlacetaID + portal público (gdlp-crm, sin datos). Pregunta: "¿Tengo que hacer algo?"
- [ ] **5.2** 🏢 **Entidad** → sección entidad en el Banco web / portal: Expedientes, Obligaciones, Contabilidad, Documentos, Representantes, Notificaciones.
- [ ] **5.3** 🛠️ **RSP admin-only**: Bandeja de trabajo → Expedientes → Ciudadanos → Entidades → Operaciones → Auditoría → Configuración.
- [ ] **5.4** **Mi bandeja ciudadana** (`GET /rsp/tramites/api/bandeja/:dip`) consumida por el Banco web/portal.

## FASE 7 — Notificaciones multicanal + acuse (P1)
- [ ] **6.1** Modelo ampliado (`canal`, `acuse_recibido`, `leida_en`) en `notificaciones.js`.
- [ ] **6.2** Email (SendGrid/SMTP) con fallback silencioso.
- [ ] **6.3** Acuse abre plazos (integra FASE 3).
- [ ] **6.4** Preferencias de canal en `rsp_ciudadanos`.

## FASE 8 — Subsanación guiada + firma múltiple + 2FA (P1)
- [ ] **7.1** Subsanación con `requisitos_pendientes[]` (checklist exacta).
- [ ] **7.2** Firma múltiple (`firmantes[]`; webhook espera a todos; "1/2 firmas").
- [ ] **7.3** 2FA admin en acciones críticas (pagar, resolver, anular).

## FASE 9 — Borrador fiscal + auditoría ciudadana (P1)
- [ ] **8.1** `GET /rsp/tributos/api/borrador/:dip` + estado `borrador|confirmada|corregida|presentada`; confirmar desde el Banco web/portal.
- [ ] **8.2** Auditoría ciudadana (quién vio/alteró mis datos) visible en la ficha (0.4).

## FASE 10 — Sucesiones automáticas (P2)
- [ ] **9.1** Herederos y % en `herencias.js`.
- [ ] **9.2** Reparto automático de patrimonio (reusa `setParticipacion` dedupe).
- [ ] **9.3** Certificado `DOC` + notificaciones a herederos.

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
