# Radiografía de estructura — auditoría automática del monorepo

> Spec de diseño. Fecha: 2026-06-11. Branch: `claude/panel-estructura-audita-84mao7`.

## Problema

La pestaña **🗺️ Estructura** del god-panel (`apps/plataforma/app/admin/page.tsx`,
datos en `apps/plataforma/lib/estructura.ts`) es hoy un **catálogo plano**: lista
Verticales, Núcleos `core-*`, Módulos `module-*` y Agentes, **curado a mano**. No
responde la pregunta que Alberto necesita: **¿qué módulo o función está implementado
en cada vertical y cuál no?** — la base para portar mejoras de una vertical a otra.

Además el catálogo curado **ya se desvía del código real**: `apps/ia-rest/package.json`
declara `module-asn`, `module-crm`, `module-feedback`, `module-inventario`,
`module-presupuestos`, `module-proveedores`, mientras `docs/ESTRUCTURA.md` los daba
como "⏳ no usados". Un dato curado a mano envejece; uno auditado contra el código no.

## Objetivo

Convertir la pestaña Estructura en una **radiografía** del programa: una auditoría
**automática del repo** que muestre, en matriz, qué tiene cada vertical y dónde están
los huecos/oportunidades de portar. Cobertura **100% del repo** (las 4 apps de `apps/*`
+ todos los `packages/*`). Fuentes externas (Supabase, Vercel) quedan fuera → **fase 2**.

## Decisiones tomadas (brainstorming)

- **Fuente del dato:** auditoría automática del repo (no matriz curada a mano).
- **Alcance de detección:** lo más completo posible — módulos (por imports) **y**
  funciones/áreas (por reglas de detección curadas).
- **Cobertura:** 100% del repo. Externo = fase 2.
- **Frescura:** script `npm run auditar` **+ check en CI** que avisa si el artefacto
  quedó desincronizado del código.

## Arquitectura

Tres piezas + un check de CI:

```
scripts/auditar-estructura.mjs   (1) escanea repo → escribe JSON
        │
        ▼
apps/plataforma/lib/estructura.generated.json   (2) artefacto commiteado
        │
        ▼
apps/plataforma/lib/estructura.ts → re-exporta tipado
        │
        ▼
apps/plataforma/app/admin/page.tsx (componente Estructura)   (3) UI matriz
```

**Por qué un artefacto commiteado y no escaneo en runtime:** el proyecto Vercel de
`plataforma` tiene Root Directory `apps/plataforma`; en producción **solo ve su propia
carpeta**, no las `apps/` hermanas. El escaneo debe correr en el repo (script/CI) y
dejar un JSON que el build aislado de plataforma pueda importar.

## (1) Script de auditoría — `scripts/auditar-estructura.mjs`

Node puro, ESM, **sin dependencias** (solo `node:fs`, `node:path`). Se invoca con
`npm run auditar` (script nuevo en el `package.json` raíz). Determinista: orden estable
de filas/columnas para que el diff del JSON sea limpio.

### 1a. Descubrimiento
- **Verticales** = subcarpetas de `apps/*` con `package.json` (hoy: `ia-rest`, `ialimp`,
  `sivra`, `plataforma`).
- **Packages** = subcarpetas de `packages/*` (hoy: 6 `core-*` + 9 `module-*`).

### 1b. Matriz de módulos (app × package)
Para cada (app, package), estado:
- ✅ **`usado`** — el código de la app importa el paquete. Detección: buscar en
  `apps/<app>/**/*.{ts,tsx,js,mjs,cjs}` (excluyendo `node_modules`, `.next`, `dist`)
  un import del nombre publicado del paquete (`@iarest/<nombre>`, leído del
  `name` de `packages/<pkg>/package.json`). Regex sobre `from '…'` / `require('…')` /
  `import('…')`.
- ◐ **`declarado`** — figura en `dependencies`/`devDependencies` de
  `apps/<app>/package.json` pero **no** se detecta import → deuda o pendiente.
- ❌ **`no`** — ni declarado ni importado.

Cada celda guarda `{ estado, evidencias: number }` (nº de ficheros con import).

### 1c. Matriz de capacidades (app × capacidad)
Catálogo curado `CAPACIDADES` en el propio script (lista de objetos
`{ id, label, grupo, match: string[] }`). `match` = patrones de ruta **relativos a la
raíz de la app** que evidencian la capacidad. Detección: una capacidad está ✅ en una
app si **algún** patrón hace match con ≥1 fichero/carpeta existente; si no, ❌.
Cada celda guarda `{ presente: boolean, evidencias: number }`.

Catálogo inicial (derivado de `docs/ESTRUCTURA.md` §5 y de las rutas reales ya
inspeccionadas; se afina al implementar). Grupos y ejemplos de `match`:

| grupo | capacidad (id) | match (ejemplos, glob relativo a la app) |
|---|---|---|
| Venta/operación | `tpv` | `**/api/caja/**`, `**/api/turno/**`, `**/api/comanda*/**` |
| Venta/operación | `kds` | `**/api/kds*/**`, `**/kds/**` |
| Venta/operación | `eventos-catering` | `**/api/eventos/**`, `**/api/kds-evento/**`, `**/api/propuesta/**` |
| Venta/operación | `reservas` | `**/api/reservas/**`, `**/api/booking*/**` |
| Cliente | `qr-portal` | `**/api/edge/**`, `**/qr/**`, `**/portal*/**` |
| Cliente | `feedback` | `**/api/feedback/**`, `**/feedback/**` |
| Limpieza/inmob | `limpiadoras` | `**/api/limpiadoras/**`, `**/limpiadoras/**`, `**/api/**/limpiadoras/**` |
| Limpieza/inmob | `agenda-asignacion` | `**/api/**/agenda/**`, `**/api/**/asignacion/**`, `**/auto-assign/**` |
| Inmobiliario | `pricing` | `**/api/rates/**`, `**/api/inversion/**`, `**/pricing/**` |
| Inmobiliario | `mercado` | `**/api/updates/**`, `**/api/rates/snapshot/**`, `**/mercado/**` |
| Negocio | `crm-leads` | `**/api/crm/**`, `**/api/leads/**`, `**/cotizador*/**` |
| Negocio | `marketing` | `**/blog*/**`, `**/instagram/**`, `**/api/**/seo*/**` |
| Negocio | `rrhh` | `**/api/rrhh/**`, `**/api/**/nomina/**`, `**/api/**/limpiadoras/**/tarifas/**` |
| Stock | `almacen-stock` | `**/api/asn/**`, `**/api/**/productos/**`, `**/api/**/reposiciones/**`, `**/inventario/**` |
| Finanzas | `contabilidad` | `**/api/**/contabilidad/**`, `**/contabilidad/**` |
| Finanzas | `facturacion-verifactu` | `**/api/**/factura*/**`, `**/verifactu/**` |
| Plataforma | `hardware-bridge` | `**/bridge/**`, `**/api/**/impresora*/**`, `**/escpos/**` |
| Plataforma | `escaner-ocr` | `**/api/**/escanear/**`, `**/api/**/ocr/**`, `**/smart-scan/**` |
| Plataforma | `informes` | `**/api/**/informes/**`, `**/informes/**` |
| Plataforma | `notificaciones` | `**/api/**/vapid*/**`, `**/api/**/push/**` |

> El catálogo es la parte semi-automática: el **código** marca ✅/❌, el **catálogo**
> define qué buscar. Al añadir una capacidad nueva se amplía esta lista. El objetivo es
> que cubra las áreas de `docs/ESTRUCTURA.md §5` sin pretender granularidad de endpoint.

### 1d. Gaps / oportunidades (derivado)
A partir de las matrices, el script calcula:
- **Módulos infrautilizados:** celdas ◐ `declarado` (paquete en `package.json` sin import).
- **Oportunidades de portar:** por cada capacidad presente en ≥1 vertical y ausente en
  otra comparable → `{ capacidad, tiene: [apps], falta: [apps] }`.
- **Resumen:** nº de verticales, packages, capacidades, gaps.

### 1e. Salida
Escribe `apps/plataforma/lib/estructura.generated.json`:
```jsonc
{
  "generadoEn": "2026-06-11T..Z",
  "verticales": ["ia-rest","ialimp","plataforma","sivra"],
  "packages": [{ "id":"core-ai","tipo":"core","npm":"@iarest/core-ai" }, ...],
  "capacidades": [{ "id":"tpv","label":"TPV / comanda","grupo":"Venta/operación" }, ...],
  "matrizModulos":  { "core-ai": { "ia-rest": {"estado":"usado","evidencias":12}, ... }, ... },
  "matrizCapacidades": { "tpv": { "ia-rest": {"presente":true,"evidencias":3}, ... }, ... },
  "gaps": {
    "modulosInfrautilizados": [{ "package":"module-crm","app":"ia-rest" }, ...],
    "oportunidadesPortar": [{ "capacidad":"contabilidad","tiene":["ialimp","sivra"],"falta":["ia-rest"] }, ...]
  }
}
```

## (2) Artefacto + tipado — `apps/plataforma/lib/estructura.ts`

`estructura.ts` se mantiene como hoy (listas curadas `VERTICALES`/`MODULOS`/`AGENTES`,
que dan **descripciones** legibles), y **añade**:
- `import audit from './estructura.generated.json'` con una interfaz `Radiografia`
  tipando el JSON.
- Re-exporta `RADIOGRAFIA: Radiografia` para el panel.
- Helpers de presentación si hacen falta (p.ej. juntar `MODULOS[i].desc` con la fila de
  la matriz por `id`).

El JSON se commitea. `tsconfig` de plataforma ya permite importar JSON (Next 15);
si no, se añade `resolveJsonModule`.

## (3) UI — componente `Estructura` en `app/admin/page.tsx`

Sobre el `Estructura()` actual, **arriba** del catálogo existente:

- **Cabecera de radiografía:** *"Radiografía del repo · última auditoría: <fecha>"* +
  KPIs (nº gaps, nº módulos infrautilizados, nº oportunidades de portar).
- **Matriz de módulos:** tabla. Filas = packages (`core-*` luego `module-*`), columnas =
  4 verticales. Celda = chip ✅ usado / ◐ declarado / ❌ no, con `title` = nº evidencias.
  Reusa la paleta `C` y estilo `card()` ya existentes (sin Tailwind).
- **Matriz de capacidades:** tabla. Filas = capacidad (agrupadas por `grupo`), columnas =
  verticales, celda ✅/❌ (✅ con `title` = evidencias).
- **Oportunidades de portar:** lista "«<capacidad>» la tienen <tiene>, falta en <falta>".
- Debajo, **se mantienen** las listas-catálogo actuales (descripciones de cada
  módulo/agente), que aportan el "qué es" que la matriz no da.

Móvil: las tablas con `overflow-x:auto` (muchas columnas no caben en móvil).

## (4) Check en CI

Nuevo job en `.github/workflows/ci.yml` (o workflow propio `auditoria.yml`):
1. `corepack`/`pnpm` ya disponibles → `node scripts/auditar-estructura.mjs` regenera el JSON.
2. `git diff --exit-code apps/plataforma/lib/estructura.generated.json` → **falla** si el
   commiteado no coincide con el recién generado (señal de "regenera la radiografía").

El job no necesita instalar dependencias del monorepo (el script es Node puro), así que
es rápido y aislado.

## Qué NO entra (YAGNI / fase 2)

- Inspección de **fuentes externas** (tablas Supabase, Edge Functions, env de Vercel).
- Granularidad por endpoint (la matriz es por **área/capacidad**, no por ruta).
- Detección de **agentes IA** por código (siguen curados en `AGENTES`; su rastro en
  código es difuso). El foco de la auto-auditoría son packages + capacidades.
- Auto-edición de `docs/ESTRUCTURA.md` (se mantiene a mano; el JSON es la verdad viva).

## Archivos tocados

- **Nuevo:** `scripts/auditar-estructura.mjs`
- **Nuevo:** `apps/plataforma/lib/estructura.generated.json` (generado, commiteado)
- **Editado:** `package.json` (raíz) → script `"auditar"`
- **Editado:** `apps/plataforma/lib/estructura.ts` → import + tipo + re-export
- **Editado:** `apps/plataforma/app/admin/page.tsx` → componente `Estructura` con matrices
- **Editado:** `.github/workflows/ci.yml` (o nuevo `auditoria.yml`) → check de frescura
- **Editado:** `docs/ESTRUCTURA.md` → nota de que la radiografía vive en el panel/JSON

## Validación

- `npm run auditar` corre sin error y produce JSON determinista (correr 2× → mismo diff).
- La matriz refleja los hechos ya conocidos: ia-rest declara 6 `module-*` (◐ o ✅ según
  imports reales); `module-contabilidad` ✅ en ialimp/sivra/ia-rest; pricing ✅ solo sivra.
- El panel `/admin` → pestaña Estructura renderiza ambas matrices sin romper el catálogo.
- CI: tras un cambio estructural sin regenerar, el check **falla**; tras `npm run auditar`
  + commit, **pasa**.
</content>
</invoke>
