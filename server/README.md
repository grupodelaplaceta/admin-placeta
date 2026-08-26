# rsp-web-api (BFF)

Servidor ligero que hace que **rsp-web** sea autónomo y `admin-placeta` pueda desaparecer como capa web.

## Qué hace
1. Sirve el SPA compilado (`dist/`) en producción (solo en el arranque standalone `server/index.js`).
2. Expone los datos reales agregados:
   - `GET /api/transparencia` → CNIC vigentes + tarifas RSP (Boletín Oficial, `rsp.laplaceta.org`).
   - `GET /api/bank/state` → estado real del banco (`api.banco.laplaceta.org`, cuentas, transacciones, tarjetas, contratos).
   - `GET /api/tributos/contribuyentes` · `GET /api/tributos/declaraciones` · `GET /api/tributos/reconciliacion` → motor fiscal **en vivo** (IRM por IA real, IGF con escala del BOP, exención IVA de empresas).
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
- **Boletín/RSP**: `BOP_URL` (por defecto `https://rsp.laplaceta.org`).
- **Banco/CRM**: `BANCO_API_URL`, `CRM_BASE_URL`, `CRM_READ_KEY` (obligatoria para leer el estado del banco; sin valor por defecto porque el repo es público), `APP_BASE_URL`.
- **PlacetaID (SSO)**: `PLACETAID_API_URL`, `PLACETAID_AUTH_URL`, `PLACETAID_CLIENT_ID`, `PLACETAID_CLIENT_SECRET`.
- **Supabase (persistencia)**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_CONNECTION`, `SUPABASE_DB_PASSWORD`.
- **Documentos/normativa**: `DOCS_API_KEYS`, `ADMIN_MASTER_KEY`.
- **Email**: `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`.

> Importante: no incrustar claves en el código. Vercel puede bloquear despliegues de repos públicos si detecta secretos en el código fuente.

## Pendiente para reemplazar del todo a admin-placeta
- Persistencia real (Supabase/Postgres) en `server/api.js` y autenticación PlacetaID.
- Motor fiscal: ya calcula IRM/IGF en vivo; falta IVA por movimientos y conciliación diaria por transacciones.
