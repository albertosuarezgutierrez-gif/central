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
- **2026-08-09 · agentes-entrenador** · hizo: pasada semanal (rango 29/07→09/08). Evidencia: 27
  entradas de bitácora procesadas y podadas + `FEEDBACK-AGENTES.md` sin pendientes + 5 PR abiertos en
  GitHub (backlog **sano**: bajó de 73→31→**5** tras el barrido de Alberto de 29/07, sin crecimiento
  nuevo — no hace falta escalar). Diagnóstico por agente: **mercado-booking** — los 2 fallos repetidos
  del rango (tope real ~10-12 ventanas por pasada, no 30; latido "perdido" tras 2 disparos el mismo
  día) ya están resueltos con el filtro server-side `?rondas=` (PR #1314, MERGEADO 08/08) — sin acción
  adicional, el `SKILL.md` ya documenta el límite real. **auditoria-diaria** — la sonda `pricing` en
  verde falso ya corregida (PR #1318, MERGEADO). **psd2-health-check** — drift de esquema real: la
  consulta seguía usando la columna `fecha` (no existe; la real es `fecha_operacion`, confirmado contra
  Supabase) — señalado el 05/08, corregido ad-hoc esa pasada pero nunca en el `.md` → corregido ahora
  (`SKILL.md`, 2 líneas; no auto-mergeable por `rutinas-automerge.yml` al no ser fichero de registro,
  así que va en el PR de esta pasada). Resto de agentes con evidencia en rango (ialimp-client-health,
  facturas-correo, pricing-agente, rrhh-compliance-calendar, health-check) sin patrones repetidos (2+)
  que justifiquen tocar prompt — el error del 06/08 en facturas-correo (DIGI duplicada) fue puntual y
  autocorregido en la misma pasada. Los 3 PR docs-only de facturas-correo cerrados sin mergear
  (#1254/#1279/#1286) comparten la misma causa raíz ya diagnosticada (harness sin push a `main`) y ya
  tiene solución estructural (`rutinas-automerge.yml`, desde 08/08) — sin acción nueva. dudas: 2 PR NO
  de agentes llevan >2 semanas abiertos (#755 CSV import 05/07, #1055 mariscos 21/07) — fuera del
  alcance de este agente, solo lo anoto. fallos: 🔇 SIN TELEGRAM (401) — preflight `GET
  /api/internal/alerta` de esta sesión dio 401 (causa: "el token no coincide con el de Vercel ni con
  ningún token de rutina activo en BD", remedio: sincronizar `ALERTA_TOKEN` byte a byte o registrar
  token propio en `rutina_tokens`) — mismo síntoma recurrente ya reportado desde el 26/07, sigue sin
  resolverse; avisado por push nativo en su lugar. PRs/commits: rama
  `claude/upbeat-shannon-0mb3yk` (fix `.claude/skills/psd2-health-check/SKILL.md` + mantenimiento de
  esta bitácora/feedback/memoria).

<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-08-09 · pasada semanal (rango 29/07→09/08) · 27 entradas procesadas y podadas (mercado-booking
×9, sivra_mercado_sweep, auditoria-diaria, ialimp-client-health, facturas-correo ×5, psd2-health-check,
pricing-agente ×2, health-check ×2, rrhh-compliance-calendar, y el resto de arrastre de la poda anterior
que seguía sin borrarse: buscador-ia 27/07 y el auto-informe del entrenador 26/07 — quedaron en el
archivo pese a que la nota de la poda del 29/07 decía haberlos podado; no se pudo determinar la causa,
posible restauración accidental en la resolución de un conflicto de PR; sin impacto, ya estaban
procesados). Backlog de PRs abiertos: **5** (de los 73→31 del barrido de Alberto de 29/07, sigue
bajando, sin crecimiento — no hace falta escalar esta vez). Único fix aplicado: schema drift de
`psd2-health-check` (`fecha`→`fecha_operacion`, confirmado contra Supabase). El resto de fallos del
rango ya estaban resueltos por PRs de las propias sesiones (mercado-booking #1314, auditoria-diaria
#1318) antes de llegar a esta pasada. Auto-informe de esta pasada añadido como entrada pendiente para
la siguiente.
