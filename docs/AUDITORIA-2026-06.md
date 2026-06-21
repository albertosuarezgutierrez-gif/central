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
