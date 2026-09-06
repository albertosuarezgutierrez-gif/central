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

## ✅ Pasada ligera — 06/09/2026

**Rango:** 50 commits del 05/09 completo (`723091c`→`55a241f`), casi todo `apps/asegura` /
`apps/asegura-portal` / `apps/asegura-web` (correduría: contactos editables, provincia vs CP,
supresión/acceso RGPD, hoja QR, muro de compañías) + rediseño completo de `asegura-web`. Nota: una
pasada **profunda** ya corrió hoy a las 02:25 UTC (PR #2412, otro trigger) — esta es la ligera diaria.

### 🔴 Hallazgo: el webhook de Codeoscopic sigue rechazando webhooks reales, y el doc lo negaba
`packages/module-seguros/src/ingesta.ts:64-77` documentó el 04/09/2026 que Codeoscopic manda webhooks
autenticados cada ~30 min y que **todos se rechazan** por forma (mandan un array, el validador espera
un objeto). El latido `correduria_ingesta` de hoy 06:45 lo sigue reportando: **23 rechazos en 24h**
(`codeoscopic_webhook_invalid_payload`). `apps/asegura/CLAUDE.md:327-329` seguía afirmando «el webhook
está SIN ESTRENAR, no roto» — stale desde el 04/09, corregido en este PR. **No hay código que arreglar
en este repo:** ninguna ruta de `apps/asegura` ni `apps/plataforma` escribe ese evento; lo recibe y
registra el CRM de Manuel (fuera de este monorepo), que apunta a la misma BD compartida. Acción manual
de Alberto: coordinar con Manuel el fix del validador (aceptar el array, o que Codeoscopic mande
objeto).

### 🟡 Backlog de PRs de rutinas (2-ter): un registro atascado, un draft cerca del umbral
- **PR #2318** (registro carril-1, no-draft, del 05/09 08:10): `mergeable_state: dirty` (conflicto en
  `docs/CONTEXTO-SESIONES.md`/`docs/AUDITORIA-2026-09.md`/`docs/AUTO-APLICADOS.md`, que `main` avanzó
  muchísimo desde entonces). Lleva **~24h sin mergear**. `rutinas-automerge.yml` está vivo (decenas de
  runs/hora, última 06:03 UTC hoy) pero no ha dejado el comentario de "no puedo resolver" que describe
  su propio diseño — no se ha intentado recientemente sobre esta rama. Contenido superado por esta
  misma pasada (ya cubre el rango 04→05/09). **Recomendado: que Alberto lo cierre** en vez de arreglar
  el conflicto a mano sobre contenido ya redundante.
- **PR #2327** (registro carril-1, draft, bitácora `facturas-correo` 05/09): `mergeable_state:
  blocked`, ~23h sin mergear — bajo el umbral de 24h pero a vigilar en la próxima pasada; podría ser
  el patrón de CI muda en draft ya documentado en `CLAUDE.md` §CI.
- Resto sano: #2412/#2413 (drafts de hoy, <1 día), #2407/#2322/#2262 verdes esperando revisión humana
  (no son registro, no les toca automerge).

### Heartbeat de crons/agentes (2-bis) — sin `⛔` nuevos
30 filas en `agente_latidos`. `ses_transporte` (`ok=false`) y `sivra_domotica_acceso` (`ok=false`,
115,4h sin OK) son las dos decisiones YA tomadas por Alberto el 04/09 («déjalo rojo»,
`apps/plataforma/lib/monitoring/latidos.ts:290-292,541-543`) — no son hallazgo nuevo. Sí a vigilar:
`sivra_domotica_acceso` **empeoró de 3 a 4 cerraduras en ERROR** desde el 04/09 (detalle de hoy: «4
con ERROR (Tuya 1109, 2001)») — la decisión de Alberto se tomó viendo 3, no 4; puede merecer una
revisión si sigue subiendo. `trading_h10`/`paper-tracker` en ~143h son cadencia normal (H10 fue un
análisis puntual ya cerrado el 01/09; paper-tracker es semanal, cron lunes). `agente_reparaciones`:
sin intentos en 7 días.

### 🛡️ Salud de la correduría (2-quater, obligatorio) — el hallazgo 🔴 ya descrito arriba aparte
CIMA sigue latiendo (`cima_pull_completed` real más reciente 05/09 09:12, dentro de umbral de 30h
aunque sin evento aún hoy en el momento de la consulta ~08h UTC — a revisar la próxima pasada si
persiste). Mapfre (C0058) sigue el patrón YA vigilado por `silencio-entidad.ts` (74→75 días,
documentado y con detector propio desde el 05/09 — no es hallazgo nuevo). Codeoscopic: 0 cotizaciones
en 7 días (dato real, count directo). §21 sigue pausada a propósito.

### 💰 Salud del precio SIVRA (2bis, obligatorio) — sin 🔴
`rail_baja_roto=0` · `bajo_minimo=0` · `rail_alza_sin_justificar=0` · `oscilantes=4` (bajo) · última
pasada hace 2,5h con 36 noches escritas. Palancas: los 4 pisos `enabled`/`apply_enabled=true`,
`min_price` puesto, `antelacion_k=0` — sin palancas apagadas en silencio.

### Reconciliación memoria/skills — corregido `apps/asegura/CLAUDE.md`, resto ya autodocumentado
Las 50 sesiones del 05/09 se autodocumentaron extensamente en `docs/CONTEXTO-SESIONES.md` (patrón
memoria+CLAUDE.md de la app en el mismo PR, visible en #2381/#2394/#2399/#2408/#2410). `docs/SKILLS.md`
ya lista `seo-asegura` (PR #2397). Único drift encontrado: la afirmación stale sobre el webhook de
Codeoscopic (ver hallazgo 🔴). ⚠️ **No se pudo listar sesiones** (herramienta no disponible en este
entorno): no se cruzaron conversaciones sin commit contra memoria/PR — no se afirma que no haya
pendientes perdidos, solo que no se ha podido mirar. `docs/HUECOS-ABIERTOS.md` y frescura de
`FUENTES-DE-VERDAD.md` no revisados línea a línea esta pasada ligera (reservado a la profunda, que ya
corrió hoy).

### Manuales de usuario — nada que tocar
Ningún commit del rango toca `apps/ia-rest/**`.

---
<!-- verificado: 2026-09-06 -->
