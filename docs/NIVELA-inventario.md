# NIVELA — inventario del repo `Cloude` (20/08/2026)

> **Por qué existe este documento.** El repo `albertosuarezgutierrez-gif/Cloude` es privado y está
> **fuera del scope** de las sesiones de Claude Code sobre `central`: no se puede inspeccionar por MCP
> desde aquí. Y el contenedor cloud es efímero. Sin esta ficha, cada vez que se retome la decisión
> «¿qué hacemos con NIVELA?» hay que volver a inventariarlo desde el navegador.
>
> 🛑 **NO BORRAR `Cloude`.** Su `main` tiene 1 commit y un README de relleno, pero eso es solo `main`:
> todo el trabajo vive en ramas y en 2 pull requests **en borrador**. Borrar el repo se lleva NIVELA
> entero. La entrada del 19/08 en `CONTEXTO-SESIONES.md` lo daba por muerto justamente por mirar solo
> `main`; ver la corrección del 20/08.

## Qué es NIVELA

Un vertical de **obra / construcción**: PWA en Next.js 15 + React 19 + TypeScript sobre Supabase, con
modelo de dominio en español (obra, partida, contrata, albarán, parte de trabajo, fichaje), módulo de
fichaje del Portal del Empleado y panel CAE. Incluye investigación de mercado (Holded, Dalux, Global 2)
y un documento de traspaso sobre construir el vertical Obra dentro de `ialimp`.

## Los 2 pull requests (ambos en borrador, verificados el 20/08/2026)

Los dos salen de la **misma rama base**, `claude/aqui-que-hay-8ePxd` — que **no es `main`**. Mergearlos
en su repo no los llevaría a ninguna rama publicada.

| | PR #1 | PR #2 |
|---|---|---|
| Título | Arranca el proyecto NIVELA (Next.js PWA + Supabase) | NIVELA: paquete completo para implementar en iarest + set de marca |
| Rama | `claude/balance-development-info-aGl64` | `claude/iarest-project-info-EzK7H` |
| Commits | 11 | 12 |
| Archivos | 34 | 52 |
| Diff | +4.468 / −9 | +5.350 / −9 |

**PR #2 es superconjunto de PR #1**: mismo scaffold, más `brand/` y un doc extra. No son dos piezas
independientes — el #2 es la evolución del #1. Para traerse NIVELA basta con el #2.

### Contenido (primer nivel)

Común a los dos: `docs/` (3 md: estudio de mercado, investigación Holded, nivela-master-obra-en-ialimp),
`public/sw.js`, `src/` (`app`, `components`, `lib`, `middleware.ts`), `supabase/migrations/`
(`0001_fichaje.sql`, `0002_cae.sql`) y en raíz `.env.example`, `.gitignore`, `CLAUDE.md`,
`next.config.mjs`, `package.json`, `package-lock.json`, `postcss.config.mjs`, `README.md`,
`tailwind.config.ts`, `tsconfig.json`. Dentro de `src/app`: rutas `cae/`, `fichar/`, `login/` + layout,
manifest, `globals.css`, `icon.svg`.

Solo en el PR #2: `brand/` (`png/`, `_generate.py`, `icono-app.svg`, `isotipo.svg`,
`logotipo-horizontal-claro.svg`, `logotipo-horizontal-oscuro.svg`, `logotipo-vertical.svg`,
`wordmark.svg`, `wordmark-verde.svg`, `README.md`) y `docs/nivela-implementar-en-iarest.md`.

## Si se trae al monorepo (decisión pendiente de Alberto)

- Entraría como `apps/nivela`, con las reglas de la matriz: `package.json` + `vercel.json` con
  **`ignoreCommand`** obligatorio (`node ../../scripts/vercel-ignore-build.mjs apps/nivela`) y proyecto
  Vercel con Root Directory `apps/nivela`. Ver `CLAUDE.md` → «Reglas de la matriz».
- `package-lock.json` sobra: el monorepo es **pnpm**, y las deps de una app nueva van al workspace.
- De `brand/`, versionar **solo los SVG**: los PNG los genera `_generate.py` desde ellos. Y la marca
  propiamente dicha debería acabar como un `src/marcas/<cliente>.ts` de `@central/brand`, no como una
  carpeta suelta de imágenes — ver la skill `marca-cliente`.
- ⚠️ Antes de importar nada, pasarle **gitleaks**: es exactamente el paso que tumbó el PR de
  `house-sevillana-landing` (12 hallazgos en 64 commits) y por el que aquella landing se trajo sin su
  historia git. No repetir el error de importar primero y auditar después.
- El doc `nivela-master-obra-en-ialimp.md` propone construir Obra **dentro de `ialimp`**; el
  `nivela-implementar-en-iarest.md` propone `iarest`. Son dos destinos distintos y ninguno es
  «vertical propia»: esa contradicción hay que resolverla ANTES de mover código.
