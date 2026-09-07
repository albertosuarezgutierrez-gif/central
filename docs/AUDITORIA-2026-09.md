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

## 🟡 Pasada ligera — 07/09/2026

Rango `f341b2e8..HEAD` (46 commits, 05/09 17:31 → 07/09). Integridad estructural (13 apps en
`ls apps` == 13 en la matriz de `tests.yml`, `ignoreCommand` presente en los 13, `transpilePackages`
coherente) sin drift.

### 🔴 Backlog de PRs (paso 2-ter) — el hallazgo grande de hoy
`rutinas-automerge.yml` vivo (decenas de runs/hora). Pero **3 PRs cuyo cuerpo dice "solo bitácora,
se auto-mergea" traen código real sin revisar**, atascados en conflicto (`dirty`) con CERO ejecuciones
de los checks requeridos en toda su vida:
- **#2318** — cuerpo: "solo 3 docs". Diff real: 15 archivos, incluido el módulo de mensajería
  `mensajes-prog/{cobertura,decidir,orquestador}.ts` (SIVRA) y una migración SQL.
- **#2322** — cuerpo: "solo bitácora". Diff real: 23 archivos, incluido
  `packages/module-seguros-portal/src/canal-compania.ts` y una migración Prisma.
- **#2327** — cuerpo: "1 línea". Diff real: 22 archivos, incluido
  `packages/module-seguros-portal/src/consentimiento.ts` y una migración SQL.
- **#2262** — registro puro CONFIRMADO (2 archivos), pero lleva ~59h en conflicto sin que ningún
  check requerido haya corrido nunca.

Causa probable en los 4: rama reutilizada por sesiones distintas después de escribirse el cuerpo del
PR, y el conflicto con `main` nunca se resolvió (así que el evento `pull_request` no llegó a
`tests.yml`/`ci.yml`/`qa.yml`). **Acción manual de Alberto**: antes de cerrar cualquiera de estos
cuatro dando por hecho que son bitácoras redundantes, hay que abrir el diff y revisar el código que
traen — #2322 y #2327 en particular tienen trabajo de producto (`module-seguros-portal`) que se
perdería si se cierran a ciegas. Los PRs `dirty` **<7 días** (2414/2413/2412/2319, todos de
06/09/2026) no llegan aún al umbral de "olvidado", pero comparten la misma causa (conflicto sin
resolver) y conviene traer `main` a sus ramas en la próxima pasada.

### Heartbeat de crons/agentes (2-bis) — sin `⛔`, tres huellas sanas SIN vigilar (🟡, cerrado en el
mismo PR de código de esta pasada)
Los 34 agentes de `AGENTES_VIGILADOS` ✅ (dos pendientes ya declarados y con fecha de revisión:
`ses_transporte` sin vencer, `sivra_domotica_acceso` vence el 12/09). Consulta b) toda ✅.
**Hallazgo**: `smoobu_sync`, `correduria_partes` y `trading_h10` ya escribían huella sana en
`agente_latidos` (verificado con filas reales) pero no estaban en `AGENTES_VIGILADOS` — verdes hoy,
mudos sin aviso si dejan de estarlo mañana. **Añadidas las tres** (`apps/plataforma/lib/monitoring/latidos.ts`
+ su probe en `app/api/cron/agentes-latido/route.ts`), typecheck y `latidos.test.ts` en verde.
`trading-backtest` (cron cada 2h) sigue sin ninguna huella — no se le pudo dar de alta sin escribir un
`registrarLatido` nuevo en su cron, eso queda para una sesión de código, no de auditoría.
⚠️ Sin verificar en esta pasada: si las 8 rutinas de Claude Code sin `ALERTA_TOKEN` funcional
(citadas en `docs/RUTINAS-PROGRAMADAS.md` del 23/08) siguen así — recomendado para la próxima pasada
profunda.

### 🛡️ Salud de la correduría (2-quater, obligatorio) — sin 🔴, dos 🟡
Latidos ✅ (`correduria_ingesta` reporta **"DEGRADADA"** en su `detalle`, no solo "no comprobado").
- **Occident/C0058 lleva 76 días sin mandar ningún fichero CIMA** (su mayor hueco medido hasta hoy
  eran 2 días), con **7 renovaciones ya vencidas** sin que llegara el fichero y 12 más vencen en 90
  días (64 pólizas vivas de esa compañía). Merece que Alberto lo mire — no es ruido del auditor.
- 20 pólizas con recibos/siniestros huérfanos (sin carga inicial de esa clave de mediador); 21
  envíos rechazados por `webhook_codeoscopic` en 24h.
- `cima_pull_*`: sigue procesando (`processed=10`, `errores=0` en las últimas 3 pasadas), pero el
  último FICHERO nuevo es del 05/09 — coherente con la degradación de arriba, no cuarentena atascada
  (`queueDepth` estable con `processed≠0`).
- Codeoscopic: 0 cotizaciones en 7 días, 0€.
- **PR #2410 (05/09) tocó el puerto `/api/operador/cliente/contactos/route.ts` sin tocar ningún test
  de aislamiento** — los cepos existentes siguen verdes, pero el cambio no sumó cobertura nueva. 🟡,
  sin acción en esta pasada (no es carril 1 ni un fix de bajo riesgo evidente).
§21 (`agente-correduria`) sigue pausada, sin entradas en la bitácora — correcto.

### 💰 Salud del precio SIVRA (2bis, obligatorio) — sin 🔴
`rail_baja_roto=0` · `bajo_minimo=0` · `rail_alza_sin_justificar=0` · última pasada hace 6 min con 19
noches escritas. Las 4 palancas sanas (`enabled`/`apply_enabled` en `true`, `min_price` puesto,
`antelacion_k=0`). Único hallazgo: **4 pares (piso, fecha) oscilantes** en los últimos 7 días (🟠,
ciclo límite — el motor no converge en esas fechas concretas). No urgente; a vigilar si se repite.

### Reconciliación memoria/skills — 4 hallazgos de texto, corregidos en el acto
- `CLAUDE.md:138` decía "el teléfono está ausente a propósito" — falso desde el 05/09/2026
  (`MEDIADOR.identidad.telefono` existe y se usa en WhatsApp/`tel:`/JSON-LD). Corregido.
- `docs/ASEGURA-SEO-REDES-IDEAS.md` seguía en "6 ramos/6 páginas" tras sumarse `flota` el 06/09
  (PR #2470, ahora son 7, ~830 palabras de copy real verificadas). Corregido.
- `docs/FUENTES-DE-VERDAD.md` no tenía fila para la skill `seo-asegura` ni para `apps/asegura-web`
  pese a 6 PRs de SEO en el rango. Añadida.
- `docs/HUECOS-ABIERTOS.md` no catalogaba el hueco de `/api/acceso/solicitar` sin rate limit/validación
  de email que la memoria del 06/09 (PR #2404) marcó como "lo más urgente" — 24h después seguía sin
  catalogar ni corregir. **Corregido en código** (ver abajo) y anotado directo en "cerrados".
Sin más hallazgos: `docs/CONTEXTO-SESIONES.md` cubre los 46 commits del rango, sin rotación mensual
pendiente, reglas fiscales sin tocar, `docs/SKILLS.md` al día, `apps/ia-rest/**` fuera del rango
(manuales no aplica), triaje de correo sin tocar.

### 🔧 Fix de código (carril 2, bajo riesgo, verificado): rate limit + validación en `/api/acceso/solicitar`
`apps/asegura-portal/app/api/acceso/solicitar/route.ts` aceptaba `destino: z.string().min(3).max(200)`
sin exigir forma de email/teléfono y sin ningún límite de tasa — la web pública de la correduría ya
enlaza a este endpoint, así que era un amplificador de correo/WhatsApp abierto con el dominio de
Alberto. Ahora: `Entrada` es un `z.discriminatedUnion('tipo', …)` que exige `.email()` real para
`tipo==='email'` y E.164 (mismo patrón que `canal-compania.ts`) para `tipo==='whatsapp'`; y
`apps/asegura-portal/lib/rate-limit.ts` (copia del patrón ya usado en `apps/plataforma`) limita a
5 intentos / 15 min por IP antes de tocar la BD. Typecheck de `asegura-portal` limpio; los 48 tests
relevantes (`peticiones`, `invitaciones`, `regression-portal-aislamiento`, `regression-secrets`) en
verde — el fix no toca `prisma.portalX`, así que el guardián de aislamiento lo ignora correctamente.

### Manuales — sin cambios
Ningún commit del rango toca `apps/ia-rest/**`.

---
<!-- verificado: 2026-09-07 -->
