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
- **2026-07-19 · agentes-entrenador** · hizo: pasada semanal (rango 03/07→19/07) — evidencia de 5 agentes:
  **pricing-agente/auditoria-central** (18/07, doble conteo de evento autointroducido en #985 y
  autocorregido el mismo día; patrón "cambio de fórmula sin caso de prueba numérico" → capturado como
  regla nueva en `auditoria-central` §2); **facturas-correo** (3 pasadas 03-12/07, un error propio
  OAuth/QUERY autocorregido, ya documentado en su propia skill, sin acción adicional);
  **ialimp-client-health** (17/07, esquema real ≠ el asumido en 3 pasos de la skill — ya autocorregido en
  PR #964, draft pendiente de que Alberto lo revise/mergee, sin acción del entrenador);
  **agente-huésped** (feedback 04/07 de Alberto, ya resuelto en `decidir.ts` en la misma tanda — marcado
  procesado sin PR nuevo). Sin contradicciones/redundancias nuevas detectadas en la pasada transversal de
  skills. dudas: —; fallos: —; PRs/commits: PR draft `claude/entrenador-auditoria-central-2026-07-19`
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-07-19 · pasada semanal (rango 03/07→19/07) · 8 entradas procesadas (pricing-agente ×3,
auditoria-central-pricing ×2, facturas-correo ×3) + 1 auto-informe previo del entrenador (03/07)
podados; 1 acción: regla nueva en `auditoria-central` §2 (PR draft
`claude/entrenador-auditoria-central-2026-07-19`); auto-informe de esta pasada añadido como entrada
pendiente para la siguiente.
