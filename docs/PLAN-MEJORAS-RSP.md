# PLAN DE IMPLEMENTACIÓN — RSP (revisado)
### De la comparativa con la República de Valdoria → ejecución, con la arquitectura acordada

> Reemplaza la versión anterior. Incorpora los redlines del equipo (sección 8 de `RSP-vs-pais-inventado.md`):
> **gdlp-crm = Administración Pública (ciudadano/entidad)** · **RSP = solo admin** ·
> **Contexto Único federado** (cada dominio es dueño de sus datos) ·
> **SERVICIO → TRÁMITE → EXPEDIENTE → ACTUACIONES** (expediente central) ·
> **silencio administrativo configurable** (no regla general) ·
> **sin biometría**: PlacetaID + 2FA + firma + niveles N1–N3 ·
> **P0 transversal primero**: modelo de expediente + fuentes de verdad.

Cada paso tiene **archivos/rutas**, **qué hacer** y **criterio de aceptación`. Se marca `[x]` al completar.

---

## FASE 0 — Fundamento: Modelo de expediente + fuentes de verdad (P0 transversal) 🔴
**Objetivo:** definir el modelo antes de ampliar funcionalidades. Es la base de SLA, bandeja, notificaciones, firma múltiple y nuevos trámites.

- [ ] **0.1 Modelo de 4 niveles**
  - En `src/config/tramites.js` + `src/config/expedientes.js`: representar `SERVICIO → TRÁMITE → EXPEDIENTE → ACTUACIONES`.
  - Cada trámite declara su `servicio`; al presentar se crea `EXP`; el expediente agrupa `actuaciones[]` (presentación, validación, requerimiento, subsanación, informe, resolución, firma, pago, justificación, cierre).
  - Criterio: un trámite subvención crea su `EXP` y registra cada actuación con fecha/responsable.
- [ ] **0.2 Expediente = objeto central**
  - `expedientes.js`: el expediente enlaza `documentos`, `actuaciones`, `firmas`, `notificaciones`, `pagos`, `validaciones`, `auditoría` (referencias, no duplicar datos).
  - Criterio: el detalle de expediente muestra todos los bloques enlazados.
- [ ] **0.3 Fuentes de verdad por dominio**
  - Documentar (en `docs/`) y respetar: PlacetaID=identidad · Banco(MongoDB)=cuentas/operaciones · Supabase RSP=expedientes/patrimonio/fiscalidad · Tributos=censo/declaraciones · gdlp-crm=portal ciudadano/entidad.
  - Criterio: ningún módulo escribe en datos de otro dominio; solo lee vía API.
- [ ] **0.4 "Contexto Único" del ciudadano (federado)**
  - En RSP (admin): endpoint `GET /rsp/api/contexto/:dip` que **agrega** Identidad (PlacetaID) + Banco (cuentas) + Fiscalidad (declaraciones/obligaciones) + Patrimonio (titularidades/participaciones) + Expedientes (activos/históricos) + Documentos + Firmas + Notificaciones, **consultando a cada dominio** (sin mega-DB).
  - Ficha del ciudadano en el panel (ya existe el buscador) pasa a mostrar este contexto completo.
  - Criterio: abrir un ciudadano muestra los 8 bloques con datos reales de cada dominio.

## FASE 1 — SLA y plazos configurables (P0) 🔴
**Objetivo:** todo expediente tiene plazo por estado y vencimiento con efecto configurable.

- [ ] **1.1 Plazos por estado/tipo**
  - En `tramites.js`: `plazos: { revision: 15, subsanacion: 10, firma: 7, justificacion: 20 }` por tipo + `plazo_default`.
  - Criterio: cada tipo define plazos.
- [ ] **1.2 Fecha límite + efecto de vencimiento configurable**
  - Al entrar en un estado: `t.fecha_limite`. Añadir `vencimiento: { modo: 'silencio_positivo' | 'silencio_negativo' | 'escalado' | 'prorroga' | 'intervencion' }` por tipo/estado.
  - **Sin silencio positivo por defecto**; cada procedimiento configura su efecto.
  - Criterio: el motor aplica el efecto configurado al vencer (no una regla global).
- [ ] **1.3 Visibilidad del plazo (UI admin)**
  - `detalle.ejs` (Resumen "Vence en X / ⚠️ vencido") + `trabajo.ejs` (chips de plazo; vencidos arriba).
  - Criterio: plazo visible en detalle y bandeja.
- [ ] **1.4 Recordatorios y escalado**
  - `revisarVencimientos()`: al 70% → notificación; al vencer → aplicar efecto configurado (escalar prioridad, prórroga o notificar).
  - Disparo: cron ligero o al abrir la bandeja.
  - Criterio: expediente al 70% recibe aviso; vencido ejecuta su efecto.

## FASE 2 — Registro maestro de identidad (P0) 🔴
**Objetivo:** una sola fuente de identidad; verificación por niveles, sin biometría.

- [ ] **2.1 Canon de ciudadano en Supabase**
  - Tabla `rsp_ciudadanos` (dip, placetaId, nombre, estado, nivel_identidad N1–N3, cuenta_principal, canal_preferido). Migración en `docs/migrar-rsp-core.sql`.
  - Criterio: tabla creada vía `scripts/aplicar-migraciones.mjs`.
- [ ] **2.2 Sincronización event-driven**
  - En `placetaid-sincronizacion.js`: alta en PlacetaID/banco → `upsertCiudadanoMaestro(dip)`.
  - Criterio: alta en PlacetaID ⇒ aparece en `rsp_ciudadanos`.
- [ ] **2.3 Resolver centralizado**
  - Helper `resolverCiudadano(dip)` usado por trámites, patrimonio, fiscalidad, contexto (0.4).
  - Criterio: todos los módulos resuelven identidad con el mismo helper.
- [ ] **2.4 Niveles de verificación**
  - N1 (registrado) → N2 (datos verificados) → N3 (firma/2FA). Beneficios por nivel (límites, firma, subvenciones).
  - Criterio: el ciudadano puede subir de nivel; los límites cambian con el nivel.

## FASE 3 — Interfaces separadas: gdlp-crm como Administración Pública (P0) 🔴
**Objetivo:** el ciudadano/entidad operan en gdlp-crm; RSP queda admin-only.

- [ ] **3.1 API ciudadana en gdlp-crm**
  - gdlp-crm consume las APIs RSP (trámites, expedientes, documentos, notificaciones) para las 2 interfaces:
    - 👤 Ciudadano: Inicio → Mi bandeja → Trámites → Documentos → Perfil.
    - 🏢 Entidad: Inicio → Expedientes → Obligaciones → Contabilidad → Documentos → Representantes → Notificaciones.
  - Criterio: desde gdlp-crm se inicia/consulta un trámite y se ve "¿tengo que hacer algo?".
- [ ] **3.2 Mi bandeja ciudadana (en gdlp-crm)**
  - `GET /rsp/tramites/api/bandeja/:dip` (acciones con plazo, prioridad, tipo, vence_en) consumida por gdlp-crm.
  - Criterio: un DIP ve sus acciones pendientes con plazos.
- [ ] **3.3 RSP admin-only**
  - Revisar rutas/permisos para que la UI de trámites del panel RSP no exponga flujo ciudadano (solo bandeja de trabajo + expedientes + contexto).
  - Criterio: no hay botones de "firmar/presentar" ciudadanos en el panel (ya se quitó el de firma).

## FASE 4 — Notificaciones multicanal + acuse (P1) 🟠
- [ ] **4.1 Modelo ampliado** — `notificaciones.js`: `canal` (app|email|push), `acuse_recibido`, `leida_en`.
- [ ] **4.2 Email (SendGrid/SMTP)** — módulo `notificaciones-email.js` con plantillas y fallback silencioso.
- [ ] **4.3 Acuse abre plazos** — `fecha_limite` del trámite empieza al acusar (integra FASE 1).
- [ ] **4.4 Preferencias de canal** — `canal_preferido` en `rsp_ciudadanos` (FASE 2).
- Criterio: notificación con canal email se envía; el acuse arranca el plazo.

## FASE 5 — Subsanación guiada + firma múltiple + 2FA (P1) 🟠
- [ ] **5.1 Subsanación guiada** — `requisitos_pendientes[]` (lista exacta) en estado subsanación; checklist en el detalle; validar contra la lista al aportar.
- [ ] **5.2 Firma múltiple** — `firmantes[]` (dip, rol, firmado) en cambio-titularidad (cedente+cesionario); webhook espera a todos; "1/2 firmas".
- [ ] **5.3 2FA admin en acciones críticas** — confirmación con segundo factor (PlacetaID/código) para pagar, resolver, anular.
- Criterio: subsanación indica exactamente qué falta; con 2 firmantes solo avanza al firmar ambos; acción crítica exige 2FA.

## FASE 6 — Borrador fiscal + auditoría ciudadana (P1) 🟠
- [ ] **6.1 Borrador de declaración** — `GET /rsp/tributos/api/borrador/:dip` (datos reales reconciliados) + estado `borrador|confirmada|corregida|presentada`; confirmar desde gdlp-crm.
- [ ] **6.2 Auditoría ciudadana** — endpoint por DIP de "quién vio/alteró mis datos"; visible en la ficha del ciudadano (0.4) y en gdlp-crm.
- Criterio: el ciudadano confirma su declaración; puede ver quién accedió a sus datos.

## FASE 7 — Sucesiones automáticas (P2) 🟢
- [ ] **7.1 Herederos y %** en `herencias.js` (testamento o ley).
- [ ] **7.2 Reparto automático de patrimonio** — al cerrar, recalcular participaciones/titularidades por heredero (reusa `setParticipacion` dedupe).
- [ ] **7.3 Certificado + notificaciones** — `DOC` de herederos enlazado al expediente; notificar a cada heredero.
- Criterio: heredero recibe su participación actualizada y certificado.

## FASE 8 — Transparencia, observabilidad y tests (P2) 🟢
- [ ] **8.1 Portal de transparencia** (público, sin login): normativa CNIC vigente, presupuestos, subvenciones otorgadas.
- [ ] **8.2 Observabilidad** — request-id + logs JSON, métricas por endpoint, alerta 5xx.
- [ ] **8.3 Tests de motores** — `node --test` para tramites, fiscalidad, patrimonio (dedupe, plazos, validaciones).
- [ ] **8.4 Migraciones en CI** — GitHub Actions ejecuta `scripts/aplicar-migraciones.mjs` con secret.
- Criterio: `npm test` verde; push a main corre migración.

## FASE 9 — Seguridad y calidad (P3) 🟢
- [ ] **9.1 Secretos** — `SUPABASE_DB_CONNECTION`, `PASSWORD_DEFAULT_SECRET` en Vercel + rotación.
- [ ] **9.2 i18n** — diccionario EN mínimo.
- [ ] **9.3 Accesibilidad** — auditoría WCAG del tema Vivid (contraste, foco, teclado).
- Criterio: sin secretos en repo; etiquetas clave traducidas; foco visible.

---

## Orden de ejecución (resumen)
1. **FASE 0** (modelo de expediente + fuentes de verdad + Contexto Único) — fundamento.
2. **FASE 1** (SLA configurable) — tiempo.
3. **FASE 2** (registro maestro) — identidad.
4. **FASE 3** (interfaces: gdlp-crm ciudadano/entidad + RSP admin + bandeja).
5. **FASE 4–6** (notificaciones, subsanación/firma/2FA, borrador fiscal + auditoría ciudadana).
6. **FASE 7** (sucesiones).
7. **FASE 8** (transparencia/observabilidad/tests).
8. **FASE 9** (seguridad/i18n).

**Regla:** cada fase se commitea y pushea por separado con `docs/` actualizado; los cambios de motor/BD llevan **test y migración** antes del push. La FASE 0 es requisito de las demás.

**Fuentes:** `RSP-vs-pais-inventado.md` (sección 8 = redlines) · `PLAN-MEJORAS-RSP.md` (este plan).
