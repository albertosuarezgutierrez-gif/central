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

## ✅ Pasada ligera — 15/09/2026

**Rango:** desde la última entrada de este informe (04/09) hasta hoy — pero **sí corrieron pasadas
diarias intermedias** (PRs de registro `#2318`/`#2319`/`#2322`/`#2327`/`#2412`-`#2414`/`#2483`/`#2484`/
`#2488`/`#2534`/`#2548`/`#2573`/`#2627`/`#2741`/`#2757`/`#2864`/`#2868`/`#2877`/`#2883`/`#2916`/`#2924`/
`#2926`/`#2957`/`#2958`/`#2962`): este doc solo se toca cuando hay hallazgo de carril 2, así que su
silencio del 05 al 14/09 **no significa que la rutina no corriera** (ya aclarado en `#2741`, 12/09).

### 🔴 Hallazgo NUEVO: `sivra_rates_snapshot` sigue en HTTP 401 en los 4 pisos — el fix de Smoobu del
### 12/09 (#2731) NO lo resolvió
`agente_latidos.sivra_rates_snapshot`: `ok=false`, **97 h sin una pasada buena** (última OK 11/09
07:00 UTC), detalle idéntico cada día: `prop_house_sevillana/busto_reform/duplex_center/luxury_busto:
HTTP 401`. El PR #2731 (12/09 07:56 UTC, migración a HMAC-SHA256) declaró resuelto el 401 de Smoobu y
**sí tocó este mismo fichero** (`apps/plataforma/app/api/sivra/rates/snapshot/route.ts` está en su
diff) — pero el cron corre a las 07:00 UTC y las pasadas del 13, 14 y **15/09** (posteriores al merge)
siguen fallando con el mismo síntoma, mientras `smoobu_sync`/`sivra_pricing_apply`/`sivra_canal`
(mismo `smoobuFetch`, mismas credenciales en `pms_connections`) llevan desde el 12/09 en verde. Las
credenciales existen y están activas (`pms_connections`: key 41 chars, secret 44 chars, `activa=true`)
— no es el problema que #2731 arregló. Hipótesis no verificada (no se pudo consultar el panel de
Smoobu desde esta sesión): el endpoint `GET /api/rates` puede requerir un scope/plan que el resto de
endpoints no necesita. **Consecuencia medida:** `rate_snapshots` (precio vivo + ocupación, "el job que
más pesa" según el propio comentario del route) sin refrescar en 4 días; `sivra_pilot_track` degradado
por «snapshot viejo (3d)»; y el motor de pricing **no ha escrito una tarifa real (no-dry-run) desde
hace 95,6 h** (`pricing_applied`, ver bloque 2bis) pese a que su latido diario sigue en `ok=true` con
«0 noches escritas» — consistente con que sin precio vivo fresco el comparador no encuentra nada que
mover, no con que no haga falta mover nada. **Acción manual de Alberto:** abrir el panel de Smoobu
(developers/API) y confirmar si la cuenta tiene habilitado el endpoint de tarifas para esta API key: si
no, es un tema de plan/permiso, no de firma.

### 💰 Salud del precio SIVRA (2bis, obligatorio) — 🔴 por lo anterior
`horas_desde_ultima_pasada=95,6` (**> 10h → 🔴** por umbral) con `noches_ultima_pasada=33` (de la
última pasada real, hace 4 días). `rail_baja_roto=0` · `bajo_minimo=0` · `rail_alza_sin_justificar=0` ·
`oscilantes=0`. Palancas: los 4 pisos `enabled`/`apply_enabled=true`, `min_price` puesto, `antelacion_k=0`
— nada apagado en silencio. El 🔴 es el mismo hallazgo de arriba visto desde el otro bloque: la causa
es `sivra_rates_snapshot`, no el motor de `apply` en sí.

### Heartbeat de crons/agentes (2-bis) — resto ✅, 2 conocidos
`seo_correduria` en rojo (14/09 09:18, «Serper 400: Not enough credits») pero es **anterior** al PR
`#2936` (14/09 16:01, retirada de Serper de este cron) — se revisa en la próxima pasada (lunes,
cadencia semanal) para confirmar que ya no reaparece. `ses_transporte` sigue `ok=false`, ya conocido
desde el 21/08 (pendiente de Alberto en el portal SES). Resto de los 34 agentes en `agente_latidos` ✅.
`agente_reparaciones`: sin intentos en 7 días.

### 🛡️ Salud de la correduría (2-quater, obligatorio) — sin 🔴
Latidos `correduria_renovaciones`/`correduria_ingesta`/`correduria_siniestros`/`correduria_partes` ✅.
Ingesta reporta «degradada» con el mismo backlog ya conocido (Occident M00171/8-92361 pendientes de
pedir a la compañía, C0058 con 84 días sin mandar nada — hueco ya señalado antes). Codeoscopic y
aislamiento no revisados línea a línea esta pasada ligera.

### Backlog de PRs de rutinas + salud del automerge (2-ter) — 🟡 ya reportado, sigue sin resolverse
**28 PRs abiertos.** El bloqueo estructural ya lo documentó `#2741` (12/09): varios PRs de **registro**
(solo `docs/**`) quedan con `mergeable_state:blocked` — no por conflicto, sino porque los checks
requeridos nunca arrancan (los pushes con el token de la App no disparan Actions, ver `CLAUDE.md` §CI)
y el ruleset no tiene *bypass* concedido. `#2741` (12/09), `#2877` (13/09) y `#2924` (14/09) — las tres
son PRs de registro, no-draft, >24h — siguen abiertas hoy. Es la misma causa raíz ya conocida y
**pendiente de decisión de Alberto** (no tocar el ruleset sin su OK, per nota del 26-27/08 en
`CLAUDE.md`); no se reabre como hallazgo nuevo, solo se deja constancia de que el backlog sigue
creciendo (16 PRs de registro/rutinas + 12 drafts de carril 2, varios con +5 días).

### Reconciliación memoria/skills — pasada acotada
Foco de esta pasada en los bloques obligatorios (heartbeat, pricing, correduría) por el hallazgo 🔴; no
se hizo reconciliación línea a línea de skills-maestro/CLAUDE.md de apps ni barrido de sesiones sin
commit. Sin drift de texto detectado en lo revisado. `docs/HUECOS-ABIERTOS.md` y manuales: sin cambios
en el rango que los afecten (ningún commit toca `apps/ia-rest/**` con superficie de usuario nueva).

---
<!-- verificado: 2026-09-15 -->
