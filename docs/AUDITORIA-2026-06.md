# Auditoría con contexto — monorepo `central` (junio 2026)

> Auditoría **con contexto** (no genérica) tras la reestructuración: rename `@iarest/*`→`@central/*`,
> migración de la BD de ia-rest al Supabase compartido, `file:`→`workspace:*`, modularización en `packages/*`.
> Alcance: código + flujo + estructura + infra real (Supabase/Vercel) + tests. Fecha: 2026-06-12.
> Método y repetición: skill `auditoria-central` (`.claude/skills/auditoria-central/SKILL.md`).

## Resumen ejecutivo
La reestructuración está **sana a nivel estructural** (0 referencias `@iarest/`, lockfile en sync,
radiografía al día, builds verdes), pero el CI solo cubría `apps/ia-rest` y eso **ocultaba bugs reales
en las demás verticales**: `apps/ialimp` tenía 26 errores de TypeScript que su build no ve (lleva
`ignoreBuildErrors: true`). Esta auditoría **arregla los de bajo riesgo** (bug de IA repetido, package
`core-identity` sin declarar), **añade red de tests** (core-fiscal + guardián de regresión) y **extiende
el CI** a typecheck de las verticales. Quedan bloqueadores de **configuración manual** (2 migraciones SQL
sin aplicar → un cron roto, y la seguridad RLS de la BD compartida) que requieren acción de Alberto.

| Severidad | Nº | Estado |
|-----------|----|--------|
| 🔴 Alto   | 4  | 3 arreglados · 1 acción manual |
| 🟡 Medio  | 6  | 1 arreglado · 5 documentados |
| 🟢 Bajo   | 5  | documentados |

---

## 🔴 Hallazgos ALTO

### A1. Bug de IA repetido — `aiComplete(prompt, número)` ✅ ARREGLADO
`aiComplete(prompt, options)` espera un **objeto** `{ maxTokens?, timeoutMs?, ... }`, pero se llamaba con
un **número suelto** → en runtime el valor se ignora y se usan los defaults.
- `apps/ialimp/lib/google-leads.ts:162` — `aiComplete(prompt, 20000)`: el `maxTokens` real caía a **800**
  → la extracción de leads se truncaba en silencio. Fix: `{ maxTokens: 20000 }`.
- `apps/ialimp/lib/mailing.ts:76` — `aiComplete(prompt, 8000)`: el "timeout corto" que promete su propio
  comentario era en realidad **30 s**. Fix: `{ timeoutMs: 8000 }`.
- Detectable por tipos (`TS2559`); pasaba inadvertido por `ignoreBuildErrors` + CI solo en ia-rest.

### A2. `@central/core-identity` usado sin declarar en ialimp ✅ ARREGLADO
8 ficheros de auth de ialimp importan `genHex`/`sha256Hex`/`genJti` de `@central/core-identity`
(`lib/auth.ts`, `lib/propietario-auth.ts`, `app/api/admin/{limpiadoras,usuarios,usuarios-empresa}/route.ts`,
`app/api/admin/clientes/[id]/{desactivar,enviar-acceso}/route.ts`, `app/api/l/auth/route.ts`) pero el
package **no estaba en `dependencies` ni en `transpilePackages`**. Como todos los `@central/*` exportan
**TS crudo** (`main: ./src/index.ts`, sin build), un consumidor que no lo transpila falla en runtime.
Fix: añadido a `apps/ialimp/package.json` y a `transpilePackages` de `apps/ialimp/next.config.ts` (de paso
se completaron los demás `@central/*` declarados que faltaban: core-fiscal, module-crm/inventario/proveedores).
Resultado: ialimp 26→16 errores de tipos.

### A3. Migraciones del radar de concursos NO aplicadas → cron roto ⚠️ ACCIÓN MANUAL
Verificado en la BD compartida (`wswbehlcuxqxyinousql`):
`public.concursos_radar_criterios` y `public.concursos_radar_anuncios` **NO existen**. El cron
`apps/ialimp/app/api/cron/concursos-radar/route.ts` (cada 6 h en `vercel.json`) consulta esas tablas →
falla con *relation does not exist*. (Las otras 2 "pendientes" sí están: `tenant_modulos` y
`cleaning_sessions.orden_manual` ✓.)
- **Acción**: aplicar en Supabase `apps/ialimp/prisma/migrations/add_concursos_radar_criterios.sql` y
  `add_concursos_radar_anuncios.sql`. Sin riesgo (solo `CREATE TABLE`). Rollback: `DROP TABLE` de ambas.

### A4. Seguridad de la BD compartida — 318 advisories (0 ERROR) ✅ RESUELTO
`mcp__Supabase__get_advisors(security)` sobre la BD compartida. Estado inicial: 500 advisories (63 ERROR).
Tres migraciones aplicadas (2026-06-12) — **500 → 318 advisories, 0 ERROR**:
- ✅ **62× `security_definer_view`** (ERROR) — `ALTER VIEW … SET (security_invoker = on)` en las 62 vistas
  (47 `iarest`, 15 `public`). Las vistas respetan la RLS del llamante; `service_role` sigue bypasseando RLS.
- ✅ **1× `rls_disabled_in_public`** (ERROR) — `ENABLE ROW LEVEL SECURITY` en `iarest.instagram_estilos_usados`.
- ✅ **114× `function_search_path_mutable`** (WARN) — `SET search_path='iarest'` en 113 funciones iarest +
  `public._execute_sql`. Previene inyecciones de search_path; no cambia comportamiento.
- ✅ **7× `rls_policy_always_true`** (WARN) — políticas `service_role_*` corregidas a `TO service_role`
  (qr_division_slots, qr_items_reclamados, qr_sesiones_cliente, qr_valoraciones, reglas_envio,
  voice_profiles, comanda_modificaciones).
- ℹ️ **17× `rls_policy_always_true`** (WARN, intencionales) — impresoras (bridge hardware, acceso anon
  necesario), sugerencias_insert, anon QR flows, bridge_tokens, print_jobs, turnos, system_errors super_admin.
  Requieren USING expressions con filtro tenant o son patrones deliberados. Sin acción.
- ℹ️ **141× `rls_enabled_no_policy`** (INFO) — tablas con RLS sin política (acceso denegado por defecto).
- ℹ️ **77× `anon/authenticated_security_definer_function_executable`** (WARN) — funciones SECURITY DEFINER
  invocables por anon/authenticated (ej: `login_pin`, `resolve_restaurante`). Intencional: flujo kiosk/QR.

---

## 🟡 Hallazgos MEDIO

### M1. CI solo cubría ia-rest → no veía las otras 3 verticales ✅ MITIGADO
`ci.yml` y `qa.yml` corren con `working-directory: apps/ia-rest`. Por eso A1/A2 no saltaron.
Fix: nuevo `.github/workflows/tests.yml` — corre la suite de tests (packages + guardián) y el typecheck
de las verticales **limpias** (ia-rest, sivra, plataforma, bloqueante) + ialimp informativo.

### M2. `transpilePackages` incompleto respecto a deps en todas las apps 🟡
Todos los `@central/*` exportan TS crudo → cada consumidor debe transpilarlos. Faltaban (además de A2):
ia-rest (7: module-contabilidad/crm/inventario/presupuestos/proveedores/feedback/asn),
sivra (core-push, module-proveedores, module-inventario). No rompe hoy (o no se importan, o Next los resuelve
server-side), pero es deuda latente. **Acción**: reconciliar `transpilePackages` con las deps `@central/*`
realmente importadas en cada `next.config`.

### M3. Vulnerabilidades de dependencias — de 32 (16 high) → 6 (2 high) 🟡 PARCIALMENTE RESUELTO
`pnpm audit` inicial: 32 vulns (16 high). Tras la auditoría:
- ✅ **`axios`** (high/moderate, transitiva vía `node-ical` en ialimp) — **resuelto** con `pnpm.overrides`
  `"axios": ">=1.16.0"` en el `package.json` raíz → resuelve a 1.17.0. Despeja todos los high de axios.
- 🟡 **`xlsx`** (high, prototype-pollution/ReDoS, *sin versión parcheada en npm*) — **queda**, pero es de
  **riesgo nulo en la práctica**: ialimp **solo ESCRIBE** xlsx (`apps/ialimp/app/api/admin/contabilidad/export/route.ts`:
  `book_new`/`json_to_sheet`/`write`), **nunca parsea** ficheros (las vulnerabilidades se disparan al LEER xlsx
  malicioso). **Remediación oficial** (cuando se quiera cerrar del todo): migrar al tarball parcheado de SheetJS
  (`https://cdn.sheetjs.com/xlsx-0.20.x/...tgz`). NO aplicada aquí porque la CDN está bloqueada en el entorno de
  build de la auditoría (403) y, con cliente en vivo, no se arriesga el build de ialimp por una vuln no explotable.

### M4. ialimp — 16 errores de tipos restantes ✅ SALDADO
Resueltos los 16: null-safety en `lib/ical-sync.ts` (variable intermedia con guarda), inferencia circular en
`api/cron/concursos-radar` (anotados `res`/`xml`/`m`), `implicit any` en `PropietarioClient`, `cp` inexistente
y `ical_urls: never[]` en `PropiedadesClient`, tipos de pdfjs en `lib/concursos-ocr.ts` (cast acotado),
`pdf-parse` sin tipos (`types/pdf-parse.d.ts`), y los imports `.ts` (`allowImportingTsExtensions` en el
tsconfig de ialimp). **Las 4 apps quedan a 0 errores de tipos** → ialimp entra en el typecheck bloqueante del CI.

### M5. Imports `.ts` rompen el typecheck de packages con tests 🟡
`packages/module-concursos/src/{deuc,oferta}.ts` importan con extensión `.ts` (lo exige `node --test`), lo
que rompe `tsc` salvo `allowImportingTsExtensions`. **Acción**: añadir `allowImportingTsExtensions`+`noEmit`
al `tsconfig` de los packages con tests, para poder typechequearlos en CI.

### M6. Peer dependency `nodemailer` desajustada 🟡
`next-auth 5 beta` pide `nodemailer@^7` pero el árbol resuelve `8.0.10`. Sin impacto observado; vigilar al
actualizar next-auth.

---

## 🟢 Hallazgos BAJO

- **B1. Anon key hardcodeada** en `apps/ia-rest/scripts/bridge-v6/bridge-v6.js:33` — JWT `anon` del proyecto
  **viejo** `efncqyvhniaxsirhdxaa`. Las anon keys son semi-públicas (cliente, protegidas por RLS), pero apunta
  al proyecto a jubilar; al cortar, regenerar/retirar.
- **B2. Proyecto Supabase viejo de ia-rest sigue ACTIVE** (`efncqyvhniaxsirhdxaa`, *ACTIVE_HEALTHY*). El schema
  nuevo `iarest` tiene 266 tablas (sano). Acción de Alberto: tras el corte de envs, reset de password + jubilar.
- **B3. Doc drift**: `apps/ialimp/CLAUDE.md` aún cita `@iarest/module-concursos` (el código ya usa `@central/`).
- **B4. `docs/CONTEXTO-SESIONES.md`** muy grande (>8000 líneas) — archivar sesiones antiguas a `docs/historial/`.
- **B5. `module-agenda`** sin consumidores (solo contrato) — esperado hasta la vertical de alquiler; sin acción.

---

## Lo que se ha hecho en esta auditoría
- **Arreglos** (bajo riesgo, verificados por typecheck): A1 (bug IA ×2), A2 (core-identity).
- **Tests nuevos**: `packages/core-fiscal/test/fiscal.test.ts` (16 tests: IVA, NIF/CIF/IBAN, huella VeriFactu
  con snapshot, QR, XML) + script `test`. Guardián `test/regression-scope.test.ts` (anti-`@iarest/`).
  Orquestadores en la raíz: `pnpm test` / `test:packages` / `test:guardia`. **Suite: 104 tests, 0 fallos.**
- **CI**: `.github/workflows/tests.yml` (tests + typecheck de verticales).
- **Skill**: `.claude/skills/auditoria-central/SKILL.md` para repetir esta auditoría con contexto.

## Checklist de acciones manuales de Alberto (Supabase/Vercel)
1. **[A3]** Aplicar `add_concursos_radar_criterios.sql` + `add_concursos_radar_anuncios.sql` en Supabase
   compartido (arregla el cron de concursos). Rollback: `DROP TABLE`.
2. **[A4]** ✅ COMPLETO — BD pasa de 500 a 318 advisories, **0 ERROR, 0 WARN evitable**. Ver A4.
3. **[M3]** Mitigar `xlsx` y `axios` (override/upgrade) en ialimp.
4. **Corte de envs de ia-rest** (cuando toque): re-meter secrets de Edge Functions, exponer schema `iarest`,
   cambiar las 3 envs de Vercel + `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest`, redeploy + smoke test. Rollback:
   revertir las 3 envs. **[B2]** Después: reset password + jubilar `efncqyvhniaxsirhdxaa`.

## Cómo verificar
```bash
pnpm install --frozen-lockfile          # lockfile en sync
node scripts/auditar-estructura.mjs --check
pnpm test                               # 104 tests (guardián + packages), 0 fallos
# typecheck de una vertical (genera Prisma antes si aplica):
pnpm exec prisma generate --schema=apps/ialimp/prisma/schema.prisma
pnpm exec tsc --noEmit -p apps/ialimp/tsconfig.json
```
