# rsp-web-api (BFF)

Servidor ligero que hace que **rsp-web** sea autónomo y `admin-placeta` pueda desaparecer como capa web.

## Qué hace
1. Sirve el SPA compilado (`dist/`) en producción.
2. Expone los datos reales agregados:
   - `GET /api/transparencia` → CNIC vigentes + tarifas RSP (Boletín Oficial, `rsp.laplaceta.org`).
   - `GET /api/bank/state` → estado real del banco (`api.banco.laplaceta.org`, cuentas, transacciones, tarjetas, contratos).
   - `GET /api/health`.

## Uso
```bash
cd rsp-web
npm run build          # compila el SPA en dist/
cd server
npm install
npm start              # http://localhost:4000
```

## Variables de entorno (`.env` en server/)
- `BOP_URL` — base del Boletín/RSP (por defecto `https://rsp.laplaceta.org`).
- `BANK_URL` — base del banco (por defecto `https://api.banco.laplaceta.org`).
- `BANK_CRM_KEY` — clave de lectura del estado del banco.
- `PORT` — puerto (por defecto 4000).

## Pendiente para reemplazar del todo a admin-placeta
- Portar el **motor fiscal** (`normativa.js`/`tributos.js`): cálculo de IRM/IGF/IVA y reconciliación desde el estado del banco.
- Endpoints de **escritura** (trámites, subvenciones, bonos, 2FA PlacetaID) hoy viven en admin-placeta.
- Autenticación/roles (PlacetaID + Supabase) para el panel.
