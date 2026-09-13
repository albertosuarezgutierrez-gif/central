# Auditoría — septiembre 2026

## ✅ Pasada ligera — 01/09/2026

**Rango:** 40 commits desde la última auditoría (31/08, `b1f7904`) hasta hoy (`e771dad`), día muy
activo en `apps/asegura` (correduría: cartera en vivo, agente-correduria Fase 0, vencimientos) +
sivra (PIN por reserva, mensajes programados, Agoda) + trading (resolución H9-H15).

### Radiografía de estructura — desfasada, regenerada
`node scripts/auditar-estructura.mjs --check` marcaba `estructura.generated.json` desfasado tras
los 40 commits del rango (mismo patrón que el 26/08, 29/08 y 31/08). Regenerado; `--check` vuelve
a dar ✓.

### 🟡 Hallazgo de código (carril 2): 4 verticales sin entrada curada en `VERTICALES`
El regen del paso anterior avisa: `almacen`, `asegura`, `housesevillana`, `mariscos` no tienen fila
en el array `VERTICALES` de `apps/plataforma/lib/estructura.ts` (sector/desc para el panel de
operador) — nacieron después de que se escribiera esa lista curada y nadie la volvió a tocar. No
rompe nada (el panel simplemente no las lista con su ficha), pero es exactamente el tipo de drift
que esta auditoría existe para cazar. Bajo riesgo (añadir 4 literales, sin lógica), pero es código
→ carril 2. Propuesto en el PR con sector/desc sacados de sus `CLAUDE.md`.

### Heartbeat de crons/agentes (paso 2-bis) — sin `⛔` nuevos
27 agentes en `agente_latidos` + 12 huellas de tabla, todo ✅. Único `ok=false`: `ses_transporte`
(sin ninguna pasada OK, «no hay ningún establecimiento dado de alta») — **ya conocido y documentado**
desde el 21/08 (`docs/CONTEXTO-SESIONES.md`, archivo de agosto): acción pendiente de Alberto en el
portal SES, no un hallazgo nuevo. `agente_reparaciones`: sin intentos en los últimos 7 días (nada
que el reparador automático esté gestionando ni deba investigarse).

### Backlog de PRs de rutinas + salud del automerge (paso 2-ter) — sano
`rutinas-automerge.yml` con decenas de ejecuciones en la última hora (vigilante vivo). 6 PRs
abiertos: `#1803` (correduría, docs-only, en conflicto en la pasada anterior) **ya mergeado** el
31/08 10:55; `#1879` (código, `dirty`, rename Sique Brilla) sigue esperando resolución manual —
conocido desde el 29/08, sin cambios; `#1865` y `#1921` son drafts recientes (<2 días, bajo el
umbral de 7 días de "olvidado"); `#1913` y `#1924` son PRs de código/docs activos de hoy, sin
bloqueo aparente. Ninguno cumple el criterio de 🔴 (registro >24h sin mergear, o draft >7 días).

### 💰 Salud del precio SIVRA (paso 2bis, obligatorio) — sin 🔴
`rail_baja_roto=0` · `bajo_minimo=0` · `rail_alza_sin_justificar=0` · `oscilantes=33` (bajando de
161 el 27/08 y de la cifra intermedia del 29/08 — el serrucho ya diagnosticado sigue en mejora, no
es un hallazgo nuevo) · última pasada hace 1,4h con 5 noches escritas. Palancas: los 4 pisos con
`enabled`/`apply_enabled=true`, `min_price` puesto, `antelacion_k=0` (apagada, correcto) — sin
palancas apagadas en silencio.

### Reconciliación memoria/skills — sin huecos
Las 40 sesiones del rango se auto-documentaron: verificado por keyword contra `docs/memoria/2026-08.md`
que cada commit del rango (PIN por reserva, Agoda, resolución H9-H15, fix SeoStatus, buscador-ia,
mercado-booking, resultado-pisos, buildCommand asegura, middleware operador) tiene su entrada. Skill
`agente-correduria` ya indexada en `docs/SKILLS.md` y `docs/RUTINAS-PROGRAMADAS.md` §21.
`apps/asegura/CLAUDE.md` ya refleja el estado de hoy (cartera en vivo, envs, Codeoscopic) — lo
mantuvieron las propias sesiones del día.

**Rotación mensual ejecutada** (`node scripts/rotar-memoria.mjs`): 535 entradas de agosto →
`docs/memoria/2026-08.md`, 2 de octubre-2025 sueltas → `docs/memoria/2025-10.md`. Quedan 8 entradas
vivas de septiembre en `docs/CONTEXTO-SESIONES.md`.

### Manuales de usuario — nada que tocar
Ningún commit del rango toca `apps/ia-rest/**` con superficie de usuario nueva.

### Frescura FUENTES-DE-VERDAD.md
Sin código nuevo bajo los paths de docs con sello `verificado:` antiguo; nada que reverificar este
rango.

---

## ✅ Pasada ligera — 04/09/2026

**Rango:** ~50 commits desde la última auditoría (01/09) hasta hoy (`212c210`), tres días muy
intensos en `apps/asegura`/`apps/asegura-portal`/`correduria` (rediseño de 5 secciones, ficha con
pestañas, siniestros, portal del cliente, campos por ramo, fusión de fichas duplicadas) y en
pricing SIVRA (guarda del descenso interrumpido, filtro de liga). PRs #2016 (patrimonio-cfo) y
#1997 (trading-analista) siguen en draft de días anteriores, sin acción de este pase (no llevan
código de esta rutina).

### 🟡 Hallazgo: `sivra_domotica_acceso` degradándose (carril 2, sin PR — es un estado, no un bug)
⛔ 67,4 h sin una pasada OK (umbral 30 h; última buena el 01/09 12:40). El detalle de hoy dice
«2 cerradura(s) · 0 PIN creado(s)/borrado(s) · 1 con la ventana desactualizada · **3 con ERROR**» —
subió de **1** cerradura en error (visto de pasada el 02/09, `CONTEXTO-SESIONES.md` línea ~1209) a
**3** hoy. Es un estado conocido y documentado como "no se repara solo a propósito" (Tuya
borra+recrea el PIN), con fallback seguro para el huésped (no se queda en la puerta), pero el
conteo va a peor y nadie lo ha vuelto a mirar desde el 02/09. `agente_reparaciones`: sin intentos
en los últimos 7 días (el reparador automático no lo está tocando — no hay excepción con forma de
SQLSTATE, es un estado de la API de Tuya). **Acción sugerida a Alberto:** abrir `/sivra/domotica` y
revisar las 3 cerraduras en ERROR.

### Heartbeat de crons/agentes (2-bis) — resto ✅
29 filas en `agente_latidos`. `ses_transporte` sigue `ok=false` (ya conocido desde 21/08, pendiente
de Alberto en el portal SES). `sivra_eventos_verificar`/`sivra_eventos` en rojo por fallos
puntuales de búsqueda web (OpenRouter timeout/vacío), dentro de umbral, sin patrón de caída
sostenida. `agente_reparaciones`: sin intentos en 7 días (nada que el automático esté gestionando).

### 🛡️ Salud de la correduría (2-quater, obligatorio) — sin 🔴
Latidos `correduria_renovaciones`/`correduria_ingesta` ✅. La ingesta reporta «DEGRADADA» pero su
propio detalle lo etiqueta como backlog **ya conocido** (3 ficheros sin procesar en 7 días,
sobre todo C0468/M00171; 20 pólizas huérfanas, 3 resolubles reprocesando, 17 esperando carga
inicial de esa clave de mediador; «39 más arrastrados de antes»; recibos SIN sin guardar 63 días
para la clave en cuarentena) — nada nuevo que escalar. `cima_pull_*`: último evento **03/09
15:06** (`queueDepth=130`, `processed=0`); sin evento visible aún para la pasada de las 05:30 UTC
de hoy en el momento de la consulta (~08:15 UTC), pero dentro del umbral de 30 h — se revisa en la
próxima pasada, no es `parada` todavía. Codeoscopic: 0 cotizaciones en 7 días (dato real, count
directo, no NULL colapsado). Aislamiento: cepos vigentes (no verificados línea a línea esta pasada
ligera). §21 sigue pausada a propósito.

### 💰 Salud del precio SIVRA (2bis, obligatorio) — sin 🔴
`rail_baja_roto=0` · `bajo_minimo=0` · `rail_alza_sin_justificar=0` · `oscilantes=5` (bajo) ·
última pasada hace 0,5 h con 58 noches escritas. Palancas: los 4 pisos `enabled`/`apply_enabled`
en `true`, `min_price` puesto, `antelacion_k=0` — sin palancas apagadas en silencio.

### Backlog de PRs de rutinas + salud del automerge (2-ter) — sano
`rutinas-automerge.yml` con decenas de runs en la última hora (vigilante vivo). 7 PRs abiertos,
ninguno cumple el criterio de 🔴 (registro >24h sin mergear o draft >7 días): `#2245`/`#2244`/`#2243`
son de hoy; `#2200` (docs, no-draft) ronda las 23h, a vigilar en la próxima pasada si sigue sin
mergear; `#2188` (auditoría 03/09, draft), `#2016` (patrimonio-cfo, draft) y `#1997`
(trading-analista, draft) llevan 1-3 días sin actividad, por debajo del umbral de 7 días.

### Reconciliación memoria/skills — sin huecos detectados
`docs/SKILLS.md` y `docs/FUENTES-DE-VERDAD.md` ya reflejan `correduria-crm`, `asegura-portal` y el
estado "lee de `seguros.*` de central" — las propias sesiones del rango se autodocumentaron en cada
PR (memoria + `CLAUDE.md` de la app en el mismo commit, patrón visible en #2242/#2237/#2235).
⚠️ **No se pudo listar sesiones** (herramienta de sesiones remotas no adjunta en este entorno): no
se cruzaron conversaciones sin commit contra memoria/PR — no se afirma que no haya pendientes
perdidos, solo que no se ha podido mirar.

### Manuales / HUECOS-ABIERTOS / rotación — sin cambios
Ningún commit del rango toca `apps/ia-rest/**` (manuales no aplica). `docs/HUECOS-ABIERTOS.md` no
revisado línea a línea esta pasada ligera (reservado a la profunda). Sin rotación mensual pendiente
(septiembre sigue abierto).

---
<!-- verificado: 2026-09-04 -->

## 🔴 Pasada PROFUNDA — 13/09/2026

**Rango:** desde la profunda anterior (23/08/2026, `docs/AUDITORIA-2026-08.md`) — casi 3 semanas sin
que una pasada profunda llegara a `main` (las ligeras del 05→12/09 sí corrieron, pero sus PRs de
registro se atascaron, ver más abajo). **Nota sobre el entorno:** esta sesión corre bajo el harness de
tareas de GitHub con una rama fija asignada (no permite push a `main` ni abrir una segunda rama para
separar carriles), así que todo — texto y código — va en este único PR, contra la guía habitual de
"dos carriles" del prompt.

### 🔴🔒 SEGURIDAD — Next.js: RCE no autenticada en las 13 apps (CORREGIDO en este PR)
`pnpm audit --prod` partía de **29 vulnerabilidades: 4 críticas, 9 high, 16 moderadas** (subida desde
las 12/0-críticas de la pasada del 02/08). Las 4 críticas eran **Next.js** (`GHSA-p293-qw3h-jr36` RCE
en Windows y **`GHSA-2xp9-vwfh-vxw4` RCE no autenticada en la API de Image Optimization con AVIF —
esta SÍ aplica en Linux/Vercel**), con las 13 apps resueltas en versiones vulnerables: 12 en
`15.5.18-15.5.22` (parche en `15.5.24`) e `ia-rest` en `16.2.12` (parche en `16.3.3`).
- **Aplicado:** bump de parche a `^15.5.25` (las 12 apps 15.x) y `^16.3.5` (ia-rest) — mismo patrón que
  el bump del 02/08 (PR #1215). Sin cambios de API.
- **Verificado tras el bump:** `pnpm install`, typecheck de las **13** apps (0 errores, incl. `asegura`
  con sus 2 schemas Prisma), `pnpm test` + `pnpm test:guardia` (0 fallos, 3.149+ tests), `next build`
  en `ia-rest` (el bump de major 16.2→16.3) y `sivra` (next-auth beta.32) — los dos con build OK.
  `pnpm audit` re-ejecutado: **29 → 14 vulns, 0 críticas**. Las 14 restantes (xlsx, browserslist,
  nodemailer, qs, sharp, file-type, deepmerge-ts, baseline-browser-mapping) son moderadas/high sin
  parche disponible hoy o de exposición indirecta (dev-time/parsers); no se tocan en este PR.

### 🔴 Correduría — CIMA lleva 35+ horas sin entregar un solo evento (2-quater c)
`seguros.operational_events` (`cima_pull_*`): el último `cima_pull_completed` es de **11/09 15:08 UTC**
(hace **35,4 h** en el momento de la consulta) — supera el umbral de 30 h de "CIMA parada". La cola
seguía en **135 pendientes / 0 procesados** en ese último evento, y `seguros.cima_ficheros` no tiene
ningún fichero nuevo desde el **10/09 09:56**. Sin `agente_reparaciones` en curso (tabla vacía en los
últimos 7 días) — nadie lo está arreglando solo. Por el histórico documentado en `apps/asegura/CLAUDE.md`
(el adaptador Java corre en el Fly de Manuel; si él lo apaga, CIMA deja de entrar SIN error), la
sospecha razonable es esa, pero **no se ha podido confirmar desde aquí** (sin acceso a Fly). **Acción
manual:** comprobar el estado de `asegura-app-cima-adapter` en Fly y los crons de `apps/asegura`
(05:30/11:30 UTC) en Vercel.

### 🔴 Pricing SIVRA — sin una sola aplicación REAL de precio en 42+ horas (2bis, obligatorio)
La consulta del bloque 2bis: `horas_desde_ultima_pasada = 42,1 h` (umbral 🔴 > 10 h). Confirmado con
detalle: el último `pricing_applied` con `dry_run=false` es de **11/09 08:30 UTC**; las pasadas
posteriores (11/09 14:30 y 20:30, 12/09 08:30/14:30/20:30 — 5 pasadas reales) escribieron **0 noches**
cada una según el propio latido `sivra_pricing_apply` ("0 noche(s) escritas en 4 piso(s)"). Palancas
revisadas: los 4 pisos con `enabled=true`, `apply_enabled=true`, `min_price` puesto, `antelacion_k=0` —
nada apagado en silencio. `rail_baja_roto=0`, `bajo_minimo=0`, `rail_alza_sin_justificar=0`,
`oscilantes=0`: cuando SÍ escribe, escribe sano. Coincide en el tiempo con el episodio de abajo
(Smoobu 401 rompiendo `sivra_rates_snapshot` desde el 12/09 07:00), pero **la ventana sin escritura
empieza ANTES de ese fallo** (11/09 14:30), así que el Smoobu 401 no explica el hueco completo — se
declara como "no lo sé" en vez de cerrarlo con una causa no verificada. **Acción manual:** abrir
`/sivra/pricing` y mirar por qué el motor no encuentra ningún cambio ≥3% que aplicar desde el 11/09 por
la tarde (10 alertas de "reserva muy por debajo de mercado" siguen abiertas en el resumen diario, lo
que no encaja con un motor sano que no necesita mover nada).

### 🟡 Heartbeat de crons/agentes (2-bis) — un episodio ya en vías de arreglo, y uno sin seguimiento
- **Smoobu 401 (12/09 07:00-07:31 UTC):** tumbó `sivra_rates_snapshot` (0/4 pisos, todos HTTP 401),
  `sivra_pricing_guard` (check #10 sin evaluar) y dejó `sivra_pilot_track` avisando de snapshot viejo.
  Según el PR #2741 (pasada ligera de ayer, aún sin mergear — ver hallazgo de abajo), otra sesión ya lo
  atribuyó a un cambio de firma (HMAC-SHA256) y lo corrigió en PR #2731 (mergeado esa misma mañana).
  `smoobu_sync` ya volvió a leer bien Smoobu a las 22:15 del 12/09. **Sin confirmar todavía**: el
  siguiente `sivra_rates_snapshot` (~07:00 UTC hoy) no había corrido aún al cerrar esta pasada — revisar
  en la próxima pasada que vuelva a ✅.
- **`sivra_eventos_verificar`** ⛔ 45 h (fallos intermitentes de búsqueda OpenRouter, patrón ya conocido
  de pasadas anteriores — dentro de lo esperado, no un incidente nuevo).
- **Familia `trading_*` (h10, paper-tracker, operaciones, analizar, puntuar)** sin una pasada OK desde
  el **07/09 ~20:45 UTC** (125-138 h). `trading_operaciones` tiene umbral 80 h — **superado**. Coincide
  con que el último PR de la rutina `trading-analista` es del 07/09 (#2573); no hay ninguno posterior.
  **No confirmado si la rutina dejó de dispararse o simplemente no se ha registrado** — carril 2, sin
  investigar a fondo por presupuesto de esta pasada.

### 🔴 Backlog de PRs de rutinas — el propio canal de entrega de la auditoría lleva 8 días atascado (2-ter)
Confirmado y agravado desde que otra sesión ya lo señaló ayer (PR #2741, aún sin mergear): los PRs de
**registro** de la propia `/auditoria-diaria` se acumulan sin mergear pese a que `rutinas-automerge.yml`
está vivo (miles de runs, éxitos constantes hoy mismo en PRs de OTRAS sesiones — #2848/#2853/#2855/#2856
mergeados en las últimas horas). Estado verificado ahora mismo:
- **#2318** (05/09, registro) — `mergeable_state: dirty` (conflicto real). 8 días.
- **#2483** (07/09, registro) — `mergeable_state: blocked` (los 12 checks requeridos nunca arrancan —
  push con token de App, ver sección CI de `CLAUDE.md`; Vercel-only en `get_status`). 6 días.
- **#2741** (12/09, registro, de la sesión que ya diagnosticó este mismo problema) — también `blocked`.
  1 día, pero ya empieza a acumular el mismo destino.
- Consecuencia medible: **este documento llevaba desde el 04/09 sin una entrada nueva** pese a que la
  rutina sí corrió los días 05, 07, 08 y 12 — la impresión de "rutina muerta" era falsa (los PRs
  existen), pero el efecto práctico (nadie ve el informe en `main`) es el mismo.
- **Esta pasada NO añade un PR de registro nuevo** (dado el punto anterior, apilar uno más sin resolver
  los existentes no ayuda): todo el contenido de esta pasada — texto y código — va en el único PR que
  este entorno permite.
- **Acción manual recomendada a Alberto:** revisar y resolver a mano #2318 (conflicto real: traer
  `main` a la rama) y decidir sobre #2483 (aplicar el procedimiento de la sección CI — sacar de draft
  ya está hecho, así que el siguiente paso es un push con contenido real, p.ej. el propio merge de
  `main`) antes de que seguir apilando PRs de registro sea contraproducente.
- **8 drafts de carril 2 sin actividad 4-9 días** (#2262, #2319, #2327, #2412, #2413, #2414, #2484,
  #2534, #2548, #2573, #2627 — lista ampliada desde los 8 que ya señalaba #2741): ninguno pasa el
  umbral de 7 días salvo #2262 (04/09, 9 días) y #2319 (05/09, 8 días). Revisar/cerrar en lote.

### Correduría — resto de 2-quater sin novedad
Latidos `correduria_renovaciones`/`correduria_siniestros`/`correduria_partes` ✅. `correduria_ingesta`
sigue "DEGRADADA" con el mismo backlog ya documentado (ficheros C0468/M00171, pólizas huérfanas,
Occident C0058 81 días sin mandar nada). Codeoscopic: 13 cotizaciones / 6,50€ en 7 días, gasto normal,
sin anomalía de importe. Cepos de aislamiento no re-verificados línea a línea esta pasada (sin cambios
en `seguros.*`/`lib/tenant*`/el puerto en el rango). §21 sigue pausada a propósito.

### Typecheck + tests + build — 0 errores (aparte del bump de seguridad)
Las 13 apps typechecan limpio (incl. `asegura` con sus 2 schemas Prisma, generados en el orden correcto
para no pisar el cliente Prisma por defecto compartido). `pnpm test` (packages + guardián, 2.785+53
tests) y `pnpm test:guardia` (821 tests) en verde. Tests de `packages/module-seguros{,-pii,-portal}`
(cifrado + índice ciego de la correduría): 1.056 tests, 0 fallos. `ia-rest`: lint 0 errores (1.225
warnings preexistentes), QA-check 818 archivos sin problemas, build OK.

### Lo que esta pasada NO cubrió (declarado, no olvidado)
Por el volumen ya encontrado (seguridad crítica + 2 incidentes operativos + backlog de PRs), esta
pasada NO hizo la reconciliación completa del paso 4 (skills-maestro, `docs/SKILLS.md`,
`docs/HUECOS-ABIERTOS.md` línea a línea, manuales de usuario, `docs/FUENTES-DE-VERDAD.md`). Queda para
la próxima pasada — que además debería confirmar si `sivra_rates_snapshot` volvió a ✅ y si el motor de
pricing volvió a aplicar precios reales.

<!-- verificado: 2026-09-13 -->
