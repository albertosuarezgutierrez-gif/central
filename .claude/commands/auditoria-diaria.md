---
description: Auditoría diaria del monorepo central — reconcilia memoria + skills + docs con el estado REAL del repo (código/infra) y abre un PR draft con el informe.
---

# Auditoría diaria — `central`

> Pensado para ejecutarse desde un **trigger programado** de Claude Code en web (lo corre
> una sesión-nube autónoma, "cowork"), o a mano con `/auditoria-diaria`. Su trabajo NO es
> "releer conversaciones" (no persisten: el contenedor es efímero), sino detectar y
> corregir el **drift** entre lo que afirman la memoria/skills/docs y lo que de verdad
> hace el código y la infra.
>
> **MCPs que necesita:** Supabase + Vercel + github (todo lectura, salvo abrir el PR).
>
> **Dos cadencias (ver `docs/RUTINAS-PROGRAMADAS.md`):**
> - **Ligera (por defecto, diaria):** reconcilia memoria/skills/docs + checks baratos
>   (lockfile, radiografía de estructura, drift skills↔código). SALTA typecheck de las 4
>   apps y tests pesados. Rápida y de bajo ruido. Es la red de seguridad del guardián de
>   cierre (`persist-memoria.sh`): caza lo que las sesiones no anotaron a mano.
> - **Profunda (`/auditoria-diaria --profunda`, semanal):** corre `auditoria-central`
>   ENTERA (typecheck de las 4 apps + tests + seguridad multi-tenant + infra por MCP).

## Por qué existe
El hook `Stop` (`persist-memoria.sh`) ya persiste `CONTEXTO-SESIONES.md` por sesión,
pero solo si esa sesión lo tocó. Esta auditoría es la **red de seguridad**: caza lo que
las sesiones del día se dejaron sin anotar, los pendientes ya resueltos que siguen
marcados, y las skills-maestro / `CLAUDE.md` que el código ya contradice.

## Fuentes de verdad (lo único que persiste)
- `git log` desde la última auditoría (mira la fecha del último `docs/AUDITORIA-*.md`
  y de la entrada superior de `docs/CONTEXTO-SESIONES.md`).
- El código real de `packages/*` y `apps/*`, `MATRIZ.md`, los `CLAUDE.md`/`AGENTS.md`.
- Infra por MCP (Supabase/Vercel), solo lectura.

## Pasos (crea un TodoWrite por bloque)

1. **Encuadre.** Lee `MATRIZ.md` y las entradas de arriba de `docs/CONTEXTO-SESIONES.md`.
   Saca el rango de cambios: `git log --since="<fecha última auditoría>" --stat` (o las
   últimas ~48h si no hay referencia). Si NO hay commits nuevos desde la última
   auditoría → **para aquí sin abrir PR** (no metas ruido).

2. **Auditoría según cadencia.**
   - **Modo ligero (por defecto):** invoca **`auditoria-central`** pero recorre solo los
     bloques baratos (integridad estructural: lockfile + radiografía + `transpilePackages`;
     coherencia de docs; deps/código muerto rápidos). SALTA typecheck de las 4 apps y los
     tests pesados — esos son de la pasada semanal.
   - **Modo profundo (`--profunda` en el prompt):** recorre `auditoria-central` ENTERA
     (integridad, typecheck de las 4 apps, tests, seguridad multi-tenant, deps, infra real
     por MCP, coherencia de docs).
   Distingue error real de ruido de entorno; no infles conteos.

2-bis. **Heartbeat de crons** (barato, corre SIEMPRE — también en modo ligero).
   Los crons pueden dejar de escribir en silencio (p. ej. jun-2026: el middleware de
   plataforma redirigía los crons `/api/sivra/*` a `/login` y estuvieron 5 días mudos sin
   que saltara ninguna alarma). Este check vigila el **síntoma** (no hay filas frescas),
   así que caza cualquier causa (middleware, clave Smoobu, bug en handler, caída Vercel…).
   Corre por Supabase MCP (lectura) sobre `wswbehlcuxqxyinousql`:

   ```sql
   WITH h(cron, tabla, ultimo, max_horas) AS (
     SELECT 'rates/snapshot',            'rate_snapshots',         max(created_at),     36 FROM rate_snapshots
     UNION ALL SELECT 'pricing/apply-auto',       'pricing_applied',        max(applied_at),     36 FROM pricing_applied
     UNION ALL SELECT 'updates/sync',             'incomes',                max("createdAt"),    36 FROM incomes
     UNION ALL SELECT 'mercado/cron',             'market_rates',           max(created_at),     36 FROM market_rates
     UNION ALL SELECT 'pricing/guard',            'pricing_alerts',         max(created_at),     36 FROM pricing_alerts
     UNION ALL SELECT 'pricing/pilot-track',      'pricing_pilot_tracking', max(created_at),     36 FROM pricing_pilot_tracking
     UNION ALL SELECT 'limpiadoras/auto-sessions','cleaning_sessions',      max(created_at),     36 FROM cleaning_sessions
     UNION ALL SELECT 'concursos-ingesta',        'concursos_licitaciones', max(actualizado_en), 12 FROM concursos_licitaciones
     UNION ALL SELECT 'psd2-sync',                'movimientos_bancarios',  max(created_at),     30 FROM movimientos_bancarios
   )
   SELECT cron, tabla, ultimo,
          round(extract(epoch FROM now()-ultimo)/3600, 1) AS horas,
          CASE WHEN ultimo IS NULL OR now()-ultimo > (max_horas||' hours')::interval
               THEN '⛔ MUDO' ELSE '✅' END AS estado
   FROM h ORDER BY estado DESC, horas DESC;
   ```

   - Cualquier fila **⛔ MUDO** es hallazgo 🔴 en el informe, con la causa investigada
     (mira el middleware/auth de la app dueña del endpoint, la env del secreto y los logs
     de runtime por Vercel MCP) y la acción concreta. **Avisa a Alberto** (cuerpo del PR;
     y si está disponible, Telegram). Si un cron es semanal/mensual, ajusta su umbral en
     vez de marcarlo (los diarios son los críticos).
   - Si todo ✅, una línea verde en el informe y sigue.

3. **Informe.** Crea/actualiza `docs/AUDITORIA-<YYYY-MM>.md` con hallazgos por
   severidad (🔴/🟡/🟢), cada uno con `ruta:línea` + acción, y el checklist de acciones
   manuales de Alberto (Supabase/Vercel) con orden seguro y rollback.

4. **Reconciliación de memoria y skills** (el núcleo de esta tarea):
   - `docs/CONTEXTO-SESIONES.md`: añade entrada(s) de lo hecho en el rango que no esté
     anotado; mueve a "hecho" los pendientes ya resueltos; corrige el "Estado actual".
   - Skills-maestro (`central-maestro`, `ia-rest-maestro`, `sivra-maestro`,
     `ialimp-maestro`, `plataforma-maestro`) y los `apps/*/CLAUDE.md`: corrige cualquier
     afirmación que el código contradiga (rutas, envs, tablas, reglas, estado). Si una
     skill y el código discrepan, **manda el código**.
   - `docs/SKILLS.md` (índice vivo): verifica que lista las skills y comandos REALES de
     `.claude/skills/` y `.claude/commands/`; añade los que falten, quita los que ya no
     existan, y corrige las descripciones de "cuándo usar" que estén desactualizadas.
   - **Manuales de usuario final** (que el código nuevo casi nunca actualiza — punto ciego
     histórico). Procedimiento concreto, no "echar un vistazo":
     1. Del `git log` del rango, lista las features VISIBLES para el usuario (rutas nuevas en
        `apps/*/src/app/**`, botones/toggles en componentes, endpoints que cambian el flujo de
        un rol). Ignora cambios internos (libs, tipos, crons sin UI).
     2. Por cada feature visible, comprueba que aparece (por palabra clave) en:
        - `apps/ia-rest/src/components/help/help-prompts.ts` — en el `ROLE_PROMPTS` del/los
          rol(es) afectado(s) (camarero `/edge`, cocina `/kds`, owner `/owner`, etc.).
        - `apps/ia-rest/public/manual.html` (y `public/manuales.html` si aplica).
        Si falta, **parchéala** (es texto, riesgo bajo): añade 1-3 líneas en el rol correcto,
        en el mismo tono que las entradas vecinas.
     3. Los **PDF** de `public/manuals/*.pdf` son binarios generados aparte: NO los toques.
        Deja/actualiza el texto listo para pegar en `docs/manuals-texto-<feature>.md` y anótalo
        como acción manual de Alberto en el informe.
     4. En el cuerpo del PR di explícitamente qué manuales tocaste y cuáles quedan pendientes
        (los PDF). Si todo estaba documentado, dilo y no toques nada.

5. **Arreglos en el acto:** solo bugs de bajo riesgo (típicos de `auditoria-central`).
   Lo de gran radio NO se toca: déjalo como hallazgo + acción manual en el informe.

6. **Entrega = PR draft.** Rama `claude/auditoria-diaria-<YYYY-MM-DD>`. Commitea
   informe + memoria + skills/docs reconciliados. Abre **PR en draft** con el cuerpo =
   resumen ejecutivo del informe (severidades + qué se reconcilió + acciones manuales
   pendientes de Alberto). **Si no hubo ningún cambio que commitear, no abras PR.**

## Reglas
- Nunca ejecutes cortes de envs ni migraciones en producción: documéntalo como acción
  manual de Alberto con rollback.
- No "arregles" `ignoreBuildErrors` (decisión deliberada de las apps).
- Frugal con el ruido: sin cambios → sin PR, sin comentarios.
