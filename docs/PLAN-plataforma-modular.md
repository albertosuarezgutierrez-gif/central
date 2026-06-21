# 🧭 PLAN MAESTRO — Plataforma modular (casa de marcas)

> **Norte del proyecto + handoff de desarrollo.** Léelo entero antes de programar.
> Estado vivo: `docs/CONTEXTO-SESIONES.md`. Esquema visual: `docs/esquema-casa-marcas.svg`.
> **Regla de oro de método: esquema/diseño ANTES de código; nunca romper producción.**

---

## 0. Resumen ejecutivo (en 6 líneas)
- **Qué:** UNA plataforma donde un **dueño** gestiona **TODOS sus negocios** (de cualquier sector) desde **una sola cuenta**.
- **Cómo:** las **verticales** (sectores) mantienen su operativa propia, pero **comparten los módulos** (contabilidad, RRHH, ventas, almacén, facturación, CRM, IA…) — se construyen **una vez** y se **encienden** en cada negocio.
- **Por qué mola:** una mejora vale para todos; **abrir un sector nuevo = solo su 20% + conectar a lo general** (el 80% ya está). Ese es el foso.
- **Empezar por:** unificar el módulo de **Contabilidad** (Hito 1), siguiendo el patrón ya probado con `core-ai/push/storage/email`.
- **Restricción nº1:** Vanessa (Sique Brilla) usa ialimp en producción → **no romperla**; cada cambio con preview verde.
- **Pendiente no bloqueante:** nombre de la matriz (candidato **«Encaje»**) → renombrar el scope `@iarest/*` cuando se decida.

## 1. La decisión (el norte)
**Unificar los MÓDULOS transversales** en una sola implementación que se **enciende** por
negocio, **manteniendo las verticales como especialidades por sector** (cada una su peculiaridad).
Se matan los duplicados; las mejoras se propagan solas.

## 2. El cliente real: un DUEÑO con varios negocios de sectores distintos
**"Todo dueño tiene que tener acceso a todo lo suyo."** No es "un negocio de un sector": es un
**empresario con cartera de negocios**, posiblemente de **sectores muy distintos**, con **una cuenta**.
- **Joaquín Jaén:** restaurante + catering (Hostelería) · empresa de camiones (Transporte) · tiendas
  de comida para llevar (Retail) · **varias fincas/inmuebles** (Inmobiliario), cada una con su
  contabilidad y su almacén, en **propiedad o alquiler**.
- **Otro lead:** empresa de fontanería (Instalaciones) + taller de coches (Automoción).

## 3. Modelo de datos (jerarquía ADAPTABLE 100%)
```
Cuenta (dueño / persona)
  └─ Sociedades / CIF  (1..N — flexible: puede ser 1 solo CIF o varias empresas separadas)
       └─ Negocios / Fincas  (cada uno de un SECTOR)
            └─ módulos encendidos (contabilidad, almacén, ventas, …) + operativa del sector
```
- **Adaptable:** soporta "todo en 1 CIF" o "varias empresas con contabilidades separadas" sin forzar estructura.
- **Inmuebles/Fincas:** marca **propiedad vs alquiler** y se enlazan a un negocio (qué negocio la ocupa)
  → distingue activo propio / gasto de alquiler / ingreso de alquiler. Cada finca: su contabilidad + su almacén.
- **Almacén MULTI-UBICACIÓN** (cada finca/local el suyo; ia.rest ya hace multi-local).
- **`core-identity` = pieza CENTRAL:** un login ve TODO lo suyo y salta entre unidades. Scoping por
  inquilino (cuenta/sociedad/negocio) en TODA query = **frontera de seguridad/RGPD innegociable**.

## 4. Verticales hoy + SECTORES ENCHUFABLES
Los sectores **no son una lista fija de 3** — son **enchufables** (se añaden: transporte, fontanería,
taller, retail…). Hoy existen 3, que quedan como especialidades:
| Vertical | Cubre | App actual |
|---|---|---|
| **Hostelería** | restaurantes · catering/eventos · espacios | `ia.rest` |
| **Limpieza / Mantenimiento** | empresas de limpieza + servicio contratable | `ialimp` |
| **Inmobiliario / Propietarios** | gestión total del propietario + servicios à la carte | `sivra` **+ portal-propietario de `ialimp` (a unificar)** |

> `sivra` y el portal-propietario de `ialimp` son **la misma persona** (el dueño de un piso) → se
> **unifican**; la limpieza queda como **servicio contratable**. (sivra+ialimp ya comparten BD; ia.rest tiene otra.)

## 5. Principio rector + REGLA DE ORO
**"Motor común + enchufe por vertical":** cada módulo = núcleo común puro (la lógica, igual para todos)
+ adaptador por vertical (sus datos/UI). Ej. **Contabilidad** = motor IVA/PyG/tesorería **común** + de
dónde salen ingresos/gastos según el sector (TPV / facturas / reservas+comisión OTA).

**🏅 REGLA DE ORO (lo que hace todo esto escalable):** cuando un cliente quiere montar **otro tipo de
empresa** (sector nuevo), **los módulos importantes YA están** → solo se construye **su operativa
específica (~20%)** y se **conecta** a lo general (contabilidad, facturación, RRHH, ventas, almacén,
IA documental, cuadro de mando, banco). **Nunca se reescribe lo común.**
- *Ejemplo (taller de Joaquín):* se reusa todo el 80% (contabilidad, factura, almacén, IA de facturas,
  cuadro de mando…); solo es nuevo el 20% (órdenes de reparación, ficha de vehículo, recambios, citas).
  Operativo en **días, no meses**.

## 6. Catálogo de módulos compartidos + duplicación actual
| Módulo | ia.rest | ialimp | sivra | Estado → acción |
|---|:--:|:--:|:--:|---|
| **Contabilidad / IVA** | ✓ | ✓ | ✓ | 🔴 dup ×3 → **unificar (HITO 1)** |
| Facturación (VeriFactu) | ✓ | ✓ | ✗ | 🟡 ia.rest ya usa `core-fiscal` |
| Cobros / Pagos | ✓ | ✓ | ~ | 🔴 dup |
| Ventas / CRM | ✓ | ~ | ~ | 🔴 dup |
| Marketing / captación | ✓ | ✓ | ✗ | 🔴 dup |
| SEO · Constructor de webs | ~ | landing | ✓/landing | 🟡 centralizar |
| Almacén / Stock (multi-ubic.) | ✓ | ✓ | ✗ | 🔴 dup |
| RRHH / Nóminas | ✗ | ✓ | ~ | 🟡 |
| Pricing / tarifas | ~ | ✓ | ✓ | 🔴 dup |
| Mensajería | ✓ | ✓ | ✓ | 🔴 dup ×3 |
| Portal externo (cliente) | ✓ | ✓ | ✗ | 🔴 dup |
| IA / Copiloto | ✓ | ✓ | ✓ | 🟢 ya sobre `core-ai` |

## 7. Capacidades transversales ACORDADAS (todas entran — «añade todo»)
1. **Reconocimiento documental IA** (sobre `core-ai`): facturas/albaranes/tickets/CVs/fotos → construir
   1 vez, disponible en todos los negocios; alimenta Contabilidad (asiento auto) y RRHH (ficha de CV).
   **Hoy triplicado** (ia.rest scanner · ialimp escáner+CVs · sivra parse-invoice) → unificar.
2. **Copiloto IA único** sobre TODOS los negocios (preguntas en lenguaje natural cruzando negocios).
3. **Intercompany automático:** servicios entre los negocios del propio dueño (limpieza de sus fincas,
   transporte entre sus tiendas) se registran solos como gasto en uno e ingreso en otro.
4. **Marketplace / RED de dos lados** entre clientes de la plataforma (proveedores ↔ propietarios; efecto red).
5. **Banco conectado (open-banking) + fiscal automático** (conciliación + IVA/modelos AEAT por CIF).
6. **Empleados/RRHH compartidos** entre negocios del mismo dueño.
7. **Alta de negocio en 5 min por sector** (plantillas preconfiguradas) + **motor de reglas/alertas** cross-sector.

## 8. Cuadro de mando consolidado (torre de control) — FEATURE CLAVE / gancho de venta
El dueño ve en una pantalla el **resumen de todas sus empresas/negocios/fincas** cruzando CIFs y
sectores: facturación, gastos, **resultado**, **tesorería total**, ranking (quién gana/pierde),
alertas, y **drill-down** (total → sociedad → negocio/finca). Es **casi gratis** porque los módulos
comparten formato de datos → otra razón para unificar. Junto a la cuenta única, es el primer valor que el dueño ve.

---

## 9. 🛠️ ROADMAP DE DESARROLLO (handoff para el desarrollador)

### 9.1 Cómo trabajar — PATRÓN probado (repetir en cada módulo)
1. **Diseño/esquema primero** (qué motor común, qué puerto, qué enchufe por vertical). Sin código hasta tenerlo claro.
2. Crear `packages/<module-x>` con la **lógica PURA** (sin UI, sin esquema de BD, sin estado de inquilino)
   + el **PUERTO** (interface TS que cada vertical implementa para aportar sus datos).
3. **Adoptar en UNA vertical** refactorizando para usar el paquete, **PRESERVANDO el comportamiento**
   (mismas firmas/exports; como se hizo con `core-email`/`core-storage`).
4. Rama `feat:`/`fix:` → **PR en draft** → esperar **previews verdes de las 3 verticales + CI** → merge → **verificar producción**.
5. Repetir en la siguiente vertical. **IALIMP (Vanessa, en vivo) la ÚLTIMA.**

### 9.2 Guardarraíles INNEGOCIABLES
- **No romper producción** (las 3 apps + landing `ialimp.es`). Vanessa intacta; Instant Rollback listo.
- **Multi-tenant:** scoping por inquilino (`empresa_id`/`local_id`/futuro `negocio_id`/CIF) en **TODA** query = frontera RGPD.
- **Sin credenciales en repo** (env vars en Vercel).
- **Install Vercel:** `npx --yes pnpm@10.33.0 install --no-frozen-lockfile` (ya configurado en los `vercel.json`).
- **Reusar núcleos** existentes (`core-ai/fiscal/push/storage/email`); **no duplicar**.
- **Paquetes nuevos:** mirror de `packages/core-ai` (TS puro `workspace:*`); si tienen dep npm, va en su
  `package.json` (pnpm la symlinkea) + añadir a `transpilePackages` de cada app que lo use.
- Verificar con **build/preview real**, no solo `tsc` (Vercel reproduce fallos que tsc no ve).
- Commits `feat:`/`fix:`; cada vertical tiene su `CLAUDE.md` con reglas propias — **leerlo** antes de tocarla.
- Scope `@iarest/*` es **provisional** (no bloquea); se renombra cuando se decida el nombre de la matriz.

### 9.3 Orden de hitos
- **HITO 0 — Fundación:** monorepo pnpm + 5 núcleos. ✅ **HECHO, en producción.**
- **HITO 1 — Módulo CONTABILIDAD compartido** (empezar aquí):
  - 1.1 `packages/module-contabilidad`: lógica pura (IVA por trimestre, PyG/resultado, tesorería,
    recurrentes) basada en la de **ialimp** (la más madura: vistas `v_contab_*`). Definir el **PUERTO**:
    forma normalizada de "apunte" (ingreso/gasto: fecha, importe, base, IVA, categoría, origen, tenant).
    **Agnóstico de BD** (recibe apuntes por el puerto; no consulta BD directamente → sirve a ia.rest que tiene otra BD).
  - 1.2 Adoptar en **ialimp** (comportamiento idéntico). PR → previews verdes → merge → verificar.
  - 1.3 Adoptar en **sivra** (ingresos/gastos; comparte BD con ialimp = más fácil).
  - 1.4 Adoptar en **ia.rest** (BD distinta → vía puerto).
  - **Salida:** una sola contabilidad + base de datos para el cuadro de mando.
- **HITO 2 — Cimiento "Cuenta→Sociedades/CIF→Negocios/Fincas" + identidad única + cuadro de mando shell**
  (Fase 0.5; más grande → **su propio diseño/esquema antes de código**):
  - 2.1 Modelo de datos jerárquico (adaptable 1..N CIF); `core-identity` = contrato de cuenta/sesión.
  - 2.2 Shell: un login + **selector de negocio** + **cuadro de mando consolidado** que lee de la contabilidad (Hito 1).
    Decidir (diseñando) si es app nueva `apps/<plataforma>` o evolución de una existente — sin romper el scoping actual.
- **HITO 3+ — Resto de módulos/capacidades** (uno a uno, mismo patrón), orden sugerido:
  1. **IA documental** (unificar los 3 escáneres). 2. **Facturación** (extender `core-fiscal`).
  3. **Ventas/CRM** · **Almacén** (multi-ubic.) · **RRHH/nóminas** · **Marketing/SEO/Web** · **Mensajería**.
  4. Capacidades §7 (copiloto único, intercompany, marketplace-red, open-banking, reglas) — cada una su diseño.

### 9.4 Definición de "HECHO" (por módulo)
- Lógica pura en `packages/`, adoptada en ≥1 vertical **preservando comportamiento**.
- **Previews verdes de las 3 + CI**; producción verificada (sin romper nada).
- Docs al día: este plan + `docs/CONTEXTO-SESIONES.md` + `public/manual.html` de la app si cambió UI.
- Datos de prueba limpiados (las BD son de producción en vivo).

---

## 10. Pendiente de decidir
- **Nombre de la matriz** → «Encaje» (dominios `encaje.ai`/`encaje.app` libres) → al fijarlo, **rename
  del scope `@iarest/* → @<marca>/*`** (mecánico, listo para ejecutar).
- Hito 2: app nueva vs evolución (se decide al diseñar el cimiento).
- Modelo de cobro de servicios entre clientes (cuando se monte el marketplace).

## 11. Decidido (NO re-preguntar)
- Verticales = especialidades, **se quedan**; se unifican los **módulos**.
- Cliente = **dueño con varios negocios** de sectores distintos; **una cuenta** lo ve todo.
- Jerarquía **adaptable** `Cuenta → Sociedades/CIF (1..N) → Negocios/Fincas`; sectores **enchufables**.
- `sivra` + portal-propietario `ialimp` = **se unifican** (Inmobiliario); limpieza = servicio.
- `ia.rest` = vertical de **hostelería** (restaurantes + catering/eventos + espacios). Tal cual.
- **Empezar por Contabilidad** (Hito 1). Las **7 capacidades** del §7 entran todas.
- **Cuadro de mando consolidado** = feature clave.
