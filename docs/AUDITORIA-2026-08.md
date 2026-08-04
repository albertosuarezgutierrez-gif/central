# Auditoría diaria — agosto 2026

# Actualización 2026-08-01 — auditoría diaria (ligera)

Rango: 12 commits sustanciales desde la última auditoría (31/07/2026 02:07 UTC, pasada ligera)
hasta hoy — cierre del PR de latido de facturas (#1194), un fix de pricing (bucket de mes
contaminado por evento, #1196), dos fixes de trading (techo de plausibilidad XBRL #1195, EBIT
derivado ADR #1193 ya reconciliados ayer), subastas (cadena de ubicación, #1191) y la pasada
mensual de RRHH compliance calendar. Checks estructurales baratos (SALTA typecheck/tests
pesados, son de la pasada profunda semanal).

## ✅ Reconciliación memoria/skills — un solo hueco, ya corregido
Las sesiones del rango se auto-documentaron con mucho detalle (prácticamente todos los commits
tocan `docs/CONTEXTO-SESIONES.md` en el mismo commit del fix). Único hallazgo: la entrada del
latido de facturas seguía diciendo **"PR #1194 pendiente de merge"** cuando ya se mergeó hoy a
las 07:40 UTC — corregido (carril 1). `docs/SKILLS.md` sigue listando las 31 skills + 3 comandos
reales de `.claude/skills`/`.claude/commands`, sin huérfanos ni faltantes. No se ha creado
ninguna skill nueva en el rango, así que la tabla de rutas del triaje de correo
(`lib/correo/rutas.ts`) no tiene drift que revisar.

## 🗓️ Rotación mensual — julio archivado
Julio es mes cerrado: `node scripts/rotar-memoria.mjs` archivó 321 entradas a
`docs/memoria/2026-07.md`. Una entrada (`### 💓 El latido de facturas...`) usaba formato
heading (`### `) en vez del `- **` que el script reconoce y no se archivó sola — se movió a
mano al mismo archivo. Anotado en la memoria viva para que quien lo vuelva a ver sepa que es
un gap conocido del script, no un bug nuevo.

## ✅ Heartbeat de crons (14 huellas) — 12/14 ✅, 2 falsos positivos (mismo patrón de siempre)
`limpiadoras/auto-sessions` (168,6h) y `updates/sync` (165,8h) salieron ⛔ MUDO por umbral.
Confirmados por Vercel runtime logs: ambos devolvieron 200 hoy a las 05:00 UTC — son crons
idempotentes que solo escriben fila cuando hay reservas/sesiones nuevas, y llevan sin actividad
real desde el 25/07. Es el mismo patrón documentado repetidamente desde el 02/07 (ver
`docs/AUTO-APLICADOS.md`); no se toca el umbral porque la regla del heartbeat solo permite
ajustarlo en crons semanales/mensuales, y estos son diarios por diseño.

## ✅ Manuales de usuario — nada que tocar
Ningún archivo de `apps/ia-rest/src/app/**` cambió en el rango (los cambios de UI del rango son
`apps/ialimp/app/dashboard/*` — fix de un chip de estado ya roto, no una feature nueva — y
`apps/plataforma/app/(usuario)/subastas/*`, que no tiene sistema de manuales). Sin gap.

## ✅ Integridad estructural — sin hallazgos
Lockfile presente, 38 paquetes en `packages/*`, y las 8 apps (`ia-rest`, `sivra`, `ialimp`,
`plataforma`, `rrhh`, `transporte`, `alquiler`, `almacen`) tienen el `ignoreCommand` obligatorio
en su `vercel.json`.

## ✅ Sin hallazgos de carril 2
Sin código roto, sin infra que tocar, sin crons genuinamente mudos. No se abre PR ni se manda
Telegram (frugalidad, regla del paso 6.4) — solo la reconciliación de texto de carril 1, ya
commiteada a `main` en esta misma pasada.

*Actualización por Claude Code (auditoría diaria automática) · 2026-08-01*

# Actualización 2026-08-02 — auditoría diaria (ligera)

Rango: 10 commits sustanciales desde la última auditoría (01/08/2026 09:40 UTC, pasada ligera) —
RRHH categoría documental (#1212), subastas «cargas no publicadas» (#1213), auditoría de precio
dinámico sivra (#1209, bucket de mes + comisión Booking duplicada), subasta vencida en el radar
(#1210), ia-rest quita el precio de la web + agente SEO (#1208), trading (#1206), health-check
(#1205), pricing eventos previstos (#1203) y palanca de urgencia + House cambió de categoría en
2024 (#1202). Checks estructurales baratos (SALTA typecheck/tests pesados, son de la pasada
profunda semanal).

## ✅ Reconciliación memoria/skills — 2 huecos, corregidos (carril 1)
Las sesiones del rango siguen auto-documentándose muy bien (todos los PRs tocan
`docs/CONTEXTO-SESIONES.md` en el mismo commit del fix). Dos huecos encontrados:
1. La entrada del latido de facturas seguía diciendo **«PR #1194 pendiente de merge»**. El PR ya
   se mergeó el 01/08 07:40 UTC — la corrección de la auditoría de ayer se hizo pero el merge de
   la propia PR (mismo minuto, rama vieja) la volvió a pisar. Corregido con el estado real:
   mergeado, primera pasada del cron con el fix hoy 02/08 06:15 UTC (`agente_latidos` sin fila
   `facturas_gmail` a las 02:00 UTC es lo esperado, no un fallo — el cron es diario y solo ha
   corrido una vez desde el merge, con el código viejo).
2. `apps/plataforma/CLAUDE.md` (sección Subastas) no mencionaba los fixes #1210 (subasta vencida
   en el radar) ni #1213 (`estadoCargas`/`titularCargas`, 5 estados) — el resto de la sección
   documenta cada PR de subastas y estos dos se quedaron fuera. Añadidos.

`docs/SKILLS.md` verificado contra `.claude/skills/` (31) y `.claude/commands/` (3): sin huérfanos
ni faltantes. Ninguna skill nueva en el rango → sin drift en la tabla de rutas del triaje de
correo (`lib/correo/rutas.ts`). `docs/FUENTES-DE-VERDAD.md` sin filas nuevas que añadir (ninguna
vertical/skill nueva en el rango).

## ✅ Manuales de usuario — nada que tocar
RRHH #1212 ya actualizó `apps/rrhh/public/manual.html` en el mismo PR. ia-rest #1208 (quitar precio
de la web) toca el sitio de marketing público, no el POS (`/edge`, `/kds`, `/owner`) — no aplica a
`help-prompts.ts`/`manual.html`, que documentan la operativa del restaurante, no la landing.

## ✅ Heartbeat de crons (14 huellas) — 14/14 ✅
Sin crons mudos. `psd2-sync` 20,0h · `rates/snapshot` 19,0h · `mercado/cron in-app` 18,8h ·
`pricing/pilot-track` 16,8h · `pricing/apply-auto` 7,3h · `updates/sync` 7,3h ·
`limpiadoras/auto-sessions` 7,2h · `trading-universo` 1,7h · `concursos-ingesta` 1,5h ·
`correo-triaje` 0,0h · `AGENTE pricing` 90,6h · `trading forward-paper` 136,1h ·
`trading-ranking` 137,0h · `ia-director-refresh` 141,0h. Todos dentro de umbral.

## ✅ Integridad estructural — sin hallazgos
Lockfile presente, 8 apps (`ia-rest`, `sivra`, `ialimp`, `plataforma`, `rrhh`, `transporte`,
`alquiler`, `almacen`) con `ignoreCommand` obligatorio en su `vercel.json`.

## ✅ Sin hallazgos de carril 2
Sin código roto, sin infra que tocar, sin crons genuinamente mudos. No se abre PR ni se manda
Telegram (frugalidad, regla del paso 6.4) — solo la reconciliación de texto de carril 1, ya
commiteada a `main` en esta misma pasada.

*Actualización por Claude Code (auditoría diaria automática) · 2026-08-02*

# Actualización 2026-08-02 — auditoría PROFUNDA (semanal, `--profunda`)

`auditoria-central` entera: integridad estructural, typecheck de las 8 apps, tests, seguridad
multi-tenant + Supabase advisors, deps, infra real por MCP, coherencia de docs.

## ✅ Integridad estructural
`pnpm install --frozen-lockfile` en sync. `node scripts/auditar-estructura.mjs --check` al día.
`pnpm test:guardia` 26/26 (incluye el guardián de scope viejo `@iarest/` y el de secretos con
fallback literal). `transpilePackages` vs deps `@central/*` verificado app por app (8/8): sin
faltantes ni sobrantes.

## ✅ Typecheck — 8/8 apps limpias
`prisma generate` + `tsc --noEmit` secuencial (mismo orden, mismo `@prisma/client` compartido) en
ialimp, sivra, plataforma, rrhh, transporte, alquiler, almacen — **0 errores**. `tsc --noEmit` en
ia-rest (sin Prisma) — **0 errores**.

## ✅ Tests — 0 fallos
`pnpm test` (guardián + tests de packages + vitest de rrhh/core-firma/module-rrhh/module-documental/
module-chat/module-transporte/core-identity) — todo verde, sin regresiones tras los bumps de deps.

## 🔴→✅ Seguridad de dependencias — 46 vulns (3 críticas) arregladas a 12 (0 críticas)
`pnpm audit --prod` salió con **46 vulnerabilidades: 3 críticas, 17 high, 26 moderadas** — subida
fuerte desde las 16 (0 críticas) de la auditoría de julio. Las 3 críticas y buena parte de las high
eran next-auth/Next.js:

- **next-auth 5.0.0-beta.31 (sivra) → 2 CRÍTICAS Auth.js**: "Configuration errors can cause
  existence-based auth checks to fail open" y "Email normalizer validates before Unicode
  normalization" (bypass homógrafo `@`). Sivra usa Credentials (sin OAuth), pero la primera es
  agnóstica al provider. Parche disponible en beta.32 (sin cambios de API). **Aplicado**: bump a
  `^5.0.0-beta.32`.
- **next desactualizado en las 8 apps**: ia-rest en 16.2.7 (patch <16.2.11, disclosure de Server
  Function endpoints + SSRF en rewrites/Server Actions + middleware bypass, varias HIGH); el resto
  en 15.5.19 (patch <15.5.21, mismo DoS/disclosure). **Aplicado**: bump de parche a `^16.2.12`
  (ia-rest) y `^15.5.22` (ialimp/sivra/plataforma/rrhh/transporte/alquiler/almacen).
- **axios vía `msedge-tts`/`node-ical`**: el override existente en `package.json` raíz
  (`>=1.16.0`, de una auditoría anterior) se había quedado corto — las nuevas advisories exigen
  `>=1.18.0`. **Aplicado**: bump del override; `pnpm -r why axios` confirma una sola versión
  resuelta (1.19.0) en todo el workspace.

Verificado tras cada bump: `pnpm install`, typecheck de las 8 apps (0 errores), `pnpm test` +
`pnpm test:guardia` (0 fallos), `pnpm audit` re-ejecutado. Resultado: **46 → 22 → 12 vulns**, cero
críticas restantes. Todos los bumps son de parche (sin cambios de API). **Cerrado (02/08, sesión
«repara»)**: los builds reales de Vercel de las 8 apps salieron en verde sobre el commit del PR
(checks «Vercel – *» todos en success) → **PR #1215 mergeado a `main`** (squash `783b2fb`).

### Vulns restantes — 2ª pasada («haz tu todo», 02/08): 12 → 3 (0 críticas)
La sesión de cierre revisó una a una las 12 documentadas; casi todas tenían arreglo seguro:

| Paquete | Resolución |
|---|---|
| `nodemailer` (sivra directo) | ✅ Bump 8→9.0.3. **El call site real es un stub** (`app/api/mensajes/auto-reply/route.ts:13` — el transporter está comentado, `sendEmail` solo hace `console.log`), así que no había nada que romper. El peer warning de `@auth/core` es cosmético: su peer de nodemailer es **opcional** y sivra solo usa el provider `Credentials`. |
| `nodemailer` (transitivo vía `imapflow`/`mailparser`) | ✅ `imapflow` ^1.6.5 en sivra+plataforma (1.6.x **eliminó la dep de nodemailer**) y `mailparser` refrescado a 3.9.14 (usa nodemailer 9.0.3). |
| `fast-xml-parser` (plataforma) | ✅ Bump 4→5.10.1. El changelog de v5 declara «no change in the functionality, syntax, APIs, options» (solo empaquetado ESM/CJS); el código ya usa la sintaxis v4 (`removeNSPrefix` etc.). Verificado con smoke test de runtime + los 769 tests de plataforma (BORME/BOE/CODICE con fixtures reales). |
| `sharp` (plataforma directo + vía `next` en almacen) | ✅ Bump 0.35.3 + override raíz `sharp >=0.35.0`. Smoke test de runtime del binario nativo (composición JPEG q82, la operación exacta del lector registral) OK; el build de Vercel del PR es la validación final del binario. |
| `linkify-it` (vía `mailparser`) | ✅ Cayó sola con el refresco de `mailparser` a 3.9.14. |
| `postcss` (vía `next`, almacen) | ✅ Override raíz `postcss >=8.5.18` (mismo major 8, API congelada; next pinnaba 8.4.31). |
| `uuid` (vía `node-ical`, ialimp) | ✅ Override raíz `uuid >=11.1.1` (resuelve 14.0.1). Verificado en el propio contexto de `node-ical` que `require('uuid').v4` sigue funcionando en CJS. |
| `xlsx` | 🟡 QUEDA (high ×2, **sin parche en npm**). No explotable: ialimp solo ESCRIBE xlsx, nunca parsea entrada de terceros. |
| `file-type` (vía `jimp`, ialimp) | 🟡 QUEDA (moderate). El parche exige ≥21.3.1, que es **ESM-only** — el override rompería el `require` CJS de jimp en runtime. Bucle infinito en parser ASF; jimp solo procesa imágenes propias. |

**Resultado final: 3 vulns (2 high `xlsx` sin parche + 1 moderate `file-type`), 0 críticas** — el
suelo alcanzable sin cambiar de librería (`xlsx`→`exceljs` y `jimp`→`sharp` serían migraciones, no bumps).

## ✅ Seguridad multi-tenant + Supabase advisors
Sin hallazgos nuevos de cruce entre tenants. Supabase advisors (`get_advisors`, ambos proyectos):
- **BD compartida `wswbehlcuxqxyinousql`**: 465 lints — 292 INFO (`rls_enabled_no_policy`, ya
  conocido), 154 WARN (`security_definer_function_executable` anon+authenticated, patrón esperado
  de las funciones RPC), 16 `rls_policy_always_true`, 2 `extension_in_public`, 1
  `function_search_path_mutable`. Sin ERROR.
- **ia-rest standalone `efncqyvhniaxsirhdxaa`**: 343 lints — **47 ERROR `security_definer_view`**,
  ya documentado como preexistente desde `AUDITORIA-2026-07.md` (M24); sin cambio desde entonces.
  113 WARN `function_search_path_mutable`, 126 WARN de funciones SECURITY DEFINER
  anon+authenticated, 23 `rls_policy_always_true`, resto ruido conocido del patrón anon-key.

Ninguno de los dos requiere acción nueva en esta pasada — son hallazgos ya llevados a auditorías
anteriores sin plan de arreglo (harding de las 47 vistas queda pendiente, gran radio).

## ✅ Heartbeat de crons — 14/14 ✅
Sin crons mudos (detalle en la pasada ligera del mismo día).

## 🟡→✅ Infra Vercel — resuelto: las 4 apps SÍ existen; el gap era del conector MCP
`list_projects` (team `pisos-turisticos-projects`) devuelve solo **6** proyectos (`plataforma`,
`ia-rest`, `ialimp`, `sivra`, `house-sevillana-landing`, `ialimp-landing`), pero los checks del
propio PR #1215 confirmaron que **`central-rrhh`, `transporte`, `alquiler` y `almacen` viven en el
MISMO team** y desplegaron su preview en verde (project IDs visibles en el comentario del bot de
Vercel). `list_deployments` sobre esos 4 proyectos devuelve `403 Forbidden` → **el conector Vercel
MCP tiene acceso concedido por-proyecto, no al team entero**. No hay gap de despliegue. Acción
manual opcional de Alberto: ampliar el acceso del conector a esos 4 proyectos para que las próximas
auditorías los cubran por MCP (mientras tanto, los checks de Vercel en los PRs sirven de evidencia).

## ✅ Coherencia de docs — 1 drift corregido (carril 1)
`.claude/skills/auditoria-central/SKILL.md` describía una arquitectura vieja: contaba 4 apps y 16
packages (hoy son 8 y 38), decía que las apps con Prisma para typecheck eran "6, no solo 3" cuando
ya son 7 (falta almacen), y afirmaba que ia-rest vive en el schema `iarest` de la BD compartida —
confirmado por MCP que su proyecto standalone `efncqyvhniaxsirhdxaa` no tiene ese schema; sigue
siendo `public`, la migración está diseñada pero pendiente (correctamente documentado en
`ia-rest-maestro`, sección "Split-brain de BD"). Corregido en el propio archivo (carril 1).

## Checklist de acciones manuales de Alberto (esta pasada)
1. ~~Vercel: confirmar team de `rrhh`/`transporte`/`alquiler`/`almacen`~~ → **resuelto**: mismo
   team; opcional ampliar el acceso por-proyecto del conector MCP a esos 4.
2. ~~Revisar y mergear el PR draft de bumps~~ → **hecho**: PR #1215 mergeado (`783b2fb`) tras
   verificar los 8 builds de Vercel en verde. Rollback: revertir el PR, no hay migración de datos
   de por medio.
3. **Opcional, sin urgencia**: valorar nodemailer 8→9 (sivra) y fast-xml-parser 4→5 (plataforma)
   con una prueba manual — quedan fuera de esta pasada por ser saltos de major sin poder probarlos
   en vivo.

*Actualización por Claude Code (auditoría profunda semanal automática) · 2026-08-02*
