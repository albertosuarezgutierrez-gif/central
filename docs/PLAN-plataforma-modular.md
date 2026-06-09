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
1. **Jerarquía de datos (ADAPTABLE 100%):** `Cuenta (dueño) → Sociedades/CIF (1..N, flexible) →
   Negocios/Fincas → módulos`. El dueño puede tener **todo en 1 CIF** o **varias empresas con
   contabilidades separadas** — la plataforma se adapta a las dos sin forzar estructura. Los módulos
   se scopean por negocio/finca; la contabilidad legal cuadra por CIF. `core-identity` = pieza CENTRAL:
   un login ve TODO lo suyo y salta entre unidades.
1.bis **Inmuebles/Fincas:** una finca puede estar **en propiedad o alquilada**, y enlazarse a un
   negocio (qué negocio la ocupa) → distingue activo propio / gasto de alquiler / ingreso de alquiler.
   Cada finca lleva su contabilidad y su **almacén** (almacén **multi-ubicación**; ia.rest ya hace multi-local).
2. **Los SECTORES son ENCHUFABLES, no una lista fija de 3.** Hoy: hostelería, limpieza,
   inmobiliario. Habrá que poder añadir **transporte/logística, fontanería/instalaciones, taller/
   automoción, retail/tiendas…** Cada sector = núcleo operativo propio + los módulos que enciende.
3. **Esto REFUERZA unificar los módulos:** **contabilidad, RRHH, ventas, almacén, facturación, CRM
   son ~iguales** en un restaurante, una empresa de camiones, una fontanería o un taller → son el
   **80% de cualquier negocio**. Unificarlos hace que **abrir un sector nuevo cueste poco** (solo
   su operativa específica). El sector aporta el 20%; la plataforma da el 80%.
4. **CUADRO DE MANDO CONSOLIDADO (torre de control) = FEATURE CLAVE.** El dueño ve, en una pantalla,
   el **resumen de TODAS sus empresas/negocios/fincas** cruzando CIFs y sectores: facturación y gastos
   totales, **resultado**, **tesorería total** (cuánto dinero tengo en conjunto), qué negocio gana/
   pierde, alertas, y **drill-down** (total → sociedad → negocio/finca). La consolidación es casi
   **gratis** porque los módulos comparten formato de datos. Es el **gancho de venta** para un empresario
   con varios negocios — y lo que ningún competidor de un solo sector puede dar.

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
5. **Capacidad transversal de IA — RECONOCIMIENTO DOCUMENTAL (sobre `core-ai`):** OCR/visión de
   **facturas, albaranes, tickets, CVs, fotos**. Se construye 1 vez y **queda disponible en TODOS los
   negocios/sectores a la vez**; cada mejora del reconocimiento mejora a todos. Alimenta:
   **Contabilidad** (factura/albarán/ticket → asiento automático) y **RRHH** (CV → ficha de candidato),
   y casos de sector (foto de limpieza/obra → control de calidad). **Hoy está TRIPLICADO** (ia.rest
   scanner de albaranes · ialimp escáner contable + selección de CVs · sivra parse-invoice) → unificarlo
   es el mismo patrón "construye una vez, enchufa en todos". Ejemplo perfecto de la idea.

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

## 9.bis Banco de ideas / capacidades futuras (solo posibles por tener todo unificado)
1. **Copiloto IA ÚNICO sobre todos los negocios:** preguntar en lenguaje natural "¿cuánto gané este
   mes entre todo?", "¿qué finca tiene peor margen?", "¿a quién pago esta semana?". Posible porque los
   datos comparten formato (módulos comunes). Hoy cada app tiene su IA suelta → unificar = un asistente que lo ve todo.
2. **Sinergias entre los negocios del PROPIO dueño (intercompany automático):** un servicio que un
   negocio suyo da a otro (limpieza de SUS fincas, transporte entre SUS tiendas) se registra solo como
   gasto en uno e ingreso en el otro. Cuadra el intercompany sin trabajo manual.
3. **Marketplace / RED de dos lados entre clientes de la plataforma:** una empresa de limpieza de la
   plataforma encuentra propietarios DENTRO de la plataforma (y viceversa). Realiza la idea "pueden o no
   trabajar con ialimp": el propietario contrata servicios de OTROS clientes. Efecto red.
4. **Banco conectado (open-banking) + fiscal automático:** conciliación bancaria contra la contabilidad
   (tesorería REAL, no estimada) + presentar IVA/modelos AEAT por cada CIF. "Tu gestoría dentro".
5. **Empleados/RRHH compartidos entre negocios:** un empleado puede trabajar en varios negocios del
   dueño; nóminas y fichaje a nivel cuenta, asignables por negocio.
6. **Alta de negocio nuevo en 5 min por sector (plantillas):** elegir sector → viene preconfigurado
   (módulos típicos, plan contable del sector, catálogo base). Hace trivial añadir negocios/sectores.
7. **Motor de reglas/automatizaciones cross-sector:** "si una finca lleva 5 días sin limpiar, avísame";
   "si un negocio baja del X% de margen, alerta"; "stock bajo en cualquier almacén → pide". Vale para todos.

## 8. Decidido (no re-preguntar)
- Verticales = especialidades, **se quedan**; se unifican los **módulos**.
- `sivra` + portal-propietario `ialimp` = **se unifican** (Inmobiliario/Propietarios).
- `ia.rest` = vertical de **hostelería** (restaurantes + catering/eventos + espacios). Tal cual.
- Empezar la unificación por **Contabilidad**.
