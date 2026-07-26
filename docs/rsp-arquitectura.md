# Red de Servicios de La Placeta (RSP) — Arquitectura

## 📋 Resumen

La **Red de Servicios de La Placeta (RSP)** es la plataforma centralizada de servicios de datos para todas las entidades públicas del Grupo de La Placeta. Sustituye a "Red del Grupo de La Placeta" con un modelo de negocio basado en tarifas por conexión.

## 🏗️ Componentes del Sistema

```
Admin Placeta ──→ RSP Meter (middleware) ──→ RSP Core (config/rsp.js)
       │                                            │
       │  RSP Routes (routes/rsp.js)               │
       │    ├── Dashboard (/rsp)                   ├── Registrar conexiones
       │    ├── Conexiones (/rsp/conexiones)       ├── Generar facturas
       │    ├── Facturación (/rsp/facturacion)     ├── Gestionar fondos
       │    └── Fondos (/rsp/fondos)               └── Pagar sanciones
       │
       └── RSP Views (views/rsp/)
             ├── dashboard.ejs
             ├── conexiones.ejs
             ├── facturacion.ejs
             └── fondos.ejs
```

## 📂 Estructura de Archivos

| Archivo | Propósito |
|---|---|
| `src/config/rsp.js` | Núcleo: registro conexiones, facturación, fondos, tarifas |
| `src/middleware/rsp.js` | Middleware de medición: intercepta llamadas API |
| `src/routes/rsp.js` | Rutas web y API REST del módulo RSP |
| `src/config/permisos.js` | Permisos actualizados con entidad `rsp` |
| `src/views/rsp/dashboard.ejs` | Dashboard principal con KPIs y tarifas |
| `src/views/rsp/conexiones.ejs` | Registro detallado de conexiones |
| `src/views/rsp/facturacion.ejs` | Gestión de facturas |
| `src/views/rsp/fondos.ejs` | Gestión de fondos y sanción IVA |
| `docs/migrar-rsp.sql` | Migración Supabase (tablas rsp_*) |
| `scripts/seed-rsp.js` | Seed inicial (fondos, permisos, historial) |

## 💰 Tarifas

| Tipo | Precio Base | IVA (12%) | Total |
|---|---|---|---|
| Consulta | 0.001 Pz | 0.00012 Pz | **0.00112 Pz** |
| Modificación | 0.1 Pz | 0.012 Pz | **0.112 Pz** |

## 💳 Estado Financiero Inicial

- **Fondos iniciales**: 18,309.83 Pz (transferidos desde "Red del Grupo de La Placeta")
- **Facturas pendientes**: ANULADAS (servicios que no creó la entidad original)
- **Sanción IVA**: 2,461.77 Pz (por IVA no abonado a la administración — Art. Constitución GDLP)
- **Fondos liberados**: Más de 20,000 Pz quedan en la administración

## 🔐 Permisos

| Rol | Acceso |
|---|---|
| `rsp_admin` | Dashboard, conexiones, facturación, fondos, pagar sanción, exportar |
| `rsp_operador` | Dashboard, conexiones, facturación, fondos (solo lectura) |
| `superadmin` | Acceso completo (incluye RSP) |
| `presidente` / `vicepresidente` | Acceso completo a RSP |

## 📡 Cómo funciona la medición

1. El **middleware RSP** (`rspMeter`) se coloca en rutas API
2. Cada petición registra una conexión (consulta o modificación)
3. El **core RSP** calcula tarifa + IVA y acumula los fondos
4. Las **facturas** se generan manualmente agrupando conexiones por entidad y periodo
5. Los **fondos** se descuentan al pagar facturas o sanciones

## 🚀 Pasos para activar

```bash
# 1. Ejecutar migración SQL en Supabase Dashboard (docs/migrar-rsp.sql)
# 2. Configurar variables de entorno (opcional)
# 3. Ejecutar seed:
node scripts/seed-rsp.js <DIP_ADMIN>
# 4. Iniciar servidor:
npm start
# 5. Acceder a http://localhost:3002/rsp
```
