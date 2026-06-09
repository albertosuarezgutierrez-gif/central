# CLAUDE.md — Matriz (casa de marcas)

> **Esta es la MATRIZ del monorepo, no una vertical.** No contiene lógica de producto.
> Lee **`MATRIZ.md`** para la estructura (raíz = matriz, `packages/*` = módulos compartidos,
> `apps/*` = verticales) y `docs/CONTEXTO-SESIONES.md` para el estado vivo del proyecto.

## Verticales (cada una con su propio CLAUDE.md/AGENTS.md y proyecto Vercel)
- **`apps/ia-rest`** — Voice POS / hostelería (`iarest.es`). Consume `packages/core-ai` y
  `packages/core-fiscal` vía `file:` deps. Ver `apps/ia-rest/CLAUDE.md`.
- **`apps/sivra`** — intranet de pisos turísticos. Ver `apps/sivra/CLAUDE.md`.
- **`apps/ialimp`** — SaaS de limpiezas (`app.ialimp.es`). Ver `apps/ialimp/CLAUDE.md`.
- **`apps/plataforma`** — cuadro de mando consolidado (HITO 2). Jerarquía `Cuenta → Sociedad → Negocio`.
  BD compartida con sivra+ialimp. Ver `apps/plataforma/CLAUDE.md`.

## Módulos compartidos (`packages/*`, fuente TS pura, portables)
- `@iarest/core-ai`, `@iarest/core-fiscal`, `@iarest/core-push`, `@iarest/core-storage`, `@iarest/core-email`, `@iarest/core-identity`.
  - `core-push` (Web Push, envoltura pura sobre `web-push`) es el **primer núcleo con
    dependencia npm propia** — funciona porque pnpm symlinkea las deps de cada paquete
    (el enfoque `file:` deps no las resolvía en Vercel). Lo consumen `ia-rest` e `ialimp`.

## Memoria entre sesiones (entorno efímero)
El contenedor cloud se borra al acabar la sesión: lo único que persiste es lo commiteado.
Al terminar, actualiza `docs/CONTEXTO-SESIONES.md` (entrada nueva arriba). El hook `Stop`
(`.claude/hooks/persist-memoria.sh`) lo commitea y empuja.

## Reglas de la matriz
- Toda **vertical nueva** entra como `apps/<app>` con su `package.json`/`vercel.json` y un
  proyecto Vercel con **Root Directory `apps/<app>`** + install `npm install --legacy-peer-deps`.
- **NUNCA** poner `apps/` en el `.vercelignore` de la raíz (se aplica a todos los proyectos del
  repo y borraría la carpeta del build por-app → el proyecto caería a construir la raíz).
- Los módulos compartidos viven en `packages/*` (portables, sin acoplarse a una vertical); las
  apps los consumen con `file:` deps (build aislado por Root Directory, sin pnpm/turbo).
