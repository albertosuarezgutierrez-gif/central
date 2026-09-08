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

## ✅ Pasada ligera — 08/09/2026

**Rango:** desde la pasada del 07/09 (`89dfc5a`) hasta hoy (`087aefa`) — ~24h, correduría
(`apps/asegura*`) a un ritmo muy alto: backfill de índice por email/teléfono, invitación al portal
por WhatsApp con nombre de pila, el cliente puede quitar sus pólizas aportadas (congelan sus
partes) y editar su dirección de contacto. Preflight Telegram → `200 ok`.

### 🔴 Hallazgo repetido y AGRAVADO: `sivra_domotica_acceso` sigue sin una pasada OK desde el 01/09
**163,4 h** sin `ok=true` (última buena: 01/09 12:40 — no ha cambiado desde que se detectó el
02/09). Detalle de hoy: «2 cerradura(s) · 0 PIN creado(s)/borrado(s) · 1 con la ventana
desactualizada · **3 con ERROR** (Tuya 1109, 2001)» — el mismo conteo de errores que el 04/09,
pero la ventana sin pasada buena ha pasado de 67 h a 163 h sin que nadie lo revise en
`/sivra/domotica`. `agente_reparaciones` sigue sin ningún intento en 7 días (no es un error con
forma de excepción, es un estado sostenido de la API de Tuya — el reparador automático no lo
toca). **Acción manual de Alberto:** revisar las 3 cerraduras en ERROR en `/sivra/domotica`; es la
tercera pasada que lo señala sin cambios.

### 🟡 Backlog de PRs de rutinas — sigue creciendo, ya con mano humana pedida dos veces
7 PRs de registro/rutinas atascados sin mergear, varios desde hace días: `#2262` (4 días,
"registro puro" — el bot de `rutinas-automerge.yml` ya comentó el 04/09 que el conflicto NO es de
inserción pura y **no volverá a avisar**: hace falta rehacer la rama a mano), `#2318`/`#2322`
(3 días, `mergeable_state: dirty`, ambos con más código real del que su título sugiere — ya
señalado en el PR #2483 de ayer), `#2483` (el propio PR de registro de ayer, `blocked`, sin
mergear todavía) y `#2488` (`dirty`, ~24h). El vigilante (`rutinas-automerge.yml`) SÍ está vivo —
corrió y mergeó varios PRs esta misma mañana (`087aefa`, `7678a6e`) — pero los atascados por
conflicto no-trivial no se resuelven solos y ya se ha pedido la mano de Alberto en dos pasadas
seguidas (07/09 y 08/09) sin que se haya tocado. No se abre un tercer PR duplicado sobre esto.

### Heartbeat de crons/agentes (2-bis) — resto ✅
32 filas en `agente_latidos`. `ses_transporte` sigue `ok=false` sin `ultimo_ok_at` (ya conocido
desde el 21/08: sin establecimiento dado de alta en `/sivra/partes/establecimientos`, pendiente de
Alberto). `agente_reparaciones`: sin intentos en 7 días. Resto de las 32 filas frescas dentro de su
cadencia — incluidas las 13 filas de correduría (`correduria_renovaciones`, `correduria_ingesta`,
`correduria_siniestros`, `correduria_partes`) todas `ok=true` y por debajo del umbral de 30 h.

### 🛡️ Salud de la correduría (2-quater, obligatorio) — sin 🔴 nuevo
`correduria_ingesta` reporta «DEGRADADA» pero es backlog ya conocido, creciendo poco: **Occident
(C0058) ahora en 77 días sin mandar CIMA** (76 el 07/09) con 7 renovaciones ya vencidas — mismo
hallazgo de ayer, un día más viejo, sigue pendiente de pedírselo a la compañía (no es una acción de
esta auditoría). `cima_pull_*`: último evento 07/09 16:36 (`queueDepth=131`, `processed=0`, dos
pasadas seguidas en 0 tras un `processed=10` el 06/09 20:48) — dentro del umbral de 30 h, no
`parada`, y coincide con el backlog ya descrito por el propio latido. Codeoscopic: 3 cotizaciones
en 7 días, 1,50 €, 2 descartadas — gasto trivial, sin cotización huérfana de decisión. Aislamiento:
cepos no re-verificados esta pasada ligera (reservado a la profunda). §21 sigue pausada a
propósito. `agente_reparaciones` sin intentos → nada que el reparador automático esté gestionando
sobre correduría.

### 💰 Salud del precio SIVRA (2bis, obligatorio) — sin 🔴
`rail_baja_roto=0` · `bajo_minimo=0` · `rail_alza_sin_justificar=0` · `oscilantes=3` (bajo) ·
última pasada hace 2,1 h con 15 noches escritas. Palancas: los 4 pisos `enabled`/`apply_enabled` en
`true`, `min_price` puesto. `prop_house_sevillana` tiene `antelacion_k=1` (los otros 3 en `0`) —
**no es drift**: es la palanca deliberada documentada en `docs/POSICION-MERCADO-lejano.md` (House
sigue en 1,40× de mercado sin converger, es la única de las 4 que la mantiene encendida a
propósito desde el 07/09).

### Reconciliación memoria/skills — sin huecos detectados
Las propias sesiones del rango se autodocumentaron en cada PR (memoria + `CLAUDE.md`/tests en el
mismo commit — patrón visible en #2585/#2592/#2599/#2603/#2604/#2613/#2614). No se ha tocado
`apps/ia-rest/**` (manuales no aplica) ni hay rotación mensual pendiente. ⚠️ **No se pudo listar
sesiones remotas** (herramienta no adjunta en este entorno): no se cruzaron conversaciones sin
commit contra memoria/PR — no se afirma que no haya pendientes perdidos, solo que no se ha podido
mirar. `docs/HUECOS-ABIERTOS.md` no revisado línea a línea (reservado a la profunda).

---
<!-- verificado: 2026-09-08 -->
