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
│   └── ia-rest        ← Voice POS / hostelería (iarest.es)                [⏳ PENDIENTE: aún en la raíz]
└── docs/              ← runbook del corte, contexto de sesiones, arquitectura
```

## Verticales (las 3 son hermanas; ninguna es la matriz)

| Vertical | Producto | Proyecto Vercel | Estado |
|---|---|---|---|
| **ia-rest** | Voice POS / hostelería | `ia-rest` | ⏳ **Todavía en la raíz** del repo. Falta bajarlo a `apps/ia-rest` (ver abajo). |
| **sivra** | Intranet pisos turísticos | `sivra` | ✅ En `apps/sivra`, Root Directory `apps/sivra`. |
| **ialimp** | SaaS de limpiezas | `ialimp` | ✅ En `apps/ialimp`, Root Directory `apps/ialimp`. |

## Por qué `ia.rest` sigue en la raíz (y cómo bajarlo a `apps/ia-rest`)

La raíz **no puede ser a la vez** "la app de `ia.rest`" y "la matriz". Para que la matriz quede
limpia, `ia.rest` debe bajar a `apps/ia-rest` como las demás. **No es un simple `git mv`** porque
`ia.rest` **ya consume `packages/*`** (`@iarest/core-ai`, `@iarest/core-fiscal` vía `tsconfig
paths` + `transpilePackages`), con rutas **relativas a la raíz**. El movimiento requiere:

1. **Workspace que abarque `apps/*` + `packages/*`** (pnpm recomendado, o npm workspaces) para que
   el build aislado de `apps/ia-rest` (Vercel con Root Directory `apps/ia-rest`) resuelva `@iarest/*`.
2. **`git mv`** de la app de `ia.rest` (`src/ lib/ public/ android/ scripts/ supabase/` + configs
   `next.config.* tsconfig.json eslint.config.mjs postcss.config.mjs vercel.json package.json` +
   `AGENTS.md/CLAUDE.md/README.md` específicos) a `apps/ia-rest/`. Ajustar en su `tsconfig` los
   `paths` de `@iarest/*` a `../../packages/...`.
3. **Cutover en Vercel** (lo hace Alberto): cambiar el Root Directory del proyecto `ia-rest` a
   `apps/ia-rest`. **OJO:** es la app de hostelería **en vivo** y **no se puede pre-validar con
   preview** (es el propio proyecto que se reubica) → hacerlo **vigilado**, con verificación en vivo
   de `iarest.es` y rollback en 1 clic (Root Directory de vuelta a la raíz). Es la "OPCIÓN POSTERIOR"
   del runbook (`docs/RUNBOOK-monorepo.md`).

Hasta entonces, `ia.rest` funciona como vertical **in situ** en la raíz (su proyecto Vercel
despliega desde la raíz, sin cambios). La matriz queda **definida** (este archivo + `packages/*`);
su consolidación física (raíz sin app) se completa cuando `ia.rest` baje a `apps/ia-rest`.

## Regla

Toda **vertical nueva** entra como `apps/<app>` con su propio `package.json`/`vercel.json` y un
proyecto Vercel con Root Directory `apps/<app>`. Los **módulos compartidos** viven en `packages/*`
(portables, sin acoplarse a ninguna vertical). La **matriz** (raíz) no contiene lógica de producto.
