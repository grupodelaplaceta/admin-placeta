# RSP Web · Panel de administración (nueva versión)

SPA de administración de la **Red de Servicios de La Placeta**, reconstruida con
Vite + React + TypeScript aplicando las mejoras de seguridad, homogeneidad y
comodidad detectadas en la auditoría de `admin-placeta`.

## Estado: esqueleto completo + P0 (demo funcional sin backend)

- Arranca en **modo mock** por defecto (`VITE_USE_MOCK=true`): todas las pantallas
  funcionan con datos de demostración, sin backend.
- En **modo live** (`VITE_USE_MOCK=false`) consume las APIs JSON del backend
  `admin-placeta` configurado en `VITE_API_URL`.

## Puesta en marcha

```bash
cd rsp-web
npm install
npm run dev        # http://localhost:5174 (modo demo)
npm test           # tests (RBAC, 2FA, smoke de la app)
npm run build      # typecheck + build de producción
```

## Qué mejoras aplica (mapeo con la auditoría)

| # | Mejora | Cómo está aplicada |
|---|---|---|
| S1 | Sin secretos en el cliente | Solo variables `VITE_*`; nunca claves/keys en código. |
| S2 | Sin superadmins hardcodeados | RBAC en `src/auth/permisos.ts` desde los roles de la sesión. |
| S3 | CORS allowlist (backend) | Documentado; el proxy de Vite evita CORS en desarrollo. |
| S6 | RBAC granular | `RequirePermiso` protege cada ruta por permiso; nav filtra por permiso. |
| H1 | Módulos sin duplicar | Un único conjunto de páginas; sin 3 sistemas de facturación/nóminas. |
| H2 | Identificadores únicos | `TR-`, `EXP-`, `OP-`, `AUD-`, `NOTIF-`, `CNIC-` en todo el UI. |
| C3 | Diseño homogéneo | Design tokens (`tokens.css`) + componentes (`components/ui`) + un layout. |
| C4 | Comodidad | Bandeja de trabajo, buscador global, Contexto Único, toasts, estados vacíos. |
| A6 | Auditoría visible | Página de auditoría (`AUD-`) + acuse en notificaciones. |
| 2FA | Acciones críticas | Botones críticos marcados con `2FA`; verificación fail-closed en backend. |
| Tests | Tests automatizados | `vitest` con tests de RBAC, 2FA y smoke. |

## Estructura

```
src/
  auth/          # AuthContext, permisos (RBAC en cliente)
  api/           # Provider (contrato), mock, http, client
  components/    # ui (Button, Card, Table, Modal…), layout (Sidebar, Topbar)
  pages/         # una carpeta por módulo
  router/        # navegación (única fuente para sidebar y rutas)
  styles/        # tokens.css, global.css, components.css, pages.css
  types/         # tipos de dominio
  test/          # tests
```

## Contrato de APIs JSON esperado (modo live)

Para conectar el SPA al backend, `admin-placeta` debe exponer los siguientes
endpoints JSON (algunos ya existen, otros están como vistas EJS y requieren
una variante JSON):

- `POST /login/demo` → `Session`
- `GET /api/sesion` → `Session | null`
- `GET /api/dashboard` → `DashboardStats`
- `GET /rsp/tramites/api/bandeja` · `GET /rsp/tramites/api` · `GET /rsp/tramites/api/:id` · `POST /rsp/tramites/api/:id/accion`
- `GET /rsp/expedientes/api` · `GET /rsp/expedientes/api/:id`
- `GET /rsp/api/ciudadanos?q=` · `GET /rsp/api/contexto/:dip` · `GET /rsp/api/entidades`
- `GET /rsp/operaciones/api` · `GET /rsp/auditoria/api` · `GET /rsp/normativo/api`
- `GET /api/notificaciones/mis` · `POST /api/notificaciones/:id/leida`

## Siguientes pasos

1. Exponer los endpoints JSON listados arriba en `admin-placeta` (o un BFF).
2. Conectar `VITE_USE_MOCK=false` y validar contra el backend real.
3. Migrar el portal ciudadano a `gdlp-crm` (deja de ser CRM) y enlazarlo aquí.
