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
- **2026-07-12 · agentes-entrenador** · hizo: 2ª pasada semanal real (la del 05/07, PR #749, quedó
  abierta sin mergear 7 días y su poda nunca llegó a `main` — reconstruido el rango 03/07→12/07
  entero vía búsqueda GitHub); diagnóstico de los 11 agentes de `docs/SKILLS.md`: **facturas-correo**
  patrón repetido (2+ pasadas) de trabajo real sin dejar entrada en la bitácora central → PR con
  recordatorio temprano en el propio SKILL.md; **buscador-ia** primera pasada real (11/07) impecable
  (cazó 3 de 4 backstops muertos, PR #822 ya aplicado) pero su bitácora vive solo en
  `docs/BUSCADOR-IA.md`, invisible para este agente hasta ahora → añadido a mi propio paso 2 de
  evidencia; **agente-huésped** feedback del 04/07 ya resuelto (PR #741 mergeado) → movido a
  Procesadas; **correo-triaje/pricing-agente/fiscal-novedades/psd2-health-check/
  ialimp-client-health/rrhh-compliance-calendar/github-vigia**: sin patrón nuevo que justifique
  tocar el prompt (bugs de lanzamiento ya reconciliados por auditoría, o sin evidencia esta
  semana); dudas: **agente-huésped ha fallado en vivo a 2 huéspedes distintos con "IA no
  disponible"** (Mirian 04/07, Julien ~07/07) y sus arreglos ya escritos (PR #784 clasificación de
  cancelación multilingüe, PR #792 timeout/logging de fallback) llevan **draft sin mergear desde
  el 07-09** — no es un cambio de prompt que me toque a mí, pero merece el aviso de esta pasada
  para que se mergeen; fallos: mi propia pasada anterior (05/07) dejó un PR de mantenimiento sin
  mergear en vez de commitear directo, rompiendo la continuidad — corregido en el propio SKILL.md
  de esta pasada (mantenimiento sin PR propio); PRs/commits: PR de esta pasada (facturas-correo +
  agentes-entrenador)
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-07-12 · 2ª pasada semanal real · 3 entradas procesadas (2× facturas-correo del rango
03/07-11/07, 1× auto-informe del entrenador del 03/07); rango reconstruido 03/07→12/07 porque la
poda de la pasada intermedia (05/07, PR #749) nunca llegó a `main` (PR sin mergear); auto-informe
de esta pasada añadido como entrada pendiente para la siguiente.
