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
<!-- verificado: 2026-09-01 -->
