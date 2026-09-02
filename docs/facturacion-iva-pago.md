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
- `server/api.js`:
  - El ciclo refleja las facturas con IVA ya ingresado (persistido).
  - **Nuevo `POST /rsp/facturacion/api/pagar-iva`** `{ mes, eip, facturaIds? }`:
    transfiere el IVA pendiente de la empresa → `TGLP` (acción `transferir`
    con `iva:0`, es decir **una transferencia del Banco, nunca PlaceZum**),
    marca las facturas `ivaPagado` en `rsp_facturacion` y emite aviso. Es
    idempotente (las ya pagadas se ignoran).
- `server/sql/rsp_facturacion.sql`: columnas `iva_pagado`, `fecha_pago_iva`,
  `transaccion_pago_iva` (+ `ALTER ... IF NOT EXISTS`).
- Panel `Facturación`: columna “IVA a ingresar” con botón **Pagar IVA** por
  empresa y estado por factura (“pagado/pendiente”); KPI “IVA a ingresar”.
- Tests (`server/facturacion.test.mjs`): 13/13 — ciclo con IVA por factura,
  `seleccionarPagoIva` agrupado/selectivo/sin repetir.

### backend-banco (`api/crm-state.js`)
- El IVA automático **solo se descuenta al momento** cuando el destino **no** es
  una empresa del Grupo (Capitalia/AGLDP/TGLP/FUND y demo siguen igual). Para
  destinos **Business privados del Grupo** el IVA queda **diferido por factura**
  (`ivaDiferido:true` en la respuesta) y se gestiona en RSP vía `pagar-iva`.
  Esto evita pagar el IVA dos veces. (El modo demo no cambia.)

## Pendiente (requiere tu OK)
1. **Banco web (banco-web)** y **Banco APP (Kotlin)**: pantalla “Facturas de mi
   empresa” que consuma el ciclo/`pagar-iva` de RSP y pague el IVA de las
   facturas seleccionadas (web primero; la APP ya tiene pestaña “Facturación”
   de empresa en `BancoPlacetaApp.kt` ~L4910/4989). Necesita exponer un API
   ciudadano (por EIP/titular) — hoy `/rsp/facturacion/*` es de administrador.
2. `bankCollections.js` (escrituras app-driven de `Consumption/Placezum/
   PLJUNIOR_PAYMENT`): decidir si también deja de auto-abonar el IVA a TGLP y
   pasa a factura (no tocado: afecta al flujo de la app y a Capitalia).
3. **PlaceZum**: confirmar el límite/CNIC (hoy va ligado al límite semanal de la
   tarjeta y no se usa en cuentas Business). Política aplicada: facturas/IVA/
   impuestos/recompensas junior = **Transferencia**; nunca PlaceZum.
4. Reconciliación: un `Tax` automático antiguo hacia TGLP podría aparecer como
   pago del recibo IRM/IGF; tras desactivar el IVA automático de empresa, vigilar
   que no queden `Tax` residuales de meses previos que “paguen” recibos futuros.

## Regla de negocio (objetivo)
> Todo IVA repercutido por una empresa se ingresa a **TRIBUTOS (TGLP)** cuando
> la empresa paga sus facturas (selección múltiple o de golpe), queda **pagada**
> en RSP y **no se vuelve a cobrar**. Es siempre una transferencia del Banco de
> La Placeta (nunca PlaceZum).
