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

## ✅ Pasada ligera — 14/09/2026

**Nota de proceso:** esta sección es la primera que consigue escribirse aquí desde el 04/09 — no
porque la rutina haya dejado de correr (corrió cada día, ver PRs `#2318`/`#2412`/`#2483`/`#2627`/
`#2741`/`#2877`), sino porque el hallazgo central de `#2877` (13/09) sigue sin resolverse: ver
más abajo. Esta pasada consolida sin re-diagnosticar lo ya encontrado por esas sesiones.

### 🔴 Hallazgo 1 (persistente, sin acción de Alberto): el automerge de carril 1 lleva 9 días bloqueado
Causa raíz ya diagnosticada por `#2877`: `rutinas-automerge.yml` resuelve el conflicto de inserción
pura de los PRs de registro, pero los checks requeridos que corren sobre el commit resultante
(autor `github-actions[bot]`) quedan en `conclusion: action_required` — GitHub exige aprobación
humana para ejecutar workflows disparados por un commit de bot, ningún agente puede pulsarla por
API. Con los checks eternamente pendientes, `mergeable_state` se queda en `blocked`/`dirty` y el
automerge nunca llega a intentar el merge. Consecuencia medida hoy: **11 PRs de auditoría abiertos
sin mergear** (`#2318`, `#2319`, `#2412`, `#2414`, `#2483`, `#2484`, `#2627`, `#2741`, `#2857`,
`#2877`, más los de 06-08/09), de registro y de carril 2 por igual — el propio `#2857` (auditoría
profunda 13/09) sigue en draft. `rutinas-automerge.yml` en sí está sano (miles de runs, éxito
constante hoy sobre PRs normales de sesión — el bloqueo es específico de su propio commit
resultante). **Acción manual de Alberto (repetida por tercera vez, no ejecutable desde aquí):**
Settings → Actions → General → revisar la política de aprobación de workflows para PRs con commits
de `github-actions[bot]`, o aprobar los runs pendientes en la pestaña Actions.

### 🔴 Hallazgo 2 (nuevo/escalando): el motor de pricing SIVRA lleva 71,6 h sin escribir un precio real
Consulta del bloque 2bis: `horas_desde_ultima_pasada = 71,6` (umbral 🔴 > 10h), `noches_ultima_pasada`
corresponde a esa pasada de hace 3 días (33 noches). El latido `sivra_pricing_apply` está `ok=true`
en cada ciclo de hoy (cada ~20-30 min) pero con detalle **"0 noche(s) escritas en 4 piso(s)"** —
el motor corre, decide, y no aplica nada: es el caso de libro que la sección 2bis de esta skill
avisa que un latido verde no basta. Progresión medida en las pasadas de esta semana: ~42h (11-12/09,
`#2857`) → 47,6h (13/09, `#2877`) → **71,6h hoy** — empeora cada pasada sin que nadie lo haya
corregido. Cuando sí escribe, los raíles están sanos (`rail_baja_roto=0`, `bajo_minimo=0`,
`rail_alza_sin_justificar=0`, `oscilantes=0`) y las 4 palancas siguen `enabled`/`apply_enabled=true`
con `min_price` puesto — no es un apagado en silencio, es que las pasadas no llegan a aplicar.
**Pide revisión de Alberto en `/sivra/pricing`** (sin fix de código posible desde una pasada ligera:
no se ha diagnosticado la causa, solo el síntoma).

### Heartbeat de crons/agentes (2-bis) — 4 en rojo, todos ya conocidos
`ses_transporte` (sin alta en SES, pendiente Alberto, desde 21/08). `sivra_rates_snapshot`
(73,1 h, HTTP 401 en los 4 pisos) y `sivra_pilot_track` (70,8 h, consecuencia del anterior): el
mismo Smoobu 401 que `#2877` ya atribuyó a otras sesiones en curso (`#2875`/`#2868`, drafts) —
**sigue sin resolverse hoy**, pese a que `#2741` (12/09) daba el fallo anterior por arreglado
(PR #2731, HMAC-SHA256): o volvió a romperse o la rotación de clave de Smoobu es recurrente.
`psd2_health_check` marca `ok=true` pero su propio detalle declara "ANOMALÍA CRÍTICA: último mov
hace 3 días, causa BBVA sesión CLOSED (HTTP 401), Kutxabank OK" — mismo hallazgo que `#2877`,
sin cambios. Resto de los ~35 agentes con latido ✅ dentro de cadencia (incluida la tanda semanal
de trading, 155-167h, bajo el umbral de 192h).

### 🛡️ Salud de la correduría (2-quater, obligatorio)
Latidos `correduria_renovaciones`/`correduria_ingesta`/`correduria_siniestros`/`correduria_partes`
✅ y frescos (<2h). `correduria_ingesta` sigue "DEGRADADA" con el backlog ya conocido (20 pólizas
huérfanas, 6 resolubles reprocesando, 14 esperando alta de mediador; 28 rechazos/24h de
`webhook_codeoscopic` — Manuel aún no emite el payload real, ver `CONTEXTO-SESIONES.md` 13/09).
Dato que sí es nuevo dentro de ese backlog: **C0058 lleva 83 días sin mandar ningún fichero**,
cuando su mayor hueco histórico hasta ahora eran 2 días — y tiene 9 renovaciones ya vencidas sin
que llegara su fichero (64 pólizas vivas, 12 más vencen en 90 días). No hay acción de código
posible desde aquí; queda anotado para que la próxima pasada compare si sigue subiendo. `cima_pull_*`:
último evento 13/09 15:06 UTC (18h, dentro del umbral de 30h), `queueDepth=136` estable con
`processed=0` en el último pull — la cuarentena conocida, no una parada nueva. Codeoscopic: no
consultado esta pasada (sin cambio esperado, cadencia baja). Aislamiento: cepos no reverificados
línea a línea (pasada ligera). §21 sigue pausada a propósito.

### Backlog de PRs de rutinas + salud del automerge (2-ter)
Ver Hallazgo 1. `rutinas-automerge.yml` corre con normalidad sobre PRs de sesión normales — el
vigilante está vivo, lo que falla es la aprobación de sus propios commits resultantes.

### Reconciliación memoria/skills — sin huecos nuevos
46 commits desde `#2877` (13/09 08:08 UTC), todos con PR propio y aparentemente autodocumentados
(siniestros abiertos/cerrados #2920, agente-huésped reintento #2922, radiografía ×varios). No se
ha revisado commit a commit por volumen (pasada ligera); sin `list_sessions` adjunta, no se cruzan
conversaciones sin commit. No se afirma que no haya huecos, solo que no se han buscado a fondo hoy.

### Canal de aviso — Telegram vía curl BLOQUEADO por Sentinel
Preflight `GET /api/internal/alerta` denegado por `MCP Sentinel [SOMBRA]`: motivo `[CRITICAL]
environment secret piped to network (exfiltration)` — exactamente el bloqueo que
`CONTEXTO-SESIONES.md` (14/09, entrada "Sentinel bloquea TODAS las rutinas...") ya anticipaba para
cualquier rutina que use `ALERTA_TOKEN` por curl en sesión desatendida. Aviso enviado por el canal
nativo de la sesión en su lugar (push); registrado también en `docs/AGENTES-BITACORA.md`.

---
<!-- verificado: 2026-09-14 -->
