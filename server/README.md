# rsp-web-api (BFF)

Servidor ligero que hace que **rsp-web** sea autónomo y `admin-placeta` pueda desaparecer como capa web.

## Qué hace
1. Sirve el SPA compilado (`dist/`) en producción (solo en el arranque standalone `server/index.js`).
2. Expone los datos reales agregados:
   - `GET /api/transparencia` → CNIC vigentes + tarifas RSP (Boletín Oficial, `rsp.laplaceta.org`).
- `GET /api/bank/state` → estado real del banco para compatibilidad interna; requiere sesión de administrador. El panel usa las rutas protegidas `/rsp/banco/api/*` y el servidor consulta el banco con la clave privada.
   - `GET /api/tributos/contribuyentes` · `GET /api/tributos/declaraciones` · `GET /api/tributos/reconciliacion` → motor fiscal **en vivo** (IRM por IA real, IGF con escala del BOP, exención IVA de empresas, IVA por movimientos reales: `ventasMes`/`ivaRepercutido` por empresa y totales de conciliación `totalIvaRepercutido`/`totalVentasMes`).
   - **Facturación central** (`server/facturacion.js`, tras sesión de administrador): `GET /rsp/facturacion/api/ciclo?mes=` (ciclo mensual por empresa: recibo de Tributos IRM+IGF con vencimiento a fin de mes + facturas de venta/servicio abonadas; **conciliación automática en cada lectura**: si un recibo pendiente/impagado ya tiene pago real en el banco se pasa a `pagada`) · `POST /rsp/facturacion/api/emitir` (persiste el ciclo en `rsp_facturacion`) · `POST /rsp/facturacion/api/conciliar` (fuerza la conciliación del mes) · `POST /rsp/facturacion/api/cierre` (`{ mes, ejecutar }` → plan de cobro por domiciliación hacia TGLP; solo mueve dinero si `ejecutar:true` y hay llave CRM) · `POST /rsp/facturacion/api/:id/estado`. Las cuotas proceden del motor fiscal y del estado real del banco; el IVA sale del CNIC `CNIC-IVA` del BOP.
   - El **«cobrar» de una declaración de empresa** (`POST /rsp/tributos/api/declaraciones/:id/cobrar`) resuelve a través de su recibo (única vía de dinero): domicilia en la cuenta BLP (acción crítica, pasa por 2FA), refleja si ya estaba abonado o bloquea si está anulado. Las personas conservan el estado declarativo.
   - `GET /api/health`.
3. **Autenticación** (`server/auth.js`): SSO con **PlacetaID móvil** (`POST /login/placetaid` → redirige a PlacetaID → `GET /login/callback`) y fallback de credenciales `POST /login` contra `ADMIN_USERS`. **Solo entran administradores** (`ADMIN_DIPS` / `ADMIN_USERS`). La sesión es un token aleatorio en cookie **httpOnly** y **todas las rutas de API exigen sesión** salvo `/api/health`, `/login*`, `/logout` y `/api/sesion`.
4. **API de dominio** (`server/api.js`): trámites, expedientes, ciudadanos, entidades, subvenciones, bonos, banco (con las reglas de cierre/reparto), Placeta Junior, operaciones, auditoría, notificaciones y normativa. Implementación de referencia en memoria; sustituir `store` por Supabase/Postgres.

## Uso (standalone / VPS)
```bash
cd rsp-web
npm install          # instala dependencias del SPA + BFF
npm run build        # compila el SPA en dist/
cd server
npm start            # http://localhost:4000  (o `npm run dev`)
```

## Despliegue en Vercel
- `vercel.json` en la raíz de `rsp-web`: sirve el SPA (Vite) con fallback a `index.html` y enruta `/api/*` a la función serverless.
- `api/index.js` monta la misma aplicación del BFF (`server/app.js`) como función de Vercel.
- Configurar el proyecto en Vercel con **Root Directory = `rsp-web`** y las variables de entorno de `server` (`.env.example`).

## Variables de entorno (`.env` en server/ — ver `server/.env.example`)
- **Core**: `PORT`, `NODE_ENV`, `SESSION_SECRET`, `JWT_SECRET`.
- **Autenticación**: `ADMIN_USERS` (credenciales de administradores), `ADMIN_DIPS` (DIPs que pueden entrar por SSO) y `PLACETAID_JWT_SECRET` (verificación de la firma del token). Sin `ADMIN_USERS`/`ADMIN_DIPS` en producción el login queda deshabilitado; en desarrollo hay un usuario demo `23749931M` / `demo`.
- **Boletín/RSP**: `BOP_URL` (por defecto `https://bop.laplaceta.org`).
- **Banco/CRM**: `BANCO_API_URL`, `CRM_BASE_URL`, `CRM_READ_KEY` (obligatoria para leer el estado del banco; sin valor por defecto porque el repo es público), `APP_BASE_URL`.
- **PlacetaID (SSO)**: `PLACETAID_API_URL`, `PLACETAID_AUTH_URL`, `PLACETAID_CLIENT_ID`, `PLACETAID_CLIENT_SECRET`.
- **Supabase (persistencia)**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_CONNECTION`, `SUPABASE_DB_PASSWORD`.
- **Documentos/normativa**: `DOCS_API_KEYS`, `ADMIN_MASTER_KEY`.
- **Email**: `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`.

> Importante: no incrustar claves en el código. Vercel puede bloquear despliegues de repos públicos si detecta secretos en el código fuente.

## Pendiente para reemplazar del todo a admin-placeta
- Persistencia real (Supabase/Postgres) en `server/api.js` y autenticación PlacetaID.
- Motor fiscal: ya calcula IRM/IGF en vivo y **IVA por movimientos** (repercutido del mes por empresa, CNIC-IVA), con **conciliación diaria automática** del ciclo (en cada lectura + `POST /rsp/facturacion/api/conciliar`).
- Tabla nueva `rsp_facturacion`: migración en `server/sql/rsp_facturacion.sql` (crear en Supabase antes del primer `POST /rsp/facturacion/api/emitir` en producción; sin la tabla, `coleccion()` opera en memoria).
