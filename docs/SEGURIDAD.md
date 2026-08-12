# Seguridad — Secretos y buenas prácticas (FASE 12.1)

## Gestión de secretos
Todos los secretos se gestionan en las variables de entorno de **Vercel** (o `.env` local, **nunca commiteado**).

| Variable | Uso | Dónde |
|---|---|---|
| `SUPABASE_URL` | Proyecto Supabase (RSP) | Vercel / `.env` |
| `SUPABASE_SERVICE_KEY` / `SUPABASE_SECRET_KEY` | Service role Supabase | Vercel / `.env` |
| `SUPABASE_DB_CONNECTION` | Conexión Postgres directa para migraciones | **secret de GitHub Actions** + `.env` |
| `SUPABASE_DB_CONNECTION` | Migraciones en CI | GitHub secret `SUPABASE_DB_CONNECTION` |
| `JWT_SECRET` | Firma de sesiones del panel | Vercel / `.env` |
| `SESSION_SECRET` | gdlp-crm | Vercel / `.env` |
| `CRM_READ_KEY` | Clave de lectura de la API del banco | Vercel (solo donde sea imprescindible) |
| `RSP_2FA_CODE` | Código 2FA de acciones críticas (fail-closed) | Vercel / `.env` |
| `EMAIL_API_KEY` | Email (Resend) — si no se define, fallback silencioso | Vercel |
| `PLACETA_ID_JWT_SECRET` | Verificación de tokens PlacetaID en backend-banco | Vercel (backend-banco) |

## Reglas
1. **Nunca** commitear `.env`, claves, tokens o datos de producción.
2. Rotar cualquier clave que haya estado en un repo (ej. la shared key del banco `crm-gdlp-shared-key-2026` estaba hardcodeada en gdlp-crm — retirada; **recomendado rotarla** en backend-banco cuando se migren los consumidores).
3. **Fail-closed**: si falta una clave crítica, el sistema bloquea la operación (2FA, transferencias, acceso ciudadano) en vez de degradarse inseguro.
4. Migraciones en CI: `.github/workflows/migraciones.yml` usa el secret `SUPABASE_DB_CONNECTION`.

## 2FA (FASE 8.3)
- Acciones críticas (aprobar, autorizar, rechazar, emitir_firma, emitir_pago, ejecutar, confirmar) exigen 2FA.
- Configurar `RSP_2FA_CODE` en producción; sin él, la verificación **falla (fail-closed)**.

## Cabeceras / cache
- `Cache-Control: no-store` en todas las APIs y páginas sensibles.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (helmet).
- Rate limiting: general en `/api/` (300/15min) y estricto en `/login` (20/15min).
