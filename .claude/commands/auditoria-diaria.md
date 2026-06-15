---
description: Auditoría diaria del monorepo central — reconcilia memoria + skills + docs con el estado REAL del repo (código/infra) y abre un PR draft con el informe.
---

# Auditoría diaria — `central`

> Pensado para ejecutarse 1×/día desde un **trigger programado** de Claude Code en web,
> o a mano con `/auditoria-diaria`. Su trabajo NO es "releer conversaciones" (no
> persisten: el contenedor es efímero), sino detectar y corregir el **drift** entre lo
> que afirman la memoria/skills/docs y lo que de verdad hace el código y la infra.

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

2. **Auditoría completa.** Invoca la skill **`auditoria-central`** y recórrela ENTERA
   (integridad estructural, typecheck de las 4 apps, tests, seguridad multi-tenant,
   deps, infra real por MCP, coherencia de docs). Distingue error real de ruido de
   entorno; no infles conteos.

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
