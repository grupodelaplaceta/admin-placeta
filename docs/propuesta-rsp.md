# PROPUESTA DE SUSTITUCIÓN DE LA ENTIDAD "RED DEL GRUPO DE LA PLACETA"
# A "RED DE SERVICIOS DE LA PLACETA" (RSP)

---

## 📋 Contexto

Esta propuesta busca arreglar el hueco que dejó "Red del Grupo de La Placeta" siendo una empresa pública que movía fondos públicos con falta de lógica y necesidad, cobrando por elementos y servicios de terceros reales que la propia Placeta contrataba.

Esto era una falta de respeto para los fondos públicos, ya que eran placetas de los ciudadanos a cambio de algo que ya tenemos, aunque no se paguen esas placetas.

En esta propuesta, el objetivo era transformar esa entidad para darle un uso y valor real, ayudando a la Placeta a centralizar sus bases de datos y la obtención de los mismos.

---

## 🌐 ¿Qué servicio proporciona RSP?

Proporciona a todas las entidades públicas del Grupo de La Placeta acceso a los datos necesarios para su funcionamiento, así como poder guardar allí sus propios datos y modificarlos.

---

## 💰 ¿Cómo conseguirá fondos el RSP?

Mediante cobro por conexión a este servidor de proporción de datos y demás.

| Concepto | Precio (INC IVA) |
|---|---|
| Conexión para **consulta** de datos | **0.001 Placetas** por conexión |
| Conexión para **modificación** de datos | **0.1 Placetas** por conexión |
| **IVA estándar** de La Placeta | **12%** |

---

## 🔄 ¿Qué pasará con los fondos y facturas pendientes?

### Fondos transferidos
Los **18,309.83 Placetas** que actualmente tiene la entidad "Red del Grupo de La Placeta" se transpasarían a la nueva **"Red de Servicios de La Placeta"**.

### Facturas anuladas
Las facturas pendientes de abonar por parte de la administración por los cambios bancarios quedarán **anuladas**, tratándose de un pago por un servicio que no crea la propia entidad y que esos placetas no regulaban si el servicio se daba o no. Esta medida hace que **más de 20,000 placetas** queden en la administración y no provoca deudas de ese calibre, ya que eran precios antes de la regularización de la inflación.

### Sanción por IVA no abonado
Según la normativa aprobada el **3 de marzo de 2025**, el IVA de "Red del Grupo de La Placeta" no se abonaba a la administración como dicta el código normativo interno, sino que se dictaba que iría a la propia empresa. Esto es **anticonstitucional**, por lo que se sentenciaría si se aprueba el cambio a un pago de **2,461.77 Placetas** como sanción por incumplimiento de los artículos vigentes actualmente.

---

## ✅ Resumen de la Implementación

| Concepto | Estado |
|---|---|
| Transferencia de fondos iniciales (18,309.83 Pz) | ✅ Implementado |
| Anulación de facturas pendientes | ✅ Implementado |
| Sanción IVA (2,461.77 Pz) | ✅ Implementado (pendiente de pago) |
| Tarifa consulta (0.001 Pz + IVA) | ✅ Implementado |
| Tarifa modificación (0.1 Pz + IVA) | ✅ Implementado |
| Dashboard RSP | ✅ Implementado |
| Registro de conexiones | ✅ Implementado |
| Generación de facturas | ✅ Implementado |
| Gestión de fondos | ✅ Implementado |
| Panel de administración | ✅ Implementado |

---

## 📊 Datos del Sistema

- **Entidad**: Red de Servicios de La Placeta (RSP)
- **Dependencia**: Admin Placeta — Plataforma de Administración Unificada
- **URL**: `http://localhost:3002/rsp`
- **API REST**: `GET/POST /rsp/api/*`
- **Migración SQL**: `docs/migrar-rsp.sql`
- **Seed inicial**: `scripts/seed-rsp.js`
- **Arquitectura**: `docs/rsp-arquitectura.md`
