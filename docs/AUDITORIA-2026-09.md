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

## ✅ Pasada ligera — 03/09/2026

**Rango:** 50 commits desde la última auditoría (01/09, `65da9a5`) hasta hoy (`c4fc90f`), día
dedicado casi por completo a la correduría (`apps/asegura`, `apps/asegura-portal`,
`packages/module-seguros*`, `/correduria` de plataforma): ficha de cliente con pestañas, fusión de
duplicados (lotes 4-5), personas sin vínculo, portal del cliente en Vercel, cotizaciones guardadas,
cuadre de comisiones e incidente de lectura de cartera (`asegura_error`, CERRADO). Todo verificado
y auto-documentado por las propias sesiones en `docs/CONTEXTO-SESIONES.md`.

### Estructura y lockfile — sanos
`auditar-estructura.mjs --check` ✓ (ya regenerada por los propios commits del rango, varios
`chore(auditoría)` de por medio). `pnpm-lock.yaml`/manifiestos sin diff pendiente.

### 🔴 Heartbeat de crons/agentes (paso 2-bis) — dos `⛔` que siguen sin resolver
- **`sivra_domotica_acceso`**: `ok=false` desde el 01/09 12:40 UTC (43,5h), detalle: *"2
  cerradura(s) · 1 con la ventana desactualizada · **1 con ERROR**"*. Ya se había «visto al pasar»
  el 02/09 (memoria de ese día) pero sigue sin resolver >24h después — una cerradura real de un
  piso en estado de error afecta al acceso de huéspedes. `agente_reparaciones`: sin intento
  automático en curso para este agente.
- **`sivra_pilot_track`**: `ok=false` desde el 01/09 09:15 UTC (46,9h), *"snapshot viejo (1d) —
  ¿corrió rates/snapshot?"*. Sin intento de reparación automática. Menor prioridad (tracking del
  piloto de pricing, no dinero directo), pero es un `⛔` nuevo desde la pasada del 01/09.
- `ses_transporte` sigue en rojo por el motivo ya conocido (sin acción de Alberto en el portal
  SES) — no es hallazgo nuevo. Resto de ~29 agentes, dentro de su cadencia.

### Backlog de PRs de rutinas (paso 2-ter) — sano, con una nota
`rutinas-automerge.yml` activo (dos PRs de registro de hoy mergeados en <4 min). Sin PRs de
registro atascados >24h. 🟡 **`#1997`** (draft): su título dice "pasada diaria trading-analista
01/09" pero su diff real son 19 archivos de `apps/asegura` (ficha, retarificador, Codeoscopic) —
posible rama reutilizada por error. Revisar antes de mergear tal cual: el contenido no coincide
con lo que anuncia. `#2016` (draft mensual `patrimonio-cfo`) sin bloqueo aparente.

### 🔴 Salud del precio SIVRA (paso 2bis, obligatorio) — el motor corre pero no escribe
`rail_baja_roto=0` · `bajo_minimo=0` · `rail_alza_sin_justificar=0` (sin roturas de raíl) ·
`oscilantes=16` (sigue bajando). Pero: **última pasada real hace 23,6h** (>10h de umbral) y el
latido `sivra_pricing_apply` (`ok=true`, corrió hace 11,6h) reporta *"0 noche(s) escritas en 4
piso(s)"* — el cron se ejecuta y no falla, pero lleva al menos una pasada sin aplicar ningún
precio. Palancas: los 4 pisos con `enabled`/`apply_enabled=true`, `min_price` puesto,
`antelacion_k=0` (apagada, correcto) — no es un apagado de palanca. **Causa sin determinar**;
merece revisión de por qué el motor decide "0 noches" de forma sostenida.

### 🔴 Salud de la correduría (paso 2-quater, obligatorio) — cola CIMA atascada
`correduria_renovaciones` fresco y sano. `correduria_ingesta`: `ok=true` (el latido en sí
funciona) pero su propio `detalle` dice **"ingesta CIMA DEGRADADA"** — 3 ficheros sin procesar en
7 días + 20 pólizas cuyos recibos/siniestros no casan con la cartera (39 de backlog ya conocido).
Confirmado por SQL directa: **`queueDepth=128`, `processed=0`** en las últimas 4 pasadas de
`cima_pull` (incluidas 3 en modo `real`, sin errores reportados), sin ningún pull nuevo desde el
02/09 15:13 UTC — el cron 05:30 UTC de hoy aún no ha dejado evento (dentro del margen de retraso
conocido de GitHub Actions, ~3h). **No es una sorpresa nueva**: la propia sesión de hoy ya lo
documentó a las 06:18 UTC (`docs/CONTEXTO-SESIONES.md`, "Check-in post-fusión CIMA") con
recomprobación agendada ~09:43 y lo atribuye a los 3 fallos HTTP 500 del adaptador Java (Fly de
Manuel) del 31/08-01/09. Esta pasada confirma que, a las 08:06 UTC, la cola sigue exactamente
igual (128/0) — sigue sin resolver, por eso se repite el aviso. Codeoscopic: 0 cotizaciones/0€ en
7 días (sin gasto, sin alarma). Tests de aislamiento (`regression-asegura-aislamiento`,
`regression-portal-aislamiento`, `regression-asegura-operador-publico`,
`regression-correduria-puerto`, `regression-asegura-gasto-codeoscopic`) existen los 5 (no se
corrió la suite completa, modo ligero). `agente-correduria`: sin entradas nuevas en
`AGENTES-BITACORA.md`, sigue pausada correctamente.

### Reconciliación memoria/skills — un dato corregido (carril 2, ficheros de comportamiento)
Sin drift de fondo (las 50 sesiones del rango se auto-documentaron con mucho detalle). Único
hallazgo: **"54 tablas" era un dato viejo** — el recuento real y verificado en `apps/asegura/CLAUDE.md`,
`docs/TRASPASO-CORREDURIA.md` y `docs/FUENTES-DE-VERDAD.md` es **52 tablas** en el schema `seguros`.
Corregido en `CLAUDE.md:69` y `.claude/skills/central-maestro/SKILL.md:42`. Va a este PR (carril 2)
en vez de a `main` directo porque son ficheros de comportamiento (`CLAUDE.md`/`.claude/skills/**`),
no de registro puro. `HUECOS-ABIERTOS.md`, `SKILLS.md` (ya lista `correduria-crm`),
`FUENTES-DE-VERDAD.md` y las reglas fiscales dictadas por Alberto: sin discrepancias. Sin cambios
en `apps/ia-rest/**` con superficie de usuario → nada que tocar en manuales.

**Nota de entorno:** el push directo a `main` no está disponible desde esta sesión (branch
asignado por el harness de tareas) — el fix de texto de comportamiento y el informe van juntos a
este PR de carril 2 en vez de fragmentarse, siguiendo el plan B del apartado "Dos carriles" de la
skill.

---
<!-- verificado: 2026-09-03 -->
