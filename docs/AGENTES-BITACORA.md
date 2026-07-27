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
- **2026-07-27 · buscador-ia** · hizo: pasada semanal completa. Watch de deprecación (Paso 1): los 4
  eslabones de la cadena directa (NIM 70B, Groq gpt-oss-120b, Gemini `gemini-flash-latest`, Kimi k2.6)
  confirmados VIVOS por primera vez sin ningún roto — el alias rodante de Gemini absorbió solo el salto
  a 3.5 Flash GA. Descubrimiento (Paso 2): `z-ai/glm-5.2` gratis en NIM, candidato fuerte pendiente de
  mini-eval con key real. Respondió pregunta ad-hoc de Alberto sobre MiMo-V2.5 (de pago/self-host, fuera
  de la cadena gratis). Actualizado `docs/BUSCADOR-IA.md`. Además, a petición de Alberto, se amplió el
  criterio de selección del agente: ya no exige gratis, compara por calidad/precio (a igualdad gana el
  gratis; un swap gratis→pago sigue exigiendo Telegram, nunca PR mecánico) — cambio en `SKILL.md` +
  `docs/SKILLS.md`. dudas: no pude confirmar si `deepseek-ai/deepseek-v3` (default de `CONTABLE_MODEL`)
  sigue vivo en NIM — WebFetch directo a build.nvidia.com da 403 (proxy) y esta sesión no tiene
  `NVIDIA_API_KEY` para probar por `curl`; el catálogo actual solo muestra variantes v3.1/v3.2/v4, no
  evidencia de rotura pero tampoco confirmación. fallos: —. PRs/commits: PR #1103.
- **2026-07-27 · pricing-agente (3ª parte)** · hizo: ciclo semanal completo de los 4 pisos. Encontró la
  causa raíz REAL de los 3 ciclos bloqueados (la 2ª parte de hoy portó los endpoints a plataforma pero
  `middleware.ts` seguía sin eximirlos → 307 a /login antes de que `isRoutineAuthorized` corriera pese a
  llevar `ALERTA_TOKEN` válido); arreglado añadiéndolos a `PUBLIC` (mismo patrón que `/api/internal/alerta`,
  sin cambiar comportamiento de precio). Paso 2 (mercado) ejecutado por Supabase directo mientras el fix no
  esté desplegado: 30 comps nuevos hoy (luxury may/jul-2027 20 + house ago-2026 10, que estaba a 0). Verificación
  obligatoria: house=10, duplex=10, busto=30, luxury=30 — ningún piso a 0 hoy. Paso 4 sigue sin decisiones
  reales (`pricing_decisiones` vacía desde 05/07) hasta que el PR se mergee y Vercel despliegue — NO se
  fabricó nada a mano. dudas: si el fix del middleware no es evidente para el próximo ciclo, revisar si el
  PR ya se mergeó antes de repetir el diagnóstico de red/dominio; fallos: —. PRs/commits: 89c8114 (pendiente
  de abrir PR).
- **2026-07-27 · pricing-agente (2ª parte)** · hizo: RESUELTO el bloqueo de 3 ciclos, por código y sin tocar
  red ni secretos. El diagnóstico del entorno destapó que `CRON_SECRET` nunca llegó a estar en "Default", que
  la allowlist solo tiene `plataforma-ten-flame.vercel.app` (ningún dominio de sivra → el 403), y que el campo
  de variables **avisa de ser texto plano visible** — justo lo que ya preveía `cron-auth.ts` ("a las rutinas no
  se les da la llave maestra"). Solución: usar lo YA permitido — `/api/sivra/mercado/ingest` de plataforma
  acepta ahora `isRoutineAuthorized` (`ALERTA_TOKEN`), y se PORTA el endpoint de raíles a plataforma
  (`/api/sivra/pricing/aplicar-propuesta`, copia fiel de las 9 guardas). **Privilegio escalonado:**
  `ALERTA_TOKEN` → solo dry-run (fuerza `dryRun=true`); en vivo exige `CRON_SECRET` o sesión — el token que
  viaja en prompts nunca mueve dinero real. Skill actualizado (usar plataforma, jamás sivra).
  dudas: —; fallos: —. Verificado `tsc` 0 · guardián de secretos 22/22; PRs/commits: #1101.
- **2026-07-27 · pricing-agente** · hizo: 3er ciclo bloqueado en Paso 4, pero a petición de Alberto se
  ejecutó el Paso 2 por Supabase — 50 comps Booking de agosto-2026 escritos en `market_rates` replicando el
  `INSERT ... ON CONFLICT` exacto de `/api/mercado/ingest` (busto 30 comps en 8/15/22-ago; luxury 10 y duplex
  10 en 8-ago). **Corrección grande: agosto de Busto estaba a p50 137€ con barrido del 05/07 → real 82€
  (~67% inflado)**; el motor llevaba semanas tarificando contra un mercado inexistente. **Hallazgo que
  descarta la hipótesis de datos en Luxury: sus comps NO estaban mal (120€ real = 120€ en BD), luego sus
  214€ en vivo a 5 días vista son del MOTOR (no suaviza bastante cerca de fecha en temporada baja)** →
  pendiente de revisar la curva de last-minute con dryRun + OK de Alberto (cambio de precio en vivo).
  dudas: si `min_price=115` de Busto (>p50 real de agosto, 82€) debe revisarse — es correcto por coste de
  subarriendo, pero deja a Busto al suelo casi todo el mes; fallos: Paso 4 NO ejecutado y NO simulado
  (no se fabricó `pricing_decisiones`); causa raíz ampliada — además de faltar `CRON_SECRET`, **el proxy de
  red de la sesión da 403 en CONNECT a `*.vercel.app`**, así que los endpoints de sivra son inalcanzables por
  HTTP con o sin secreto (por eso solo funcionaba el rodeo `pg_net`, que corre dentro de Supabase). Sin
  refrescar: house (8p) y fechas 4p más allá del 8-ago; PRs/commits: esta rama.
- **2026-07-26 · agentes-entrenador** · hizo: pasada semanal (rango real 03/07→26/07 — el intento previo del
  19/07 quedó en un PR draft sin mergear, `claude/entrenador-auditoria-central-2026-07-19` #1008, así que la
  poda de main nunca se aplicó; esta pasada la retoma y la completa). Evidencia de 24 entradas de bitácora
  (repartidas en 11 PRs abiertos sin mergear + main) más `docs/FEEDBACK-AGENTES.md`. Diagnóstico por agente:
  **pricing-agente** — bloqueo REPETIDO (20/07 y 22/07) del Paso 4 (`aplicar-propuesta` dryRun) por falta de
  `CRON_SECRET` en la sesión programada, quedando solo como «pendiente» silencioso en la bitácora dos
  semanas seguidas → añadida regla de escalado por Telegram tras 2 ciclos bloqueados (`SKILL.md`); el doble
  conteo de evento del 18/07 ya tenía su lección capturada (ver abajo, reaplicada de #1008 que seguía sin
  mergear). **facturas-correo** — patrón repetido 3ª vez (11/07, 12/07, 24/07) de sesiones que procesan
  correo real sin dejar entrada aquí → reforzado en Paso 0 que la entrada es obligatoria aunque la sesión
  sea ad-hoc o se corte a medias. **psd2-health-check** — falsa alarma 22/07 por no filtrar `origen='psd2'`
  (mezclaba el feed real con importaciones manuales) → añadido el filtro + nota explicativa. **auditoria-
  central** — reaplicada la regla de caso de prueba numérico para cambios de fórmula de pricing (ya
  redactada en el PR #1008 sin mergear; se repite aquí para no depender de que Alberto rescate ese PR).
  **ialimp-client-health** — esquema real ≠ el asumido en el SKILL.md (tablas `reservas`/`facturas`
  inexistentes) ya autocorregido por la propia sesión en PR #1084 (abierto, sin mergear) — sin acción
  adicional, solo señalado para que se mergee. **agente-huésped** — feedback del 04/07 y la regla «nos
  vemos» del 25/07 ya resueltas en `decidir.ts` en sus propias tandas (PRs #1088 y anterior, ambos
  mergeados) → feedback marcado procesado. **buscador-ia** — pasada 20/07 sana, WebFetch 403 puntual
  (resuelto con WebSearch) sin repetirse aún, sin acción. Sin evidencia suficiente para juzgar
  `trading-analista`, `github-vigia`, `fiscal-novedades`, `rrhh-compliance-calendar`, `correo-triaje` en
  este rango (no dejan entrada en esta bitácora — actividad real la hay, ver `CONTEXTO-SESIONES.md`, pero
  no en el formato que consume este agente). **Hallazgo transversal (no accionado, para que Alberto
  decida):** hay ≥11 PRs `claude/*` abiertos sin mergear solo con cambios de `docs/AGENTES-BITACORA.md` u
  otros docs de auto-informe — mientras sigan abiertos, la poda de este agente no "cuadra" con main y cada
  pasada tiene que ir a buscar la evidencia PR a PR en vez de solo leer el archivo. dudas: —; fallos: (1)
  el intento del 19/07 (rama `claude/upbeat-shannon-5j9re4`/PR #1008) hizo el trabajo pero nunca se
  mergeó — posible causa: el carril 2 abre PR pero nadie lo revisa si no hay aviso Telegram que aterrice
  o si el aviso se pierde; (2) **el propio aviso Telegram de ESTA pasada falló** —
  `POST {PLATAFORMA_URL}/api/internal/alerta` con el `ALERTA_TOKEN` de la sesión devolvió `401 No
  autorizado` (token no coincide con el `ALERTA_TOKEN`/`CRON_SECRET` real en Vercel prod, o la env no
  está puesta) — mismo síntoma que el bloqueo de `pricing-agente` por secreto ausente/incorrecto en
  sesión programada. Avisado a Alberto por el canal nativo de la rutina (push) en su lugar; **pendiente
  de Alberto:** verificar que `ALERTA_TOKEN` en Vercel plataforma coincide con el que reciben las
  sesiones programadas — si este endpoint falla en silencio, TODOS los avisos Telegram de agentes
  (`psd2-health-check`, `pricing-agente`, `facturas-correo`…) están mudos ahora mismo; PRs/commits: esta
  rama (`claude/upbeat-shannon-934ce5`, PR #1090)
<!-- Los agentes insertan aquí. Ejemplo:
- **2026-07-05 · facturas-correo** · hizo: 12 correos revisados, 3 facturas archivadas en
  Drive, 2 conciliadas con banca; dudas: recibo de Endesa sin CIF visible (a "Para tu
  decisión"); fallos: —; PRs/commits: —
-->

## Última poda

2026-07-26 · pasada semanal (rango real 03/07→26/07, retomando el intento del 19/07 que quedó sin
mergear en PR #1008) · 10 entradas de agentes procesadas (pricing-agente ×5, auditoria-central-pricing
×2, facturas-correo ×3) + 1 auto-informe previo del entrenador (03/07) podados · 4 acciones (carril 2,
todas en la misma PR de esta pasada por restricción de rama única de la sesión): regla de escalado por
Telegram en `pricing-agente` (bloqueo repetido de CRON_SECRET), refuerzo del auto-informe obligatorio en
`facturas-correo` (3ª vez que se pierde), filtro `origen='psd2'` en `psd2-health-check` (falsa alarma
22/07), y la regla de caso de prueba numérico en `auditoria-central` (reaplicada de #1008, que sigue sin
mergear). Sin acción: `ialimp-client-health` (fix ya en PR #1084 sin mergear) y `agente-huésped`
(feedback 04/07 ya resuelto, marcado procesado). Auto-informe de esta pasada añadido como entrada
pendiente para la siguiente.
