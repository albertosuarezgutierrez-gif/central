# Bitácora de auto-informes de agentes — `central`

> **Para qué.** Cada agente programado (skill de `docs/SKILLS.md` § "Agentes programados")
> deja aquí UNA entrada por ejecución: qué hizo, qué dudó, qué falló. Es la materia prima
> del `agentes-entrenador` (rutina semanal) para mejorar los prompts por RENDIMIENTO real,
> no por intuición. El contenedor es efímero: si no queda escrito aquí, no existió.
>
> **Cómo se mantiene.** Los agentes SOLO añaden entradas arriba del todo (3-5 líneas máx.,
> en el mismo commit/PR de su pasada, o en un commit propio a `main` si su pasada no tocó
> el repo). El `agentes-entrenador` PODA las entradas ya procesadas en su pasada semanal
> (git guarda el histórico; este archivo no engorda). Nadie más borra aquí.
>
> **Formato por entrada (una línea de lista, multilinea si hace falta):**
> `- **YYYY-MM-DD · <skill>** · hizo: …; dudas: …; fallos: …; PRs/commits: #xxx / SHA / —`
> Sin dudas ni fallos → escribir `dudas: —; fallos: —` (el "todo bien" también es señal).

## Entradas pendientes de procesar (lo más reciente arriba)
- **2026-07-05 · agentes-entrenador** · hizo: primera pasada semanal real (evidencia: bitácora 07-03,
  `AUTO-APLICADOS.md`, `CONTEXTO-SESIONES.md`, commits 03–05/07, PRs #725/#728/#739/#741/#742/#743/
  #744/#745/#746/#747/#748) — diagnóstico de los 9 agentes de `docs/SKILLS.md`: **facturas-correo**
  (2 pasadas, 07-03 y 07-04/PR#742; el blocker del Apps Script `_buzon_pdf` ya está documentado en la
  skill desde el 02/07 con instrucciones claras → sin patrón nuevo, sin acción); **correo-triaje** (3
  bugs de lanzamiento #743/#744/#745 el mismo día — ya reconciliados y explicados con causa raíz en
  `.claude/skills/correo-triaje/SKILL.md` por `/auditoria-diaria` → sin acción adicional, sería
  redundante); **agente-huésped SIVRA** (hallazgo de Alberto: afirmaba haber cancelado una reserva sin
  ejecutar nada — YA corregido en el PR #741 abierto, que además amplía el scope del entrenador para
  cubrir agentes cuyo prompt vive en código; no duplico ese trabajo); **pricing-agente / fiscal-novedades
  / psd2-health-check / ialimp-client-health / rrhh-compliance-calendar / github-vigia**: sin evidencia
  esta semana (no han corrido o no dejaron rastro); dudas: si el agente contable (Telegram,
  `lib/contable/*`, PRs #726-738/#747) debería sumarse también al scope formal como agente-huésped —
  lo dejo pendiente de que se mergee #741 para no tocar el listado dos veces en paralelo; fallos: —;
  PRs/commits: — (esta pasada no abre PR propio; el único hallazgo accionable ya lo cubre #741)
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-07-05 · primera pasada semanal real · 2 entradas procesadas y podadas (facturas-correo 07-03,
auto-informe del entrenador 07-03); sin carril 2 propio esta pasada — el único hallazgo accionable
(agente-huésped SIVRA) ya lo cubre el PR #741 abierto por otra sesión; auto-informe de esta pasada
añadido como entrada pendiente para la siguiente.
2026-07-03 · primera pasada (manual, validación) · 0 entradas de agentes procesadas (ningún agente había corrido aún — sistema activado hoy); auto-informe del entrenador añadido como entrada pendiente para la siguiente pasada.
