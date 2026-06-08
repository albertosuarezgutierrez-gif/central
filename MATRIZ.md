# 🏛️ Casa de marcas — Matriz

> Este repositorio es una **casa de marcas** (monorepo "fábrica de marcas"). La **raíz es la
> MATRIZ** (capa común + identidad del grupo); cada producto es una **vertical** bajo `apps/`.
> La matriz **no es** ninguna vertical: ni siquiera `ia.rest` (que históricamente vivía en la
> raíz) es la matriz — `ia.rest` es **una vertical más**.

## Estructura

```
/                      ← MATRIZ (capa común, plantilla, identidad del grupo)
├── packages/          ← módulos compartidos, portables y enchufables
│   ├── core-ai        ← IA (proveedores, geminiSearch, …)
│   ├── core-fiscal    ← fiscalidad (VeriFactu, ES, …)
│   └── core-identity  ← contrato de sesión/inquilino (puertos & adaptadores)
├── apps/              ← VERTICALES (un proyecto Vercel por carpeta, Root Directory = apps/<app>)
│   ├── sivra          ← intranet de pisos turísticos (Sevilla)            [✅ en apps/]
│   ├── ialimp         ← SaaS multi-tenant de limpiezas (app.ialimp.es)    [✅ en apps/]
│   └── ia-rest        ← Voice POS / hostelería (iarest.es)                [✅ en apps/]
└── docs/              ← runbook del corte, contexto de sesiones, arquitectura
```

## Verticales (las 3 son hermanas; ninguna es la matriz)

| Vertical | Producto | Proyecto Vercel | Estado |
|---|---|---|---|
| **ia-rest** | Voice POS / hostelería | `ia-rest` | ✅ En `apps/ia-rest`, Root Directory `apps/ia-rest` (live en `iarest.es`). |
| **sivra** | Intranet pisos turísticos | `sivra` | ✅ En `apps/sivra`, Root Directory `apps/sivra`. |
| **ialimp** | SaaS de limpiezas | `ialimp` | ✅ En `apps/ialimp`, Root Directory `apps/ialimp`. |

## Cómo se bajó `ia.rest` a `apps/ia-rest` (HECHO — 08/06/2026, PR #90)

La raíz **no puede ser a la vez** "la app de `ia.rest`" y "la matriz", así que `ia.rest` bajó a
`apps/ia-rest` como las demás. **No fue un simple `git mv`** porque `ia.rest` **consume `packages/*`**
(`@iarest/core-ai`, `@iarest/core-fiscal`). Lo que se hizo (referencia para futuras verticales que
consuman `packages/*`):

1. **`file:` deps** en `apps/ia-rest/package.json` (`@iarest/core-ai: file:../../packages/core-ai`,
   idem core-fiscal) → `npm install` crea `node_modules/@iarest/*` por symlink. **Self-contained, sin
   pnpm/turbo** (Vercel instala aislado por Root Directory, igual que sivra/ialimp).
2. **`next.config(.ts/.js)`**: `outputFileTracingRoot` + `turbopack.root` = raíz del monorepo
   (`path.join(__dirname,'..','..')`) → Turbopack/tracing resuelven `packages/` fuera de `apps/ia-rest`.
3. Se **quitaron los `tsconfig paths` de `@iarest/*`** (resuelven por `node_modules`, que respeta el
   export `./es` de core-fiscal). Se mantiene `@/* → ./src/*`.
4. **CI** (`.github/workflows/ci.yml`, `qa.yml`): `defaults.run.working-directory: apps/ia-rest` +
   `cache-dependency-path: apps/ia-rest/package-lock.json`.
5. **Cutover en Vercel** (vigilado, sin downtime): se cambió **primero** el Root Directory del
   proyecto `ia-rest` a `apps/ia-rest` (no auto-redeploy), **luego** se mergeó el PR → build de
   producción desde `apps/ia-rest` en verde (`✓ Compiled`, Next 16.2.6) → `iarest.es` promovido.
   Red de seguridad disponible: **Instant Rollback** de Vercel.

> ⚠️ **Trampa evitada:** si se mergea ANTES de cambiar el Root Directory, la raíz (ya matriz, sin app)
> produce un **build vacío de ~1s que ÉXITO-pero-vacío** y **reemplazaría producción** (caída). Por eso
> el orden es **Root Directory primero, merge después**.

## Regla

Toda **vertical nueva** entra como `apps/<app>` con su propio `package.json`/`vercel.json` y un
proyecto Vercel con Root Directory `apps/<app>`. Los **módulos compartidos** viven en `packages/*`
(portables, sin acoplarse a ninguna vertical). La **matriz** (raíz) no contiene lógica de producto.
