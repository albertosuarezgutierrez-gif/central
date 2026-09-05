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

## ✅ Pasada ligera — 05/09/2026

**Rango:** ~40 commits desde la ligera de ayer (04/09) hasta hoy (`0cad002`). Volumen muy alto en
correduría (`apps/asegura`, `apps/asegura-portal`, `apps/plataforma` `/correduria`): siniestros con
teléfonos por compañía, invitaciones/peticiones de acceso al portal, "contacto sin canal", vigía de
silencio por entidad. Nace **`apps/asegura-web`** (web pública de marketing, sin BD). También modo
noche del agente de huéspedes (mergeado y comprobado en BD) y un fix de la bienvenida de sivra.

### Heartbeat de crons/agentes (2-bis)
⛔ **`sivra_eventos_verificar`** — 50,5h sin pasada OK (umbral 30h). Detalle: búsqueda web caída +
un JSON de OpenRouter no parseable para una fecha. Es la misma familia de fallo intermitente que ya
señaló la pasada del 04/09 ("dentro de umbral, sin patrón de caída sostenida") — hoy cruza el
umbral, pero sigue sin patrón de caída sostenida (fallos puntuales de búsqueda, no un cron muerto).
No se abre PR por esto; a vigilar si se repite mañana.
🟡 **`facturas_correo`** — 46,9h desde su última pasada buena, pero la rutina es diaria a las 11:00
y la consulta se hizo antes de esa hora: la última pasada registrada fue `ok=true`, así que es
timing de la consulta, no una avería (regla NULL≠0: no comprobado ≠ roto).
Ya conocidos, sin cambio: `ses_transporte` (sin establecimiento dado de alta, pendiente 06/10) y
`sivra_domotica_acceso` (4 cerraduras en ERROR, Tuya, pendiente 12/09). Sin intentos de reparación
automática en 7 días para ninguno de los dos. Resto de la lista (29 agentes) dentro de umbral.

### 🛡️ Salud de la correduría (2-quater) — sin 🔴, backlog ya documentado
Latidos `correduria_renovaciones`/`correduria_ingesta` ✅. `cima_pull_completed` late (hace ~17h,
dentro de 30h) pero **`processed=0`** en los 3 últimos eventos con `queueDepth=130` constante
(`modo=real`) — es la cuarentena ya reportada por `correduria_ingesta` (C0058 con 74 días sin
mandar nada, "SIN" 64 días sin guardar). No es un empeoramiento medido hoy, sigue igual que el
04/09. Codeoscopic: 0 cotizaciones/0€ en 7 días. Aislamiento: los 4 cepos (`regression-asegura-
aislamiento`, `regression-portal-aislamiento`, `regression-asegura-operador-publico`,
`regression-correduria-puerto`) existen y los recoge `test:guardia` (glob `test/*.test.ts`). §21
sigue pausada a propósito.

### 💰 Salud del precio SIVRA (2bis) — sin 🔴
`rail_baja_roto=0` · `bajo_minimo=0` · `rail_alza_sin_justificar=0` · última pasada hace 0,7h con 70
noches escritas. 🟠 `oscilantes=8` (subió de 5 el 04/09 a 8 hoy — vigilar si sigue creciendo, no
cruza umbral de acción). Los 4 pisos con `enabled`/`apply_enabled=true` y `min_price` fijado
(65/85/300/72€); sin palancas apagadas en silencio.

### Backlog de PRs de rutinas + salud del automerge (2-ter)
`rutinas-automerge.yml` con runs constantes en la última hora — vigilante vivo. PRs `claude/*`
abiertos relevantes: **#2317** (regenerar radiografía, ya en vuelo por `auditoria.yml`, no
duplicado por esta pasada), **#2313** (código real de otra sesión, `mergeable_state=dirty`, no es
de esta auditoría arreglarlo), **#2295** (`conectores-vigia`, docs/registro, 12 checks verdes pero
`dirty` desde hace ~6h — por debajo del umbral de 24h del registro, pero con CI verde solo le falta
resolver el conflicto; queda anotado para la próxima pasada si sigue así), **#2262** (draft,
bitácora, ~11h sin actividad, por debajo del umbral de 7 días).

### 🟡 Hallazgo carril 2: `apps/asegura-web` nació sin dos piezas de doc
1. **Sin `CLAUDE.md` propio.** El resto de apps de la correduría (`asegura`, `asegura-portal`) lo
   tienen desde el mismo día de su alta; `asegura-web` llevaba su detalle solo en el bullet raíz de
   `CLAUDE.md`. Se creó `apps/asegura-web/CLAUDE.md` (extraído del bullet) y se añadió el puntero
   `Tiene CLAUDE.md propio — ver apps/asegura-web/CLAUDE.md` al bullet raíz.
2. **`docs/FUENTES-DE-VERDAD.md` no mapeaba `apps/asegura-web/**`.** Añadida la fila.
3. **`CLAUDE.md` decía «la matriz de tests.yml son 12 apps»**; con `asegura-web` ya son 13
   (`ia-rest, ialimp, sivra, plataforma, rrhh, transporte, alquiler, almacen, mariscos, asegura,
   asegura-portal, asegura-web, housesevillana`). Corregido el conteo y la lista.
   (El mismo conteo aparece también en `.claude/commands/auditoria-diaria.md`, que ya se auto-
   advierte de no fiarse del número literal — no se tocó, sigue diciendo "recuenta con `ls apps`".)

Estos tres cambian ficheros de comportamiento (`CLAUDE.md`, `docs/FUENTES-DE-VERDAD.md`), así que
van al PR draft de carril 2 bajo el harness de tareas de GitHub, no auto-aplicados a `main`.

### Reconciliación memoria/skills — sin más huecos
`docs/SKILLS.md` y `.claude/skills/correduria-crm/SKILL.md` al día (no mencionan `asegura-web` y es
correcto: es marketing sin BD, fuera del CRM). `docs/HUECOS-ABIERTOS.md` sin huecos de correduría
que cerrar (los únicos vivos son de trading, sin cambios este rango). ⚠️ **No se pudo listar
sesiones** (herramienta de sesiones remotas no adjunta en este entorno): no se cruzaron
conversaciones sin commit contra memoria/PR — no se afirma que no haya pendientes perdidos, solo
que no se ha podido mirar. El resto del rango se autodocumentó commit a commit en
`docs/CONTEXTO-SESIONES.md` (verificado contra el `git log --stat`).

### Manuales / rotación
Ningún commit del rango toca `apps/ia-rest/**` (manuales no aplica). Sin rotación mensual pendiente
(septiembre sigue abierto, 9 entradas vivas tras la de hoy).

---
<!-- verificado: 2026-09-05 -->
