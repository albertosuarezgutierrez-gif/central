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
<!-- verificado: 2026-09-20 -->
