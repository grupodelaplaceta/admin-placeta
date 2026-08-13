# rsp-web-api (BFF)

Servidor ligero que hace que **rsp-web** sea autónomo y `admin-placeta` pueda desaparecer como capa web.

## Qué hace
1. Sirve el SPA compilado (`dist/`) en producción (solo en el arranque standalone `server/index.js`).
2. Expone los datos reales agregados:
   - `GET /api/transparencia` → CNIC vigentes + tarifas RSP (Boletín Oficial, `rsp.laplaceta.org`).
   - `GET /api/bank/state` → estado real del banco (`api.banco.laplaceta.org`, cuentas, transacciones, tarjetas, contratos).
   - `GET /api/tributos/contribuyentes` · `GET /api/tributos/declaraciones` · `GET /api/tributos/reconciliacion` → motor fiscal **en vivo** (IRM por IA real, IGF con escala del BOP, exención IVA de empresas).
   - `GET /api/health`.
3. **Autenticación demo** (`server/auth.js`): `POST /login/demo` + `GET /api/sesion` con cookie `rsp_session` (mismo flujo que admin-placeta; sustituir por PlacetaID + Supabase en producción).
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

## Variables de entorno (`.env` en server/)
- `BOP_URL` — base del Boletín/RSP (por defecto `https://rsp.laplaceta.org`).
- `BANK_URL` — base del banco (por defecto `https://api.banco.laplaceta.org`).
- `BANK_CRM_KEY` — clave de lectura del estado del banco.
- `PORT` — puerto (por defecto 4000).

## Pendiente para reemplazar del todo a admin-placeta
- Persistencia real (Supabase/Postgres) en `server/api.js` y autenticación PlacetaID.
- Motor fiscal: ya calcula IRM/IGF en vivo; falta IVA por movimientos y conciliación diaria por transacciones.
