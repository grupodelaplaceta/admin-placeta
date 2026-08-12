# PLAN DE IMPLEMENTACIÓN — Mejoras RSP (todas las fases)
### De la comparativa con la República de Valdoria → a ejecución

> Este plan convierte el documento `RSP-vs-pais-inventado.md` en pasos ejecutables.
> Orden = dependencias primero. Cada paso tiene **archivos/rutas**, **qué hacer** y
> **criterio de aceptación**. Se marca `[x]` cuando está hecho.

---

## FASE 1 — Plazos y SLA en el motor de trámites (P0)
**Objetivo:** todo trámite tiene plazo máximo por estado, vencimiento visible y silencio administrativo.

- [ ] **1.1 Configurar plazos por estado/tipo**
  - Archivo: `admin-placeta/src/config/tramites.js` (catálogo `TRAMITES` + `ESTADO_UI`)
  - Añadir a cada tipo: `plazos: { revision: 15, subsanacion: 10, firma: 7, justificacion: 20 }` (días).
  - Criterio: cada tipo tiene `plazos` y un `plazo_default` global.
- [ ] **1.2 Fecha límite por estado**
  - En `avanzarTramite()`: al entrar en un estado con plazo, fijar `t.fecha_limite = now + N días` y `t.plazo_estado = estado`.
  - Criterio: al avanzar a `revision` el trámite tiene `fecha_limite` calculada.
- [ ] **1.3 Visibilidad del plazo (UI)**
  - `detalle.ejs`: en Resumen mostrar "Vence en X días" / "⚠️ Vencido".
  - `lista.ejs` y `trabajo.ejs`: chip de plazo por fila; ordenar vencidos arriba.
  - Criterio: el plazo se ve en lista, detalle y bandeja de trabajo.
- [ ] **1.4 Silencio administrativo**
  - Regla configurable en `tramites.js`: al vencer `revision` sin acción → opción auto-avanzar a `resolucion` (silencio positivo) o marcar `vencido`.
  - Criterio: un trámite vencido en revisión avanza o se marca, según config.
- [ ] **1.5 Recordatorios y escalado**
  - En `estadoTramites()`/función `revisarVencimientos()`: al 70% del plazo → notificación; al vencer → subir prioridad + notificar al admin (bandeja "Urgentes").
  - Disparador: cron ligero (o al abrir la bandeja) que llama a `revisarVencimientos()`.
  - Criterio: trámite al 70% recibe notificación; vencido pasa a Urgentes.

## FASE 2 — Bandeja ciudadana (API) + Mi bandeja (P0)
**Objetivo:** el ciudadano ve en su app las acciones que le tocan, con plazos.

- [ ] **2.1 Endpoint público de bandeja por DIP**
  - `admin-placeta/src/routes/tramites.js`: `GET /rsp/tramites/api/bandeja/:dip` → acciones pendientes del DIP (subsanación, firma, justificación, borradores) con `fecha_limite`, `vence_en`, `prioridad`, `tipo`, `id_trámite`.
  - Criterio: devuelve JSON con las acciones pendientes y su plazo para cualquier DIP.
- [ ] **2.2 Bandeja transversal (multi-servicio)**
  - Consolidar pendientes de Banco (documentos por firmar), Tributos (declaraciones pendientes) y RSP (trámites) en el mismo endpoint.
  - Criterio: un DIP con pendientes de 2 servicios los ve agrupados.
- [ ] **2.3 Contrato documentado para la app**
  - Añadir a `docs/` el esquema del endpoint (para `placetaid-mobil`).
  - Criterio: documento con ejemplo de request/response.
- [ ] **2.4 (App, opcional) Pantalla "Mi bandeja" en placetaid-mobil**
  - Archivo: `placetaid-mobil` (repo raíz) — nueva pantalla consumiendo 2.1.
  - Criterio: la app lista acciones pendientes con "Abrir trámite".

## FASE 3 — Registro maestro único (P0)
**Objetivo:** una única fuente de verdad de ciudadanos/entidades.

- [ ] **3.1 Canon de ciudadano en Supabase**
  - Tabla `rsp_ciudadanos` (id, dip, placetaId, nombre, estado, nivel_identidad, cuenta_principal, created_at). Migración en `docs/migrar-rsp-core.sql`.
  - Criterio: tabla creada (vía `scripts/aplicar-migraciones.mjs`).
- [ ] **3.2 Sincronización event-driven**
  - En `placetaid-sincronizacion.js`: al crear PlacetaID o banco_user → `upsertCiudadanoMaestro(dip)`.
  - Criterio: alta en PlacetaID ⇒ aparece en `rsp_ciudadanos`.
- [ ] **3.3 Resolver centralizado**
  - Helper `resolverCiudadano(dip)` que usen trámites, patrimonio, fiscalidad, bandeja (deja de leer de 3 sitios).
  - Criterio: todos los módulos resuelven el ciudadano con el mismo helper.
- [ ] **3.4 Deprecar lecturas dispersas**
  - Sustituir usos de `solicitantes`/censo sueltos por el maestro.
  - Criterio: sin consultas duplicadas de identidad en el código.

## FASE 4 — Notificaciones multicanal + acuse (P1)
**Objetivo:** notificaciones con canal preferido y acuse que abre plazos.

- [ ] **4.1 Modelo ampliado**
  - `notificaciones.js`: añadir `canal` (app|email|push), `acuse_recibido`, `leida_en`.
  - Criterio: crearNotificacion acepta canal; las notificaciones guardan acuse.
- [ ] **4.2 Envío email (SendGrid/SMTP)**
  - Módulo `src/config/notificaciones-email.js` con plantillas y envío asíncrono (fallback silencioso).
  - Criterio: notificación con `canal:'email'` se envía (en dev, log).
- [ ] **4.3 Acuse abre plazos**
  - En trámites: `fecha_limite` empieza a contar al notificar/acusar (FASE 1).
  - Criterio: plazo de firma empieza tras el acuse.
- [ ] **4.4 Preferencias de canal**
  - Campo `canal_preferido` en `rsp_ciudadanos`; crearNotificacion lo respeta.
  - Criterio: ciudadano con email preferido recibe por email.

## FASE 5 — Subsanación guiada + firma múltiple (P1)
**Objetivo:** el solicitante sabe exactamente qué falta; las firmas múltiples se coordinan.

- [ ] **5.1 Subsanación con lista exacta**
  - En estado `subsanacion`: `t.requisitos_pendientes[]` (docs/errores concretos).
  - `detalle.ejs`: mostrar checklist; al aportar, validar contra la lista.
  - Criterio: subsanación muestra "falta: presupuesto actualizado, estatutos".
- [ ] **5.2 Firma múltiple**
  - Modelo `firmantes[]` (dip, rol, firmado) en trámites de `cambio-titularidad` (cedente+cesionario).
  - `firma-placetid.js` + webhook: esperar a todos; `confirmar_firma` avanza al completarse; progreso "1/2 firmas".
  - Criterio: con 2 firmantes, el trámite solo avanza al firmar ambos.

## FASE 6 — Borrador de declaración ciudadano (P1)
**Objetivo:** el contribuyente confirma su declaración desde la app.

- [ ] **6.1 Endpoint borrador por DIP**
  - En `tributos`/API: `GET /rsp/tributos/api/borrador/:dip` con datos reales reconciliados (ingresos, patrimonio, subvenciones, inversiones) + `importe_estimado`.
  - Criterio: devuelve el borrador con origen de cada dato.
- [ ] **6.2 Confirmar / corregir**
  - Estado `borrador|confirmada|corregida|presentada` en la declaración; endpoint para confirmar.
  - Criterio: confirmar desde la app fija la declaración como presentada.
- [ ] **6.3 Botón admin**
  - En `declaraciones.ejs`: regenerar borrador por contribuyente (reusar `reconciliarCuentaMes`).
  - Criterio: el admin puede regenerar un borrador individual.

## FASE 7 — Sucesión automática (P2)
**Objetivo:** la herencia recalcula el patrimonio de los herederos sin teclear.

- [ ] **7.1 Herederos y % en herencias**
  - En `herencias.js`: lista de herederos con % (testamento o ley).
  - Criterio: herencia registra herederos.
- [ ] **7.2 Reparto automático de patrimonio**
  - Al cerrar la herencia: recalcular participaciones (reusar `setParticipacion` dedupe) y titularidades para cada heredero según %; registrar como activos.
  - Criterio: al cerrar, cada heredero tiene su participación/activo actualizado.
- [ ] **7.3 Certificado + notificaciones**
  - Generar `DOC` de certificado de herederos; notificar a cada heredero.
  - Criterio: certificado enlazado al expediente y notificación enviada.

## FASE 8 — Transparencia + observabilidad + tests (P2)
- [ ] **8.1 Portal de transparencia público**
  - Rutas públicas: normativa vigente (CNIC), presupuestos, subvenciones otorgadas (sin datos personales).
  - Criterio: URL pública sin login lista los 3 bloques.
- [ ] **8.2 Observabilidad**
  - Middleware de request-id + logs estructurados (JSON) en rutas críticas; métricas de endpoint; alerta si 5xx>umbral.
  - Criterio: cada request logueado con id, duración, status.
- [ ] **8.3 Tests de motores**
  - `node --test` para `tramites.js`, `fiscalidad-ampliada.js`, `patrimonio.js` (casos: dedupe, plazos, validaciones).
  - Criterio: `npm test` en verde.
- [ ] **8.4 Migraciones en CI**
  - Workflow GitHub Actions que ejecute `scripts/aplicar-migraciones.mjs` con `SUPABASE_DB_CONNECTION` (secret).
  - Criterio: push a main corre la migración.

## FASE 9 — Seguridad y calidad (P3)
- [ ] **9.1 Secretos y rotación**
  - Centralizar `SUPABASE_DB_CONNECTION`, `PASSWORD_DEFAULT_SECRET` en Vercel; aviso de rotación.
  - Criterio: sin secretos en repo; `.env.example` documentado.
- [ ] **9.2 2FA admin en acciones críticas**
  - Confirmación con segundo factor (código/PlacetaID) para pagar, resolver, anular.
  - Criterio: acción crítica requiere doble confirmación.
- [ ] **9.3 i18n + accesibilidad**
  - Diccionario EN mínimo; auditoría WCAG del tema Vivid (contraste, foco, teclado).
  - Criterio: etiquetas clave traducidas; foco visible.

---

## Orden de ejecución (resumen)
1. **FASE 1** (plazos) → base de todo lo que depende del tiempo.
2. **FASE 2** (bandeja ciudadana API) → expone los plazos al ciudadano.
3. **FASE 4.1–4.3** (notificaciones + acuse) → alimenta plazos/recordatorios.
4. **FASE 3** (registro maestro) → deja de duplicar identidad.
5. **FASE 5–6** (subsanación, firma múltiple, borrador) → UX de trámites y tributos.
6. **FASE 7** (sucesión) → cierra el ciclo patrimonial.
7. **FASE 8** (transparencia/observabilidad/tests) → calidad.
8. **FASE 9** (seguridad/i18n) → endurecimiento.

**Regla:** cada fase se commitea y pushea por separado con su `docs/` actualizado. Los cambios que tocan el motor de trámites o la BD llevan **test y migración** antes del push.
