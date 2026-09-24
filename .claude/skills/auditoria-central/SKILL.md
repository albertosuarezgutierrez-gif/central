---
name: auditoria-central
description: Auditoría CON CONTEXTO del monorepo `central` (casa de marcas). Úsala tras renames de scope, migraciones de BD, reestructuras de packages/apps, o antes de un corte de infraestructura — cuando Alberto pregunte "¿se ha roto algo?", "haz una auditoría", "revisa que todo está bien" o pida pruebas/testeo del proyecto. NO es un checklist genérico: aprovecha la matriz de consumo, la BD compartida multi-tenant y la infra real (Supabase/Vercel por MCP).
---

# Auditoría con contexto — monorepo `central`

Casa de marcas: raíz = matriz (sin producto), `packages/*` = 41 núcleos TS puros
(`main: ./src/index.ts`, **sin build** → cada consumidor DEBE listarlos en
`transpilePackages`), `apps/*` = **12 verticales** Next.js (ia-rest, ialimp, sivra, plataforma,
rrhh, transporte, alquiler, almacen, mariscos, asegura, asegura-portal, housesevillana) que
buildan **aisladas por Root Directory** en Vercel. ⚠️ **Las cifras de este párrafo caducan
solas**: la lista que manda es `ls apps` cruzada con la matriz de `.github/workflows/tests.yml`
(este doc dijo «8» durante dos meses mientras nacían cuatro apps). BD Supabase **compartida**
(`wswbehlcuxqxyinousql`) con CUATRO ámbitos: schema `public` (ialimp/sivra/plataforma/transporte/
alquiler/almacen/mariscos/asegura-portal, scope `empresa_id`/tenant), **`iarest`** (ia-rest:
runtime + Edge Functions + crons desde el cierre 19/08/2026), **`rrhh`** (rol `rrhh_app`,
BYPASSRLS) y **`seguros`** (correduría: roles `prisma_seguros` y `crm_seguros`, ambos BYPASSRLS; desde
el 02/09/2026 es **la fuente viva**: `apps/asegura` lee de aquí por defecto y el CRM de Manuel, ya en la
cuenta de Alberto, ESCRIBE aquí la ingesta de CIMA. El Supabase de Manuel, `uijsgeocgdaxkhvwtjqs`
—conector MCP `Supabase_asegura`, solo lectura— queda como foto congelada al 31/08). `housesevillana` no tiene BD propia (lee disponibilidad por `/api/publico/*` de
plataforma). El proyecto viejo `efncqyvhniaxsirhdxaa` fue BORRADO el 19/08/2026 — ya no existe.
Lee `MATRIZ.md` y `docs/CONTEXTO-SESIONES.md` (entradas de arriba) antes de empezar.

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
- **`ignoreCommand` en los 12 `apps/*/vercel.json`**: cada uno debe llevar
  `"ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/<app>"` (regla 🚨 de
  `CLAUDE.md`), y **`--sin-previews` en todas salvo ialimp** (cliente vivo). Una app sin él
  reconstruye en CADA push del monorepo — incidente 15/07/2026, ~600 US$ de Build CPU en un mes
  (PR #904). App nueva sin la clave = hallazgo 🔴.
- **App fuera de la matriz de `tests.yml`** (`ls apps` ≠ `matrix.app`) = hallazgo 🔴: nadie la
  typechequea. `housesevillana` vivió 15 días así con 5 errores `TS5097` (12→27/08/2026).

### 2. Compila y typechequea TODO (no solo ia-rest)
- Las apps con Prisma (**10**: ialimp, sivra, plataforma, rrhh, transporte, alquiler, almacen,
  mariscos, asegura, asegura-portal; sin Prisma solo ia-rest y housesevillana) necesitan
  `prisma generate` ANTES de typechequear (si no, miles de falsos `Property 'sql' does not exist on
  typeof Prisma`, o falsos `Property 'X' does not exist on type 'PrismaClient<...>'` si el client
  regenerado es el de OTRA app). Los schemas escriben al MISMO `@prisma/client` → genera el de cada
  app justo antes de chequearla, en el mismo orden en que se van a typechequear.
  ⚠️ **`apps/asegura` tiene DOS schemas** (`prisma/schema.prisma` → `seguros.*` de central, y
  `prisma/asegura.prisma` → la cartera de Manuel, `output = ../lib/generated/asegura-client`).
  Generar solo el primero deja el typecheck rojo con `TS2307: Cannot find module
  './generated/asegura-client'` mientras el CI está verde: usa el script de la app
  (`prisma generate && prisma generate --schema prisma/asegura.prisma`).
- `tsc --noEmit -p apps/<app>/tsconfig.json` en las **12** apps (la matriz de `tests.yml`). **OJO**:
  ialimp, plataforma, rrhh, transporte, alquiler y almacen llevan `typescript.ignoreBuildErrors: true`
  → el build verde NO garantiza tipos sanos; el typecheck sí.
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
  > `core-identity` (tenant) > **`module-seguros-pii`** (cifrado de IBAN/DNI + índice ciego: si el
  índice cambia, los clientes siguen legibles pero **dejan de encontrarse sin error**) >
  `module-seguros{,-portal}` > `core-ai` > resto. Mockea red/SDK; tests puros y deterministas.
- **Guardianes de `test/*.test.ts` (`pnpm test:guardia`)**: son cepos de reglas, no tests de
  unidad; si un PR del rango toca el código que vigilan sin tocar el cepo, míralo. Los de la
  correduría: `regression-asegura-aislamiento` (toda consulta a `seguros.*` pasa por `lib/tenant`),
  `regression-portal-aislamiento` (asegura-portal), `regression-asegura-operador-publico` +
  `regression-correduria-puerto` (puerto `/api/operador/*` con Bearer), `regression-asegura-gasto-
  codeoscopic` (0,50€ por cotización, contador persistente), `regression-ficha-asegura`,
  `regression-correduria-menu`. Los de las rutinas: `regression-rutas-rutina`, `regression-rutina-
  tokens`, `regression-rutinas-numeracion`, `regression-automerge-registro`.

### 4. Seguridad + multi-tenant (lo más crítico — BD compartida)
- Toda query scoped por `empresa_id`/tenant en la BD compartida `wswbehlcuxqxyinousql`; ia-rest
  aísla por su schema `iarest` dentro del mismo proyecto (funciones con `search_path` fijado,
  clientes con `db: { schema: 'iarest' }`) — ningún cruce entre tenants ni entre schemas.
- **Los roles con BYPASSRLS convierten el aislamiento en cosa del CÓDIGO** (`rrhh_app`,
  `prisma_seguros`, `central_asegura` sobre el origen de Manuel): ahí el fallo no es «no se ve
  nada» sino «se ve todo sin que falle nada». Correduría: las 86 RLS del CRM de origen se resuelven
  por `auth.uid()` de Supabase Auth y **ya no tienen sujeto** con la auth propia de `apps/asegura`;
  la puerta única es `lib/tenant-ambito.ts` (tres estados: `pendiente`/`sin-asignar`/`ok`, con
  `exigirCorreduriaId()` que LANZA). `asegura-portal` va al revés a propósito: rol
  `prisma_asegura_portal` **sin** BYPASSRLS + secreto de sesión propio. Apps con auth propia
  (cookie + `jose` contra `public.cuentas`): mariscos, asegura, asegura-portal — cada una con su
  `*_SESSION_SECRET` sin fallback a literal.
- **Puertos HTTP entre apps** (`/api/operador/*` de asegura ← plataforma `lib/correduria-puerto.ts`
  con `ASEGURA_OPERADOR_SECRET`; `/api/operador/empresas` de rrhh ← god-panel con
  `RRHH_OPERADOR_SECRET`; `/api/publico/*` de plataforma ← housesevillana, el ÚNICO sin sesión):
  el mismo valor tiene que estar en los DOS proyectos Vercel; un 401 aquí es «no se pudo leer»,
  no «no hay datos» (y el latido `correduria_renovaciones` lo dice en su `detalle`).
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
- Supabase: el proyecto de producción es el compartido `wswbehlcuxqxyinousql` (todas las verticales;
  ia-rest en `iarest`, rrhh en `rrhh`, correduría en `seguros`). El viejo `efncqyvhniaxsirhdxaa` fue
  BORRADO el 19/08/2026: `list_projects` debe devolver SOLO `central` — si aparece cualquier otro
  proyecto, investígalo. `list_migrations` (¿migraciones del repo aplicadas?), `list_tables` y
  `list_edge_functions` en el compartido.
- **El Supabase de Manuel (`uijsgeocgdaxkhvwtjqs`, conector `Supabase_asegura`, solo lectura) ya
  NO es el origen:** desde el 02/09/2026 es una foto congelada; la cartera viva está en `seguros`
  de central. No sale en `list_projects` de central y eso es correcto. Ahí ya no se reconcilia
  nada. Lo que SÍ se vigila en central: que la ingesta de CIMA sigue entrando — eventos
  `cima_pull_*` en `seguros.operational_events` (`occurred_at`, dos crons al día, 05:30 y 11:30
  UTC). Un día sin heartbeat es «CIMA parada» (el adaptador Java vive en el Fly de Manuel y se
  apaga sin error), nunca «no hay ficheros». **Nunca** escribir en el proyecto de Manuel.
- Vercel: `list_projects` puede no listar las 12 apps si alguna vive en otro team/cuenta fuera del
  alcance del conector — no lo des por "no desplegada" sin más, márcalo para que Alberto lo mire a
  mano en el dashboard. `list_deployments` (último deploy de cada proyecto visible y su resultado).
  `mariscos` está pendiente de proyecto Vercel a propósito (ver `apps/mariscos/CLAUDE.md`).

### 7. Coherencia de docs
- `CLAUDE.md`/`AGENTS.md` por app (10 de las 12 lo tienen; `almacen` y `asegura-portal` no — su
  contexto vive en `CLAUDE.md` raíz y en `docs/superpowers/specs/`) y `MATRIZ.md` vs realidad.
  Actualiza `CONTEXTO-SESIONES.md`. En la correduría el dato que más envejece es **de dónde lee el
  código** (origen de Manuel vs `seguros.*`): contrástalo con `apps/asegura/lib/asegura-db.ts`.
- **Los docs que cuentan apps/rutinas envejecen solos**: `docs/AGENTES-MAPA.md`,
  `docs/RUTINAS-PROGRAMADAS.md` §1-2, este SKILL y `.claude/commands/auditoria-diaria.md`
  llevaban «8 apps» (y AGENTES-MAPA «4») con 12 en `apps/`. Cruza toda cifra de apps contra
  `ls apps` y la matriz de `tests.yml`, nunca contra otro doc.

## Reglas
- Distingue **error real** de **ruido de entorno** (Prisma sin generar, falta `@types/node` en el
  typecheck standalone de un package). No infles conteos.
- No "arregles" `ignoreBuildErrors`: es decisión deliberada de las apps; el valor está en que el
  CI/typecheck cace lo que el build ignora.
- Nunca ejecutes el corte de envs ni apliques migraciones en producción: documéntalo como acción
  manual de Alberto con su rollback.
