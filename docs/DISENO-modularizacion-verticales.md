# Diseño — Modularización de capacidades horizontales (casa de marcas)

> Estado: **DISEÑO** (no implementado). Esta ronda solo documenta; la extracción real de
> código de `apps/ia-rest` es de rondas posteriores.
> Relacionado: `MATRIZ.md`, `docs/PLAN-plataforma-modular.md`, `apps/ia-rest/CLAUDE.md`.

## 1. Por qué (contexto)

La casa de marcas tiene hoy 3 verticales en producción (`ia-rest`, `ialimp`, `sivra`) + la
`plataforma` consolidada. `ia-rest` ha acumulado, además del POS de hostelería, un montón de
**capacidades horizontales** (CRM/leads, portales públicos con token, inventario, presupuestos,
proveedores, feedback, OCR, ASN, agenda) que **no son específicas de hostelería** y que otras
verticales necesitarán.

Disparador concreto: la reunión con **Joaquín Jaén**, un holding con varios negocios
—restaurante, catering, haciendas de eventos (propiedad y alquiler), alquiler de materiales,
transporte de camiones y nuevas tiendas de comida para llevar—. Sus **comerciales necesitan el
mismo CRM** para eventos, para transporte y para alquiler de materiales; sus haciendas necesitan
reservas + limpieza; sus tiendas se alimentan de una cocina central. Y el siguiente cliente
(p.ej. una **clínica estética**) reutilizaría CRM + reservas + feedback + presupuestos.

**Objetivo:** sacar esas capacidades a paquetes compartidos `packages/module-*` con un patrón
de **conector/adaptador**, de modo que cualquier vertical (actual o futura) las enchufe sin
reescribirlas. Es el mismo principio que ya aplican `packages/core-*` y
`packages/module-contabilidad`, llevado a capacidades de producto.

## 2. Principios de arquitectura

- **`core-*` = núcleos técnicos** (IA, fiscal, push, email, storage, identity). Sin dominio.
- **`module-*` = capacidades de producto** portables, con su modelo genérico + puertos. Pueden
  apoyarse en `core-*`, nunca al revés. No conocen a ninguna vertical.
- **Vertical (`apps/*`) = dominio + adaptadores.** Cada vertical mapea sus entidades de negocio
  a las entidades genéricas del módulo mediante un **adaptador** (patrón puerto/adaptador).
- **Regla de oro de la costura:** el módulo nunca importa nada de una vertical; la vertical
  importa el módulo e implementa su interfaz. La dependencia siempre apunta hacia el módulo.
- **BD:** cada módulo define sus tablas genéricas (o un contrato de repositorio). Para no forzar
  una migración masiva de golpe, los módulos admiten **dos modos**: (a) tablas propias del
  módulo, o (b) un repositorio-adaptador que lee/escribe las tablas existentes de la vertical
  durante la transición.

## 3. La pieza central: el agregado genérico **Encargo**

Un *evento* de catering en ia-rest **ya es** la composición de varias capacidades:
oportunidad (CRM) → presupuesto → inventario/menaje → proveedores → portal de cliente →
transporte → feedback. Un **porte de camión**, un **alquiler de materiales** y una **cita/bono
de clínica** son exactamente el mismo patrón con otra piel.

Por eso el diseño define un agregado genérico **`Encargo`** (job/orden de trabajo) que **une los
módulos** en lugar de recomponerlos a mano en cada vertical:

```
Encargo {
  id
  tipo            // 'evento' | 'porte' | 'alquiler' | 'cita_clinica' | 'comanda' | ...
  vertical        // 'ia-rest' | 'transporte' | 'materiales' | 'clinica' | ...
  oportunidad_id?       // → module-crm
  presupuesto_id?       // → module-presupuestos
  recurso_reserva_id?   // → module-agenda (hacienda / camión / kit / sala)
  asignaciones_activo[] // → module-inventario
  proveedores[]         // → module-proveedores
  portal_id?            // → module-portales
  feedback_id?          // → module-feedback
  estado
  fechas, importes…
}
```

`parent_id + parent_type` es la **costura compartida** por casi todos los módulos: un activo de
inventario, una asignación de proveedor o una propina se cuelgan de un `Encargo` (su
`parent_id`), sea del tipo que sea. Esto es lo que hace que un mismo CRM/inventario/proveedores
sirva a eventos, portes y alquileres sin tocar el módulo.

## 4. Patrón de conector/adaptador

Cada `module-*` expone:
1. **Entidades genéricas** (tipos TS puros).
2. **Puertos** (interfaces): repositorio de datos y, donde aplique, UI parametrizable.
3. **Lógica** pura/servicios sobre las entidades genéricas.

Cada vertical aporta un **adaptador** que mapea su entidad de dominio ↔ la genérica. Ejemplos
(documentados, no implementados):

| Adaptador (vertical) | Mapea | Módulo |
|---|---|---|
| `LeadsEventoAdapter` | `leads_evento` ↔ `Oportunidad` | module-crm |
| `MenajeEventoAdapter` | `inventario_menaje_evento` ↔ `AsignacionActivo` (`parent_type='evento'`) | module-inventario |
| `PresupuestoEventoAdapter` | `presupuestos_evento` (precio_adulto/_nino) ↔ `Presupuesto` (líneas) | module-presupuestos |
| `ProveedorEventoAdapter` | `proveedores_evento_asignaciones` ↔ `ProveedorServicio` | module-proveedores |
| `BriefingEventoAdapter` | formulario briefing catering ↔ `FormaDinamica` | module-portales |
| `ReservaHaciendaAdapter` (futuro sivra/venues) | disponibilidad de hacienda ↔ `RecursoReserva` | module-agenda |

## 5. Catálogo de módulos candidatos

Origen = ubicación actual en `apps/ia-rest`. "Costura" = qué hay que generalizar para
desacoplarlo de hostelería.

| Módulo nuevo | Origen en ia-rest | core-* | Costura a romper |
|---|---|---|---|
| **module-crm** | `leads`, `leads_evento`; `/api/owner/eventos/leads`; `CRMEventosTab` | core-ai | `leads_evento.evento_id`, `tipo_evento`, `aforo` → `Oportunidad` + `parent_*` |
| **module-agenda** | calendario/disponibilidad de `eventos`; `CalendarioEventosTab` | — | separar "disponibilidad de recurso" (genérico) del modelo `eventos`/tipos (hostelería) |
| **module-portales** | `evento_briefing`, `evento_portal_cliente`; `/evento/briefing/[token]`, `/catering/[slug]`, `/portal/[token]`, `/tienda/[slug]` | — | formulario briefing catering → `FormaDinamica` parametrizable; token genérico |
| **module-inventario** | `stock_central`, `transferencias_central`, `inventario_menaje(_evento)`; `/api/central/*` | — | `inventario_menaje_evento.evento_id` → `AsignacionActivo.parent_id/parent_type`; categorías parametrizables |
| **module-presupuestos** | `presupuestos_evento`, `costes_evento`, `evento_historico_precios`; `/api/owner/eventos/presupuestos` | core-fiscal | tarifa `precio_adulto/_nino` → líneas `cantidad × precio_unitario`; márgenes |
| **module-proveedores** | `proveedores_evento(_asignaciones)`; `/api/owner/eventos/proveedores-*` | — | `..._asignaciones.evento_id` → `ProveedorServicio.oportunidad_id`/`parent_*`; portal proveedor con token |
| **module-feedback** | `feedback_visita`, `propinas`; `/api/feedback/[token]`, `/api/propinas/[token]` | core-push | `propinas.comanda_id` (y `feedback_visita` sin `evento_id`) → `parent_id/parent_type` |
| **module-asn** | `proveedores`, `asn_cabecera`, `asn_lineas`; `/proveedor/[token]`, `/api/asn/*` | core-ai (OCR) | token genérico; ASN ya es modelo estándar de logística |
| **module-ocr** (consolidación) | `/api/owner/stock/ocr`, `/api/asn/ocr`, `/api/scanner/clasificar`; `lib/brain.ts` | core-ai | casi agnóstico; en gran parte ya delegado en `core-ai` → envoltura fina |
| **module-mensajeria** (consolidación) | `qr_avisos_suscripciones`; `/api/push/send` | core-push, core-email | consolidar canales/plantillas; ya casi agnóstico |

**Se quedan en `apps/ia-rest` (específico hostelería, NO se modulariza):** KDS / producción,
comandas / mesas / turnos, menús / pases / alérgenos, APPCC, escandallos per-cápita, **VeriFactu
/ facturación AEAT** (ya apoyada en `core-fiscal`), y el modelo de negocio `eventos` con sus
tipos (boda, comunión, empresa…). Estas se consultan, si hace falta, vía API de lectura — no se
extraen.

## 6. Conector de KPIs para `plataforma` (registro, no `if app===`)

Hoy `apps/plataforma/lib/financiero.ts` despacha con `if (app === 'ialimp') … if (app === 'sivra') …`.
Con 6+ verticales no escala y mezcla la conexión a cada BD dentro del core.

**Diseño:** un **registro de `ResumenProvider`**. Cada vertical registra su proveedor (cómo leer
su financiero y de qué BD), y `getResumenNegocio` solo busca en el registro por `app`:

```ts
type ResumenProvider = (refExt: string | null, anio: number) => Promise<ResumenFinanciero>
const PROVIDERS: Record<string, ResumenProvider> = {
  ialimp: getResumenIalimp2,   // BD compartida (Prisma)
  sivra:  getResumenSivra2,    // BD compartida (Prisma)
  'ia-rest': getResumenIaRest, // BD separada (supabase-js service-role)  ← ya añadido en HITO 3
}
```

El **HITO 3 (financiero de ia-rest)** es justo el primer caso que demuestra el patrón
multi-BD: ia-rest se lee con un cliente `@supabase/supabase-js` contra su Supabase separada
(`apps/plataforma/lib/iarest.ts`). Convertir el `if` en registro es un refactor pequeño que
deja el dashboard **extensible sin tocar el core** cuando entren nuevas verticales
(transporte, materiales, clínica…). Cada futura vertical solo añade su provider.

## 7. Intercompany — el gancho para un holding

Un holding factura **entre sus propias sociedades**: la cocina central factura a las tiendas, el
transporte factura al catering, el alquiler de materiales factura a los eventos. La jerarquía
`Cuenta → Sociedad → Negocio` de `plataforma` ya lo soporta estructuralmente; falta el modelo de
**operaciones vinculadas + consolidación con eliminación**:

- Registrar que el ingreso de la Sociedad A proviene de la Sociedad B del mismo holding.
- En el dashboard consolidado, **eliminar** esos importes intercompany para no inflar el
  agregado del holding (ingreso de A = gasto de B → neto 0 a nivel grupo).
- Apoyarse en `module-presupuestos` + `core-fiscal` para emitir la factura intercompany, y en el
  agregado `Encargo` para trazar el flujo (el porte/alquiler/lote de cocina que la origina).

Esto es **muy diferencial frente a un ERP genérico** y encaja exactamente con el perfil de
Joaquín (cocina central → tiendas; flota → catering; materiales → eventos).

## 8. Reutilización entre verticales existentes (sin construir nada)

- **Cross-sell `ialimp` para las haciendas de eventos:** las haciendas necesitan limpieza
  *turnaround* entre eventos. `ialimp` ya existe → se conecta una "empresa" de limpieza al
  negocio "haciendas" sin desarrollo nuevo.
- **`sivra` como base de venues:** propiedades + calendario + documentos + portal de propietario
  de `sivra` son reutilizables para las **haciendas en propiedad/alquiler** (gestión de inmueble +
  disponibilidad), combinados con `module-agenda` y `module-presupuestos`.

## 9. Refactors de acoplamiento residual (para la ronda de extracción)

- `feedback_visita` **no tiene `evento_id`** → añadir FK opcional a `parent_id/parent_type`.
- `propinas` atadas a `comanda_id` → flexibilizar a `parent_id + parent_type`.
- `inventario_menaje_evento.evento_id` → tabla genérica `asset_assignments(parent_id, parent_type)`.
- `leads_evento` mezcla CRM genérico con campos catering (`tipo_evento`, `aforo`) → separar core
  `Oportunidad` + tabla de extensión por vertical.

## 10. Orden de extracción recomendado (por valor para Joaquín)

1. **module-crm** — su ejemplo explícito (comerciales de eventos + transporte + materiales).
2. **module-inventario** — habilita el futuro **alquiler de materiales**.
3. **module-agenda** — disponibilidad de haciendas, camiones, kits y (futuro) citas de clínica.
4. **module-presupuestos** → 5. **module-proveedores** → 6. **module-portales** →
   7. **module-feedback** → 8. **module-asn**.
9. **module-ocr / module-mensajeria** — consolidación ligera (ya apoyadas en `core-*`), en
   cualquier momento.
0. **(Transversal)** convertir el dispatcher de KPIs en registro (§6) — barato, va con HITO 3.

> Los **dos módulos nuevos de negocio** que Joaquín necesita y hoy no existen —**alquiler de
> materiales** y **flota/transporte**— se diseñan a fondo en su propio documento (siguiente
> ronda) y se construyen **componiendo** `module-crm` + `module-inventario` + `module-agenda` +
> `module-presupuestos` + `module-proveedores` sobre el agregado `Encargo`. Esa es la prueba de
> que la modularización paga.

## 11. Matriz de consumo por negocio

Qué módulo necesita cada negocio del holding (✅ directo · 🔧 vía módulo nuevo compuesto):

| Negocio de Joaquín | crm | agenda | inventario | presupuestos | proveedores | portales | feedback | Vertical base |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| Restaurante | | | ✅ | | | ✅ | ✅ | ia-rest |
| Tiendas comida para llevar | | | ✅ | | | ✅ | ✅ | ia-rest (Tienda) |
| Catering / eventos | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ia-rest (eventos) |
| Haciendas (propiedad/alquiler) | ✅ | ✅ | | ✅ | ✅ | ✅ | ✅ | sivra + ialimp (limpieza) |
| Alquiler de materiales | ✅ | ✅ | ✅ | ✅ | | ✅ | ✅ | 🔧 vertical nueva |
| Transporte (camiones) | ✅ | ✅ | 🔧 | ✅ | ✅ | | ✅ | 🔧 vertical nueva |
| **Cliente plantilla: clínica estética** | ✅ | ✅ | ✅ | ✅ | | ✅ | ✅ | 🔧 vertical nueva |

La fila "clínica estética" demuestra el objetivo: un cliente de **otro sector** se monta casi
entero con los mismos módulos (CRM de captación, agenda de citas, inventario de producto,
presupuestos/bonos, portal de paciente, feedback) + una piel ligera de dominio.

## 12. Modelo comercial habilitado

- **Catálogo de módulos activables por negocio:** la modularización permite vender por módulos
  (CRM aquí, inventario allá), como ya insinúa `leads.modulos_recomendados[]`. Cada negocio del
  dashboard activa los módulos que necesita → pricing por módulo/negocio.
- **Joaquín como design partner / caso de referencia** del modelo holding (intercompany +
  multi-vertical) a cambio de condiciones de lanzamiento.

## 13. Para confirmar con Joaquín en la reunión

- Nº real de **sociedades/CIFs** y qué negocio cuelga de cada una.
- Qué **software usa hoy** cada negocio (coste/realidad de migración).
- Si entran **comerciales/empleados** (→ necesidad de roles/RBAC por negocio, sobre `core-identity`).
- **Dolor nº1** y por dónde arrancar el **piloto** (apuesta: cocina central → tiendas con ia-rest,
  + CRM de eventos como segundo módulo).
- Volumen de **operaciones intercompany** (cocina→tiendas, flota→catering, materiales→eventos).
