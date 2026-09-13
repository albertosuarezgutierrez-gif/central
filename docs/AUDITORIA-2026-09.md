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

## ✅ Pasada ligera — 13/09/2026

**Rango:** 63 commits desde `31/08`→`04/09` (última entrada de este doc) hasta hoy (`31efb07`);
actividad muy concentrada en `apps/asegura`/`plataforma` (Codeoscopic Submit/emisión) y una
auditoría **profunda** ya corrida hoy mismo a las 02:40 UTC por otra sesión (PR #2857, ver abajo).
**Antes de tocar nada** se listaron los PRs abiertos (regla global del `CLAUDE.md`): hay ~20, varios
cubriendo exactamente lo que esta pasada iba a buscar — no se duplica ese trabajo, se contrasta.

### 🔴 HALLAZGO CENTRAL — por qué `docs/AUDITORIA-2026-09.md` llevaba 9 días sin registro: causa raíz encontrada
`#2741` (pasada ligera de ayer 12/09) ya documentó que los PRs de registro (`#2318`, `#2322`,
`#2483`, el propio `#2741`) se quedaban `mergeable_state: dirty`/`blocked` sin que
`rutinas-automerge.yml` los resolviera, **pese a correr con normalidad** (miles de runs/día). Hoy se
encontró el motivo, mirando los workflow runs del propio `#2741`: `rutinas-automerge.yml` SÍ resolvió
su conflicto de inserción pura (commit `eecf6d1`, "resolviendo el conflicto conservando ambas
entradas"), pero los 4 checks requeridos que corrieron sobre ESE commit (`CI`, `QA Check`,
`Tests & Typecheck`, `gitleaks`) salieron **`conclusion: action_required`** — GitHub exige aprobación
humana para ejecutar workflows disparados por un commit autoría `github-actions[bot]` (no es el
problema ya documentado del token de la App sin disparar workflows: aquí SÍ se disparan, pero quedan
pendientes de un botón "Approve and run" que ningún agente puede pulsar por API). Con los checks
requeridos eternamente pendientes, `mergeable_state` se queda en `blocked` y el auto-merge nunca
llega a intentarlo. **Mismo patrón esperable en `#2318`/`#2322`/`#2483`** (no verificado uno a uno,
pero comparten síntoma y antigüedad). 🎯 **Acción manual de Alberto (no ejecutable desde aquí):**
abrir la pestaña Actions de esos runs y pulsar "Approve and run", o revisar
Settings → Actions → General → aprobación de workflows para no repetir esto cada vez que el bot
resuelve un conflicto. Sin esto, **el carril 1 completo de `/auditoria-diaria` seguirá sin poder
autoentregarse** cuando su PR de registro choque con otro.

### 🔴 Pricing SIVRA — sigue sin escritura REAL, empeorando (continuación de PR #2857)
`horas_desde_ultima_pasada` (no dry-run) = **47,6 h** (eran ~42 h cuando `#2857` lo midió esta
madrugada) — última tanda real: 33 noches. Palancas de los 4 pisos: `enabled`/`apply_enabled=true`,
`min_price` puesto, `antelacion_k=0` — nada apagado en silencio. Raíles sanos cuando sí escribe
(`rail_baja_roto=0`, `bajo_minimo=0`, `rail_alza_sin_justificar=0`, `oscilantes=0`). El motor corre
(`sivra_pricing_apply` late `ok=true` cada pasada) pero reporta "0 noche(s) escritas" — no es que
esté apagado, es que no encuentra nada que escribir desde hace 2 días. **No es hallazgo nuevo**, es
la misma alarma de `#2857` sin resolver y a peor: sigue pendiente de que Alberto mire `/sivra/pricing`.

### 🔴 Correduría — CIMA sin un solo pull nuevo desde el 11/09 15:08 UTC (~41 h, 3 ciclos perdidos)
`seguros.operational_events` (`cima_pull_*`): el último evento de cualquier tipo es
`cima_pull_completed` del **2026-09-11 15:08:41** (`queueDepth=135`, `processed=0`). Los pulls
programados de las 05:30/11:30 UTC del 12/09 **y** el de las 05:30 del 13/09 no dejaron NINGÚN
evento (ni `started` ni `completed`) — no es "miró y no había nada", es que no hay pull registrado
en absoluto desde hace 3 ciclos. Coincide con la sospecha ya escrita en `#2857`: el adaptador Java en
el Fly de Manuel. El latido `correduria_ingesta` de plataforma (06:45 hoy, `ok=true`) NO contradice
esto — es un health-check sobre el estado YA guardado en `seguros.*`, no una confirmación de que CIMA
siga entrando. Codeoscopic: 14 cotizaciones / 7,00€ en 7 días, 3 descartadas — ya reconciliadas en
memoria (ver entradas de hoy sobre 40685793/40685666). Aislamiento: cepos no releídos línea a línea
esta pasada (ligera). §21 sigue pausada a propósito.

### 🟡 Heartbeat (2-bis) — dos crons mudos, ambos YA diagnosticados hoy por otras sesiones
- `sivra_rates_snapshot` (49 h sin OK) + `sivra_pilot_track` (46,8 h): los 4 pisos devuelven
  HTTP 401 al leer `/api/rates` de Smoobu. Diagnóstico ya en PR `#2875` (draft, hoy 07:59): no es la
  credencial HMAC (sigue viva en `smoobu_sync`/`reservas_booking_vigia`), apunta a un scope
  "Rates & Availability" desactivado en el panel de Smoobu — acción de Alberto, sin fix de código.
- `psd2_health_check`: BBVA con sesión `CLOSED` en Enable Banking (HTTP 401), Kutxabank OK. Ya
  diagnosticado en PR `#2868` (draft, hoy 06:08) — acción de Alberto: re-vincular BBVA en `/banca`.
- `ses_transporte`: sigue `ok=false` desde el 21/08, ya conocido, pendiente de Alberto en el portal SES.
- `sivra_eventos`: fallo puntual de OpenRouter (timeout), dentro de umbral.
- `agente_reparaciones`: sin intentos en 7 días — nada que el reparador automático esté gestionando.

### Backlog de PRs de rutinas + salud del automerge (2-ter)
`rutinas-automerge.yml` corriendo sin parar (7.831 runs acumulados, docenas hoy). El backlog de
`#2262` (9 días, registro puro), `#2318`/`#2483` (8/6 días, `dirty`/`blocked`) y `#2322`/`#2488`
(8/6 días) **ya está explicado por el hallazgo central de arriba** — no es un vigilante muerto, es un
vigilante que resuelve el conflicto y luego se queda esperando una aprobación humana que nunca llega.
Draft de seguridad crítica `#2857` (Next.js RCE, `mergeable_state: dirty`) sigue sin mergear desde
esta madrugada — el bump de versión ya está commiteado, solo falta resolver el conflicto y (por el
hallazgo de arriba) probablemente aprobar sus checks a mano. Resto de drafts de carril 2 antiguos
(`#2534`, `#2548`, `#2573`, `#2627`) sin cambios desde su creación, por debajo del umbral de 7 días
salvo mención expresa de Alberto.

### Reconciliación memoria/skills
El propio rango de hoy ya se autodocumentó en cada PR (patrón `#2874`/`#2872`/`#2870`/`#2867`/`#2863`:
memoria + `CLAUDE.md` en el mismo commit) — sin huecos nuevos detectados en skills-maestro ni
`docs/SKILLS.md`. No se pudo listar sesiones remotas (herramienta no adjunta): no se afirma que no
haya pendientes de solo-charla perdidos, solo que no se ha podido mirar.

### Manuales / HUECOS-ABIERTOS / rotación — sin cambios
`apps/ia-rest` sin commits en el rango. `docs/HUECOS-ABIERTOS.md` no revisado línea a línea (reservado
a la profunda). Sin rotación mensual pendiente.

---
<!-- verificado: 2026-09-13 -->
