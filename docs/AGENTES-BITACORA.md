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
- **2026-07-29 · agentes-entrenador** · hizo: pasada a petición de Alberto ("repara todo") tras
  descubrir que 2 pasadas semanales previas (26/07 PR #1090, 27/07 PR #1108) y varios PRs de otros
  agentes se habían quedado **cerrados sin mergear** en un barrido manual de Alberto (73→31 PR
  abiertos en minutos) — cerrar sin mergear perdió contenido real, no solo ruido. Verificado uno a
  uno contra `main` qué sobrevivió y qué no: **ya estaba** (llegó por otras sesiones) el filtro
  `origen='psd2'` de `psd2-health-check`, el aviso Telegram tras 2 ciclos bloqueados de
  `pricing-agente`, el recordatorio de auto-informe de `facturas-correo`, y el caso de prueba
  numérico de `auditoria-central`. **Se había perdido y se ha reaplicado en esta pasada:** (1) queries
  de `ialimp-client-health` (PR #1084 cerrado 29/07 sin mergear) seguían señalando tablas inexistentes
  (`reservas`/`facturas`) — confirmado con Supabase que aún no existen, reaplicado el fix real
  (`pms_connections`+`cleaning_sessions`, `facturas_clientes`); (2) limpieza de 4 deps muertas
  (`date-fns`/`clsx`/`lucide-react` de ia-rest, `nodemailer` de rrhh — PR #748 cerrado 29/07, aún
  presentes y sin uso real hoy, verificado por grep) — reaplicada + lockfile regenerado + `tsc` 0 en
  ambas apps; (3) doc de `GITHUB_TOKEN` en `apps/sivra/CLAUDE.md` (PR #765 cerrado 29/07, env var
  aún ausente del doc y el código sigue exigiéndola) — reaplicado. Regla del `SKILL.md` propio
  (backlog de PRs) tampoco había sobrevivido → reaplicada con nota nueva sobre este mismo incidente
  (cerrar ≠ resuelto). Limpieza del propio backlog: cerrados 10 PR docs-only ya superados (verificado
  contenido factual ya capturado o resuelto en `main` antes de cerrar, no a ciegas) + reabierto y
  actualizado #1108. Diagnóstico de los pendientes 27-28/07 (ver abajo): sin acción de prompt en
  ninguno (buscador-ia/pricing-agente ya se habían resuelto solos; el guardián `avisado_at` de
  pricing-agente se mergeó minutos antes de esta pasada, PR #1118). **Aviso para seguimiento de
  Alberto (no es acción de prompt):** `pricing_decisiones` sigue vacía desde el 05/07 pese a que el
  fix de middleware (27/07) ya está en producción — verificar que el ciclo semanal del lunes
  produce decisiones reales. dudas: —; fallos: el patrón "PR cerrado sin mergear = trabajo perdido en
  silencio" ya es la 2ª vez que golpea a este mismo agente (antes fue "PR abierto sin mergear");
  PRs/commits: PR de esta pasada (reabre y sustituye #1108).
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

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
