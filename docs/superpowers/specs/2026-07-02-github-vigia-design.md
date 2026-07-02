# Diseño — `github-vigia` (vigía mensual de GitHub/OSS)

**Fecha:** 2026-07-02 · **Estado:** aprobado por Alberto (sesión 02/07)

## Problema
Las mejoras del monorepo dependen de un ecosistema OSS que se mueve (VROOM, OSRM,
openrouteservice, Leaflet, Traccar, web-push…) y de dependencias npm que envejecen.
Hoy nadie vigila ni releases relevantes, ni herramientas nuevas por vertical, ni
avisos de seguridad — se descubren por casualidad en sesiones de chat.

## Decisión (enfoque elegido: una sola skill, mensual)
Una skill programada **`github-vigia`** con tres patas en una sola pasada mensual:

1. **Releases vigilados** — lista curada en `docs/VIGIA-OSS.md` (repo, por qué nos
   importa, última versión vista). Consulta por **WebFetch** a la API pública de
   GitHub (`api.github.com/repos/<owner>/<repo>/releases/latest`, o tags si no hay
   releases). ⚠️ El MCP de GitHub de la rutina está scopeado a `central`: para repos
   externos SIEMPRE WebFetch/WebSearch.
2. **Descubrimiento** — 2-3 búsquedas WebSearch dirigidas por vertical (routing/flota,
   pisos turísticos, hostelería/TPV, RRHH), contrastadas con los pendientes reales
   (memoria + maestros). Criterio, no listas genéricas.
3. **npm** — `pnpm outdated` + `pnpm audit` sobre el monorepo, filtrado a lo que
   afecta a producción (majors con breaking changes que nos toquen, CVEs en deps vivas).

## Salida (dos carriles, como la auditoría)
- **Carril texto:** actualizar `docs/VIGIA-OSS.md` (versiones vistas + bitácora de
  hallazgos) — es el estado entre ejecuciones; el contenedor es efímero.
- **Carril acción:** si algo merece ojo humano (CVE serio, release que desbloquea un
  pendiente, herramienta claramente mejor) → aviso **Telegram** vía
  `POST {PLATAFORMA_URL}/api/internal/alerta` (Bearer `CRON_SECRET`). Si además el
  arreglo es un bump de dependencia pequeño y seguro → **PR draft**
  `claude/github-vigia-<fecha>`.
- **Sin novedades relevantes → sin ruido** (solo el doc de estado actualizado).

## Alternativas descartadas
- **B) npm semanal separado del resto:** más rutinas que mantener; la auditoría
  profunda dominical ya corre tests y puede absorber un `pnpm audit` si hiciera falta.
- **C) Dependabot:** en un monorepo con 8+ `package.json` y deps `file:` genera ruido
  mecánico sin criterio de relevancia — justo lo que la skill sí aporta.

## Cadencia y registro
- Mensual, **día 15 ~07:00 CEST** (el día 1 ya tiene dos rutinas).
- Rutina 9 en `docs/RUTINAS-PROGRAMADAS.md`; fila en `docs/SKILLS.md`.
- Trigger manual de Alberto en `claude.ai/code → Rutinas` con prompt
  `Ejecuta la skill github-vigia` + `PLATAFORMA_URL`/`CRON_SECRET` en instrucciones.

## Fuera de alcance
- Sin BD (el estado vive en `docs/VIGIA-OSS.md` commiteado).
- No aplica bumps automáticamente a `main`; el código siempre va por PR draft.
- No sustituye a la auditoría (esa reconcilia docs↔código; esta mira hacia FUERA).
