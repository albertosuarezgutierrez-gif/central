# RUNBOOK — Corte a monorepo "casa de marcas"

> Cómo activar el monorepo (ia.rest = repo central; SIVRA/IALIMP como `apps/`) **sin romper
> despliegues**. Plan completo: `docs/HANDOFF-unificacion-casa-marcas.md` y el plan aprobado.
> Estado: **Paso 1 hecho** (código co-localizado en `apps/`, inerte, CI verde). Lo de abajo es el
> resto, que mezcla pasos de código (Claude, en rama) con pasos de Vercel (**tú**, en el panel).

## Estado actual (rama `claude/adoring-hawking-s1cFi`, PR #88, NO mergeado)
- `apps/sivra/` y `apps/ialimp/` = copia de sus `origin/main`. **Inertes**: excluidos de tsconfig,
  eslint y `.vercelignore` de ia.rest → el proyecto Vercel `ia-rest` y su CI siguen verdes.
- `packages/core-ai`, `packages/core-fiscal` ya en `main`.
- ia.rest sigue en la raíz; despliega como siempre. SIVRA e IALIMP siguen desplegando desde sus repos
  propios. **Nada roto, rollback trivial.**

## Secuencia de corte (orden estricto)

### A. Código (Claude, en rama PR #88) — pasos restantes de Fase 1
1. `pnpm-workspace.yaml` (`apps/*`, `packages/*`) + `pnpm-lock.yaml` (borrar `package-lock.json`).
2. Mover ia.rest raíz → `apps/ia-rest/` (git mv de `src/`, `public/`, `supabase/`, `scripts/`,
   `next.config.*`, `tsconfig.json`, `vercel.json`, `eslint.config.mjs`, `postcss`, `package.json` de
   app, `next-env.d.ts`). Quedan en la raíz: `packages/`, `.github/`, `CLAUDE.md`/`AGENTS.md`, `docs/`,
   `.claude/`, `turbo.json`, `pnpm-workspace.yaml`, `package.json` raíz (workspace root).
3. `packages/base` (raíz/plantilla: `tsconfig.base.json`, eslint base, patrón de registro de módulos)
   y, opcional, `packages/core-identity` (contrato `Session`/`getTenantId()`).
4. Cada `apps/<app>` declara `@<scope>/core-*` como `workspace:*` + `transpilePackages`.
5. CI (`.github/workflows/{ci,qa}.yml`) → pnpm + `turbo run ... -F ia-rest` (y luego por app). Mover
   `apps/ialimp/.github/workflows/deploy-landing.yml` a la raíz con `paths: apps/ialimp/landing/...`.
   > Tras esto el **CI de la rama se pondrá ROJO** hasta que apliques B (es esperado).

### B. Vercel (TÚ, en el panel — no se puede por git). Aplicar ANTES de mergear.
Equipo `team_f4gPpt6dPuNcd5YyMt3q27uf`. Para **cada** proyecto: Settings → Build & Development →
**Root Directory** y **Install Command**; Settings → Git → **Connected Repository**.

| Proyecto Vercel | Repo conectado | Root Directory | Install Command |
|---|---|---|---|
| `ia-rest` (prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo) | ia.rest (igual) | `apps/ia-rest` | `pnpm install` |
| `sivra` (su proyecto actual) | **cambiar** sivra → **ia.rest** | `apps/sivra` | `pnpm install` |
| `ialimp` (proyecto `ialimp`) | **cambiar** ialimp → **ia.rest** | `apps/ialimp` | `pnpm install` |
| `ialimp-landing` (prj_41U7iFmAbFStPBqfms1cuDpJB8y4) | **cambiar** ialimp → **ia.rest** | `apps/ialimp/landing/ialimp-es` | (estático, sin build) |

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
