---
name: github-vigia
description: Agente PROGRAMADO mensual (día 15) que vigila el ecosistema GitHub/OSS — releases de los repos curados en docs/VIGIA-OSS.md, descubrimiento por vertical, y deps npm desactualizadas o con CVE. Actualiza docs/VIGIA-OSS.md, Telegram + PR draft solo para bumps seguros. Úsala si Alberto pide "revisa las novedades de GitHub / del ecosistema". Sin secretos.
---

# Vigía GitHub/OSS — releases, descubrimiento y npm

Vigila **hacia fuera** (el ecosistema), no hacia dentro (eso es `/auditoria-diaria`).
Entorno **efímero**: cada ejecución es una pasada completa e idempotente. El estado
entre ejecuciones vive en **`docs/VIGIA-OSS.md`** (commiteado).

> ⚠️ **El MCP de GitHub de la rutina está scopeado al repo `central`** — y el proxy del
> entorno también intercepta `api.github.com` (403 fuera de `central`, verificado 02/07/2026).
> Para repos EXTERNOS usa: la **página web** `https://github.com/<owner>/<repo>/releases/latest`
> por WebFetch, el registro npm `https://registry.npmjs.org/<pkg>/latest` por curl para
> paquetes npm, y **WebSearch**. No uses `mcp__github__*` fuera de `central`.

## Paso 0 — Cargar contexto
1. Lee `docs/VIGIA-OSS.md`: lista de repos vigilados con su última versión vista y
   por qué nos importan.
2. Lee los pendientes vivos: sección «Estado actual» de `docs/CONTEXTO-SESIONES.md`
   y los «Estado / pendientes» de los maestros que toquen (transporte, sivra, ialimp,
   plataforma). La relevancia de una novedad se juzga SIEMPRE contra estos pendientes.

## Paso 1 — Releases de los repos vigilados
Para cada repo de la lista:
1. `WebFetch https://github.com/<owner>/<repo>/releases/latest` (página web, NO la API —
   ver aviso arriba). Si el repo no publica releases, cae a `.../tags`. Para paquetes
   npm, `curl https://registry.npmjs.org/<pkg>/latest` da la versión directa.
2. Si la versión ≠ la última vista: lee las release notes y juzga si el cambio nos
   afecta (¿desbloquea un pendiente? ¿breaking change en algo que usamos? ¿CVE?).
3. Anota SIEMPRE la versión nueva en `docs/VIGIA-OSS.md` (aunque no sea relevante);
   si es relevante, añade una línea a la bitácora de hallazgos con el porqué y la URL.

## Paso 2 — Descubrimiento de herramientas nuevas
2-3 búsquedas **WebSearch** dirigidas, rotando el foco entre verticales según sus
pendientes (ej.: optimización de rutas/flota, channel managers/pisos turísticos,
TPV/hostelería, RRHH/nóminas, y lo transversal: push, fiscal, Telegram). Regla de
oro: **solo cuenta lo que resuelve un pendiente real o mejora claramente algo que ya
tenemos** — nada de listas genéricas de "awesome-X". Máximo 3 candidatos por pasada,
cada uno con: qué es, licencia, madurez (releases/actividad) y a qué pendiente sirve.
Los candidatos que pasen el corte se añaden a la bitácora (y a la lista de vigilados
si merecen seguimiento).

## Paso 3 — Dependencias npm
1. `npx --yes pnpm@10.33.0 outdated -r` en la raíz (si el recursivo falla en algún
   paquete, pásalo por app: `apps/*`, `packages/*`).
2. `npx --yes pnpm@10.33.0 audit --prod` (o por app) para CVEs.
3. Filtra con criterio: **majors** solo si el breaking change nos toca de verdad;
   **CVEs** solo en deps que corren en producción (no devDependencies de tooling).
   Ignora el ruido de patch/minor sin CVE.

## Paso 4 — Salida (dos carriles)
- **Texto (siempre):** actualiza `docs/VIGIA-OSS.md` — versiones vistas, fecha de
  pasada y bitácora de hallazgos. Commitea (la rutina corre en su propia rama/PR
  draft si el trigger lo pide; a mano, en la rama de trabajo).
- **Acción (solo si la hay):**
  - Algo merece ojo humano (CVE serio, release que desbloquea un pendiente,
    herramienta claramente mejor) → **aviso Telegram**:
    `POST {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`
    y `{ "text": "🔭 github-vigia: <resumen con URLs>" }`. Si faltan las envs, omite
    el aviso (no falles). (`ALERTA_TOKEN` = token estrecho de este endpoint; acepta también el
    viejo `CRON_SECRET` por compat, pero NO metas la llave maestra en el prompt.)
  - El arreglo es un **bump de dependencia pequeño y seguro** (patch/minor con CVE,
    sin breaking changes) → **PR draft** `claude/github-vigia-<fecha>` con el bump y
    el porqué en el cuerpo. Código NUNCA directo a `main`.
- **Sin novedades relevantes → sin ruido**: solo el doc de estado actualizado y un
  resumen en el chat ("sin novedades relevantes; revisado a fecha X").

## Reglas
- No inventes versiones ni changelogs: sin URL de fuente, no se anota.
- No apliques majors ni refactors por tu cuenta: eso es decisión de Alberto (Telegram + bitácora).
- Idempotente: re-ejecutar el mismo día no duplica avisos ni entradas de bitácora.
- Mantén la lista de vigilados curada: si un repo lleva >6 meses muerto o dejó de
  importarnos, proponlo para quitar (no lo borres en silencio).

## Auto-informe (obligatorio al terminar la pasada)

Antes de cerrar, añade UNA entrada arriba del todo de la sección "Entradas pendientes de
procesar" de `docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · <nombre-de-esta-skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

- Sin dudas ni fallos → `dudas: —; fallos: —` (el "todo bien" también es señal).
- Commitea la entrada con el resto de tu trabajo (o en un commit propio a `main` si la
  pasada no tocó el repo). La consume el `agentes-entrenador` (semanal) para mejorar este
  prompt; si no queda escrita, esta pasada no existió para él.

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → el canal está vivo, sigue con tu pasada.
- `401` → el canal está **mudo** (el token de ESTE entorno no coincide con el de Vercel `plataforma`;
  hay un entorno por rutina y se desincronizan de uno en uno). El cuerpo trae `causa` y `remedio`.
  Entonces, según `docs/AVISOS-AGENTES.md`: avisa por el **push nativo** de la sesión empezando por
  `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md` (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.
