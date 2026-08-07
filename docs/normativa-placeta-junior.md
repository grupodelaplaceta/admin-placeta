# 📜 Normativa aplicable al programa **PLACETA JUNIOR**

> **Marco normativo del Grupo de La Placeta (GDLP)**
> Fuente oficial: **BOP — Boletín Oficial de La Placeta** (`bop.laplaceta.org`)
> Documentos: **Estatutos · CNI (Código Normativo Interno) · CNIC (Códigos Normativos Internos Complementarios)**
> Versión del documento: 1.0 · Actualizado: 07/08/2026

Este documento compila la normativa que aplica al programa **Placeta Junior** en todos los ámbitos del Grupo de La Placeta: identidad, altas, banco, impuestos, subvenciones, juego, convivencia y protección de datos. Los valores variables (% , precios, límites) viven en los **CNIC complementarios** y se sirven al programa desde el **backend remoto** (no son manipulables desde la aplicación).

---

## 1. Programa Placeta Junior (alcance)

- **Placeta Junior** es el programa educativo y bancario del GDLP para integrantes **menores de edad**.
- Ofrece: cuenta bancaria junior, RBU, academia de actividades (juegos, exámenes y diplomas), puntos verdes/rojos, amigos, control parental y monedero.
- La app permite **descargar hasta 10 actividades** para jugar sin conexión con la sesión guardada.
- Los valores y sistemas importantes (límites parentales, RBU, precios, umbral de examen, cupo offline) se obtienen de `GET /api/junior/config` del **backend remoto**, para evitar que la aplicación sea manipulable.

---

## 2. Identidad y altas (CNI Cap. I y II)

- **Acceso universal con autorización** (Art. 1): el acceso al GDLP está abierto a cualquier persona; los menores requieren la **autorización expresa de un mayor de edad activo**.
- **PlacetaID / DIP** (Cap. II): el PlacetaID es la pasarela de identificación oficial. El menor tiene su propio **DIP** y se autentica mediante PlacetaID Móvil (2FA biométrico) con la **autorización del tutor**.
- **Franjas de edad y tipo de alta** (CNIC-1.2):

| Edad | Alta | Acceso | Autorización |
|---|---|---|---|
| Cualquier edad (menor) | Alta tutelada | Acceso completo con restricciones de franja | Autorización expresa de un mayor de edad activo |
| Menos de 16 años | **Tutelada básica** | Básica + banco Junior básica (500 Pz / 50 Pz día) | Autorización mayor + supervisión mensual Administración |
| 16 a 17 años | **Tutelada senior** | Plena sin cargos directivos + banco Junior senior (1.000 Pz / 100 Pz día) | Autorización mayor + notificación a Administración |

- **Regularización**: los menores dados de alta antes del 1 de julio de 2026 con el bono de 500 Pz vigente podrán solicitar la regularización al nuevo régimen (CNI Cap. III).

---

## 3. Banco de La Placeta — cuentas y bonos (CNI Cap. III, Art. 7)

- **Tabla de cuentas por franja** (CNIC-4.1 / Art. 7):

| Franja | Tipo cuenta | Saldo máx. | Transferencia diaria | Bono bienvenida |
|---|---|---|---|---|
| Menos de 16 años | **Junior básica** | 500 Pz | 50 Pz/día | **750 Pz** |
| 16 a 17 años | **Junior senior** | 1.000 Pz | 100 Pz/día | **500 Pz** |

- **Bono de bienvenida** (Art. 7): **750 Pz** para menores de 16 años (alta tutelada básica) y **500 Pz** para el resto. Lo abona el Banco; si no puede, lo asume subsidiariamente la Administración. Es **intransferible los primeros 30 días** y no puede reclamarse un segundo bono.
- **Cuenta del sistema** para Placeta Junior:
  - `CAPITALIA_BANK` (**Capitalia**) — entidad que abona IVA, comisiones y los impuestos de los menores.
  - `TGLP` (Tesoro) — recibe el IVA y los tributos.
  - `AGLDP` (Fundación / Administración) — paga la RBU y bonos.

---

## 4. Renta Básica Universal (CNI Art. 4.6 / CNIC-4.6)

- El Banco emite un bono de **RBU de 5 Pz** por usuario activo (CNIC-4.6, valor variable servido desde backend).
- En el programa junior la RBU se reclama **manual y diariamente** desde el monedero (`RBU_DIARIO = 5 Pz` en backend). El bono no reclamado en el período **caduca y no se acumula**.
- La RBU es universal, **no es transferible** ni embargable por deudas con el Grupo.
- La Fundación (`AGLDP`) transfiere la RBU a la cuenta del junior mediante movimiento real en el banco.

---

## 5. Impuestos y subvenciones (CNI Cap. IV + Art. 5 y 6)

### 5.1 Los menores tributan, pero Capitalia paga hasta los 16 años
- Los menores de 16 años generan **IRM** (Impuesto de Regulación Monetaria) e **IGF** (Impuesto sobre Grandes Fortunas) sobre su patrimonio, igual que el resto de contribuyentes (CNI Cap. IV, Arts. 4.8-4.15).
- **Capitalia asume el pago**: la declaración del menor se emite desde `CAPITALIA_BANK → TGLP`, con concepto `DEC-JUNIOR … (impuestos asumidos por Capitalia)`. Al cumplir los 16 años, el junior tributa desde su propia cuenta principal.

### 5.2 IVA (CNI Art. 4.4)
- Todo producto o servicio del sistema GDLP está sujeto a **IVA del 12 %** (CNIC-4.4), desglosado en toda transacción comercial.
- En Placeta Junior, **Capitalia abona el IVA a TGLP** en cada compra de la academia (licencias e intentos) y en los pagos `PLJUNIOR_PAYMENT`.
- El precio mostrado al junior es el **total con IVA incluido**.

### 5.3 Art. 5 — Subvenciones destinadas al régimen tributario de menores de 16 años
> **Texto normativo (Art. 5):** Las empresas podrán subvencionar a **CAPITALIA** para únicamente abonar los impuestos de **IVA, IRM e IGF de los menores de 16 años**.
- Implementación: `CAPITALIA` es el receptor de las subvenciones destinadas a los impuestos de los menores.
- `CAPITALIA_GASTOS_PERMITIDOS`: `Tax`, `IrmCharge`, `ForcedVatRegularization`, `InvestmentTax`, `PljuniorPayment`.

### 5.4 Art. 6 — Categoría de pagos `PLJUNIOR_PAYMENT`
> **Texto normativo (Art. 6):** Creación de la categoría de pagos **PLJUNIOR_PAYMENT**. Se permitirá en el sistema público de subvenciones excluir esta categoría o únicamente incluir esta.
- Los pagos de recompensas y juegos de Capitalia en nombre de **PLACETA JUNIOR** usan la categoría `PLJUNIOR_PAYMENT`.
- Sujeta a tributos (IVA, IRM, IGF): el IVA se liquida a `TGLP`.
- En el sistema público de subvenciones puede **excluirse** la categoría o **incluirse únicamente** ella.

---

## 6. Loterías, juegos e inversiones (CNI Cap. VI)

- **Los menores de 12 años tienen prohibido el acceso a loterías** aunque dispongan de alta tutelada. El tutor interno que facilite dicho acceso incurre en **infracción grave**.
- **Inversiones con componente de azar** (fondos de riesgo simulados, apuestas, mercados de predicción): **solo mayores de 18 años con alta plena**, verificados mediante PlacetaID. **Ningún tutor puede autorizar el acceso de un menor** a estas actividades.
- Los productos de inversión **sin componente de azar** están disponibles para todos los integrantes con cuenta activa, con los límites bancarios de su franja de edad.

---

## 7. Convivencia y conducta (CNI Cap. VIII)

- Todos los integrantes tienen la obligación de tratarse con **respeto y dignidad**.
- Normas obligatorias aplicables a los menores en el programa: usar lenguaje apropiado, no insultar, no acosar, no difamar (CNI Cap. IX) y respetar la convivencia en la academia y entre amigos.

---

## 8. Protección de datos de menores (CNI Cap. XI y XIV)

- **Menores de 14 años**: el consentimiento para el tratamiento de sus datos requiere la **autorización del tutor interno** mayor de edad registrado en el GDLP.
- **Entre 14 y 17 años**: el menor puede prestar consentimiento por sí mismo para tratamientos ordinarios, pero el **tutor debe ser informado**.
- Las comunicaciones dirigidas a menores serán **apropiadas a su edad** y no incluirán datos de terceros sin autorización expresa.
- Los datos de menores **no se publicarán ni compartirán** públicamente sin consentimiento expreso del tutor interno.
- El tratamiento ilícito o la vulneración de derechos de menores es **infracción muy grave** (derivación a AEPD; multas Art. 83.5 RGPD).

---

## 9. Control parental (normativa interna PJ-NORM-001)

Límites por defecto cuando el tutor no ha personalizado los límites. **Los valores se sirven desde el backend** (`GET /api/junior/config` → `control_parental.niveles`).

| Nivel | Edad | Máx. diario | Máx. semanal | Requiere tutor |
|---|---|---|---|---|
| PJ-N1 | 0-5 | 0 Pz | 0 Pz | — |
| PJ-N2 | 6-10 | 10 Pz | 50 Pz | > 5 Pz |
| PJ-N3 | 11-13 | 25 Pz | 100 Pz | > 10 Pz |
| PJ-N4 | 14-15 | 50 Pz | 250 Pz | solo notificación |
| PJ-N5 | 16-17 | 100 Pz | 500 Pz | informativo |

- Si el tutor configura límites personalizados, **prevalecen sobre los de la normativa**.
- Las categorías bloqueadas por el tutor no pueden operarse.
- La autorización del tutor se gestiona vía **PlacetaID Móvil** (notificación push + biometría).

---

## 10. Academia — exámenes y diplomas (spec §9-§17)

- **Tipos de actividad**: test, sopa de letras, relacionar, ordenar, completar y cálculo mental.
- **Precios con IVA** (12 %) que abona **Capitalia a TGLP**; el precio mostrado es el total (CNIC-4.4).
- **Examen**: actividad con **más de 10 preguntas** (`examen_umbral_preguntas`). Se aprueba con **≥ 70 %** (`aprobado_min`).
- **Diploma**: al aprobar un examen se genera un **diploma PDF oficial**:
  - **100 % → Excelencia**
  - ≥ 90 % → Mención especial
  - ≥ 70 % → Diploma
- **Puntos Verdes / Rojos** (spec §16-§17): aciertos y errores; se canjean por Placetas según las tablas servidas desde el backend (`canje_puntos_verdes`).
- **Puntos Rojos por intento**: 1 (servido desde backend).
- **Recompensas**: al aprobar, el junior gana la recompensa en Placetas definida para la actividad.
- **Regalías**: los admins pueden pagar regalías a los titulares (con `kind` normal o `PLJUNIOR_PAYMENT`).

---

## 11. Subvenciones a la academia

- Las empresas/entidades pueden **subvencionar actividades** para los menores (becas de acceso). Una actividad subvencionada no se muestra como "de pago".
- La subvención cubre licencias e intentos según lo justificado en el sistema de subvenciones del RSP.

---

## 12. Uso sin conexión (offline)

- Placeta Junior permite **descargar hasta 10 actividades** (`offline.max_actividades`, servido desde el backend) para jugar **sin conexión**.
- Las actividades descargadas se guardan en el dispositivo y se juegan con la **sesión guardada** (DIP y perfil persistidos).
- Al completar una actividad sin conexión, la realización se registra cuando hay red (best-effort); los puntos y diplomas se computan en el backend de forma remota.

---

## 13. Índice de referencias normativas (BOP)

| Código | Documento | Contenido relevante |
|---|---|---|
| CNI Cap. I | CNI | Altas y autorización de menores |
| CNI Cap. II | CNI | PlacetaID / DIP (identidad) |
| CNI Cap. III / Art. 7 | CNI + CNIC-4.1 | Cuentas junior, límites, bono bienvenida |
| CNI Art. 4.6 | CNI + CNIC-4.6 | RBU 5 Pz |
| CNI Cap. IV / Art. 4.4 | CNI + CNIC-4.4 | IVA 12 % |
| CNI Cap. IV / Arts. 4.8-4.15 | CNI + CNIC-4.10, 4.13, 4.14, 4.15 | IRM e IGF (los menores tributan) |
| Art. 5 | Normativa | Subvenciones a CAPITALIA para impuestos de menores |
| Art. 6 | Normativa | Categoría `PLJUNIOR_PAYMENT` |
| CNI Cap. VI | CNI | Loterías/juegos/inversiones y menores |
| CNI Cap. VIII y IX | CNI | Convivencia y difamación |
| CNI Cap. XI y XIV | CNI | Protección de datos de menores |
| PJ-NORM-001 | Interna | Control parental por nivel de edad |
| spec §9-§17 | Interna | Academia, precios, exámenes, diplomas, puntos |

---

*Este documento se mantiene en el repositorio del proyecto. Los valores variables (% , precios, límites, cupo offline) se sirven desde el backend remoto (`/api/junior/config`) y desde los CNIC del BOP; no están hardcodeados en la aplicación.*
