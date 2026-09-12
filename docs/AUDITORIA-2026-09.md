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

## ✅ Pasada ligera — 12/09/2026

**Rango:** desde la última entrada de este doc (04/09) hasta hoy — 8 días, ~90 commits. **Este doc no
se actualizaba desde el 04/09 pese a que la auditoría SÍ corrió en el intermedio** (existen PRs de
pasadas del 05, 06, 07 y 08/09): la causa no es que la rutina dejara de correr, es que su salida se
quedó sin llegar a `main` — ver el hallazgo del backlog más abajo, que es el central de esta pasada.

### 🔴 Backlog de PRs de rutinas (2-ter) — el hallazgo real de esta pasada
Al menos 3 PRs de **registro** (carril 1, tocan solo `docs/CONTEXTO-SESIONES.md`/
`AUDITORIA-2026-09.md`/`AUTO-APLICADOS.md`, `draft:false`, listos para el automerge) llevan **4-7
días abiertos con `mergeable_state:dirty`**: `#2318` (05/09, 7 días), `#2322` (05/09, 7 días),
`#2483` (07/09, 5 días). `rutinas-automerge.yml` SIGUE VIVO y corriendo con total normalidad (miles
de runs acumulados, éxito constante sobre otros PRs hoy mismo), pero no ha resuelto el conflicto de
estos tres ni ha dejado el comentario de "no he podido, hace falta mano humana" que el diseño
promete — se han quedado mudos, ni mergeados ni señalizados. Consecuencia medida: el registro de la
auditoría (este doc, `CONTEXTO-SESIONES.md`) llevaba 8 días sin reflejar nada, dando la apariencia de
que la rutina había dejado de correr cuando en realidad corrió y su salida se pudrió en conflicto.
Además hay **8 drafts de carril 2 sin actividad 4-8 días**: `#2262` (trading-analista, 04/09, 8
días), `#2319`/`#2327` (05/09, 7 días), `#2412`/`#2413`/`#2414` (06/09, 6 días), `#2484`/`#2534`/
`#2548`/`#2573` (07/09, 5 días), `#2627` (08/09, 4 días). **Acción manual recomendada para Alberto:**
revisar y mergear/cerrar el lote (varios son puro registro y deberían fusionarse sin fricción trayendo
`main`), y mirar por qué el automerge no señaliza conflictos en vez de quedarse callado — puede ser
que el paso de "traer `main` a la rama" del workflow esté fallando en silencio para PRs con más de un
día de antigüedad de conflicto.

### Heartbeat de crons/agentes (2-bis)
🔴→ya en vías de arreglo: **Smoobu HTTP 401** tumbó 4 agentes durante ~24h (`sivra_rates_snapshot`,
`sivra_pricing_guard`, `smoobu_sync`, `reservas_booking_vigia`) — Smoobu deprecó el header legacy
`Api-Key`; otra sesión ya diagnosticó y migró a HMAC-SHA256 esta misma mañana (commit `d5ec555`, PR
#2731, **merged** a `main` a las 07:40 UTC). Los latidos afectados son de ANTES del fix; pendiente
confirmar en verde en la próxima pasada de estos crons. 🔴 **`AGENTE mercado-booking` (diario) MUDO
119h** — sin escribir en `market_rates fuente='booking_mcp'` desde el 07/09 08:41 (el mismo día del
PR #2488 "objetivo jul/ago-2027 ya cumplido 5ª vez"); no investigado a fondo esta pasada (carril 2,
pendiente). `ses_transporte` sigue en rojo por decisión ya aceptada de Alberto (04/09). `canario_lead_web`
dentro de tolerancia (4,6h de 6h). `sivra_eventos_verificar` cruza el umbral por un fallo puntual de
búsqueda ya explicado en su propio detalle (OpenRouter vacío). Sin intentos de auto-reparación en curso
(`agente_reparaciones` vacía en 7 días) — el fix de Smoobu fue manual, no del reparador automático.

### 🛡️ Salud de la correduría (2-quater) — sin 🔴 nuevo
`correduria_renovaciones`/`correduria_ingesta`/`correduria_siniestros`/`correduria_partes` todos ✅ y
frescos (<2h). Ingesta reporta "DEGRADADA" pero es el backlog ya conocido (ficheros C0468/M00171,
pólizas huérfanas arrastradas). §21 sigue pausada a propósito.

### 💰 Salud del precio SIVRA (2bis) — sano
`rail_baja_roto=0` · `bajo_minimo=0` · `rail_alza_sin_justificar=0` · `oscilantes=0` · última pasada
hace 23,6h con 33 noches escritas. Las 4 palancas `enabled`/`apply_enabled` en `true`, `min_price`
puesto en las 4, `antelacion_k` apagada salvo House Sevillana (=1, con las 3 condiciones exigidas).

### Reconciliación memoria/skills — no completada en profundidad esta pasada
Presupuesto de esta pasada consumido por el hallazgo del backlog (arriba), que es carril 2 real y
justifica priorizarlo. No se revisó línea a línea el drift skills↔código ni `HUECOS-ABIERTOS.md`
este ciclo — queda pendiente para la próxima pasada ligera.

---
<!-- verificado: 2026-09-12 -->
