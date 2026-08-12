# RSP de La Placeta frente a un país imaginario
### Organización, procedimientos y plan de mejoras para todo el ecosistema

> Documento de análisis y propuesta. El **RSP (Red de Servicios de La Placeta)** se compara con la **República de Valdoria**, un país imaginario pequeño, moderno y *digital-first* (≈20.000 ciudadanos equivalentes), famoso por su administración transparente, sus plazos garantizados y su "ventanilla única". La comparación no es decorativa: sirve para detectar **qué le falta al RSP para funcionar como un mini-estado bien administrado**.

---

## 1. Idea central

El RSP ya se comporta como un **estado soberano digital en miniatura**:

- Tiene **moneda propia** (Pz) y un **banco central** (Banco de La Placeta: TGLP, AGLDP, FUND-BLP).
- Tiene **hacienda** (Tributos: censo, IRM/IGF, IVA) y **registro de riqueza** (Patrimonio: titularidades, participaciones, activos).
- Tiene **identidad** (PlacetaID), **gobierno** (Junta), **leyes** (CNIC) y **servicios públicos** (RSP).
- Tiene **procedimiento administrativo** (motor de trámites), **control** (Auditoría/Comprobación) y **canal oficial** (Notificaciones).

Valdoria es el "qué pasaría si" de esa idea llevada al extremo de la eficiencia. **El objetivo de este documento es listar, de forma concreta, los cambios que acercan el RSP a esa referencia.**

---

## 2. Mapa institucional comparado

| RSP (La Placeta) | República de Valdoria | Función equivalente |
|---|---|---|
| **Banco de La Placeta** (TGLP, AGLDP, CAPITALIA_BANK, FUND-BLP) | Banco Central + Tesoro | Emisión de moneda, reservas, pagos, fondo de apoyo, ejecuciones |
| **Tributos de La Placeta** | Agencia Tributaria | Censo de contribuyentes, declaraciones, IRM/IGF, IVA |
| **Junta de La Placeta** | Legislativo + Ejecutivo | Leyes, votaciones, cargos, reclamaciones, departamentos |
| **PlacetaID** (id.laplaceta.org) | Registro Civil + DNI electrónico + Firma electrónica | Identidad, credenciales, firma en móvil, cierre de sesión global |
| **CNIC (Centro Normativo)** | Constitución + Código Legal | Marco normativo y reglas fiscales |
| **RSP (Red de Servicios)** | Administración General / Ventanilla Única | Servicios, trámites, expedientes, conexiones, facturación |
| **Motor de Trámites + Bandeja de trabajo** | Procedimiento Administrativo Común (PAC) | Ciclo de vida de los trámites con siguiente paso siempre visible |
| **Patrimonio** (titularidades, participaciones, activos) | Registro de la Propiedad + Catastro | Trazabilidad de la riqueza y su transmisión |
| **Fiscalidad ampliada** | Hacienda (líquido imponible) | Retribuciones, desgravaciones IVA, patrimonio afecto |
| **Auditoría** | Tribunal de Cuentas | Control de todas las acciones administrativas |
| **Comprobación ecosistema** | Inspección / órgano de control | Verificación del estado real del sistema |
| **Incidencias / Reclamaciones** | Defensor del Pueblo + justicia administrativa | Resolución de conflictos y subsanaciones |
| **Notificaciones** | BOE + notificaciones administrativas | Comunicación oficial y plazos |
| **Herencias y Bajas** | Registro de sucesiones | Transmisión de titularidad y baja de personas/entidades |
| **Subvenciones** | Convocatorias públicas | Ayudas con solicitud → justificación |
| **Operation Engine** | Normas de operación / infraestructura | Reglas de funcionamiento del sistema |

---

## 3. Comparativa de procedimientos clave

### 3.1 Alta de identidad (onboarding ciudadano)

| | RSP (hoy) | Valdoria |
|---|---|---|
| Registro | PlacetaID (alta automática desde el banco con contraseña temporal recuperable) | **Auto-onboarding en 5 minutos** con verificación biométrica/video-llamada opcional |
| Credencial | DIP + contraseña temporal + firma móvil | DNI digital con claves + firma cualificada en el móvil |
| Verificación | Cruzada con cuentas del banco | Verificación de identidad **una sola vez** (registro maestro único) |
| **Gap** | Identidad **duplicada en 3 registros** (PlacetaID, Supabase `solicitantes`, censo tributario) | Registro civil único del que beben todos los servicios |

**Mejora recomendada:** convertir PlacetaID en **registro maestro único** y hacer que `solicitantes`, censo y banco se **sincronicen automáticamente** (ya hay sincronización; falta que sea *event-driven* en vez de manual/batch).

### 3.2 Apertura de cuenta bancaria

| | RSP | Valdoria |
|---|---|---|
| Hoy | Alta de cuenta vía admin / banco; censo requiere `bank_user` | Apertura **inmediata y autónoma** al verificar identidad, con límites por nivel |
| **Gap** | El ciudadano no puede abrirse su cuenta desde la app sin pasar por un admin | Proceso autónomo con límites progresivos |

### 3.3 Declaración tributaria

| | RSP | Valdoria |
|---|---|---|
| Hoy | Declaraciones **regeneradas con datos reales** del banco (reconciliación, participaciones, subvenciones, inversiones) | Declaración **pre-rellenada al 100%**; el ciudadano solo confirma o corrige |
| **Gap** | Falta el paso de **"confirmación ciudadana"** y el **borrador público** consultable desde la app | Confirmación expresa con responsabilidad fiscal |

### 3.4 Solicitud de subvención / ayuda (trámite completo)

```mermaid
flowchart LR
  A[🟣 Inicio] --> B[📝 Datos] --> C[📎 Documentación] --> D[⚙️ Validaciones automáticas]
  D --> E[👤 Revisión] --> F[🔍 Subsanación] --> G[✅ Resolución] --> H[✍️ Firma PlacetaID Móvil]
  H --> I[💰 Ejecución / Pago] --> J[📊 Justificación] --> K[📦 Cierre y archivo]
```

| | RSP (motor de trámites) | Valdoria |
|---|---|---|
| Cómo se guía | **Siguiente paso siempre visible** (stepper + banner de acción) | Ídem, pero con **plazos máximos por estado** |
| Firma | Ciudadano firma en **PlacetaID móvil** (webhook avanza el trámite) | Firma cualificada en móvil + **doble firma** cuando hay dos partes |
| Subsanación | Se vuelve a revisión | Subsanación **guiada**: el sistema dice exactamente qué falta |
| **Gap principal** | **No hay plazos/SLA ni silencio administrativo** | Plazos garantizados: 15 días en revisión, silencio positivo |

### 3.5 Cambio de titularidad y herencia

| | RSP | Valdoria |
|---|---|---|
| Hoy | Trámite de cambio de titularidad con documentación + firma; módulo de herencias y bajas | Sucesión **con testamento digital** y reparto automático de participaciones |
| **Gap** | Las **participaciones/% en patrimonio** ya se gestionan (motor), pero falta el **flujo de sucesión completo** que recalcule cuotas automáticamente y notifique a herederos | Reparto automático + certificado de herederos |

### 3.6 Reclamación / incidencia

| | RSP | Valdoria |
|---|---|---|
| Hoy | Incidencias con estados (abierta→resuelta) + notificaciones | Reclamación con **código único**, plazos y **escalado automático** |
| **Gap** | Falta **escalado por antigüedad** (si pasa N días sin respuesta, sube de nivel) y **rendición al reclamante** | Escalado automático + retroalimentación obligatoria |

### 3.7 Notificación oficial

| | RSP | Valdoria |
|---|---|---|
| Hoy | Campana en el panel + tabla de notificaciones | **Canal preferido** (app, email, SMS) con acuse de recibo |
| **Gap** | Faltan **canales reales** (email/móvil) y el **acuse de recibo** que abre plazos | Comunicación multicanal con acuse |

---

## 4. Lo que el RSP ya hace bien (fortalezas a conservar)

1. **Automatización con datos reales**: retribuciones, desgravaciones de IVA, patrimonio afecto y registro automático de patrimonio se calculan **desde el estado real del banco** (no se teclean).
2. **Motor de trámites genérico**: cada trámite es config (flujo, documentos, validaciones, acciones) y el frontend solo lo representa. **Extensible sin tocar código por trámite.**
3. **Firma centrada en el ciudadano**: se firma desde **PlacetaID móvil**, no en el panel de admins; el webhook avanza el workflow solo.
4. **Numeración única y trazable**: `RSP-…`, `EXP-…`, `DOC-…`, `SIG-…`, `OP-…`.
5. **Panel de admins cómodo**: bandeja de trabajo, buscador global de ciudadanos, KPIs, UI homogénea "Vivid Infrastructure".
6. **Validaciones automáticas** de identidad/entidad/documentación/cuenta al presentar.
7. **Permisos por rol** y **auditoría** de cada acción.
8. **Censo ciudadano** resuelto (18 `bank_users`, 16 censados), con detección de ciudadano por cuenta (no solo por usuario).

---

## 5. Brechas y mejoras posibles (priorizado por dominio)

### A. Identidad y datos maestros 🔴
- **A1.** Registro maestro único de ciudadanos/entidades (hoy: PlacetaID + Supabase + censo = 3 fuentes). **Sincronización event-driven**.
- **A2.** El ciudadano debe **ver su ficha única** (datos, cuentas, patrimonio, trámites, declaraciones) en su app; el panel admin ya la tiene.
- **A3.** Proceso de **verificación progresiva** (N1→N3) con beneficios por nivel (límites bancarios, firma, subvenciones).

### B. Ciclo de vida ciudadano / UX 🔴
- **B1.** **"Mi bandeja" ciudadana en la app** (no en el panel): acciones pendientes del ciudadano con "vence en X días".
- **B2.** Onboarding autónomo: alta de cuenta + PlacetaID + censo en un solo flujo desde la app.
- **B3.** Un único número de expediente que enlace trámite + documentos + firma + pago (ya existe `EXP`, hay que **mostrarlo en la app**).

### C. Trámites y plazos 🔴
- **C1.** **SLA por estado**: plazos máximos (revisión 15 días, subsanación 10, firma 7) y **silencio administrativo** (positivo/negativo).
- **C2.** **Recordatorios automáticos** (notificación + escalado si se pasa el plazo).
- **C3.** **Subsanación guiada**: lista exacta de documentos/errores requeridos, con enlace para aportarlos.
- **C4.** Firma **múltiple** (n firmantes) cuando el trámite lo requiera (p.ej. cambio de titularidad con cedente+cesionario).
- **C5.** Acciones masivas en la bandeja de trabajo (validar/archivar varios expedientes).

### D. Notificaciones y comunicaciones 🟠
- **D1.** Canales reales: **email y push móvil** además de la campana.
- **D2.** **Acuse de recibo** que "abre" los plazos de un trámite.
- **D3.** Plantillas oficiales por tipo de trámite y **preferencias de canal** del ciudadano.

### E. Fiscalidad 🟠
- **E1.** **Borrador de declaración** consultable por el ciudadano en su app, con "confirmar" o "corregir".
- **E2.** **Cuadro de mando fiscal** por contribuyente (retenciones, deudas, próximas liquidaciones).
- **E3.** Automatizar **sanciones** y su cobro (ya hay base en Comprobación/Sanciones) con notificación y plan de pago.

### F. Patrimonio 🟠
- **F1.** **Sucesión automática**: al registrar una herencia, recalcular % de participaciones y titularidades de forma automática (el motor ya deduplica; falta el flujo de reparto entre herederos).
- **F2.** Valoraciones **con fecha** (histórico de patrimonios por periodo) para el cálculo correcto del IGF.
- **F3.** **Alerta de patrimonio neto negativo / grandes variaciones** (monitorización).

### G. Control, auditoría y transparencia 🟢
- **G1.** Portal de **transparencia** público (normativa vigente, presupuestos, subvenciones otorgadas).
- **G2.** **Auditoría consultable por el ciudadano** sobre sus propios datos (quién vio qué y cuándo).
- **G3.** Informes periódicos automáticos (mensual fiscal, trimestral de subvenciones).

### H. Seguridad y cumplimiento 🟢
- **H1.** Gestión de secretos (claves en Vercel: `PASSWORD_DEFAULT_SECRET`, `SUPABASE_DB_CONNECTION`) centralizada y rotación.
- **H2.** **Doble factor** para acciones admin críticas (pagar, resolver, anular).
- **H3.** **RBAC granular** ya existe; falta el **soporte de delegaciones temporales** (que un admin delegue su bandeja).

### I. Técnica / arquitectura 🟢
- **I1.** **Persistencia coherente**: hoy conviven Supabase + MongoDB (backend-banco) + memoria/archivo. Definir **fuentes de verdad por dominio** y una capa de sincronización.
- **I2.** **Observabilidad**: logs estructurados, métricas y alertas por endpoint (hoy casi no hay).
- **I3.** **Migraciones versionadas** y ejecutables (el runner `scripts/aplicar-migraciones.mjs` ya existe; falta integrarlo en CI).
- **I4.** **Tests** de los motores (trámites, fiscalidad, patrimonio) — hoy es todo probado a mano.
- **I5.** Documentar **contratos de API** (los endpoints del banco ya son una API viva).

### J. Entidades y cumplimiento 🟢
- **J1.** Ciclo de vida de entidad completo: alta → cumplimiento → **disolución** (hoy falta la parte final).
- **J2.** **Representantes legales** y su trazabilidad (quién puede firmar por una entidad).

### K. Accesibilidad e internacionalización 🟢
- **K1.** **Idiomas** (ES mínimo; preparar EN).
- **K2.** **Accesibilidad** (contraste, teclado, lectores) — el tema oscuro Vivid ya ayuda, falta WCAG.

---

## 6. Plan priorizado

| Prioridad | Mejora | Impacto | Esfuerzo | Dependencias |
|---|---|---|---|---|
| 🔴 P0 | **SLA + plazos en trámites** (C1–C2) | Alto | Medio | Motor de trámites (ya hecho) |
| 🔴 P0 | **"Mi bandeja" ciudadana en la app** (B1) | Alto | Medio | API de trámites + app móvil |
| 🔴 P0 | **Registro maestro único + sincronización event-driven** (A1) | Alto | Alto | PlacetaID + Supabase + censo |
| 🟠 P1 | **Notificaciones multicanal + acuse** (D1–D3) | Medio | Medio | Email/push |
| 🟠 P1 | **Subsanación guiada + firma múltiple** (C3–C4) | Medio | Medio | Motor de trámites |
| 🟠 P1 | **Borrador de declaración ciudadano** (E1) | Medio | Medio | Tributos + app |
| 🟢 P2 | Sucesión automática (F1) | Medio | Alto | Patrimonio |
| 🟢 P2 | Transparencia pública (G1) | Medio | Bajo | Vistas públicas |
| 🟢 P2 | Observabilidad + tests (I2–I4) | Medio | Medio | Infra |
| 🟢 P3 | i18n + accesibilidad (K) | Bajo | Medio | Global |

---

## 7. Conclusión

El RSP no es "un panel más": es la **columna vertebral de un mini-estado digital** con moneda, hacienda, identidad y procedimiento administrativo propios. Frente al país imaginario de referencia (Valdoria), su principal fortaleza es la **automatización con datos reales** y el **motor de trámites genérico**; sus principales deudas son **los plazos garantizados, la UX ciudadana en la app, la unicidad de los datos maestros y la observabilidad**.

Las mejoras P0 (plazos en trámites, bandeja ciudadana, registro maestro único) son las que más acercan al RSP a ser un "estado que se administra solo", manteniendo lo que ya funciona: firma en el móvil del ciudadano, panel de admins cómodo y datos que no se teclean.

---

## 8. Correcciones de arquitectura (redlines del equipo)

Este documento se revisó y se adoptaron estas decisiones que **matizan o sustituyen** partes anteriores.

### 8.1 Tres interfaces, no una
- **gdlp-crm es la web principal** (NO un CRM): actúa como **Administración Pública** donde **ciudadanos y entidades** acceden y realizan trámites.
  - 👤 **Ciudadano**: Inicio → Mi bandeja → Trámites → Documentos → Perfil. La única pregunta que responde: **"¿Tengo que hacer algo?"**
  - 🏢 **Entidad**: Inicio → Expedientes → Obligaciones → Contabilidad → Documentos → Representantes → Notificaciones.
- **RSP es solo para admins**: Inicio → Bandeja de trabajo → Expedientes → Ciudadanos → Entidades → Operaciones → Auditoría → Configuración (filtros avanzados, acciones masivas, asignación, escalado, validaciones, resolución).
- El panel RSP **no debe exponer UI ciudadana**; la bandeja ciudadana vive en gdlp-crm.

### 8.2 "Contexto Único" del ciudadano (federado, sin mega-DB)
Cuando Administración abre un expediente, ve un **contexto único del ciudadano**:
```
👤 Identidad (PlacetaID verificado)
💰 Banco (2 cuentas)
🧾 Fiscalidad (declaraciones, obligaciones, retenciones)
🏠 Patrimonio (titularidades, participaciones)
📋 Expedientes (4 activos, 12 históricos)
📄 Documentos (28)
✍️ Firmas (3 pendientes)
🔔 Notificaciones (2 pendientes)
```
**Cada dominio sigue siendo dueño de sus datos** (PlacetaID=identidad, Banco=MongoDB, RSP/Supabase=expedientes/patrimonio, Tributos=censo/declaraciones, gdlp-crm=portal). El "Contexto Único" es una **vista agregada vía APIs**, no una base central. Eso convierte al RSP en **ventanilla única federada**.

### 8.3 El trámite tiene 4 niveles
```
SERVICIO (Subvenciones)
   ↓
TRÁMITE (Solicitar subvención)
   ↓
EXPEDIENTE (EXP-2026-000184)   ← objeto central del RSP
   ↓
ACTUACIONES (presentación, validación, requerimiento, subsanación, informe, resolución, firma, pago, justificación, cierre)
```
El expediente pasa a ser el **objeto central** que agrupa documentos, actuaciones, firmas, notificaciones, pagos, validaciones y auditoría.

### 8.4 Silencio administrativo configurable (no regla general)
No se establece "silencio positivo" por defecto. El motor permite configurar **por procedimiento**:
```
plazo: 15 días
si vence → silencio positivo | silencio negativo | escalado | prórroga | requiere intervención
```

### 8.5 Sin biometría/video generalizada
PlacetaID ya da identidad y firma. Se prioriza **PlacetaID + 2FA + firma + niveles de verificación (N1→N3)** antes que biometría en todos los procesos.

### 8.6 Ranking de propuestas (valoración)
| Propuesta | Valoración |
|---|---|
| Motor de trámites configurable | ⭐⭐⭐⭐⭐ |
| Mi bandeja ciudadana | ⭐⭐⭐⭐⭐ |
| SLA y plazos | ⭐⭐⭐⭐⭐ |
| Subsanación guiada | ⭐⭐⭐⭐⭐ |
| Registro maestro de identidad | ⭐⭐⭐⭐⭐ |
| Fuentes de verdad por dominio | ⭐⭐⭐⭐⭐ |
| Notificaciones multicanal | ⭐⭐⭐⭐½ |
| Firma múltiple | ⭐⭐⭐⭐½ |
| Borrador fiscal | ⭐⭐⭐⭐½ |
| Auditoría ciudadana | ⭐⭐⭐⭐½ |
| Sucesiones automáticas | ⭐⭐⭐⭐ |
| Portal de transparencia | ⭐⭐⭐⭐ |
| Observabilidad/tests | ⭐⭐⭐⭐⭐ (técnicamente) |
| Biometría/video | ⭐⭐½ |

### 8.7 Roadmap revisado: P0 transversal primero
Antes de ampliar funcionalidades, se define **P0 previa/transversal: "Modelo de expediente + fuentes de verdad"**:
```
IDENTIDAD → SERVICIO → TRÁMITE → EXPEDIENTE
  ├── Documentos ├── Actuaciones ├── Firmas ├── Notificaciones
  ├── Pagos ├── Validaciones └── Auditoría
```
Cada cosa tiene un **propietario**. Si esto queda bien diseñado, SLA, Mi bandeja, notificaciones, firma múltiple, auditoría y nuevos trámites salen mucho más fácil.

> **Visión final:** el RSP es una **plataforma de procedimiento administrativo configurable** donde cada trámite es un expediente con estado, plazos, documentos, responsables, firmas, comunicaciones, operaciones y auditoría; y la UI esconde la complejidad al ciudadano: *"esto es lo que está pasando, esto es lo que falta y esto es lo que tienes que hacer ahora"* → **un sistema operativo administrativo de todo el ecosistema**.

---

*Documento generado a partir del estado real del RSP (admin-placeta + backend-banco + PlacetaID + gdlp-crm). El país comparado (República de Valdoria) es imaginario y sirve exclusivamente como referencia de mejores prácticas.*
