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
