# Auditoría con contexto — monorepo `central` (junio 2026)

---

## Auditoría LIGERA — 21/06/2026

**Rango:** desde AUDITORIA-2026-06-18.md (18/06) hasta HEAD (`0c2244a`). 63 commits.
**Modo:** ligero (sin typecheck ni tests pesados).
**Estado final:** ✅ Verde en estructura. 1 bug de skill arreglado en el acto.

| Bloque | Estado |
|---|---|
| Lockfile sync | ✅ OK (`pnpm-lock.yaml` + `package-lock.json` por app) |
| Radiografía de estructura | ✅ Al día (generada 2026-06-20) |
| Guardián de scope (`@iarest/`) | ✅ 0 referencias |
| `transpilePackages` vs deps (ialimp) | 🟡 `module-concursos` era dep muerta → **eliminado** |
| Skills-maestro vs código | 🔴 `ialimp-maestro` describía Concursos como si viviera en ialimp → **corregido** |
| `plataforma-maestro` vs código | 🟡 No mencionaba Concursos (movido el 19/06) → **añadido** |
| `MATRIZ.md` vs apps reales | 🟡 Faltaban `plataforma` y `rrhh` en la tabla de verticales → **añadidos** |

### 🔴 A1. `ialimp-maestro` — Concursos en ialimp (ARREGLADO)
La skill seguía describiendo el módulo de Concursos como funcionalidad propia de ialimp, incluyendo rutas API y crons que fueron eliminados en PR #403 (19/06). Una sesión que siguiera esa skill estaría buscando código que ya no existe en ialimp.
- **Arreglado:** skill actualizada — sección Concursos reemplazada por nota de MOVIDO + referencia a `plataforma-maestro`.

### 🟡 B1. `plataforma-maestro` — Concursos no documentado (ARREGLADO)
La skill no mencionaba el módulo de Concursos que recibió de ialimp (PR #403), ni el pendiente de SMTP.
- **Arreglado:** añadida entrada en "Dónde vive cada cosa" con scope, módulo, crons y acción manual SMTP pendiente.

### 🟡 B2. `ialimp` — dep muerta `@central/module-concursos` (ARREGLADO)
Tras el puerto de Concursos a plataforma (PR #403), ialimp mantenía `@central/module-concursos` en `package.json` y `transpilePackages` sin ningún import en su código.
- **Arreglado:** eliminado de `apps/ialimp/package.json` y `apps/ialimp/next.config.ts`.

### 🟡 B3. `MATRIZ.md` — faltaban `plataforma` y `rrhh` (ARREGLADO)
La tabla de verticales de MATRIZ.md solo listaba ia-rest, sivra e ialimp. Tanto `apps/plataforma` como `apps/rrhh` existen desde hace semanas con sus proyectos Vercel propios.
- **Arreglado:** añadidas ambas verticales al árbol y a la tabla.

### 🟢 Info — Pendiente manual de Alberto (no urgente)
- `SMTP_*`/`RESEND_API_KEY` en el proyecto Vercel **plataforma**: necesario para que los crons de avisos y recordatorio de cierre de Concursos envíen emails (documentado en `plataforma-maestro` y `apps/plataforma/CLAUDE.md`).

---

## Auditoría LIGERA — 23/06/2026

**Rango:** desde AUDITORIA-2026-06-21.md (21/06) hasta HEAD (`5a1fdef`). 57 commits en el rango.
**Modo:** ligero (sin typecheck ni tests pesados).
**Estado final:** ✅ Estructura OK. 3 crons en zona de vigilancia (se autocuran). 1 corrección documental.

| Bloque | Estado |
|---|---|
| Radiografía de estructura | ✅ Al día |
| Skills index vs `.claude/skills/` | ✅ Coincidencia exacta |
| Heartbeat crons (9 vigilados) | 🟡 6 ✅ + 3 ⛔ MUDO (ver abajo) |
| Project ID `ialimp` en docs | 🟡 Era incorrecto → corregido en este informe |

### 🟡 Heartbeat crons — 3 mudos (autocura hoy)

Los 9 crons del heartbeat del paso 2-bis:

| Cron | Tabla | Última escritura | Estado | Diagnóstico |
|---|---|---|---|---|
| `psd2-sync` | `movimientos_bancarios` | 22/06 06:01 (20h) | ✅ | |
| `pricing/apply-auto` | `pricing_applied` | 22/06 15:48 (10h) | ✅ | |
| `rates/snapshot` | `rate_snapshots` | 22/06 16:09 (9.9h) | ✅ | |
| `limpiadoras/auto-sessions` | `cleaning_sessions` | 22/06 18:50 (7.2h) | ✅ | |
| `mercado/cron` | `market_rates` | 22/06 22:24 (3.7h) | ✅ | |
| `concursos-ingesta` | `concursos_licitaciones` | 23/06 00:31 (1.5h) | ✅ | |
| `pricing/guard` | `pricing_alerts` | 16/06 07:30 (162h) | ⛔ MUDO | Métrica condicional: solo escribe cuando detecta reversiones de precio o piso en suelo. Sin incidencias → sin filas. Logs de Vercel confirman 307 el 22/06 a las 07:30 (antes del fix), pero el cron del 23/06 (07:30 UTC) probablemente ya corría con el fix. Verificación pendiente. |
| `updates/sync` | `incomes` | 16/06 09:21 (160h) | ⛔ MUDO | Silencio esperado según CONTEXTO-SESIONES: "solo mueve `createdAt` si entra una reserva nueva". Cron fue disparado manualmente el 22/06 tras el fix (#429) y no encontró reservas nuevas en Smoobu. Autocura en el próximo run. |
| `pricing/pilot-track` | `pricing_pilot_tracking` | 17/06 09:15 (136h) | ⛔ MUDO | **Real.** Para `prop_busto_reform` (`pilot_enabled=true`) siempre escribe 1 fila/día (INSERT...ON CONFLICT DO UPDATE). 0 filas desde 17/06: el cron recibía 307 del middleware (roto desde 16-17/jun), y no fue relanzado manualmente el 22/06 tras el fix. Gap de 6 días en `pricing_pilot_tracking`. **Se autocura hoy a las 09:15 UTC.** |

**Causa raíz compartida:** crons `/api/sivra/*` bloqueados por middleware 16–22/06 (fix PR #429 del 22/06). Los 6 crons ✅ fueron relanzados manualmente por Alberto el 22/06 tras el fix; `pilot-track` no lo fue.

**Acción manual (si el próximo run de pilot-track a las 09:15 UTC del 23/06 sigue mudo):** en Vercel dashboard → proyecto `plataforma` → Functions → `/api/sivra/pricing/pilot-track` → "Run". El gap de 6 días en el histórico es cosmético; no afecta al motor de pricing.

### 🟡 Corrección: Project ID de `ialimp` en docs

La auditoría del 21/06 identificó que el ID `prj_iayrcepFTNQ0ff6L8bADn4TV4` daba 404. Verificado hoy vía `list_projects`: el ID correcto es **`prj_iayrcepFTNQ0ff6L8bO5bADn4TV4`**. Anotado en `CONTEXTO-SESIONES.md`.

### 🟢 Pendientes de auditorías anteriores

| Pendiente | Estado |
|---|---|
| Extracto BBVA Dúplex 01/01–22/03/2026 (~4.296€) | ⏳ Sin confirmar resolución |
| Buckets públicos Supabase con listado abierto | ⏳ Sin confirmar resolución |
| SMTP en Vercel `plataforma` (crons email concursos) | ⏳ Sin confirmar resolución |
| ialimp project ID corregido | ✅ Corregido en este informe |

---

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

## Addendum 2026-06-14 — Dashboard de SIVRA (datos correctos + entradas/salidas)

Revisión a partir del dashboard real (`sybra.vercel.app`, Junio 2026). Hallazgos y arreglos
(todos de bajo riesgo, verificados con `tsc --noEmit -p apps/sivra/tsconfig.json`, 0 errores):

### 🔴 D1. Gráfico "Evolución mensual" vacío — `dataKey` no coincide ✅ ARREGLADO
`apps/sivra/app/api/dashboard/route.ts:156-162` emite las series con claves dinámicas
`[year]`/`[year-1]`/`[year-2]` (p.ej. `2026`,`2025`,`2024`), pero el `<BarChart>` leía
`dataKey="y0"`/`"y1"` (`apps/sivra/app/(dashboard)/dashboard/page.tsx:233-234`) → claves
inexistentes → **las barras no se pintaban**. Fix: `dataKey={String(year)}` / `dataKey={String(year-1)}`.

### 🟡 D2. Delta engañoso "↑0.0%" cuando no hay periodo previo ✅ ARREGLADO
Con `ingresosPrev = €0` (no hay dato del año anterior) la UI mostraba `vs €0 ↑0.0%`, que sugiere
"sin crecimiento" cuando en realidad **no hay base de comparación**. `delta()` ahora devuelve `null`
en ese caso (`route.ts`) y `<Delta>` renderiza **"nuevo"** en vez de un 0,0% falso
(`page.tsx`; tipos `number|null`). Cuando ambos periodos son 0 sigue mostrando 0,0% (correcto).

### 🟢 D3. Entradas/Salidas no indicaban el piso ✅ AÑADIDO (petición de Alberto)
Las tarjetas "Salidas hoy / Entradas hoy / Entradas mañana" solo mostraban el nombre del huésped.
El endpoint `/api/incomes/today` **ya devolvía `propertyName`** (JOIN con `properties`), solo faltaba
pintarlo. Nuevo componente `TodayRow` muestra huésped + **🏠 nombre del piso** (fallback
`propertyId` → "Piso sin asignar"). `apps/sivra/app/(dashboard)/dashboard/page.tsx`.

> Nota: los importes (€5,3k ingresos/beneficio en el pantallazo) son coherentes: `beneficio = ingresos − gastos`
> y en Jun-2026 no hay gastos cargados → beneficio = ingresos. El KPI **Gastos** es global (no filtra por
> piso/portal); es limitación conocida, no un bug.

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

---

## Addendum 2026-06-18 — Auditoría profunda semanal

> Auditoría `auditoria-central` ENTERA: integridad estructural + typecheck 5 apps + tests +
> seguridad Supabase + deps + infra Vercel + coherencia docs. Rango cubierto: desde PR #373
> (auditoría diaria 18/06) hasta PR #374 (guardián de cierre). Estado: **SANO**.

### Resumen ejecutivo

| Bloque | Estado |
|---|---|
| Integridad estructural (lockfile, radiografía, guardián `@iarest/`) | ✅ Sano |
| Typecheck 5 apps (ia-rest, sivra, ialimp, plataforma, rrhh) | ✅ 0 errores |
| Tests (rrhh 25/25, packages 40/40, guardián 21/21) | ✅ Verde |
| Seguridad Supabase (0 ERROR, 0 WARN evitable) | ✅ Mantenido |
| Deps (vulns sin cambios, documentadas) | ✅ Sin cambios |
| Infra Vercel (4 proyectos READY, último deploy #374) | ✅ Sano |
| Coherencia docs (SKILLS.md en sync) | ✅ Sano |
| RUTINAS-PROGRAMADAS.md — desync "pendiente" vs activas | 🟡 PR #375 corrige |
| `documentos-contables` bucket con listing público | 🟡 Revisar |

---

### 🟡 Hallazgos MEDIO

#### P1. `documentos-contables` — bucket público con listing habilitado
`mcp__Supabase__get_advisors("security")` devuelve 4× `public_bucket_allows_listing` para
el bucket `documentos-contables`. El bucket es público (acceso anon a ficheros con URL),
pero el **listing** expone el índice completo de todos los ficheros a cualquier agente
anónimo.
- Riesgo: un tercero con la URL base puede enumerar todos los documentos contables de todos
  los tenants sin autenticación.
- **Acción de Alberto**: en Supabase Storage → `documentos-contables` → deshabilitar
  "Public bucket listing" (o hacer el bucket privado si las URLs firmadas son suficientes).
- Rollback: re-habilitar el listing si alguna integración lo necesita.

#### P2. RUTINAS-PROGRAMADAS.md desync — dice "pendiente de activar" pero las rutinas están activas
`docs/RUTINAS-PROGRAMADAS.md` sigue marcando la auditoría nocturna ligera y la semanal
profunda como "pendiente de activar". Esta misma sesión es la prueba de que **están activas**.
- PR #375 (draft) ya corrige el doc. Mergear para que la fuente de verdad refleje la realidad.
- **Acción de Alberto**: mergear PR #375 (solo docs, bajo riesgo).

---

### 🟢 Hallazgos BAJO

#### P3. `pg_net` instalada en schema `public`
1× `extension_in_public` (INFO): la extensión `pg_net` está en el schema `public` en lugar
de un schema dedicado. No es explotable actualmente, pero es una best practice moverla a
`extensions`. Sin impacto en operación actual; documentado para la próxima ventana de mantenimiento.

#### P4. PRs stale abiertas (8 drafts)
8 PRs en draft sin actividad reciente: #302 (blog SEO), #307 (core-receipts spec),
#312 (rrhh scaffold), #322 (facturas control), #331 (plataforma ingresos), #351 (organizador plan),
#364 (memoria lead), #375 (rutinas docs — pendiente de merge). Las 7 primeras son work-in-progress
o specs; sin urgencia, pero acumulan ruido en la lista de PRs.
- **Acción de Alberto**: revisar y cerrar (o re-abrir como no-draft) las que ya no procedan.

---

### Checklist de acciones manuales — 18/06/2026

1. **[P1]** Deshabilitar listing del bucket `documentos-contables` en Supabase Storage.
   Rollback: re-habilitar.
2. **[P2]** Mergear PR #375 (docs `RUTINAS-PROGRAMADAS.md` — solo docs, cero riesgo).
3. **[P4]** Revisar/cerrar PRs stale: #302, #307, #312, #322, #331, #351, #364.
4. **[A3 carry-forward]** Aplicar `add_concursos_radar_criterios.sql` +
   `add_concursos_radar_anuncios.sql` en Supabase (arregla el cron de concursos).
   Rollback: `DROP TABLE`.
5. **[B2 carry-forward]** Proyecto Supabase viejo `efncqyvhniaxsirhdxaa` — jubilar tras
   el corte de envs de ia-rest (aún ACTIVE).

---

## Addendum 2026-06-21 — Auditoría profunda semanal

> Auditoría `auditoria-central` ENTERA: integridad estructural + typecheck 5 apps + tests +
> seguridad Supabase + deps + infra Vercel + coherencia docs. Rango cubierto: desde PR #403
> (port agente concursos ialimp→plataforma, 19/06) + PR #404 (fix buscador zona, 20/06).

### Resumen ejecutivo

| Bloque | Estado |
|---|---|
| Integridad estructural (lockfile, radiografía, guardián `@iarest/`) | ✅ Sano |
| Typecheck 5 apps (ia-rest, sivra, ialimp, plataforma, rrhh) | ✅ 0 errores (1 fix aplicado) |
| Tests (rrhh 25/25, packages 40/40, guardián 21/21) | ✅ Verde |
| Seguridad Supabase (advisors) | 🟡 3 nuevos buckets con listing público |
| Deps (`pnpm audit`) | 🟡 16 vulns (5 high), subida desde 6/2h de la pasada |
| Infra Vercel (4 proyectos READY) | ✅ Sano |
| Coherencia docs (SKILLS.md, commands) | ✅ En sync |
| `concursos_radar_criterios` ausente en Supabase | 🔴 Cron roto (carry-forward A3) |
| `module-concursos` huérfano en ialimp dep+transpile | 🟡 Arreglado en este PR |
| SMTP/Resend ausentes en Vercel plataforma | 🟡 Crons de email concursos no envían |

---

### 🔴 Hallazgos ALTO

#### Q1. `concursos_radar_criterios` sigue sin existir en Supabase — cron de plataforma roto
Carry-forward de A3. Con el port del agente (PR #403) el cron `concursos-radar` ahora vive en
**plataforma** (`apps/plataforma/vercel.json`, `/api/concursos/radar` cada 6 h). La tabla
`concursos_radar_criterios` sigue sin aplicarse → el cron falla con *relation does not exist*
al ejecutarse en producción.
- `concursos_radar_anuncios` sí existe (se aplicó manualmente con PR #398).
- **Acción de Alberto**: ejecutar en Supabase compartido (`wswbehlcuxqxyinousql`):
  ```sql
  -- de apps/ialimp/prisma/migrations/add_concursos_radar_criterios.sql
  CREATE TABLE public.concursos_radar_criterios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
    clave text NOT NULL,
    valor text,
    peso int DEFAULT 1,
    created_at timestamptz DEFAULT now()
  );
  CREATE INDEX ON public.concursos_radar_criterios(empresa_id);
  ```
  Rollback: `DROP TABLE public.concursos_radar_criterios;`

---

### 🟡 Hallazgos MEDIO

#### Q2. `module-concursos` huérfano en ialimp (dep + transpilePackages) ✅ ARREGLADO
Tras el port del agente de concursos a plataforma (PR #403), el código de ialimp fue eliminado
pero no sus declaraciones: `@central/module-concursos` seguía en `apps/ialimp/package.json`
(deps) y en `apps/ialimp/next.config.ts` (`transpilePackages`). Ningún fichero de ialimp lo importa.
Fix: eliminado de ambos sitios. Bajo riesgo (no hay código que lo use).

#### Q3. plataforma — `types/pdf-parse.d.ts` faltaba tras el port ✅ ARREGLADO
Al portar el agente de concursos desde ialimp, `lib/concursos.ts:26` importa
`pdf-parse/lib/pdf-parse.js` de forma perezosa, pero la declaración de tipos
`types/pdf-parse.d.ts` (presente en ialimp) no se copió a plataforma → error `TS7016`.
Fix: copiado `apps/ialimp/types/pdf-parse.d.ts` → `apps/plataforma/types/pdf-parse.d.ts`.
Resultado: plataforma typecheck 0 errores.

#### Q4. 3 nuevos buckets públicos con listing habilitado (+ P1 carry-forward)
`get_advisors("security")` devuelve `public_bucket_allows_listing` en 4 buckets:
- `documentos-contables` (carry-forward P1, ya documentado 18/06)
- `documentos-propiedad` — archivador de documentos del piso del propietario (nuevo)
- `property-access-files` — ficheros de acceso a la propiedad (nuevo)
- `propuestas-leads` — propuestas de leads (nuevo)

Los 3 nuevos son públicos por diseño (URLs directas para propietarios), pero el **listing**
expone el índice completo de ficheros a cualquier agente anónimo con la URL base.
- **Acción de Alberto**: en Supabase Storage → cada bucket → deshabilitar "Allow public bucket listing":
  `documentos-propiedad`, `property-access-files`, `propuestas-leads` (y `documentos-contables`).
  Rollback: re-habilitar si alguna integración depende de listing.

#### Q5. SMTP/Resend ausentes en plataforma → crons de email de concursos no envían
`apps/plataforma/vercel.json` define 2 crons que envían email: `concursos-avisos` (digest
de nuevos matches al radar) y `concursos-cierre` (recordatorio ≤3 días). Ambos usan
`lib/mailer.ts` que necesita `SMTP_*` o `RESEND_API_KEY`. Esas envs solo están en ialimp.
- **Acción de Alberto**: añadir al proyecto Vercel `plataforma` las variables de entorno
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (mismos valores que ialimp, o el
  `RESEND_API_KEY` si se prefiere Resend). `MAIL_FROM` también (remitente).
  Sin estas envs, los crons se ejecutan pero los emails no se envían (fallo silencioso).

#### Q6. Subida de vulnerabilidades en `pnpm audit` — 16 vulns (5 high)
Pasada anterior: 6 vulns (2 high). Esta pasada: 16 (5 high). Nuevas:
- **`vite` ^6.3.5** (high, `@vitejs/plugin-react` transitiva): DOM Clobbering XSS en apps.
  Afecta ialimp y plataforma si sirven bundles de Vite. Mitigar con override `"vite":">=6.3.5"`.
- **`fast-xml-parser` ^5.0.9** (high, `ialimp/package.json` directa): ReDoS en DTD.
  Actualizar a ≥5.2.5: `pnpm update fast-xml-parser --filter ialimp`.
- **`nodemailer` ^8.0.7** (moderate, ialimp directa): header injection si `to` no se sanitiza.
  Actualizar: `pnpm update nodemailer --filter ialimp`.
- `xlsx` (high, carry-forward M3 — sin versión npm; ialimp solo escribe, no parsea → no explotable).
- 12 vulns restantes: transitivas de bajo impacto real (path-to-regexp, esbuild dev-only, etc.).

---

### 🟢 Hallazgos BAJO

#### Q7. `efncqyvhniaxsirhdxaa` (BD vieja ia-rest) sigue ACTIVE_HEALTHY
Carry-forward B2. Sin acción hasta el corte de envs de ia-rest.

---

### Lo que se arregló en esta auditoría
- **Q2**: `@central/module-concursos` eliminado de ialimp (`package.json` + `next.config.ts`).
- **Q3**: `apps/plataforma/types/pdf-parse.d.ts` creado → plataforma typecheck 0 errores.

### Checklist de acciones manuales de Alberto — 21/06/2026

1. **[Q1]** Aplicar en Supabase `add_concursos_radar_criterios.sql` (arregla cron plataforma).
   Rollback: `DROP TABLE public.concursos_radar_criterios;`
2. **[Q4]** Deshabilitar "Allow public bucket listing" en Supabase Storage:
   `documentos-propiedad`, `property-access-files`, `propuestas-leads`, `documentos-contables`.
3. **[Q5]** Añadir `SMTP_HOST/PORT/USER/PASSWORD` + `MAIL_FROM` al proyecto Vercel `plataforma`
   (mismos valores que ialimp) para que los crons de email de concursos envíen.
4. **[Q6]** Actualizar `fast-xml-parser` y `nodemailer` en ialimp (altas). Añadir override
   `"vite":">=6.3.5"` en `pnpm.overrides` del `package.json` raíz.
5. **[A3/Q1 carry-forward]** Ya consolidado en Q1 arriba.
6. **[B2 carry-forward]** Jubilar `efncqyvhniaxsirhdxaa` tras corte de envs de ia-rest.

---

## Addendum 2026-06-24 — Auditoría ligera diaria

> Modo ligero (sin typecheck ni tests). Rango: desde Addendum 21/06 hasta HEAD. 66 commits,
> todos en `apps/plataforma` + nuevo paquete `packages/core-telegram`.
> **Estado final:** ✅ Crons vivos. 3 fixes de docs aplicados en el acto.

### Resumen ejecutivo

| Bloque | Estado |
|---|---|
| Radiografía de estructura | ✅ Al día |
| Lockfile sync | 🟡 `@central/core-telegram` sin actualizar en `pnpm-lock.yaml` — **acción manual** |
| Heartbeat crons (8 verificados) | ✅ Todos vivos (falso positivo corregido — ver R1) |
| Skills-maestro vs código | ✅ En sync |
| `MATRIZ.md` + `CLAUDE.md` raíz vs paquetes reales | 🟡 `core-telegram` no listado → **arreglado** |
| CONTEXTO-SESIONES.md | ✅ Bien cubierto hasta 23/06/2026 |
| `docs/SKILLS.md` vs `.claude/skills/` + `.claude/commands/` | ✅ En sync |
| Manuales ia-rest (`help-prompts.ts` / `manual.html`) | ✅ Sin features visibles de ia-rest en el rango |

---

### 🟡 R1. Heartbeat falso positivo — `pricing/guard` (CORREGIDO en SQL)

El heartbeat SQL medía actividad de `pricing/guard` por filas nuevas en `pricing_alerts`, pero
ese cron solo escribe cuando detecta **reversiones de precio o suelos de coste** — no en cada
ejecución. Resultado: el cron aparecía como "⛔ MUDO" (186h sin escritura) cuando en realidad
**Vercel confirma 7 invocaciones en los últimos 7 días** (1/día, todo OK).

- **Fix**: eliminada la fila `pricing/guard` / `pricing_alerts` del SQL de heartbeat en
  `.claude/commands/auditoria-diaria.md` (línea 65). Es un cron de excepción, no de rutina.
- **Estado real del cron**: ✅ vivo. Si PriceLabs revertiera precios, volvería a generar alertas.

### 🟡 R2. `@central/core-telegram` no documentado en MATRIZ.md ni CLAUDE.md raíz (ARREGLADO)

El paquete `packages/core-telegram` fue creado el 22/06/2026 (decisión registrada en
`CONTEXTO-SESIONES.md`), consumido inmediatamente por `apps/plataforma` (`transpilePackages` +
`package.json`), pero no se actualizó la documentación de la raíz.

- **Fix**: `MATRIZ.md` — línea nueva en el árbol de packages. `CLAUDE.md` raíz — `core-telegram`
  añadido a la lista de módulos compartidos con descripción de envs y consumidores.

### 🟡 R3. `pnpm-lock.yaml` desincronizado — `@central/core-telegram` sin registrar

`apps/plataforma/package.json` declara `@central/core-telegram: workspace:*` pero
`pnpm-lock.yaml` no recoge la entrada (confirmado con `pnpm install --frozen-lockfile`).
No bloquea Vercel (usa `--no-frozen-lockfile`), pero rompe el check CI de lockfile en dev
y puede enmascarar conflictos de resolución.

- **Acción de Alberto**: ejecutar `pnpm install` localmente (sin `--frozen-lockfile`) y
  commitear el `pnpm-lock.yaml` actualizado.
- No aplicado en esta auditoría porque la descarga de Prisma engines falla en el entorno
  de ejecución remota (red restringida).

---

### 🟢 Hallazgos BAJO / Carry-forwards sin cambio

| | Estado |
|---|---|
| `concursos_radar_criterios` en Supabase [Q1] | ⚠️ Pendiente Alberto |
| Listing buckets Supabase [Q4] | ⚠️ Pendiente Alberto |
| SMTP/Resend en Vercel `plataforma` [Q5] | ⚠️ Pendiente Alberto |
| Vulns `fast-xml-parser` + `nodemailer` en ialimp [Q6] | ⚠️ Pendiente Alberto |
| `efncqyvhniaxsirhdxaa` vieja BD ia-rest [B2] | ⚠️ Pendiente corte de envs |

---

### Lo que se arregló en esta auditoría

- **R1**: heartbeat SQL corregido (eliminada fila falsa `pricing/guard`).
- **R2**: `@central/core-telegram` documentado en `MATRIZ.md` + `CLAUDE.md` raíz.

### Checklist de acciones manuales de Alberto — 24/06/2026

1. **[R3]** Ejecutar `pnpm install` local (sin `--frozen-lockfile`) y commitear `pnpm-lock.yaml`.
2. Carry-forwards de 21/06: Q1 (tabla radar criterios), Q4 (bucket listing), Q5 (SMTP plataforma),
   Q6 (vulns ialimp), B2 (jubilar BD vieja).

---

## Addendum 2026-06-25 — Auditoría ligera diaria

> Modo ligero (sin typecheck ni tests). Rango: desde Addendum 24/06 hasta HEAD.
> **Estado final:** 🔴 1 cron mudo real. 🟡 1 falso positivo confirmado. Skill + memoria reconciliadas.

### Resumen ejecutivo

| Bloque | Estado |
|---|---|
| Radiografía de estructura | ✅ Sin cambios desde 24/06 |
| Lockfile sync | ✅ (pendiente R3 manual de Alberto) |
| Heartbeat crons (8 verificados) | 🔴 `mercado/cron` MUDO desde 23/06 · 🟡 `auto-sessions` falso positivo |
| Skills-maestro vs código | 🟡 `plataforma-maestro` sin CIMA LIQ → **arreglado** |
| CONTEXTO-SESIONES.md | 🟡 Entrada CIMA LIQ (24/06) fuera de orden → **reordenada** |
| `docs/SKILLS.md` vs `.claude/skills/` | ✅ En sync |
| Manuales ia-rest | ✅ Sin features visibles de ia-rest en el rango |

---

### 🔴 S1. `mercado/cron` MUDO — `SERPER_API_KEY` ausente en Vercel `plataforma`

El heartbeat SQL devuelve `⛔ MUDO` para `market_rates` (última escritura: 22/06, ~55h de silencio).

**Causa raíz confirmada por Vercel runtime errors (plataforma):**
- `apps/plataforma/app/api/sivra/mercado/cron/route.ts:18-19`:
  ```ts
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY no configurada");
  ```
- Error registrado el 23/06 07:15 UTC y el 24/06 07:15 UTC: `Error: SERPER_API_KEY no configurada`.
- `lib/secrets-registry.ts:100`: `SERPER_API_KEY` tiene `vercelProject: 'sivra'` — la key existe
  en el proyecto **sivra** pero **NO en plataforma**, donde el cron realmente corre.

**Impacto:** sin datos de mercado en `market_rates` desde el 22/06 22:24. El motor de pricing
estacional puede tarificar sin comparativa de competidores durante este gap.

**Acción de Alberto:** en Vercel dashboard → proyecto **plataforma** → Settings →
Environment Variables → añadir `SERPER_API_KEY` (mismo valor que en el proyecto `sivra`).
- Alternativa a futuro: actualizar `lib/secrets-registry.ts` añadiendo `plataforma` como
  segundo `vercelProject` para poder gestionarlo desde el god-panel de secretos.
- Rollback: eliminar la env si se quiere desactivar el cron en plataforma.

---

### 🟡 S2. `limpiadoras/auto-sessions` — falso positivo del heartbeat (confirmado)

El heartbeat SQL devuelve `⛔ MUDO` para `cleaning_sessions` (55h sin escritura nueva).

**Diagnóstico:** el cron es **idempotente por diseño** — solo inserta cuando no existe sesión para
`(property_id, session_date)`. Verificado vía Supabase: las próximas salidas (28-jun ×4, 01-jul ×2,
06-jul ×1) ya tienen filas en `cleaning_sessions`. El cron ejecuta OK pero no inserta nada → silencio
normal, no un problema.

**Sin acción.** A considerar: excluir `auto-sessions` del heartbeat o ajustar umbral a 7d
(como se hizo con `pricing/guard` en el addendum 24/06 R1).

---

### 🟢 S3. CIMA LIQ — operativo (tabla ✅, cron en vercel.json ✅)

Primera ejecución del cron: 25/06 07:30 UTC. Tabla `cima_liquidaciones` confirmada en Supabase
(`wswbehlcuxqxyinousql`). Cron `30 7 * * *` en `apps/plataforma/vercel.json` ✅.

**Pendiente de Alberto:** test manual `GET /api/cron/cima-liq?secret=<CRON_SECRET>` en preview
tras merge de PR #508. Credenciales sandbox Codeoscopic/Avant2 pendientes (Juan Manuel / LOOR.es,
ticket #267336).

---

### 🟢 S4. `pricing/pilot-track` — autocurado (confirmado)

Tabla `pricing_pilot_tracking` con filas del 24/06 09:15 UTC. El cron que llevaba 6 días mudo
(middleware roto 16–22/06) se autocuró exactamente como se predijo en el addendum del 23/06.

---

### 🟡 S5. `plataforma-maestro` — CIMA LIQ no documentado (ARREGLADO)

La skill no mencionaba el cron `cima-liq`, la tabla `cima_liquidaciones` ni la integración TIREA/CIMA.
Fix: entrada añadida en "Dónde vive cada cosa" con scope, archivos, BD, envs y pendientes.

---

### Lo que se arregló en esta auditoría

- **S5**: `plataforma-maestro` actualizado con CIMA LIQ.
- **CONTEXTO-SESIONES.md**: entrada CIMA LIQ (24/06) reubicada al principio de Estado actual.

### Checklist de acciones manuales de Alberto — 25/06/2026

| Prioridad | Acción | Nota |
|---|---|---|
| 🔴 | Añadir `SERPER_API_KEY` a Vercel proyecto **plataforma** (mismo valor que en `sivra`) | Sin esto, `mercado/cron` sigue mudo → sin datos de mercado para pricing |
| 🟡 | Test manual `GET /api/cron/cima-liq?secret=<CRON_SECRET>` en preview tras merge PR #508 | Confirmar que el cliente SOAP funciona con las credenciales reales |
| 🟡 | [R3 carry-forward] `pnpm install` local + commitear `pnpm-lock.yaml` | CI lockfile check falla en dev |
| 🟡 | [Q1 carry-forward] Crear `concursos_radar_criterios` en Supabase | Cron plataforma roto |
| 🟡 | [Q4 carry-forward] Deshabilitar listing en 4 buckets Supabase Storage | Exposición de índice de ficheros |
| 🟡 | [Q5 carry-forward] SMTP/Resend en Vercel `plataforma` | Emails de concursos no envían |
| 🟡 | [Q6 carry-forward] Actualizar `fast-xml-parser` + `nodemailer` en ialimp | Vulns altas |

---

## Addendum 2026-06-28 — Auditoría ligera diaria

> Modo ligero (sin typecheck ni tests). Rango: desde Addendum 25/06 hasta HEAD (~20 commits).
> Features del rango: vertical `alquiler` (#560/#561), filtros gastos (#553), CLAUDE.md rrhh (#552),
> cron SEO semanal Serper (#551), fix agente huésped host (#549).
> **Estado final:** 🟡 `mercado/cron` extrae 0 datos (cron vivo, key ok, pero LLM no encuentra precios). 🟢 Estructura + skills al día.

### Resumen ejecutivo

| Bloque | Estado |
|---|---|
| Heartbeat crons (8 verificados) | 🟡 `mercado/cron` 0 datos × 2 días · 🟢 resto OK o falso-positivo confirmado |
| Radiografía de estructura | ✅ Vertical `alquiler` integrada correctamente |
| Skills-maestro vs código | ✅ En sync (alquiler-maestro, transporte-maestro, central-maestro al día) |
| `docs/SKILLS.md` vs `.claude/skills/` | ✅ En sync |
| CONTEXTO-SESIONES.md | ✅ PRs del rango ya anotados correctamente |
| Manuales ia-rest | ✅ Sin features visibles de usuario en ia-rest en el rango |

---

### 🟡 T1. `mercado/cron` — SERPER_API_KEY configurada pero extrae 0 apartamentos

El cron `GET /api/sivra/mercado/cron` ya no da el error de clave configurada tras el 🔴 S1 del
addendum 25/06 (Alberto añadió `SERPER_API_KEY` a Vercel `plataforma`). Ahora corre sin error pero
devuelve 0 resultados en los dos últimos runs:

- `2026-06-27 07:16 UTC`: `market:{"booking":0,"tripadvisor":0,"expedia":0} alerts:0`
- `2026-06-26 07:15 UTC`: `market:{"booking":0,"tripadvisor":0,"expedia":0} alerts:0`

**Causa probable:** `extractPrices` usa LLM para extraer precios numéricos de snippets de Google (vía
Serper). Los snippets de booking.com/tripadvisor.com/expedia.com no siempre muestran precios en el
extracto visible → el LLM devuelve `{"apartments":[]}` (correcto por diseño: el system prompt dice
"Si no hay precios reales, devuelve []").

**Impacto:** `market_rates` sin filas nuevas desde 25/06 14:19 (~3 días). El motor de pricing usa
datos de los últimos 7 días, así que opera con datos ligeramente obsoletos. No crítico a corto plazo
pero degradado.

**Acción:** Verificar el run del 29/06 a las 07:15 UTC. Si sigue con 0, añadir "precio por noche" o
"€/noche" a las queries Serper para forzar snippets con precios. Alternativa: bajar `extractPrices`
a pedir solo el campo `price_night` del primer resultado (más robusto).

---

### 🟢 T2. `updates/sync` y `limpiadoras/auto-sessions` — falsos positivos confirmados de nuevo

Ambos crons corrieron a las 05:00 UTC del 26/06 y 27/06 (HTTP 200, verificado en logs Vercel).
Sin filas nuevas porque no hubo reservas nuevas en Smoobu y todas las sesiones de limpieza ya
existían. Comportamiento normal, ya documentado en S2 del addendum 25/06. Sin acción.

---

### 🟢 T3. Vertical `alquiler` — integración correcta en la matriz

La vertical `apps/alquiler` (PR #560, en `main` desde 27/06) está correctamente integrada:

| Check | Estado |
|---|---|
| `MATRIZ.md` — fila `alquiler` | ✅ |
| `central-maestro` — enrutado a `alquiler-maestro` | ✅ |
| `docs/SKILLS.md` — `alquiler-maestro` listado | ✅ |
| CI `tests.yml` — `alquiler` en matrix typecheck | ✅ |
| `apps/alquiler/next.config.ts` — `transpilePackages` | ✅ `@central/core-identity`, `@central/module-alquiler` |
| `apps/alquiler/package.json` — deps declaradas | ✅ ambas deps |

La vertical `transporte` (PR #542, mergeada 26/06) también está en sync; pendiente solo la creación
del proyecto Vercel (acción de Alberto).

---

### Carry-forwards sin cambio

| Pendiente | Origen |
|---|---|
| ⏳ Crear `concursos_radar_criterios`/`radar_anuncios` en Supabase | Q1 - 12/06 |
| ⏳ Deshabilitar listing en 4 buckets Supabase Storage | Q4 - 18/06 |
| ⏳ SMTP/Resend en Vercel `plataforma` | Q5 - 18/06 |
| ⏳ Actualizar `fast-xml-parser` + `nodemailer` en ialimp | Q6 - 18/06 |
| ⏳ Crear proyecto Vercel para `apps/transporte` | 26/06 |
| ⏳ Rotar contraseñas `prisma_ialimp/_plataforma/_transporte` si pasaron por el chat (incidente 27/06) | 27/06 |

### Checklist de acciones manuales de Alberto — 28/06/2026

| Prioridad | Acción | Nota |
|---|---|---|
| 🟡 | Verificar run de `mercado/cron` el **29/06 a las 07:15 UTC**; si sigue con 0, afinar las queries Serper | Sin datos de mercado desde el 25/06; motor de pricing degradado |
| 🟡 | [Carry-forward] Crear proyecto Vercel para `apps/transporte` | App lista en `main`, solo falta el proyecto Vercel |
| 🟡 | [Carry-forward] Rotar contraseñas `prisma_ialimp/_plataforma/_transporte` si pasaron por el chat | Seguridad mínima — incidente 27/06 |
| 🟡 | [Q5 carry-forward] SMTP/Resend en Vercel `plataforma` | Emails de concursos no envían |
