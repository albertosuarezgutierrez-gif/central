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
- **2026-08-02 · agentes-entrenador** · hizo: pasada semanal (rango 29/07→02/08, 6 entradas de
  bitácora previas). Diagnóstico por agente: sin patrones repetidos (2+) sin resolver — el Check 4
  del health-check ya se reescribió sobre latido real por sesión interactiva (30/07, PR #1192,
  mergeado); la trampa `rate_snapshots.price_ours` de `pricing-agente` ya quedó documentada en
  `references/ciclo.md` tras su 2ª falsa alarma (31/07), verificado que el aviso sigue presente;
  `rrhh-compliance-calendar` y `pricing-agente` (check-in 31/07, auditoría pre-cutover 30/07) sin
  incidencias que tocar prompt. Revisión transversal: regla de backlog del propio `SKILL.md`
  (guardada el 29/07) sigue presente, verificada. Backlog de PRs abiertos `claude/*`: **24** (bajó de
  31 el 29/07 — no ha crecido, no se re-escala), el más antiguo #728 (03/07, 30 días). Sin pendientes
  en `FEEDBACK-AGENTES.md`. Ninguna acción de carril 1 ni carril 2 esta pasada. dudas: —; fallos:
  preflight del canal de aviso dio **401** (`ALERTA_TOKEN` de este entorno desincronizado del de
  Vercel `plataforma`) — sin contenido que avisar esta pasada (cero acciones), pero el canal seguía
  mudo; avisado por push nativo `🔇 SIN TELEGRAM (401):`; PRs/commits: —.
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-08-02 · pasada semanal · 6 entradas procesadas y podadas (health-check 30/07 sesión interactiva +
health-check continuación 01/08 + rrhh-compliance-calendar 01/08 + pricing-agente auditoría pre-cutover
30/07 + pricing-agente check-in 31/07 + auto-informe del entrenador 29/07). Diagnóstico: sin patrones
repetidos sin resolver — Check 4 del health-check y la trampa `price_ours` de pricing-agente ya se
habían corregido/documentado por las propias sesiones antes de esta pasada, verificado que sobrevivió
en `main`/`references`. Sin acción de carril 1 ni carril 2. Backlog de PRs abiertos: 24, bajó de 31
(29/07) — no ha crecido, sin re-escalar. Canal de aviso en 401 (`ALERTA_TOKEN` de este entorno
desincronizado); sin contenido que perder porque no hubo acciones esta pasada. Auto-informe de esta
pasada añadido como entrada pendiente para la siguiente.

2026-07-29 · pasada a petición de Alberto ("repara todo") · 6 entradas procesadas y podadas
(auto-informe del entrenador del 26/07 + buscador-ia 27/07 + pricing-agente 27/07 ×3 + pricing-agente
28/07 + facturas-correo 28/07). Causa raíz de esta pasada: Alberto cerró en bloque ~40 PR sin mergear
(73→31), incl. 2 pasadas propias del entrenador (#1090, #1108) y varios de otros agentes — verificado
uno a uno qué contenido sobrevivió a `main` por otras vías y qué se había perdido de verdad. Reaplicado
lo perdido: fix de esquema real en `ialimp-client-health` (PR #1084), limpieza de 4 deps muertas
(PR #748), doc `GITHUB_TOKEN` de sivra (PR #765), regla de backlog de PRs del propio `SKILL.md`
(PR #1108, ampliada con la lección de "cerrado ≠ resuelto"). Ya estaba en `main` por otras sesiones
(sin re-aplicar): escalado Telegram de `pricing-agente`, recordatorio de auto-informe de
`facturas-correo`, filtro `origen='psd2'`, caso de prueba numérico de `auditoria-central`. Sin acción
de prompt en los agentes: `buscador-ia`/`pricing-agente` (27-28/07) ya resueltos en sus propias
sesiones. Limpieza del backlog de PRs: 10 cerrados (contenido verificado ya capturado/resuelto en
`main`), #1108 reabierto y actualizado. Auto-informe de esta pasada añadido como entrada pendiente
para la siguiente.
