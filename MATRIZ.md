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
│   ├── core-push      ← Web Push (envoltura pura sobre web-push; dep npm propia)
│   ├── core-storage   ← signed URLs de Supabase Storage (puro, vía REST)
│   ├── core-email     ← transporter de nodemailer (multi-proveedor; dep npm propia)
│   ├── core-identity  ← contrato de sesión/inquilino (puertos & adaptadores)
│   ├── module-contabilidad ← dominio: IVA/PyG/tesorería/rentabilidad (puro, agnóstico de BD)
│   └── module-concursos    ← dominio: agente de concursos públicos/LCSP (lee pliego→ficha+checklist+Go-No-Go; LLM por puerto AiRunner)
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
(`@central/core-ai`, `@central/core-fiscal`). Lo que se hizo (referencia para futuras verticales que
consuman `packages/*`):

1. **`file:` deps** en `apps/ia-rest/package.json` (`@central/core-ai: file:../../packages/core-ai`,
   idem core-fiscal) → `npm install` crea `node_modules/@central/*` por symlink. **Self-contained, sin
   pnpm/turbo** (Vercel instala aislado por Root Directory, igual que sivra/ialimp).
2. **`next.config(.ts/.js)`**: `outputFileTracingRoot` + `turbopack.root` = raíz del monorepo
   (`path.join(__dirname,'..','..')`) → Turbopack/tracing resuelven `packages/` fuera de `apps/ia-rest`.
3. Se **quitaron los `tsconfig paths` de `@central/*`** (resuelven por `node_modules`, que respeta el
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

### Lo COMPARTIDO sube a la matriz; lo de cada marca se queda en su marca
Mismo principio que los `packages/*` (núcleos compartidos) frente a `apps/*` (lo propio), aplicado a
**configuración y secretos**:
- **Arriba (común a todas las verticales)** → no se duplica:
  - **Secretos/keys idénticos** = **Shared Environment Variables a nivel de equipo de Vercel** (no en cada
    proyecto): `NVIDIA_API_KEY` (todas usan `core-ai`), `OPERADOR_SHARED_SECRET` (plataforma ↔ ia-rest), y
    cualquier clave de servicio que sea la misma. Defínela una vez, vincúlala a los proyectos → al crear una
    vertical nueva hereda lo compartido sin reconfigurar. (Si un proyecto ya la tiene a nivel proyecto, esa
    gana sobre la compartida; para unificar, borra la local.)
  - **Config de build/herramientas**: **`tsconfig.base.json` en la raíz** (✅ hecho) con las opciones TS
    comunes (`target`/`lib`/`strict`/`module`/`moduleResolution`/`jsx`/`plugins`…); cada app lo `extends`
    (`"extends": "../../tsconfig.base.json"`) y **solo declara lo SUYO**: `paths` (`@/*`), su `include`/`exclude`,
    y los overrides propios (ia-rest: `jsx:react-jsx`, `types:["node"]`, `lib` con `es2017`; ialimp:
    `allowImportingTsExtensions`). Vercel clona el repo entero (los `file:` deps ya alcanzan `../../packages`),
    así que el `extends` a `../../tsconfig.base.json` resuelve en build aunque el Root Directory sea `apps/<app>`.
    Overrides de pnpm y workflows de CI ya viven en la raíz.
  - **Lint compartido: `eslint.config.base.mjs` en la raíz** (✅ hecho). Sube lo COMÚN: la lista de `ignores` y el
    ruleset de código legado bajado a `warn` (`@typescript-eslint/*`, `react-hooks/*`, `react/no-unescaped-entities`,
    `@next/next/no-html-link-for-pages`, `prefer-const`…). Es **solo DATOS, sin `import` de paquetes** (la raíz no tiene
    `node_modules` en el build por-app, igual razonamiento que con los `file:` deps): cada vertical importa
    `eslint-config-next`/`eslint` desde **su propio** `node_modules` y compone el flat-config
    (`...nextVitals, ...nextTs, globalIgnores([...sharedIgnores, …propios]), legacyWarnRules`). Las 4 apps van a
    **flat-config con `eslint-config-next ^16.2.6`** y `lint: "eslint"` (sivra migró desde el legacy `.eslintrc.json`;
    ialimp y plataforma estrenan eslint). Verificado: **0 errores** en las 4 (ia-rest queda **idéntico**: 0 err / 1164
    warn, mismo desglose por regla → no rompe su build/CI, el único donde el lint es gate). La versión de
    `eslint-config-next` (^16) se desacopla de la de Next por app (el lint son reglas, no runtime; en las 3 apps Next-15
    el lint no es gate ni rompe build por `eslint.ignoreDuringBuilds`).
- **Abajo (específico de cada vertical)** → en su proyecto Vercel / su carpeta:
  - secretos de sesión/JWT, dominios (`NEXTAUTH_URL`…), la BD **propia** de ia-rest (`efncqyvhniaxsirhdxaa`),
    y los integradores de cada una (SMTP, Smoobu, Stripe, Apify…).


## Ver también
- **`docs/ARQUITECTURA-casa-marcas.md`** — mapa-norte de módulos: las **especialidades** encienden
  **módulos** (capacidades de negocio + de plataforma) sobre **núcleos técnicos** (`packages/*`).
  Incluye catálogo de módulos por vertical, mecanismo de "encender", heurística de qué baja a
  `packages/*` y reglas de dependencia.
- **`docs/CONTEXTO-SESIONES.md`** — estado vivo del proyecto entre sesiones.
