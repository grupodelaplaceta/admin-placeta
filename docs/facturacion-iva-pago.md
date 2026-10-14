# IVA por facturas — pago selectivo/agrupado a Tributos (RSP + Banco)

> Diseño y decisión autónoma (2026-09-02). Documento de trabajo para revisar.
> Cambia el modelo: **el IVA ya no se descuenta automáticamente a TGLP al
> liquidar una venta**; cada venta genera su factura y la empresa ingresa el
> IVA **pagando sus facturas** (todas de golpe o seleccionándolas), en una
> transferencia del Banco a TRIBUTOS (TGLP). Queda pagado en RSP y nunca se
> vuelve a cobrar.

## Problema detectado (verificación)
1. `backend-banco/api/crm-state.js` (acciones `transferir`/`transferir-masivo`):
   cuando una transferencia lleva `iva>0`, se creaba **automáticamente** una
   transacción `Tax` desde la cuenta **destino** → `TGLP` con el IVA.
2. `backend-banco/lib/bankCollections.js` (~L425/L535): al liquidar transacciones
   `Consumption/Placezum/InvestmentBuy/PLJUNIOR_PAYMENT` con `ivaPz`, se suma el
   IVA a `TGLP` automáticamente.
   ⇒ Riesgo: si además se cobra por factura, se pagaría el IVA **dos veces**.

## Cambios aplicados (esta iteración)
### rsp-web (motor + API + panel)
- `server/facturacion.js`:
  - Cada **factura de venta/servicio** lleva `ivaPagado/fechaPagoIva/
    transaccionPagoIva` (nace pendiente: el IVA **no** se cobra solo).
  - Por empresa: `ivaAIngresar` (suma de IVA de facturas no pagadas) y
    `totalIvaPagado`; el resumen agrega `totalIvaVentas/totalIvaAIngresar/
    totalIvaPagado`.
  - `seleccionarPagoIva(empresa, facturaIds?)`: devuelve las facturas
    pendientes (todas, o solo las indicadas); nunca una ya pagada.
  - `pagosIvaExternosDeEmpresa(state, empresa)`: detecta las transferencias
    REALES Settled empresa→TGLP cuyo concepto referencia facturas
    (`Pago IVA facturas <mes> · … · refs:FAC-…,FAC-…`) → mapa factura→{tx,fecha}.
    Es la conciliación de los pagos hechos por el **ciudadano** en Banco web/APP.
- `server/api.js`:
  - El ciclo refleja las facturas con IVA ya ingresado (persistido) y
    **concilia** los pagos externos detectados (los persiste como `ivaPagado`).
  - **Nuevo `POST /rsp/facturacion/api/pagar-iva`** `{ mes, eip, facturaIds? }`:
    transfiere el IVA pendiente de la empresa → `TGLP` (acción `transferir`
    con `iva:0`, es decir **una transferencia del Banco, nunca PlaceZum**),
    marca las facturas `ivaPagado` en `rsp_facturacion` y emite aviso. Es
    idempotente (las ya pagadas se ignoran).
- `server/facturacion-publico.js`: **ruta ciudadana SOLO LECTURA**
  `GET /api/v1/tributos/facturacion?eip=&mes=` (validada por
  `X-API-Key` = `TRIBUTOS_API_KEY`) → facturas del mes de una empresa + IVA
  pendiente por factura; concilia y persiste los pagos externos. Se monta en
  `app.js` ANTES de la sesión de administrador.
- `server/sql/rsp_facturacion.sql`: columnas `iva_pagado`, `fecha_pago_iva`,
  `transaccion_pago_iva` (+ `ALTER ... IF NOT EXISTS`).
- Panel `Facturación`: columna “IVA a ingresar” con botón **Pagar IVA** por
  empresa y estado por factura (“pagado/pendiente”); KPI “IVA a ingresar”.
- Tests (`server/facturacion.test.mjs`): 15/15 — ciclo con IVA por factura,
  `seleccionarPagoIva` agrupado/selectivo/sin repetir y conciliación de pagos
  externos (Settled a TGLP con refs; ignora Pending/no-TGLP/sin refs/ajenos).

### backend-banco (`api/crm-state.js`)
- El IVA automático **solo se descuenta al momento** cuando el destino **no** es
  una empresa del Grupo (Capitalia/AGLDP/TGLP/FUND y demo siguen igual). Para
  destinos **Business privados del Grupo** el IVA queda **diferido por factura**
  (`ivaDiferido:true` en la respuesta) y se gestiona en RSP vía `pagar-iva`.
  Esto evita pagar el IVA dos veces. (El modo demo no cambia.)

### Capa ciudadana (Banco web / APP) — iteración completada
- `backend-banco/api/web.js` (Bearer PlacetaID, solo datos del titular):
  - `GET /api/web/facturacion?mes=` → facturas del mes de las cuentas Business
    del titular/gestor (scope por EIP; lee de RSP).
  - `POST /api/web/facturacion/pagar-iva { from, mes, facturaIds[] }` →
    valida propiedad + facturas pendientes, y crea una transferencia **Pending**
    de la empresa a **TGLP** por el IVA seleccionado (ivaPz 0, concepto con
    `refs:FAC-…`, `source: banco-web-facturacion`). El abono real se ejecuta al
    confirmarla en **PlacetaID Móvil** (flujo de firma existente). RSP la
    concilia al liquidarse.
  - Env: `ADMIN_PLACETA_URL` + `TRIBUTOS_API_KEY`.
- `backend-banco/api/v1/tributos/[...ruta].js`: `GET /api/v1/tributos/facturacion`
  (proxy a RSP por EIP) para la pestaña de la APP.
- `banco-web`: nueva página `/facturacion` (vista `facturacion.ejs`): por empresa
  muestra sus facturas del mes (IVA pendiente/pagado), el titular **selecciona**
  las facturas y paga su IVA **de golpe** (se muestra el código de ejecución para
  confirmar en la APP). Enlace “Facturación” en el menú.
- **Banco APP (Kotlin)**: el pago ordenado desde la web se confirma en la APP
  (firma/execution-code) sin cambios. Pendiente de un siguiente paso: que la
  pestaña `Sociedades → Facturación` (`BusinessInvoicePanel`,
  `BancoPlacetaApp.kt` ~L4986) muestre las facturas reales vía el gateway
  `/api/v1/tributos/facturacion` (ya expuesto) en lugar de los datos locales.

## Pendiente (requiere tu OK)
1. **Banco APP (Kotlin)**: ya implementado y compilado (BUILD SUCCESSFUL):
   - `DocumentActionsClient`: `consultarFacturas(eip, mes)` (GET gateway
     `/api/v1/tributos/facturacion`) y `pagarIvaFacturas(eip, from, mes,
     facturaIds)` (POST `/facturacion/pagar-iva` → crea el Pending a TGLP).
   - `BusinessInvoicePanel` (`Sociedades → Facturación`): ahora muestra las
     **facturas reales** del mes + IVA pendiente/pagado, permite seleccionar
     facturas y pagar su IVA **de golpe** (muestra el código de ejecución para
     confirmar en PlacetaID Móvil). Se conservan enlaces de pago y TPV NFC.
   - OJO: `banco-app` vive en el monorepo divergido `grupodelaplaceta/
     grupodelaplaceta` (NO se empuja); los cambios están en el working tree.
2. `bankCollections.js` (escrituras app-driven de `Consumption/Placezum/
   PLJUNIOR_PAYMENT`): decidir si también deja de auto-abonar el IVA a TGLP y
   pasa a factura (no tocado: afecta al flujo de la app y a Capitalia).
3. **PlaceZum**: confirmar el límite/CNIC (hoy va ligado al límite semanal de la
   tarjeta y no se usa en cuentas Business). Política aplicada: facturas/IVA/
   impuestos/recompensas junior = **Transferencia**; nunca PlaceZum.
4. Reconciliación: un `Tax` automático antiguo hacia TGLP podría aparecer como
   pago del recibo IRM/IGF; tras desactivar el IVA automático de empresa, vigilar
   que no queden `Tax` residuales de meses previos que “paguen” recibos futuros.
5. En producción, `TRIBUTOS_API_KEY` debe ser la MISMA en rsp-web (server/.env o
   Vercel) y en backend-banco, y `ADMIN_PLACETA_URL` debe apuntar al servidor que
   sirve `rsp-web` (con la migración `rsp_facturacion.sql` ya aplicada).

## Regla de negocio (objetivo)
> Todo IVA repercutido por una empresa se ingresa a **TRIBUTOS (TGLP)** cuando
> la empresa paga sus facturas (selección múltiple o de golpe), queda **pagada**
> en RSP y **no se vuelve a cobrar**. Es siempre una transferencia del Banco de
> La Placeta (nunca PlaceZum).
