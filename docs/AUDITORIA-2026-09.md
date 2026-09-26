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

## ✅ Pasada ligera — 19/09/2026

**Rango:** 54 commits desde `04a43ea` (15/09 16:41, última auditoría) hasta `0ba45c4`; actividad
casi entera en la correduría (CIMA, retarificación, portal, asegura-web). Entorno de tarea de
GitHub con una única rama asignada (`claude/great-maxwell-drrojp`): sin push directo a `main`
posible, así que texto y código van en el mismo PR (mismo patrón que #2857/#3023).

### 🔴 Next.js RCE crítica (`GHSA-2xp9-vwfh-vxw4`) SIN parchear en `main` desde hace 6 días
`main` seguía en `next ^15.5.18-22`/`^16.2.12` (RCE no autenticada en la API de Image Optimization
con AVIF, aplica en Linux/Vercel). Ya diagnosticado y con fix verificado en `#2857` (13/09) y
`#3023` (16/09) — **ambos siguen en draft con `mergeable_state: dirty` sin resolver**, así que el
parche nunca llegó a `main`. Reproducido el mismo bump en esta rama (commit `e636afce3`):
`next` → `^15.5.25` (12 apps) / `^16.3.5` (ia-rest). `pnpm audit --prod`: 29 vulns/10 críticas →
19 vulns/**0 críticas**. Verificado: typecheck limpio en las 13 apps, `pnpm test`
(2883+53 tests, 0 fallos), `pnpm test:guardia` (852/852). **Acción de Alberto: mergear este PR ya**
(o resolver el conflicto de #2857/#3023) — son 6 días con una RCE no autenticada en producción.

### 🔴 Pricing SIVRA: motor en PAUSA global 4 días, con su propia condición de despause ya cumplida
`pricing_config.paused=true` desde el 15/09 14:44 UTC (decisión deliberada tras el episodio de
Semana Santa 2027 tarificada sin evento, ver memoria 15/09) y sin tocar desde entonces —
`horas_desde_ultima_pasada`=89,5h, 0 noches reales escritas en ese tiempo en los 4 pisos. La propia
nota de esa pausa fijaba la condición de reactivación: «NO despausar si el barrido no midió el
evento» de Semana Santa. **Esa condición ya se cumplió el mismo 15/09** (`market_rates` pasó de 22
a 30 comparables en 25/03/2027, Jueves Santo, medido 08:53 UTC) y no hay rastro en memoria ni en
código de una rutina de despausa que se haya ejecutado desde entonces — parece la misma familia que
el «cron mudo»: se programó un check para el día siguiente y nadie volvió a mirarlo. **Sin fix de
código posible desde aquí** (es una fila de config, no un bug): acción de Alberto, revisar
`/sivra/pricing` y despausar si el barrido de eventos ya cubre Semana Santa 2027 (parece que sí).

### 🟡 Correduría/CIMA — Mapfre (C0058) sigue muda, empeorando (88 días, ya alertado por su propio canal)
`correduria_ingesta` (latido `ok=true`, detalle DEGRADADA): C0058 lleva **88 días sin mandar nada**
(era 74-75 el 05-06/09) y ahora **9 renovaciones** vencieron sin fichero (eran 7). No es hallazgo
nuevo — `silencio-entidad.ts` ya lo detecta y avisa por Telegram desde el propio cron, así que no
se duplica aquí. Sigue pendiente la decisión de Alberto sobre el borrador de consulta a Codeoscopic
(`docs/ASEGURA-MAPFRE-C0058.md`, sin enviar). `cima_pull_*`: eventos regulares (17-18/09, cada
~6h), `queueDepth` estancado en ~145 con `processed` 0-2 — la cola no crece pero tampoco baja.
Codeoscopic: 8 cotizaciones/4,00€ en 7 días, todas `facturable`/cerradas — volumen normal para la
semana de desarrollo de retarificación/portal, guardián `regression-asegura-gasto-codeoscopic`
vigente. `seo_correduria`: `ok=false` desde el 14/09 (Serper sin créditos) — ya conocido y crónico
desde el 24/08, no se re-escala.

### Backlog de PRs de rutinas + salud del automerge (2-ter) — vigilante vivo, canal de registro sigue atascado
`rutinas-automerge.yml` corriendo con normalidad (run en curso a las 08:04 UTC de hoy). **30 PRs
abiertos.** El bloqueo estructural que `#2877` (13/09) ya diagnosticó — los checks requeridos sobre
un commit de `github-actions[bot]` no arrancan solos y quedan pendientes de aprobación humana en
Actions — sigue sin resolverse 6 días después: `#2877` (puramente registro, `docs/**`) tiene sus 21
checks en verde incluido «Ready to merge» pero **sigue sin mergear**, y `#2318`/`#2322`/`#2483`
llevan más de 2 semanas en el mismo estado. Dos PRs de seguridad crítica (`#2857`, `#3023`) están
atrapados en el mismo backlog. **Acción de Alberto (repetida, sin cambios desde el 13/09):** revisar
Settings → Actions → General → aprobación de workflows, o aprobar a mano los runs pendientes — sin
esto el carril 1 completo de esta rutina seguirá sin poder autoentregarse.

### Reconciliación memoria/skills
`docs/FUENTES-DE-VERDAD.md` no tenía fila para `correduria-crm`/`docs/CORREDURIA-CRM-VISION.md` ni
para la skill `cima-ingesta` + sus 4 docs (`ASEGURA-CIMA-INGESTA-INVENTARIO`, `CIMA-CUARENTENA`,
`ASEGURA-CIMA-COBERTURAS`, `CODEOSCOPIC-API-PORTAL`) — añadidas. `docs/SKILLS.md` ya lista
`cima-ingesta`; sin huecos ahí. `docs/CONTEXTO-SESIONES.md`: 402 entradas vivas, `rotar-memoria.mjs`
corrido (idempotente, 0 archivadas — julio/agosto siguen dentro de su ventana de retención). ⚠️ **No
se pudo listar sesiones remotas** (herramienta no adjunta): no se cruzaron conversaciones de
solo-charla contra memoria/PR.

### Manuales / HUECOS-ABIERTOS — sin cambios
Ningún commit del rango toca `apps/ia-rest/**`. `docs/HUECOS-ABIERTOS.md` no revisado línea a línea
(reservado a la profunda).

---

## 🔍 Pasada PROFUNDA — 20/09/2026

**Entorno de tarea de GitHub, rama asignada `claude/focused-gates-z5vsx6`; sin push directo a
`main`.** Igual que el 19/09: texto de registro va en un PR propio (este), y el único fix de código
que salió de esta pasada (infra del auto-merge) va en un PR de carril 2 aparte para que Alberto lo
mire — no se mete aquí para no sacar a este PR de la lista de "solo registro" que el propio bot exige.

### 🟢 Código e infra: sano
`pnpm test` (2.947 tests, node --test + vitest) y los 13 typechecks de la matriz (incluidos los DOS
schemas de `apps/asegura`) en verde; `qa-check.ts` (820 archivos, 0 problemas), lint (0 errores,
1.224 warnings) y build de `ia-rest` también. Sin regresiones desde la profunda anterior.

### 🟢 Heartbeat de crons/agentes: sano, dos rojos ya conocidos y sin acción nueva
`agente_latidos` completo revisado. Todo ✅ salvo:
- `ses_transporte` (`ok=false`, nunca en verde) — **pendiente de siempre**: sin establecimientos
  dados de alta en `/sivra/partes/establecimientos`; hoy lo cubre Chekin hasta el 06/10. Sin acción.
- `seo_correduria` (`ok=false` desde el 14/09, "Serper sin créditos") — **ya diagnosticado y curado
  en origen**: Serper se retiró de ese cron el mismo 14/09 (#2936); se pondrá verde solo en la
  próxima pasada semanal (lunes 21/09). Sin acción.
- `psd2_health_check` (semanal, dentro de umbral) reportó el 16/09 una "ANOMALIA CRITICA" —conexión
  BBVA con `401 Session is closed` en Enable Banking— y **ya avisó por Telegram él mismo ese día**
  (hay PR de registro #2868/#3022 documentándolo). Sigue sin resolver 4 días después: Alberto tiene
  que reconectar BBVA en Enable Banking. No se repite el aviso aquí (no es nuevo), pero se deja
  anotado por si se ha perdido en el ruido del backlog de PRs de abajo.

### 🟢 Correduría (bloque 2-quater): sano
CIMA sigue entrando (`cima_pull_completed` cada ~5h, último 19/09 14:39, `errorsCount=0`); el hueco
de 88 días de Mapfre (C0058) y el resto de "ingesta degradada" ya están cubiertos por
`docs/ASEGURA-MAPFRE-C0058.md` y el propio latido diario — nada nuevo que abrir. Gasto Codeoscopic
normal: 3 cotizaciones / 7 días, 1,50 €, 0 descartadas sin desenlace. Cepos de aislamiento
(`regression-asegura-aislamiento`, `regression-portal-aislamiento`, `regression-*-puerto`) verdes en
el `pnpm test` de arriba.

### 🟢 Salud del precio (bloque 2bis): sano
`rail_baja_roto=0`, `bajo_minimo=0`, `rail_alza_sin_justificar=0`, `oscilantes=0`, las 4 palancas
(`enabled`/`apply_enabled`=true, `antelacion_k=0`, `min_price` con valor) para los 4 pisos. Única
nota menor: `horas_desde_ultima_pasada=11,0h` (umbral 10h) con `noches_ultima_pasada=13` — margen de
una hora, y con el resto de señales en verde no se interpreta como pasada abortada.

### 🔴 Backlog de PRs de rutinas: 46 abiertos, hasta 16 días — y esta vez con hallazgo NUEVO y accionable
El vigilante (`rutinas-automerge.yml`) está vivo (corre en verde cada pocos minutos, confirmado por
sus runs). El problema no es que esté muerto: es que casi ningún PR del backlog cumple sus
condiciones, por dos motivos medidos con precisión esta pasada (delegado a un agente, 99 llamadas a
la API de PRs):

1. **`docs/uso-herramientas/<sesión>.json` (telemetría del hook `Stop`) saca del carril 1 a casi
   todo el lote.** Viaja en ~20 de los 46 PRs "solo bitácora" y **no está en el allowlist**
   `es_registro()` del workflow — un solo fichero de telemetría, inocuo, deja fuera al PR entero.
   Es un hueco del propio mecanismo, no un fallo de las rutinas. **Propuesto en el PR de carril 2**
   de esta pasada: añadir `docs/uso-herramientas/**/*.json` al allowlist.
2. **Al menos 7 PRs cuyo título/cuerpo dice "solo registro" traen código real sin revisar**, muy
   probablemente por reutilizar una rama entre sesiones distintas después de escribir el cuerpo del
   PR (el mismo patrón que ya cazaron #2318/#2322/#2327 el 07-08/09, pero más extenso de lo que se
   pensaba entonces):
   - **#2318** (15 días) — módulo `sivra/mensajes-prog/*` + migración SQL completos, sin revisar.
   - **#2322** (15 días) — feature de parte de siniestro del portal (Prisma + SQL) completa.
   - **#2327** (15 días) — `module-seguros-portal/consentimiento.ts` + agente-salud + SQL.
   - **#2573** (13 días) — feature de descripción de siniestro en el portal (prisma + SQL).
   - **#2757** (8 días) — fixes reales de Codeoscopic / `ficha-asegura.ts`.
   - **#2741** (8 días) — feature completa "declaradas por vencer" (rutas, UI, lib; 669 líneas).
   - **#2488** (13 días) — ~32 ficheros: asegura-web, `lib/contable/*`, fuga de canal, portal.
   **Esto es lo importante de verdad: hay trabajo terminado (no solo texto) esperando desde hace más
   de una semana sin que nadie lo esté mirando**, camuflado bajo títulos de rutina.
3. **#2262** (16 días, el más viejo) ya tiene el comentario `<!-- automerge-conflicto -->` del bot
   desde el 04/09 diciendo que no puede resolver el conflicto solo — sigue esperando mano humana.

**Acción de Alberto:** revisar y mergear/cerrar los 7 PRs de (2) cuanto antes (son features/fixes
reales, no bitácora); resolver a mano el conflicto de #2262 o rescatar su contenido; el fix de (1)
va en PR de carril 2 aparte. El backlog general (>2 semanas, causa raíz "aprobación de workflows en
Actions" per la nota del 19/09) sigue sin resolverse — cuarta vez que esta rutina lo señala.

### Reconciliación memoria/skills
`docs/CONTEXTO-SESIONES.md` y `docs/AUTO-APLICADOS.md` actualizados con esta pasada. Matriz de apps
verificada: `ls apps/` (13) == matriz de `tests.yml` (13), sin drift. No se hizo reconciliación
skill-a-skill exhaustiva de las ~50 skills de agentes contra código (fuera del alcance de esta
pasada dado el volumen del hallazgo de arriba); queda para la próxima pasada profunda si no hay otro
hallazgo de radio similar.

---

## ✅ Pasada ligera — 20/09/2026 (II)

**Rango:** 2 commits desde la profunda de esta mañana (`6dcc590`, 06:57) — #3136 (auto-informe
mercado-booking, docs) y #3126 (siniestros: campos por ramo + terceros/testigos). Los dos ya traían
su propio commit de memoria (`chore(memoria): actualizar contexto de sesión`); sin reconciliación
pendiente.

Heartbeat (2-bis), correduría (2-quater) y salud del precio (2bis) re-comprobados por si algo había
cambiado en las ~3h: **sin novedad frente a la profunda de la mañana**. `agente_latidos` con los
mismos dos `ok=false` ya crónicos y documentados (`ses_transporte` sin establecimientos SES;
`seo_correduria` sin créditos Serper desde el 14/09). CIMA sigue entrando (`cima_pull_completed` a
las 05:33, `errorsCount=0`, cola estable en 145 — mismo backlog conocido de C0058, ahora 89 días).
Codeoscopic: 3 cotizaciones/7 días, 1,50 €, 0 descartadas — igual que la mañana. Pricing:
`rail_baja_roto=0` · `bajo_minimo=0` · `rail_alza_sin_justificar=0` · `oscilantes=0`, 4 palancas
activas con `min_price`; `horas_desde_ultima_pasada=16,8h` es el mismo artefacto de "última escritura
con cambios" ya explicado esta mañana (la pasada de las 20:30 de ayer escribió 0 noches
legítimamente, confirmado por su propio latido `ok=true`), no una pasada abortada.

No se ha podido listar las sesiones del rango por `list_sessions` (herramienta MCP no adjunta en
esta pasada) — se dice explícitamente en vez de afirmar que no hay pendientes de conversación.

**Sin hallazgo nuevo. Carril 1 = solo esta entrada + `CONTEXTO-SESIONES.md`; carril 2 vacío: sin PR
de código ni aviso Telegram** (regla de frugalidad).

---

## ✅ Pasada ligera — 21/09/2026

**Rango:** 60 commits desde la pasada de ayer (20/09, 10:39) — actividad casi toda en la correduría
(sustituciones por retarificación #3202, alcance ver/ver_economico #3207, tabla de precios del
retarificador #3216, tipo de vía por Catastro #3217, watchlist CIMA #3209) más el ciclo semanal de
pricing (#3213) y buscador-ia (#3212, Groq retira el gratis a gpt-oss-120b, ya en `AGENTES-BITACORA.md`).

**Reconciliación memoria (paso 4):** 4 PRs mergeados **sin entrada en `CONTEXTO-SESIONES.md`**
pese a llevar cada uno su propio commit `chore(memoria): actualizar contexto de sesión` — ese commit
solo tocaba el JSON de seguimiento de uso de herramientas (`docs/uso-herramientas/`), no la memoria
real. Añadidas ahora: **#3202** (sustituciones), **#3207** (alcance ver/ver_economico), **#3216**
(retarificador: logos + cepos), **#3217** (tipo de vía por Catastro). Detalle en la entrada de arriba
del todo de `CONTEXTO-SESIONES.md`. `docs(asegura)` **74f0db4** (corrige "de Manuel: transferir
proyectos" ya cumplido) fue autocontenido por su propia sesión, sin acción adicional.

**Heartbeat (2-bis):** todo verde salvo los dos crónicos ya documentados (`seo_correduria` sin
créditos Serper desde 14/09; `ses_transporte` sin establecimientos SES). Sin reparaciones automáticas
en curso (`agente_reparaciones` vacío en 7 días).

**Correduría (2-quater):** CIMA sigue entrando (`cima_pull_completed` hace 17,3h, dentro del umbral
de 30h; `errorsCount=0`; cola estable en 145-147). `correduria_ingesta` marca DEGRADADA (7 pólizas con
recibos/siniestros huérfanos, ya conocidas) y **C0058 (Mapfre) alcanza 90 días sin mandar nada** (su
peor hueco hasta ahora eran 74, medido el 06/09 en `docs/ASEGURA-MAPFRE-C0058.md`) — mismo backlog ya
documentado, sigue sin acción de Alberto (borrador de consulta a Codeoscopic sin enviar). Codeoscopic:
4 cotizaciones/7d, 2,00€, 0 descartadas — normal.

**Pricing (2bis):** `rail_baja_roto=0` · `bajo_minimo=0` · `oscilantes=0` · **`rail_alza_sin_justificar=1`**
(🟠, `prop_luxury_busto` 2027-01-13: 72€→104€, fecha lejana sin evento ni mercado medido — un solo
caso, no sistémico). 4 palancas activas con `min_price` y `antelacion_k=0`. `horas_desde_ultima_pasada`
marca 11,6h, por debajo del hueco normal de 12h entre la pasada de las 20:30 y la de las 08:30 — no es
una pasada saltada (la de anoche escribió 2 noches con `ok=true`).

**Backlog de PRs (2-ter):** el automerge (`rutinas-automerge.yml`) está sano — decenas de runs en
verde en la última hora. El problema sigue siendo el mismo ya reportado 4 veces: **42 PRs abiertos**
(30+ inspeccionados), varios con `mergeable_state:dirty` por antigüedad (p. ej. `#2741`, 9 días,
registro-only en su día pero su diff actual arrastra 15 ficheros por desincronía con `main`). Sin
cambio de causa raíz desde el informe del 20/09 (aprobación de workflows en Actions) — no se repite
el listado completo, ya hecho ayer. Acción de Alberto: el mismo lote pendiente de revisar/mergear/cerrar.

No se ha podido listar las sesiones del rango (`list_sessions` de Claude Code Remote no está adjunto
en esta pasada) — se dice explícitamente, no se afirma que no hay pendientes de conversación.

**Carril 1:** esta entrada + 4 entradas de memoria + `AUTO-APLICADOS.md`. **Carril 2 vacío** (nada de
código nuevo que arreglar). Aviso Telegram enviado por los hallazgos 🟡 (PR backlog, raíl al alza).

---

## ✅ Pasada ligera — 22/09/2026

**Rango:** 36 commits desde la última auditoría (21/09 10:29, `f050ab3`) hasta hoy (`11037df`),
casi todo correduría — presupuesto al cliente PR 1 y PR 2 en producción, libro de consumo
Codeoscopic, cierre del residuo CIMA (pólizas duplicadas) — más el auto-tarificador Avant2.

**Heartbeat (2-bis):** todo verde salvo los crónicos ya documentados. `ses_transporte`
(`pendienteConocido`, revisar 06/10) sin cambios. `psd2_health_check` sigue con la BBVA rota en
Enable Banking (sesión 401 desde el 13-16/09, Telegram ya enviado en su día, PR #3022) — última
pasada hace 144,9h, todavía dentro de su umbral semanal (192h); no hay pasada nueva que confirme si
sigue caída. Sin reparaciones automáticas en curso (`agente_reparaciones` no consultado esta pasada,
sin indicio de necesidad).

**Correduría (2-quater):** CIMA sigue entrando (`cima_pull_completed` hace ~15h, dentro de 30h;
`errorsCount=0`; cola estable en 148). `correduria_ingesta` sigue DEGRADADA (7 pólizas con
recibos/siniestros huérfanos, backlog ya conocido) y **C0058 (Mapfre) ya son 91 días sin mandar
nada** (89→90→91, incremento diario esperado, sin acción nueva de Alberto). Codeoscopic:
11 cotizaciones/7d, 5,50€, 2 descartadas — coherente con el lanzamiento en producción del
presupuesto al cliente (PR #3281, mismo día).

**Pricing (2bis):** `rail_baja_roto=0` · `bajo_minimo=0` · `oscilantes=0` ·
`rail_alza_sin_justificar=1` (🟠, un solo caso, mismo patrón que ayer). 4 palancas activas y sanas
(`enabled`/`apply_enabled=true`, `min_price` puesto, `antelacion_k=0`). `horas_desde_ultima_pasada`
11,5h — dentro del hueco normal 20:30→08:30 (12h), no es una pasada saltada.

**Backlog de PRs (2-ter):** automerge (`rutinas-automerge.yml`) sano — runs en verde cada pocos
minutos en la última hora. El backlog de PRs abiertos en `mergeable_state:dirty` (p. ej. #2318,
#3157) sigue igual que en las últimas pasadas — mismo problema ya reportado, sin cambio de causa
raíz. No se repite el listado completo.

No se ha podido listar las sesiones del rango (`list_sessions` de Claude Code Remote no está
disponible en esta pasada) — se dice explícitamente, no se afirma que no hay pendientes de
conversación.

**Carril 1:** esta entrada + `AUTO-APLICADOS.md`. **Carril 2 vacío** (nada de código nuevo que
arreglar, nada 🔴). Sin hallazgos nuevos respecto a la pasada de ayer — no se manda Telegram
(ruido redundante sobre lo mismo ya avisado).

---

## ✅ Pasada ligera — 23/09/2026

**Rango:** 8 commits desde la pasada de ayer (`bb0401b`) hasta hoy (`5d0c191`) — CIMA parado
~45h por presupuesto de Actions agotado (arreglado, con respaldo nuevo `cima-pull-respaldo`), alerta
PSD2 BBVA, y «Invitar al portal por lotes» + recorte de minutos de Actions. Las 3 entradas de
`CONTEXTO-SESIONES.md` que corresponden ya estaban anotadas por las propias sesiones — nada que
reconciliar ahí.

**Heartbeat (2-bis):** 43 filas en `agente_latidos`, prácticamente todo ✅. Dos `ok=false`:
`ses_transporte` (crónico desde 21/08, sin establecimientos SES — sin cambios) y
`correduria_renovaciones` (`"no se pudo leer la cartera: red"`, fallo de red de HOY, 25,6h desde su
último ok — todavía dentro de su umbral de ~30h, no es 🔴 por umbral; primera vez que se ve este
motivo, a vigilar si se repite mañana). `agente_reparaciones`: sin intentos en los últimos 7 días.

**Correduría (2-quater):** CIMA entrando con normalidad (`cima_pull_completed` hace <1h, cola
estable en 151, `errorsCount=0`) — coherente con el arreglo de ayer (PR #3293) y con el latido
`cima_pull_respaldo` («al día, no hace falta respaldo»). `correduria_ingesta` sigue DEGRADADA (mismo
backlog conocido: 7 pólizas huérfanas ya en cartera, 3 arrastradas de antes) y **C0058 (Mapfre) ya
son 92 días sin mandar nada** (91→92, incremento diario esperado). Codeoscopic: 11 cotizaciones/7d,
5,50€, 2 descartadas — igual que ayer.

**Pricing (2bis):** `rail_baja_roto=0` · `bajo_minimo=0` · `oscilantes=0` ·
`rail_alza_sin_justificar=1` (🟠, mismo patrón que ayer). 4 palancas activas y sanas
(`enabled`/`apply_enabled=true`, `min_price` puesto, `antelacion_k=0`). `horas_desde_ultima_pasada`
7,8h, `noches_ultima_pasada=16` — sano.

**Backlog de PRs (2-ter):** automerge (`rutinas-automerge.yml`) sano — varios runs en verde en la
última hora, incluida la fusión inmediata del PR de radiografía (#3296). 41 PRs abiertos; el backlog
en `mergeable_state:dirty`/`blocked` (p. ej. #2318 desde el 05/09, #2966 esperando lectura de
Alberto) sigue igual que en las últimas pasadas — mismo problema ya reportado, sin cambio de causa
raíz ni crecimiento apreciable. No se repite el listado completo.

**Frescura de mapas (paso 4):** `docs/FUENTES-DE-VERDAD.md` fila de `cima-ingesta` no incluía el
cron nuevo `cima-pull-respaldo`, `packages/module-seguros/src/ingesta.ts` (`firmaAvisoIngesta`,
`decidirRespaldoPull`) ni `docs/ASEGURA-OS-ARQUITECTURA.md`, todos del commit `852a5bd` de ayer —
corregido. Como `docs/FUENTES-DE-VERDAD.md` es uno de los docs que el automerge de registro
**no** acepta (cambia comportamiento), va en el PR de carril 2 de hoy, no en el de registro.

No se ha podido listar las sesiones del rango (`list_sessions` de Claude Code Remote no está
disponible en esta pasada) — se dice explícitamente, no se afirma que no hay pendientes de
conversación. Los 41 PRs abiertos (2-ter) cubren razonablemente ese hueco: sus títulos no muestran
ninguna sesión sin huella en memoria/bitácora.

**Carril 1:** esta entrada + `AUTO-APLICADOS.md` + `CONTEXTO-SESIONES.md` (PR de registro aparte,
auto-mergeable). **Carril 2:** el fix de `docs/FUENTES-DE-VERDAD.md` (texto acotado, pero cambia un
doc que el automerge excluye a propósito) — PR draft, sin 🔴 nuevo. Sin Telegram: nada que Alberto
no supiera ya de ayer, y el único cambio de carril 2 es una corrección de mapa, no una decisión.

---

## ✅ Pasada ligera — 25/09/2026

**Rango:** desde la pasada de ayer (23/09, `bb0401b`... la de 24/09 no dejó informe propio) hasta
`e988720` — ~25 commits, casi todo correduría (accesos de cliente/póliza #3547+#3555, cuatro fixes
sueltos #3524/#3526/#3528/#3533, tramitación de siniestros #3551, tipografía de marca extendida),
`/banca` e `/inicio` adelgazados (#3541, #3544), botón «Instalar app» (#3559) y el respaldo de CIMA
a las 07:00/14:00/18:00 UTC (#3562, tras el retraso de Actions del 24/09).

### Heartbeat de crons/agentes (2-bis) — sano
43 filas en `agente_latidos`, todo `ok=true` salvo `ses_transporte` (crónico desde 21/08, sin
establecimientos SES — sin cambios, acción pendiente de Alberto). `psd2_health_check` (semanal,
dentro de umbral) sigue reportando la BBVA rota en Enable Banking, ahora "sesión CLOSED, sin
movimientos desde el 10/09" (13 días) — mismo problema ya avisado por Telegram en su día (PR
#2868/#3022), sin novedad que repetir. `agente_reparaciones`: sin intentos en 7 días.

### Correduría (2-quater) — sano, con el mismo backlog conocido
`cima_pull_completed` hace <1h, cola estable en 155, `errorsCount=0`. `correduria_ingesta` sigue
DEGRADADA por C0058 (Mapfre): **94 días sin mandar nada** — la memoria de hoy ya registra que CIMA
dice haberlo reconfigurado el 24/09 pero los 3 pulls posteriores (13:21/17:01/06:49 UTC) siguen sin
traer nada suyo; a vigilar si se resuelve mañana. Codeoscopic: 12 cotizaciones/7d, 0,50€... 5,00€
en total, 3 descartadas — en línea con los días previos. Cepos de aislamiento (`regression-asegura-
aislamiento`, `regression-portal-aislamiento`, `regression-asegura-operador-publico`,
`regression-correduria-puerto`, `regression-asegura-gasto-codeoscopic`) presentes en `test/`.

### 🟠 Salud del precio (2bis) — raíles intactos, pero `oscilantes` sube de 0 a 10
`rail_baja_roto=0` · `bajo_minimo=0` · `horas_desde_ultima_pasada=7,6h` · `noches_ultima_pasada=118`
— todo sano. `rail_alza_sin_justificar=1` (🟠, mismo patrón crónico). **`oscilantes=10`** (🟠, venía
en 0 desde el 20/09): concentrado en `prop_duplex_center` (2026-11-16 a 11-19, hasta 4 cambios de
sentido en 6 pasadas, precio oscilando 115↔190€) y `prop_luxury_busto` (2026-10-01, 10-11, 11-16,
2027-02-06). No es un desplome (el raíl de bajada no se rompe en ninguna) ni vende bajo mínimo: es
ciclo límite en fechas de noviembre, con horquillas de mercado amplias. No dispara Telegram por sí
solo (no es 🔴 de la tabla), pero es la primera vez en 5 días que `oscilantes` no es 0 — queda
anotado para que la próxima pasada confirme si es puntual o si se instala. Las 4 palancas
(`enabled`/`apply_enabled=true`, `min_price` puesto, `antelacion_k=0`) sanas.

### Backlog de PRs (2-ter) — automerge vivo, mismo backlog sin crecer de forma anómala
`rutinas-automerge.yml` con runs en verde en la última hora (incluida la fusión del PR de
radiografía #3563). Sigue habiendo PRs `claude/*` abiertos desde principios de mes (p. ej. #2318
desde el 05/09, #2868/#3022 sobre la alerta BBVA) — mismo problema ya reportado varias veces, sin
causa raíz nueva. No se repite el listado completo.

### Reconciliación memoria/skills
4 commits del rango (#3524, #3526, #3528, #3533) tenían cambios de producto reales sin entrada en
`docs/CONTEXTO-SESIONES.md` (solo tocaban el JSON de traza de sesión, no la memoria) — añadida una
entrada agrupada. El resto del rango ya estaba anotado por las propias sesiones. `docs/FUENTES-DE-
VERDAD.md` sigue cubriendo los ficheros nuevos de correduría (`seguros-cliente.ts`, `Accesos.tsx`,
`siniestro-tramitacion.ts`, `siniestro-historial.ts`) bajo sus globs existentes — sin drift.

No se ha podido listar las sesiones del rango (`list_sessions` de Claude Code Remote no está
disponible en esta pasada) — se dice explícitamente. El backlog de PRs (2-ter) no muestra ningún
título sin huella en memoria/bitácora.

**Carril 1:** esta entrada + `AUTO-APLICADOS.md` + `CONTEXTO-SESIONES.md`. **Carril 2:** ninguno
nuevo hoy (nada de código, nada `⛔`). Sin Telegram: sin 🔴, y el único 🟠 nuevo (`oscilantes`) no
cruza el umbral que pide aviso inmediato — queda anotado para la próxima pasada.

---

## ✅ Pasada ligera — 26/09/2026

**Rango:** desde la pasada del 25/09 (`7a354c3`) hasta `1a17282` — 49 commits, casi todo correduría
(diferencias con CIMA automáticas + aviso «póliza emitida» + 6 revisiones del agente #3635, retención
CIMA a 6 años + clientes fusionados con DNIs distintos #3637, cierre del hilo CIMA/Mapfre, portal:
dueño de empresa automático #3616, fix del webhook de Resend que ignoraba TODOS los eventos #3619,
recaptación por email — tracking de aperturas estaba apagado #3591, retarificación con fecha de
efecto/desempate/coberturas #3621).

### Heartbeat de crons/agentes (2-bis) — sano, con dos matices
49 filas en `agente_latidos`. `ses_transporte` sigue en rojo crónico (sin establecimientos SES, sin
cambios, acción pendiente de Alberto). **`sivra_mercado_booking` (rutina diaria de Booking) lleva
42,4 h sin una pasada `ok=true`** (última buena: 24/09 13:46 UTC) — por encima del umbral diario
(~30 h). No es un silencio total: la última pasada sí trajo 239 comparables reales en 24 ventanas,
pero se quedó a 0/4 en las ventanas de "escaparate propio" (los 4 pisos), que es lo que la marca
`ok=false`. Anotado para que la próxima pasada confirme si se resuelve sola o se instala — no cruza
el umbral de aviso inmediato porque no es un silencio total y ya tiene su propio latido vigilándolo.
`agente_reparaciones`: sin intentos en 7 días.

### Correduría (2-quater) — sano
`cima_pull` con evento hace <1h (158 ficheros en cola). `correduria_ingesta` sigue con el mismo
backlog conocido de cuarentena (objetos de C0468/C0072 sin guardar, ya arrastrado de antes — nada
nuevo). Codeoscopic: 13 cotizaciones/7d, 5,50€ en total, 3 descartadas — en línea con días previos.
Cepos de aislamiento (`regression-asegura-aislamiento`, `regression-portal-aislamiento`,
`regression-asegura-operador-publico`, `regression-correduria-puerto`,
`regression-asegura-gasto-codeoscopic`) presentes en `test/`.

### 🟠 Salud del precio (2bis) — raíles intactos, pero `oscilantes` se dispara de 10 a 103 y hay un
### caso concreto que merece el ojo de Alberto HOY

`rail_baja_roto=0` · `bajo_minimo=0` · `horas_desde_ultima_pasada=7,6h` · `noches_ultima_pasada=134`
— sano. `rail_alza_sin_justificar=1` (🟠, patrón crónico ya conocido). **`oscilantes=103`** (🟠, venía
en 10 ayer): ya no está concentrado en un par de fechas de noviembre — se extiende a `busto_reform`
(46 fechas, feb-ago 2027), `duplex_center` (35 fechas, sep 2026-sep 2027), `luxury_busto` (21 fechas,
oct 2026-may 2027) y `house_sevillana` (1 fecha). Las palancas de los 4 pisos están sanas
(`enabled`/`apply_enabled=true`, `min_price` puesto, `antelacion_k=0`).

**El caso que se sale de la plantilla de "ciclo límite":** `prop_house_sevillana` para **2026-09-30**
(a 4 días vista) pasó de 478€ (23/09 00:20 UTC) a **1.019€** en la pasada siguiente (23/09 14:23 UTC,
+113%) y desde entonces oscila 928-1.019€. La media de 20 comparables reales de Booking para esa
misma fecha (`market_rates`, escenario `prop_house_sevillana`) es **458€** — prácticamente el precio
de ANTES del salto, no lo justifica ni de lejos el umbral de `premioMercadoFecha` (exige ≥1,5× la
base normal). No hay fila en `pricing_eventos_auto` para esa fecha. La consulta de raíl de este
bloque NO lo marca como `rail_alza_sin_justificar` porque el ancla (`ref24`) es el precio del día
ANTERIOR completo (23/09 mismo día no cuenta dos veces), y la exención de "premio de mercado" de esta
consulta solo comprueba que EXISTE mercado medido para la fecha (≥3 comps) — no que ese mercado
justifique la subida. O sea: el salto real pasó por debajo del radar de la propia auditoría, y solo
apareció por vía del conteo de `oscilantes`. **No se ha tocado código ni el precio**: es un hallazgo
para que Alberto decida si es un bug del motor (dqFactor/demanda mal calculado, ver
`pricing-premio-mercado.ts`) o un ajuste legítimo que no se puede verificar desde aquí — la fecha
está a 4 días y el precio sigue publicado ~2× el mercado medido.

### Backlog de PRs (2-ter) — sano
`list_pull_requests` no devuelve ningún PR abierto de rama `claude/*` contra este repo en este
momento. `rutinas-automerge.yml` con runs en verde en la última hora (varios `pull_request_target` +
`check_suite` sobre los últimos merges de hoy).

### Reconciliación memoria/skills
De los 49 commits del rango, 14 no tocan `docs/CONTEXTO-SESIONES.md` — 13 son regeneraciones de
radiografía (`[skip vercel]`, no requieren memoria) o bitácoras de agentes (`AGENTES-BITACORA.md`,
que es su propio registro); el único fix de código sin entrada propia (`#3619`, webhook de Resend)
ya está referenciado dentro de la entrada del 25/09 sobre "los 13 correos de la correduría". No se
detecta ningún commit de producto sin huella en memoria. No se ha podido listar las sesiones del
rango (`list_sessions` de Claude Code Remote no está disponible en esta pasada) — se dice
explícitamente, no se afirma que no haya pendientes.

**Carril 1:** esta entrada + `AUTO-APLICADOS.md`. **Carril 2:** el hallazgo de `house_sevillana`
2026-09-30 (sin código que tocar, es una decisión/investigación de Alberto) — PR draft con este
informe + aviso Telegram. El resto no cruza el umbral de PR (nada `⛔`, nada 🔴).

---
<!-- verificado: 2026-09-26 -->
