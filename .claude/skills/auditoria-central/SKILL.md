---
name: auditoria-central
description: Auditoría CON CONTEXTO del monorepo `central` (casa de marcas). Úsala tras renames de scope, migraciones de BD, reestructuras de packages/apps, o antes de un corte de infraestructura — cuando Alberto pregunte "¿se ha roto algo?", "haz una auditoría", "revisa que todo está bien" o pida pruebas/testeo del proyecto. NO es un checklist genérico: aprovecha la matriz de consumo, la BD compartida multi-tenant y la infra real (Supabase/Vercel por MCP).
---

# Auditoría con contexto — monorepo `central`

Casa de marcas: raíz = matriz (sin producto), `packages/*` = 38 núcleos TS puros
(`main: ./src/index.ts`, **sin build** → cada consumidor DEBE listarlos en
`transpilePackages`), `apps/*` = 8 verticales Next.js (ia-rest, ialimp, sivra, plataforma,
rrhh, transporte, alquiler, almacen) que buildan **aisladas por Root Directory** en Vercel.
BD Supabase **compartida** (`wswbehlcuxqxyinousql`): ialimp/sivra/plataforma/rrhh/transporte/
alquiler/almacen en schema `public` (scope `empresa_id`/tenant). ia-rest vive en su propio
proyecto Supabase **standalone** `efncqyvhniaxsirhdxaa`, schema `public` (aislado por ser el
único tenant de ese proyecto) — la migración a un schema `iarest` dentro del compartido está
DISEÑADA pero pendiente de ejecutar (ver skill `ia-rest-maestro`, "Split-brain de BD"); no
asumas que ya vive ahí. Lee `MATRIZ.md` y `docs/CONTEXTO-SESIONES.md` (entradas de arriba)
antes de empezar.

## Cuándo usar
Tras renames de scope (`@iarest/*`→`@central/*`), migraciones de BD, mover/crear
`packages/*` o `apps/*`, cambios en deps `workspace:*`/`transpilePackages`, o antes de
cortar envs/infra. También cuando se pidan "pruebas y testeo" del estado del proyecto.

## Salida
Un informe `docs/AUDITORIA-<YYYY-MM>.md` con hallazgos por severidad (🔴/🟡/🟢), cada
uno con `ruta:línea` y acción, **más** un checklist de acciones manuales de Alberto
(Supabase/Vercel) con su orden seguro y rollback. Usa `docs/AUDITORIA-2026-06.md` de
plantilla. Arregla en el acto solo bugs de bajo riesgo; lo de gran radio se consulta.

## Checklist (crear un TodoWrite por bloque)

### 1. Integridad estructural
- `pnpm install --frozen-lockfile` → lockfile en sync.
- `node scripts/auditar-estructura.mjs --check` → radiografía al día.
- Guardián: `pnpm test:guardia` (falla si reaparece `@iarest/`). Grep manual de scopes viejos.
- **`transpilePackages` vs deps**: cada `@central/*` declarado debe estar en `transpilePackages`
  de su app (exportan TS crudo). Cada import `@central/*` debe estar declarado en deps.

### 2. Compila y typechequea TODO (no solo ia-rest)
- Las apps con Prisma (**ialimp, sivra, plataforma, rrhh, transporte, alquiler, almacen** — las
  7; ia-rest es la única sin Prisma) necesitan `prisma generate --schema=apps/<app>/prisma/schema.prisma`
  ANTES de typechequear (si no, miles de falsos `Property 'sql' does not exist on typeof Prisma`, o
  falsos `Property 'X' does not exist on type 'PrismaClient<...>'` si el client regenerado es el de
  OTRA app). Los 7 schemas escriben al MISMO `@prisma/client` → genera el de cada app justo antes de
  chequearla, en el mismo orden en que se van a typechequear.
- `tsc --noEmit -p apps/<app>/tsconfig.json` en las **8** apps. **OJO**: ialimp, plataforma, rrhh,
  transporte, alquiler y almacen llevan `typescript.ignoreBuildErrors: true` → el build verde NO
  garantiza tipos sanos; el typecheck sí. El CI (`tests.yml`) typechequea las apps con Prisma.
- **GOTCHA del CI (rompió `tests.yml` en main):** `prisma generate` y `tsc` deben correr **desde el dir de
  cada app** (`working-directory: apps/<app>` + `pnpm exec prisma generate` / `tsc -p tsconfig.json`), NO desde
  la raíz — `prisma`/`typescript` son deps de cada app, no de la raíz (`pnpm exec` desde la raíz → `Command
  "prisma" not found`). En local invoca el binario por su ruta en `.pnpm` o entra al dir de la app.
- Patrón de bug recurrente: llamar a `aiComplete(prompt, 8000)` (número) en vez de
  `aiComplete(prompt, { maxTokens|timeoutMs: 8000 })` (objeto) → el valor se ignora en runtime.
- **Motor de pricing** (`apps/plataforma/app/api/sivra/pricing/apply/route.ts`): cualquier cambio a la
  fórmula (raíles, eventos, buckets) es alto riesgo silencioso — el 18/07/2026 un cambio de raíl
  introdujo sin querer un doble conteo del premio de evento (autodetectado el mismo día, iba camino de
  2.000€/noche en una fecha de Karol G; PR #985→#987). Antes de mergear un cambio de fórmula, calcula A
  MANO el precio esperado en 2-3 fechas conocidas (una de evento + una normal) y compáralo con el
  resultado real del código — no valides solo leyendo el diff.

### 3. Tests
- `pnpm test` (guardián + packages). Runner = `node --test` (Node 22 strippea tipos); imports de
  `src` con extensión `.ts` EXPLÍCITA. Prioriza por riesgo-si-se-rompe: `core-fiscal` (IVA/VeriFactu)
  > `core-identity` (tenant) > `core-ai` > resto. Mockea red/SDK; tests puros y deterministas.

### 4. Seguridad + multi-tenant (lo más crítico — BD compartida)
- Toda query scoped por `empresa_id`/tenant en la BD compartida `wswbehlcuxqxyinousql`; ia-rest
  (proyecto standalone `efncqyvhniaxsirhdxaa`) aísla por ser el único tenant de ese proyecto —
  ningún cruce entre tenants ni entre proyectos.
- Secretos: ningún `.env` commiteado; sin claves reales hardcodeadas (anon keys de cliente son
  semi-públicas pero anótalas). Crons exigen `Authorization: Bearer CRON_SECRET`.
- **Guardián de secretos** (gate en `pnpm test:guardia`): `test/regression-secrets.test.ts` falla si un
  secreto de auth cae a un literal (`process.env.X_SECRET || 'algo'`) sin guarda de producción. Usa
  `requireSecret()` de `@central/core-identity`. Si añade un falso positivo seguro → a su ALLOWLIST.
- Supabase advisors (read-only): `mcp__Supabase__get_advisors(project, "security")` y `"performance"`.
  Vigila `rls_policy_always_true`, `security_definer_view`, `function_search_path_mutable`.

### 5. Deps y código muerto
- `pnpm audit` (vulnerabilidades). Deps declaradas-sin-usar / usadas-sin-declarar. Packages sin
  consumidores. Drift de esquema: `mcp__Supabase__generate_typescript_types` vs los tipos commiteados.
- **Vulns transitivas** (p.ej. `axios` vía `node-ical`/`msedge-tts`): arréglalas con `pnpm.overrides` en el
  `package.json` RAÍZ (ver la sección `overrides` ya existente), no tocando cada app. Verifica con `pnpm -r
  why <paquete>` que solo queda una versión resuelta y que el override no rompe el build.
- **Antes de "arreglar" una vuln, mira si es explotable:** `xlsx` (sin parche en npm) es high, pero ialimp
  **solo ESCRIBE** xlsx (export), nunca parsea → no explotable; la remediación (tarball CDN de SheetJS) puede
  romper el build de un cliente vivo si la CDN no es alcanzable. Documenta en vez de arriesgar.

### 6. Infra real (MCP, solo lectura)
- Supabase: hay DOS proyectos — el compartido `wswbehlcuxqxyinousql` (sivra/ialimp/plataforma/rrhh/
  transporte/alquiler/almacen) y el standalone de ia-rest `efncqyvhniaxsirhdxaa`. `list_projects`,
  `list_migrations` (¿migraciones del repo aplicadas?), `list_tables` (con datos, no vacío) y
  `list_edge_functions` en AMBOS.
- Vercel: `list_projects` puede no listar las 8 apps si alguna vive en otro team/cuenta fuera del
  alcance del conector — no lo des por "no desplegada" sin más, márcalo para que Alberto lo mire a
  mano en el dashboard. `list_deployments` (último deploy de cada proyecto visible y su resultado).

### 7. Coherencia de docs
- `CLAUDE.md`/`AGENTS.md` por app y `MATRIZ.md` vs realidad. Actualiza `CONTEXTO-SESIONES.md`.

## Reglas
- Distingue **error real** de **ruido de entorno** (Prisma sin generar, falta `@types/node` en el
  typecheck standalone de un package). No infles conteos.
- No "arregles" `ignoreBuildErrors`: es decisión deliberada de las apps; el valor está en que el
  CI/typecheck cace lo que el build ignora.
- Nunca ejecutes el corte de envs ni apliques migraciones en producción: documéntalo como acción
  manual de Alberto con su rollback.
