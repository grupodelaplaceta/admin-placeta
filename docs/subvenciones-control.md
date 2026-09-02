# Subvenciones — justificación con categorías, facturas, trazabilidad y devolución

> Control y auditoría (2026-09-02). Cambios en `rsp-web` (server + panel).

## Qué permite ahora
1. **Justificar pagos también de facturas** y de operaciones del Banco.
2. **Separación por categoría** de cada gasto justificado:
   `factura | iva | tributos | irm_igf | operacion | otro`.
   - Clasificación automática desde el `kind` del banco (Tax→tributos,
     IrmCharge/IRM/IGF→irm_igf, IvaAdjustment→iva, Consumption/Service→operacion)
     o explícita al registrar el gasto (con `facturaId`, `base`, `iva`).
   - Esto permite **subvenciones para abonar IVA** (p. ej. IVA de inversiones):
     al conceder se indica `categoriasCubiertas` (ej. `['iva']`); solo esos
     gastos podrán justificarse.
3. **Vista por beneficiario** (`GET /rsp/subvenciones/api/beneficiarios` y
   página **RSP / Tributos / Beneficiarios**): cada empresa (EIP) y cada
   particular (DIP) con totales concedido/justificado/devuelto/pendiente y el
   detalle de **todas sus operaciones justificadas** (subvención, concepto,
   gasto, categoría, importe, fecha, justificación).
4. **Devolución/reversión**: si una justificación no corresponde al fin de la
   subvención, `POST /rsp/subvenciones/api/:id/revertir { gastoId, motivo }`
   revierte el gasto (queda excluido), elimina su justificación, registra la
   devolución con **`devueltoA` = la EIP emisora que concedió la subvención** y
   restituye el importe al `importeRestante`. El beneficiario no retiene un
   cobro indebido; el dinero vuelve a la empresa EIP que subvencionó.

## Endpoints nuevos / modificados (`server/api.js`)
- `POST /rsp/subvenciones/api/conceder` (+ `categoriasCubiertas`).
- `POST /rsp/subvenciones/api/:id/gastos` — registra gastos (operaciones o
  facturas) clasificados por categoría.
- `POST /rsp/subvenciones/api/:id/justificar` — valida cobertura (categorías +
  tipos aptos), no supera `importeRestante`, y devuelve desglose por categoría.
  (Sigue siendo tras confirmación 2FA en el panel.)
- `POST /rsp/subvenciones/api/:id/revertir` — devolución (ver arriba).
- `GET /rsp/subvenciones/api/beneficiarios` — traza por beneficiario.

## Notas / pendientes
- La justificación es **registro contable + trazabilidad**; el movimiento real
  de fondos (desembolso y retorno al **emisor EIP**) se hace con la API bancaria
  (acciones `transferir`) cuando se integre el alta de cuenta del emisor, igual
  que en el resto del sistema. `transferenciaId` queda como referencia.
- **Persistencia:** el detalle (gastos/justificaciones/reversiones) se guarda en
  `rsp_subvenciones.detalle` (JSONB). Aplicar `server/sql/rsp_subvenciones.sql`
  (crea/actualiza la tabla con la columna `detalle`).
- Los `Tax/IrmCharge/IvaAdjustment` dejan de excluirse en bloque: ahora se
  clasifican y solo se justifican si la subvención los cubre (categorías).
