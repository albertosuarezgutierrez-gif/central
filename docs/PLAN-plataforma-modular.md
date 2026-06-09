# 🧭 PLAN — Plataforma modular (casa de marcas unificada)

> Decisión estratégica de Alberto (jun-2026). **Esto es el norte del proyecto.**
> Ver esquema visual: `docs/esquema-casa-marcas.md` (conceptual) y
> `docs/esquema-casa-marcas.svg` (dibujo). Estado vivo: `docs/CONTEXTO-SESIONES.md`.
> **Antes de tocar código: esquema + validación.** No romper lo que está en producción.

---

## 1. La decisión (en una frase)
**Unificar los MÓDULOS transversales** (contabilidad, ventas, almacén, RRHH, marketing,
SEO, web, mensajería, IA…) en **una sola implementación** que se **enciende** en cada
vertical — **manteniendo las verticales como especialidades por sector** (cada una con su
peculiaridad). Una mejora vale para todas; se matan los duplicados.

## 2. Las 3 verticales (especialidades) — quedan, no se fusionan
| Vertical | Qué cubre | De dónde sale hoy |
|---|---|---|
| **Hostelería** | restaurantes · catering/eventos · espacios de eventos | `ia.rest` |
| **Limpieza / Mantenimiento** | empresas de limpieza + servicio contratable | `ialimp` (lado operativo) |
| **Inmobiliario / Propietarios** | gestión total del propietario + servicios à la carte | **`sivra` + portal-propietario de `ialimp` UNIFICADOS** |

**Decisión clave:** `sivra` y el **portal-propietario de `ialimp` son lo mismo** (el dueño
de un piso) → se **unifican** en la vertical Inmobiliario. La **limpieza** pasa a ser un
**servicio** que el propietario contrata (puede o no). Dato a favor: `sivra` e `ialimp` **ya
comparten la misma base de datos** (Supabase `wswbehlcuxqxyinousql`); `ia.rest` tiene otra.

> **Glosario:** *vertical = especialidad* = producto enfocado a un sector, con su núcleo
> propio + branding, que **enciende** módulos compartidos.

## 3. Principio rector: "motor común + enchufe por vertical"
Cada módulo transversal = **un núcleo común puro** (la lógica, igual para todos) + **un
adaptador por vertical** (sus datos/fuentes/UI). Ejemplo con **Contabilidad/Finanzas**:
- **Común (módulo):** asientos ingresos/gastos, **IVA** (trimestres/modelos), **PyG**,
  **tesorería**, apuntes recurrentes, informes y exportación. Es ley contable → igual para todos.
- **Específico (enchufe de cada vertical):** de dónde salen ingresos/gastos —
  - Hostelería: ventas TPV / albaranes proveedores.
  - Limpieza: facturas a clientes / nóminas de limpiadoras + materiales.
  - Inmobiliario: reservas (Smoobu) / suministros, mantenimiento, **comisión OTA** (Booking 20%), limpieza. (+ informe propio: **ROI por piso**.)
- **Ojo:** "Contabilidad" (registrar/reportar) y **"Facturación"** (emitir facturas VeriFactu)
  son **módulos hermanos distintos** (sivra hoy ni factura, solo lleva ingresos/gastos).

## 3.bis. EL CLIENTE REAL: un DUEÑO con VARIOS negocios de sectores distintos (CLAVE)
**"Todo dueño tiene que tener acceso a todo lo suyo."** El cliente NO es un negocio de un
sector — es un **empresario con una cartera de negocios** que pueden ser de **sectores muy
distintos**, y quiere **una sola cuenta** para gestionarlos todos. Ejemplos reales (leads):
- **Joaquín Jaén:** restaurante + catering + **empresa de camiones** + quiere **tiendas de
  comida para llevar** → 1 cuenta, 4 negocios, 3 sectores distintos.
- **Otro lead:** **empresa de fontanería** + **taller de coches** → 1 cuenta, 2 negocios, 2 sectores.

**Consecuencias para la arquitectura:**
1. **Jerarquía de datos:** `Cuenta (dueño) → Negocios (N) → cada negocio es de un Sector`. Los
   módulos se scopean **por negocio**. (Multi-tenant jerárquico; `core-identity` = pieza CENTRAL,
   no un extra: un login ve TODOS sus negocios y salta entre ellos.)
2. **Los SECTORES son ENCHUFABLES, no una lista fija de 3.** Hoy: hostelería, limpieza,
   inmobiliario. Habrá que poder añadir **transporte/logística, fontanería/instalaciones, taller/
   automoción, retail/tiendas…** Cada sector = núcleo operativo propio + los módulos que enciende.
3. **Esto REFUERZA unificar los módulos:** **contabilidad, RRHH, ventas, almacén, facturación, CRM
   son ~iguales** en un restaurante, una empresa de camiones, una fontanería o un taller → son el
   **80% de cualquier negocio**. Unificarlos hace que **abrir un sector nuevo cueste poco** (solo
   su operativa específica). El sector aporta el 20%; la plataforma da el 80%.

## 4. Plan de obra por FASES (conceptual — cada fase con esquema + preview verde antes de prod)
- **Fase 0 — Fundación:** monorepo pnpm + 5 núcleos técnicos (`core-ai/fiscal/push/storage/email`). ✅ **HECHO, en producción.**
- **Fase 0.5 — Cimiento de plataforma (NUEVO, por el §3.bis):** modelo `Cuenta(dueño) → Negocios →
  Sector` + **identidad única** (`core-identity`) + el conmutador "cambiar de negocio". Es el
  esqueleto sobre el que se montan los módulos compartidos. (Diseñar para que los sectores sean enchufables.)
- **Fase 1 — 1er módulo transversal: CONTABILIDAD.** La de `ialimp` es la más madura
  (vistas SQL `v_contab_*`) → se convierte en **módulo compartido**; cada vertical lo enciende
  con su enchufe de datos. (Detallar como esquema antes de código.)
- **Fase 2 — Unificar Inmobiliario:** fundir `sivra` + portal-propietario de `ialimp` en la
  vertical "Propietarios"; limpieza = servicio contratable; adaptar a **multi-propietario**
  (multi-tenant) cuando se quiera escalar.
- **Fase 3+ — Resto de módulos** uno a uno, mismo patrón: ventas/CRM, almacén, RRHH,
  marketing/SEO, constructor de webs, mensajería.

## 5. Añadidos recomendados (entran en el plan)
1. **Cuenta/identidad única (`core-identity`):** un solo login da acceso a las verticales/
   servicios que el cliente tenga encendidos → la casa se siente como **una sola cosa**.
   (`core-identity` ya existe, 0 consumidores → este es su primer uso.)
2. **"Marketplace" de servicios:** pantalla donde el cliente **enciende/apaga** módulos y
   servicios (limpieza, pricing, contabilidad…). Es la **cara comercial** y donde se monetiza.
3. **Datos compartidos vs aislados:** ialimp+sivra comparten BD; ia.rest tiene otra → el
   módulo común debe contemplar **mismo motor, distintos orígenes de datos** desde el día 1.
4. (Opcional) **Dashboard de matriz** para Alberto: vista consolidada de todos sus negocios.

## 6. Restricciones / invariantes
- **Vanessa (Sique Brilla)** sigue en su `ialimp` actual **sin romper nada**; migración
  planificada y probada (preview verde, IALIMP la última, Instant Rollback).
- **Cada cambio**: rama → PR → previews verdes de las 3 verticales + CI → merge → verificar prod.
- **Multi-tenant** = frontera de seguridad/RGPD (scoping por inquilino en toda query).

## 7. Pendiente de decidir
- **Nombre de la matriz** → Claude Design recomienda **"Encaje"** (dominios `encaje.ai`/
  `encaje.app` libres; `.com`/`.es` ocupados). Al fijarlo → **rename del scope `@iarest/* →
  @<marca>/*`** (mecánico, ya listo para ejecutar).
- Orden fino dentro de Fase 1 (qué vertical migrar primero a la contabilidad compartida).
- Modelo de cobro de servicios entre verticales (cuando se monte el marketplace).

## 8. Decidido (no re-preguntar)
- Verticales = especialidades, **se quedan**; se unifican los **módulos**.
- `sivra` + portal-propietario `ialimp` = **se unifican** (Inmobiliario/Propietarios).
- `ia.rest` = vertical de **hostelería** (restaurantes + catering/eventos + espacios). Tal cual.
- Empezar la unificación por **Contabilidad**.
