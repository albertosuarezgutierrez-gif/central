# RUNBOOK — Corte a monorepo "casa de marcas"

> Cómo activar el monorepo (ia.rest = repo central; SIVRA/IALIMP como `apps/`) **sin romper
> despliegues**. Plan completo: `docs/HANDOFF-unificacion-casa-marcas.md` y el plan aprobado.
> Estado: **Paso 1 hecho** (código co-localizado en `apps/`, inerte, CI verde). Lo de abajo es el
> resto, que mezcla pasos de código (Claude, en rama) con pasos de Vercel (**tú**, en el panel).

## Estado actual (rama `claude/adoring-hawking-s1cFi`, PR #88, NO mergeado)
- `apps/sivra/` y `apps/ialimp/` = copia de sus `origin/main`. **Inertes**: excluidos de tsconfig,
  eslint y `.vercelignore` de ia.rest → el proyecto Vercel `ia-rest` y su CI siguen verdes.
- `packages/core-ai`, `packages/core-fiscal` en `main`; `packages/core-identity` en este PR.
- ia.rest sigue en la raíz; despliega como siempre. SIVRA e IALIMP siguen desplegando desde sus repos
  propios. **Nada roto, rollback trivial.**
- **✅ DE-RISK HECHO (08/06):** los **3 apps compilan en verde desde `apps/*`** en aislamiento
  (`npm install --legacy-peer-deps` en su propio dir + su `buildCommand`): IALIMP (`next build` OK con
  sus envs, incl. `JWT_SECRET`), SIVRA (OK) y ia.rest (CI). **Conclusión clave:** con **Root Directory
  por app** cada uno usa su propio `node_modules` y su propia versión de Next → **NO se necesita pnpm
  ni mover ia.rest para el primer corte** (las 3 versiones de Next nunca se cruzan). pnpm/turbo pasan a
  ser una mejora *posterior*, solo cuando un app empiece a consumir `packages/*`.

## OPCIÓN RECOMENDADA — Corte mínimo (PROBADO, sin pnpm, sin mover ia.rest)
Riesgo mínimo: ia.rest no se toca; SIVRA/IALIMP ya están co-localizados; cada Vercel project compila su
carpeta con npm. Pasos:

### A. Código — **ya está** (nada que mover)
Las apps están en `apps/sivra` y `apps/ialimp` con su `package.json`/`vercel.json` propios. No hace
falta pnpm, ni `pnpm-workspace.yaml`, ni mover ia.rest.

> **Pendiente conocido (DECISIÓN: aplazado — Opción 3, 08/06):** el GitHub Action de la landing
> `apps/ialimp/.github/workflows/deploy-landing.yml` **no se ejecuta** ahí (GitHub solo corre los de
> `.github/workflows/` de la raíz) → tras el corte la landing `ialimp.es` **deja de auto-publicarse**.
> NO se arregla ahora a propósito (la landing casi no cambia). Cuando se edite la landing, elegir:
> (1) conectar el proyecto Vercel `ialimp-landing` al repo `ia.rest` con Root Directory
> `apps/ialimp/landing/ialimp-es` + Build `bash fetch-fonts.sh` y **borrar** el workflow (recomendado,
> sin secreto); o (2) mover el workflow a la raíz con `paths: apps/ialimp/landing/ialimp-es/**` y añadir
> el secreto `VERCEL_TOKEN` al repo `ia.rest`. Mientras tanto, despliegue manual: `bash fetch-fonts.sh`
> + `npx vercel deploy --prod` desde esa carpeta.

### B. Vercel (TÚ, en el panel). Aplicar y luego mergear.
Equipo `team_f4gPpt6dPuNcd5YyMt3q27uf`. Por **cada** proyecto: Settings → Build & Deployment →
**Root Directory**; Settings → Git → **Connected Repository**.

| Proyecto Vercel | Repo conectado | Root Directory | Install Command |
|---|---|---|---|
| `ia-rest` (prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo) | ia.rest (**no tocar**) | — (raíz, igual) | (igual) |
| `sivra` (su proyecto actual) | **cambiar** sivra → **ia.rest** | `apps/sivra` | `npm install --legacy-peer-deps` |
| `ialimp` (proyecto `ialimp`) | **cambiar** ialimp → **ia.rest** | `apps/ialimp` | `npm install --legacy-peer-deps` |
| `ialimp-landing` (prj_41U7iFmAbFStPBqfms1cuDpJB8y4) | **cambiar** ialimp → **ia.rest** | `apps/ialimp/landing/ialimp-es` | (estático, sin build) |

> En el corte mínimo, ia.rest **se queda en la raíz y NO se toca** → cero riesgo para iarest.
> El Install Command es el `npm install --legacy-peer-deps` que ya usan (NO pnpm).

> **⚠️ GOTCHA REAL (08/06, primer intento de SIVRA falló — `prisma: command not found`, exit 127):**
> dos ficheros de la **raíz** del repo se colaban en el build de cada app y hacían que Vercel
> construyera **la raíz (ia.rest)** en vez de `apps/<app>` (instalaba las deps de la raíz, detectaba
> Next 16.2.6 en vez de la versión de la app, y `apps/<app>` ni se construía):
> 1. **`turbo.json` en la raíz** → Vercel detecta "Turborepo" ("Detected Turbo. Adjusting default
>    settings…") y pasa a modo monorepo-desde-raíz, ignorando el Root Directory. **No lo usa nadie**
>    (no hay `turbo` en ninguna `package.json` ni en el lock) → **se ELIMINÓ**.
> 2. **`.vercelignore` de la raíz con `apps/`** → en ese modo borra `apps/<app>` antes de construir.
>    Se mantiene (lo necesita el proyecto `ia-rest`); al quitar `turbo.json`, Vercel respeta el Root
>    Directory por app y ya no lo aplica para borrar la propia carpeta del build.
> Además, `prisma` estaba en **devDependencies** de SIVRA → se movió a **dependencies** (como ya lo
> tiene IALIMP) para que el binario `prisma` esté siempre disponible en el build. **Verificar SIEMPRE
> con el preview real del proyecto Vercel de la app (no con build aislado), porque la config de la
> raíz del repo —`.vercelignore`, `turbo.json`, workspaces— se hereda en los builds por-app.**

## OPCIÓN POSTERIOR (opcional) — pnpm + ia.rest→`apps/ia-rest`
Solo cuando se quiera (a) compartir `packages/*` dentro de las apps o (b) la simetría total
"todas en `apps/`". Entonces sí: `pnpm-workspace.yaml`, mover ia.rest a `apps/ia-rest`, `workspace:*`
+ `transpilePackages`, CI a pnpm/turbo, y en Vercel cambiar `ia-rest` a Root Directory `apps/ia-rest`
+ Install `pnpm install`. Se hace app por app (ia.rest primero, IALIMP el último). No es necesario
para tener el monorepo funcionando.

- **Build Command:** dejar el de cada `vercel.json` (ia.rest `next build`; sivra `prisma generate &&
  next build`; ialimp `node scripts/fetch-fonts.mjs && prisma generate && next build`). Vercel con Root
  Directory ejecuta el `vercel.json` de esa carpeta.
- **Env vars:** NO se tocan; cada proyecto conserva las suyas (incluida `DATABASE_URL` de IALIMP/SIVRA).
- Proyectos `ia-rest-docs` (prj_eKC4r06S5svI3mwJJUbZmLVnbiQE) y `repo`: confirmar qué construyen; si son
  catch-all del repo, dejarlos o apuntarlos a una carpeta concreta (no bloquean el corte).
- **⚠️ IALIMP es prod**: no tocar BD/RLS/buckets ni env; solo Root Directory + install + repo.

### C. Verificar y mergear
1. Con B aplicado, **disparar un redeploy de la rama** en cada proyecto y comprobar **preview en
   verde** (los 4): `ia-rest`, `sivra`, `ialimp`, `ialimp-landing`.
2. Solo si los 4 previews están verdes → **mergear PR #88 a `main`**.
3. Humo en producción: `iarest.es`, dominio de SIVRA, `app.ialimp.es`, `ialimp.es` + crons.

### D. Limpieza (tras unos días estables)
- Archivar y luego **borrar** los repos `sivra` e `ialimp` (GitHub).
- Quitar `apps/` del `.vercelignore` y de los `exclude` de tsconfig/eslint de ia.rest si ya no aplica
  (al estar ia.rest en `apps/ia-rest`, su tsconfig es el suyo propio).

## Rollback
Mientras NO se haya mergeado y NO se hayan borrado los repos viejos: revertir los cambios de Vercel
(Root Directory / repo conectado a su estado anterior) restaura los despliegues actuales al instante.

## Adopción de módulos (Fase 3, después del corte)
Ya en el monorepo, app por app (IALIMP el último), reemplazar duplicados por `core-*`, cada cambio
verificado por el preview de esa app. Detalle en el plan.
