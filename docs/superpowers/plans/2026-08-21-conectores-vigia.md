# Vigía de conectores MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el agente programado `conectores-vigia`, arreglar el automerge que hoy deja colgados los PRs de registro de tres rutinas vivas, e integrar el calendario de earnings de Alpha Vantage en `trading-analista`.

**Architecture:** Tres fases independientes, **un PR por fase**. La fase 1 es un arreglo de infraestructura que no depende de nada y desbloquea a tres rutinas que ya corren. La fase 2 es el agente nuevo (skill + docs de estado + fichas). La fase 3 es una integración de datos que vive en el prompt de una skill existente, más una guarda de código que aplica la regla de la casa sobre el «no lo sé».

**Tech Stack:** Markdown (skills y docs), bash dentro de un workflow de GitHub Actions, `node --test` con TypeScript para los guardianes de `test/`, TypeScript en `packages/module-trading` y `apps/plataforma`.

**Spec:** `docs/superpowers/specs/2026-08-21-conectores-vigia-design.md`

---

## Contexto que el implementador necesita antes de empezar

Lee esto aunque tengas prisa; casi todos los errores posibles en este plan salen de no saber una de estas cinco cosas.

1. **El entorno es efímero.** El contenedor se borra al acabar la sesión. Lo único que sobrevive es lo commiteado. Por eso el estado de un agente vive en un fichero `docs/*.md` y no en memoria.
2. **Las rutinas NO pueden empujar a `main`.** Corren bajo el harness de tareas de GitHub, que les asigna una rama. Cada pasada acaba en un PR. Si ese PR no se mergea solo, se pudre en conflicto en 1-3 días (pasó con cinco PRs entre el 04 y el 07/08/2026). Eso es lo que arregla la fase 1.
3. **Dos carriles.** Los ficheros que solo *cuentan lo que pasó* (memoria, bitácoras, informes) se automergean. Los que *le dicen a un agente qué hacer* (`.claude/**`, `CLAUDE.md`, `docs/SKILLS.md`, `docs/RUTINAS-PROGRAMADAS.md`) NUNCA se automergean: un agente que se reescribe sus instrucciones sin que nadie mire es el fallo que el repo evita a propósito.
4. **Regla de la casa: `NULL` ≠ «no hay».** Está en `CLAUDE.md` y es la que gobierna la fase 3. Un dato que no se ha podido mirar jamás se pinta como «no hay nada»; se pinta como «pendiente». Colapsarlo con `?? false` convierte un «no lo sé» en una afirmación falsa.
5. **Evidencia antes que catálogo.** La ficha de un conector describe lo que el producto hace, no lo que tu tier te deja hacer. Nada se da por disponible sin una llamada real. Esta regla nació en la sesión que produjo el spec y se ganó dos veces el mismo día (§5 del spec).

**Comandos de verificación que usarás en todo el plan:**

```bash
npx --yes pnpm@10.33.0 run test:guardia   # los guardianes de test/*.test.ts — rápido
npx --yes pnpm@10.33.0 -C packages/module-trading run test   # tests del módulo de trading
```

---

## Estructura de ficheros

| Fichero | Responsabilidad | Fase |
|---|---|---|
| `test/regression-automerge-registro.test.ts` | **Crear.** Guardián: todo fichero de estado de una rutina debe ser reconocido por `es_registro()`. | 1 |
| `.github/workflows/rutinas-automerge.yml` | **Modificar** (`es_registro()`, ~línea 102-119). Añadir los ficheros de estado de los vigías. | 1 |
| `.claude/skills/conectores-vigia/SKILL.md` | **Crear.** El prompt del agente. | 2 |
| `docs/VIGIA-CONECTORES.md` | **Crear.** Estado entre pasadas: conectores vistos, veredictos, cuotas, mapa rutina→endpoint. | 2 |
| `docs/HUECOS-ABIERTOS.md` | **Crear.** Catálogo de «esto nos falta», sembrado desde los docs que ya lo contienen sin llamarlo así. | 2 |
| `docs/RUTINAS-PROGRAMADAS.md` | **Modificar.** Ficha nº 16. | 2 |
| `docs/SKILLS.md` | **Modificar.** Fila del índice. | 2 |
| `docs/AGENTES-MAPA.md` | **Modificar.** Nodo del diagrama + fila de la tabla. | 2 |
| `docs/FUENTES-DE-VERDAD.md` | **Modificar.** Filas doc→código de los dos docs nuevos. | 2 |
| `packages/module-trading/src/riesgo.ts` | **Modificar.** Distinguir «sin fecha» de «no hay earnings próximos». | 3 |
| `packages/module-trading/test/riesgo.test.ts` | **Modificar.** Tests de los tres estados. | 3 |
| `.claude/skills/trading-analista/references/pasada-diaria.md` | **Modificar.** Paso de Alpha Vantage. | 3 |

---

# FASE 1 — El automerge no reconoce los ficheros de estado de los vigías

**PR propio.** Toca un workflow → carril 2, revisión de Alberto.

**El problema, en concreto:** `es_registro()` reconoce nueve rutas. No están `docs/VIGIA-OSS.md`, `docs/BUSCADOR-IA.md` ni `docs/FISCAL-AYUDAS.md`, que son los ficheros de estado de `github-vigia`, `buscador-ia` y `fiscal-novedades`. Cuando esas rutinas actualizan su estado —que es puro registro, exactamente igual que una entrada de bitácora— su PR cae en carril 2 y espera ojo humano. Es el pudrirse-en-conflicto que el workflow existe para evitar, en las tres rutinas a las que nadie miró.

### Task 1.1: Guardián que impide que vuelva a pasar

Un simple `sed` al workflow arregla el síntoma de hoy y deja intacta la causa: nada obliga a que el fichero de estado de un vigía futuro (empezando por el de la fase 2) entre en la lista. El guardián es lo que convierte el arreglo en permanente.

**Files:**
- Test: `test/regression-automerge-registro.test.ts` (crear)

- [ ] **Step 1: Escribe el test que falla**

El test extrae la función `es_registro()` del YAML y la ejecuta **en bash de verdad**, no reimplementando su lógica de `case` en JavaScript: reimplementarla haría que el test pasara mientras el workflow falla, que es justo el fallo que estamos previniendo.

Crea `test/regression-automerge-registro.test.ts`:

```typescript
// Guardián del automerge de rutinas. `node --test` (gate en CI vía `pnpm test:guardia`).
//
// EL FALLO QUE PREVIENE (detectado 21/08/2026): `.github/workflows/rutinas-automerge.yml`
// mergea solo los PRs cuyo diff toca ÚNICAMENTE ficheros de registro, y decide qué es
// "registro" con la función bash `es_registro()`. Los ficheros de ESTADO de los agentes
// programados (docs/VIGIA-OSS.md, docs/BUSCADOR-IA.md, docs/FISCAL-AYUDAS.md) son registro
// puro —cuentan lo que el agente vio— pero nadie los añadió a esa lista. Resultado: sus PRs
// caen en carril 2 y esperan ojo humano para nada, hasta pudrirse en conflicto (el mismo
// fallo de los cinco PRs muertos del 04-07/08/2026).
//
// Arreglarlo a mano no basta: nada impide que el PRÓXIMO vigía nazca con el mismo defecto.
// Este test declara los ficheros de estado y comprueba que el workflow los reconoce.
//
// Se ejecuta la función bash REAL extraída del YAML. Reimplementar su `case` en JS haría
// que el test pasara mientras el workflow falla — exactamente lo que queremos evitar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const WORKFLOW = '.github/workflows/rutinas-automerge.yml'

// Ficheros de ESTADO de agentes programados: los escribe el agente para contar lo que vio.
// Al dar de alta un agente con fichero de estado propio, añádelo aquí Y a es_registro().
const ESTADO_DE_AGENTES = [
  'docs/VIGIA-OSS.md',        // github-vigia
  'docs/BUSCADOR-IA.md',      // buscador-ia
  'docs/FISCAL-AYUDAS.md',    // fiscal-novedades
  'docs/VIGIA-CONECTORES.md', // conectores-vigia
]

// Ficheros que NUNCA deben colarse como registro: le dicen a un agente qué hacer.
const NUNCA_REGISTRO = [
  '.claude/skills/conectores-vigia/SKILL.md',
  'docs/SKILLS.md',
  'docs/RUTINAS-PROGRAMADAS.md',
  'docs/FUENTES-DE-VERDAD.md',
  'CLAUDE.md',
  'docs/HUECOS-ABIERTOS.md',  // catálogo de decisiones, no registro de lo que pasó
  '.github/workflows/rutinas-automerge.yml',
  'apps/plataforma/lib/dinero.ts',
]

/** Extrae el cuerpo de `es_registro() { ... }` tal cual está en el YAML. */
function extraerFuncion(): string {
  const yaml = readFileSync(join(ROOT, WORKFLOW), 'utf8')
  const m = /^(\s*)es_registro\(\) \{\n([\s\S]*?)\n\1\}$/m.exec(yaml)
  assert.ok(m, `no se encontró es_registro() en ${WORKFLOW} — ¿la han renombrado o reindentado?`)
  return `es_registro() {\n${m[2]}\n}`
}

/** Corre la función bash real contra una ruta. true = la reconoce como registro. */
function esRegistro(ruta: string): boolean {
  const script = `${extraerFuncion()}\nif es_registro "$1"; then echo SI; else echo NO; fi`
  const out = execFileSync('bash', ['-c', script, '--', ruta], { encoding: 'utf8' })
  return out.trim() === 'SI'
}

test('el automerge reconoce los ficheros de estado de los agentes programados', () => {
  const invisibles = ESTADO_DE_AGENTES.filter((f) => !esRegistro(f))

  assert.deepEqual(
    invisibles,
    [],
    'Estos ficheros de estado NO los reconoce es_registro(), así que el PR de esa rutina ' +
      'esperará ojo humano para un cambio que es puro registro, y se pudrirá en conflicto. ' +
      `Añádelos al case de es_registro() en ${WORKFLOW}.`,
  )
})

test('el automerge NO reconoce como registro lo que dice a un agente qué hacer', () => {
  const colados = NUNCA_REGISTRO.filter((f) => esRegistro(f))

  assert.deepEqual(
    colados,
    [],
    'Estos ficheros cambian el COMPORTAMIENTO de un agente o del repo y se estarían ' +
      'auto-mergeando sin que nadie los mire. Sácalos del case de es_registro().',
  )
})
```

- [ ] **Step 2: Ejecuta el test y comprueba que falla**

Run: `npx --yes pnpm@10.33.0 run test:guardia 2>&1 | grep -A12 "estado de los agentes"`

Expected: FALLA. El primer test debe listar los cuatro ficheros de `ESTADO_DE_AGENTES` como invisibles (`VIGIA-CONECTORES.md` aún no existe, pero el test comprueba la lista del workflow, no el disco, así que también sale). El segundo test debe PASAR ya.

Si el primer test pasa, para: significa que `extraerFuncion()` no está encontrando la función y `esRegistro()` devuelve algo raro. Depúralo antes de seguir.

- [ ] **Step 3: Arregla el workflow**

En `.github/workflows/rutinas-automerge.yml`, dentro del `case` de `es_registro()`, justo **después** de la línea `docs/memoria/*.md)         return 0 ;;`, añade:

```bash
              # Ficheros de ESTADO de los agentes programados: el agente cuenta ahí lo que vio
              # (versiones, veredictos, fecha de pasada). Es registro puro, igual que una entrada
              # de bitácora. Sin esta línea el PR de cada vigía espera ojo humano para nada y se
              # pudre en conflicto — el fallo de los cinco PRs del 04-07/08/2026, repetido en
              # las tres rutinas a las que nadie miró (detectado 21/08/2026).
              # OJO: el CATÁLOGO de huecos (docs/HUECOS-ABIERTOS.md) NO entra aquí: eso no
              # cuenta lo que pasó, decide qué buscamos. Lo mira Alberto.
              docs/VIGIA-*.md)           return 0 ;;
              docs/BUSCADOR-IA.md)       return 0 ;;
              docs/FISCAL-AYUDAS.md)     return 0 ;;
```

- [ ] **Step 4: Ejecuta el test y comprueba que pasa**

Run: `npx --yes pnpm@10.33.0 run test:guardia`

Expected: PASS, los dos tests.

- [ ] **Step 5: Comprueba que no has roto el YAML**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/rutinas-automerge.yml')); print('YAML OK')"
```

Expected: `YAML OK`. Si falla, casi seguro es la indentación del bloque que añadiste — tiene que alinear exactamente con las otras ramas del `case` (14 espacios).

- [ ] **Step 6: Commit**

```bash
git add test/regression-automerge-registro.test.ts .github/workflows/rutinas-automerge.yml
git commit -m "El automerge no reconocía los ficheros de estado de los vigías

es_registro() decide qué PR de rutina se mergea solo. Los ficheros de estado de
github-vigia, buscador-ia y fiscal-novedades no estaban en la lista, así que sus
PRs esperaban ojo humano para un cambio que es puro registro — y se pudrían en
conflicto, que es el fallo que este workflow existe para evitar.

El guardián nuevo declara los ficheros de estado y ejecuta la función bash REAL
extraída del YAML, para que el próximo vigía no nazca con el mismo defecto. Y
comprueba la dirección contraria: que nada que diga a un agente qué hacer se cuele
como registro."
```

---

# FASE 2 — El agente `conectores-vigia`

**PR propio.** Toca `.claude/**` y docs de instrucciones → carril 2.

### Task 2.1: El catálogo de huecos

Sin este fichero el criterio 1 del agente no tiene contra qué cruzar. La información ya existe pero dispersa y sin nombre.

**Files:**
- Create: `docs/HUECOS-ABIERTOS.md`

- [ ] **Step 1: Lee las fuentes de las que se siembra**

```bash
sed -n '/## 2. Ranking/,/^## 3/p' docs/TRADING-FUENTES-PAGO.md
grep -n "pendiente\|falta\|no tenemos" docs/EINFORMA-CONTRATACION.md | head -20
```

No inventes huecos. Un hueco solo entra si puedes citar el fichero y la línea donde está declarado.

- [ ] **Step 2: Crea el catálogo**

```markdown
# Huecos abiertos — qué nos falta y quién lo necesita

> **Para qué.** Es el catálogo explícito de «esto no lo tenemos». Lo cruza `conectores-vigia`
> (mensual, día 5) contra el registro de conectores MCP: sin este fichero, ese agente no tiene
> contra qué comparar y acabaría haciendo barrido semántico, que es ruido.
>
> **Cómo se mantiene.** A mano cuando una sesión detecta un hueco, y por `/auditoria-diaria`
> (carril 1, se auto-aplica a `main`). Si solo se llenara a mano nacería completo hoy y estaría
> viejo en dos meses — y entonces el vigía callaría por la razón equivocada: no porque no haya
> nada, sino porque no sabe lo que falta.
>
> **Regla de entrada.** Un hueco solo entra con su fuente citada (fichero + por qué). Un hueco
> sin fuente es una opinión, y el vigía acabaría persiguiendo fantasmas.
>
> **Regla de salida.** Cuando un hueco se cierra, se borra su fila y se anota en
> `docs/VIGIA-CONECTORES.md` con qué se cerró.

## Huecos vivos

| # | Hueco | Vertical | Fuente | Por qué importa |
|---|---|---|---|---|
| H1 | Cierres ajustados por splits y dividendos (3er fallback de precios, tras Stooq y Yahoo) | trading | `docs/TRADING-FUENTES-PAGO.md` §2 | A 15 años hay muchos splits. La guarda `serieDiscontinua` caza lo imposible, no lo erróneo. **Alpha Vantage NO lo cierra**: `TIME_SERIES_DAILY_ADJUSTED` es premium (verificado 21/08/2026). Candidato: EODHD (~50-80 US$/mes). |
| H2 | Screener de acciones para la cantera | trading | `docs/TRADING-FUENTES-PAGO.md` §2 | El plan Free de FMP no da `/stable/company-screener`. `Datos financieros` tiene `screen_stocks` pero esa cuenta está a `$0.00`. Coste de desbloqueo: ~20 US$. |
| H3 | Datos de mercado en vivo de IBKR | trading | `docs/TRADING-FUENTES-PAGO.md` §2 | No es investigación, es fontanería de la ejecución: imprescindibles al abrir el Tramo 1 con dinero real. Pocos US$/mes. |

## Huecos cerrados (histórico corto)

| Hueco | Cerrado con | Fecha |
|---|---|---|
| Fecha de próximos resultados (la guarda `earningsInminente` no podía vetar sin ella) | Alpha Vantage `EARNINGS_CALENDAR`, tier gratis | 21/08/2026 |
| Histórico de deslistadas (sesgo de supervivencia del retrovisor) | Alpha Vantage `LISTING_STATUS`, tier gratis (8.491 filas con `ipoDate`/`delistingDate`) | 21/08/2026 |
```

- [ ] **Step 3: Commit**

```bash
git add docs/HUECOS-ABIERTOS.md
git commit -m "Catálogo de huecos abiertos: lo que nos falta, con su fuente citada

Esta información ya existía pero dispersa y sin nombre (TRADING-FUENTES-PAGO §2 es
un catálogo de huecos que no se llama así). conectores-vigia lo cruza contra el
registro de conectores; sin él tendría que hacer barrido semántico, que es ruido."
```

### Task 2.2: El fichero de estado del vigía

**Files:**
- Create: `docs/VIGIA-CONECTORES.md`

- [ ] **Step 1: Crea el fichero con el estado ya conocido**

Siémbralo con lo verificado el 21/08/2026 — no lo dejes vacío «para que lo llene la primera pasada»: un fichero vacío hace que la primera pasada no sepa qué es nuevo y lo reporte todo.

```markdown
# Vigía de conectores MCP — estado

> Estado entre pasadas de `conectores-vigia` (mensual, día 5). El contenedor es efímero:
> lo que no está aquí, no existe para la próxima pasada.
>
> **Regla dura:** ningún veredicto se anota sin una llamada real al endpoint. La ficha de un
> conector describe lo que el producto hace, no lo que NUESTRO tier deja hacer. Sin evidencia,
> la fila no se escribe.

## Última pasada

`—` (sin pasada aún; sembrado a mano el 21/08/2026)

## Veredictos

| Conector | Estado | Evidencia | Fecha |
|---|---|---|---|
| Alpha Vantage | **Conectado.** Cierra H-earnings y H-deslistadas; NO cierra H1. | `EARNINGS_CALENDAR` ✅ (ISRG → 2026-10-20, est. 2,63 USD) · `LISTING_STATUS` ✅ (8.491 deslistadas) · `TIME_SERIES_DAILY_ADJUSTED` ❌ *"this is a premium endpoint"* | 21/08/2026 |
| Datos financieros | **Conectado pero sin saldo.** No usar sin recargar. | `Your current balance is $0.00`. Sus capacidades ya las cubren piezas propias: `/api/trading/insiders` (Form 4), `/api/trading/gurus` (Dataroma), `/api/trading/fundamentales` (SEC XBRL). | 21/08/2026 |
| Twelve Data | Descartado | Indicadores técnicos que `@central/module-trading` ya calcula (SMA/EMA/RSI/MACD/ATR/ADX). | 21/08/2026 |
| Bigdata.com | **Descartado por regla de la casa** | Noticias y sentimiento. Las noticias son CONTEXTO y jamás entran al modelo. | 21/08/2026 |
| Webull | Descartado | Otro bróker, con herramientas de escritura. Riesgo sin beneficio: IBKR ya cubre el caso. | 21/08/2026 |
| Morningstar · MSCI · Moody's | Descartados | Enterprise de pago; ninguna hipótesis firmada los usa. | 21/08/2026 |
| D&B Finance · Datarails | Descartados | No son bolsa (crédito corporativo y FP&A). | 21/08/2026 |

## Cuotas (recurso COMPARTIDO — quien la gasta se la quita a otro)

| Conector | Cuota | Quién la consume | Notas |
|---|---|---|---|
| Alpha Vantage | ~25 llamadas/día (tier gratis; **verificar**, el número viene de un `rate_limit` observado, no de la factura) | `trading-analista` (1/día) · `conectores-vigia` (canarios, 1/mes) | `EARNINGS_CALENDAR` se pide UNA vez SIN `symbol` (devuelve el calendario entero) y se filtra en local. Símbolo a símbolo revienta la cuota con una watchlist de 15. |

## Mapa rutina → endpoint del que depende (lo recorre el paso canario)

| Rutina | Conector | Endpoint | Si muere… |
|---|---|---|---|
| `mercado-booking` | Booking.com | `accommodations_search` | `market_rates` deja de distinguir temporada y el pricing decide con comparables viejos. |
| `trading-analista` | IBKR | `get_price_history`, `get_price_snapshot`, `get_account_summary` | La pasada nocturna no puede puntuar nada. |
| `trading-analista` | Alpha Vantage | `EARNINGS_CALENDAR` | La guarda `earningsInminente` deja de vetar **en silencio**. Ver `packages/module-trading/src/riesgo.ts`. |

## Higiene de los conectados

| Conector | Uso en el repo | Escritura | Veredicto |
|---|---|---|---|
| *(lo rellena la primera pasada — paso 4)* | | | |

## Bitácora de hallazgos

*(vacía; una línea por hallazgo, con fecha y URL)*
```

- [ ] **Step 2: Commit**

```bash
git add docs/VIGIA-CONECTORES.md
git commit -m "Estado de conectores-vigia, sembrado con lo verificado el 21/08

Sembrado y no vacío a propósito: una primera pasada sin estado previo no sabe qué
es nuevo y lo reporta todo."
```

### Task 2.3: La skill

**Files:**
- Create: `.claude/skills/conectores-vigia/SKILL.md`

- [ ] **Step 1: Lee la skill hermana para copiar su forma**

Run: `cat .claude/skills/github-vigia/SKILL.md`

Fíjate en el protocolo de aviso (preflight al ARRANCAR, no al final) y en el auto-informe obligatorio. Los dos se replican literalmente: no los reinventes.

- [ ] **Step 2: Crea la skill**

```markdown
---
name: conectores-vigia
description: Agente PROGRAMADO mensual (día 5) que vigila los conectores MCP — cruza el registro contra docs/HUECOS-ABIERTOS.md, hace de canario sobre los conectores de los que dependen las rutinas vivas, y audita la higiene de los ya conectados. Estado en docs/VIGIA-CONECTORES.md; Telegram + PR draft. Úsala si Alberto pide "revisa si hay conectores nuevos que encajen" o al disparo mensual. Sin secretos.
---

# Vigía de conectores MCP

Vigila **los conectores**: los que podrían entrar, los que ya están y los que sostienen a otras
rutinas. Entorno **efímero**: cada pasada es completa e idempotente; el estado vive en
**`docs/VIGIA-CONECTORES.md`** (commiteado).

> ⚠️ **REGLA DURA — evidencia antes que catálogo.** Ningún conector se recomienda, y ningún
> endpoint se da por vivo, **sin una llamada real de prueba** al endpoint que supuestamente cierra
> el hueco. La ficha describe lo que el producto hace, no lo que NUESTRO tier deja hacer. Esta
> regla se ganó dos veces el 21/08/2026: Alpha Vantage anunciaba precios ajustados y
> `TIME_SERIES_DAILY_ADJUSTED` respondió *"this is a premium endpoint"*; y el propio diseño de
> esta skill dio por bueno que `Datos financieros` traía `screen_stocks` gratis cuando esa cuenta
> está a `$0.00`. **Sin llamada, no hay veredicto.**
>
> Corolario: `Your current balance is $0.00`, un `rate_limit` o un 401 significan **«fuente no
> disponible»**, JAMÁS «no hay datos». Confundirlos es la regla de la casa incumplida.

## Paso 0 — Contexto
1. `docs/HUECOS-ABIERTOS.md` — contra qué se cruza.
2. `docs/VIGIA-CONECTORES.md` — qué se vio ya (para no repetir avisos).
3. Pendientes vivos: «Estado actual» de `docs/CONTEXTO-SESIONES.md` y los maestros que toquen.

## Paso 0-bis — El hueco inverso (primera pasada, luego anual)
Antes de mirar fuera: ¿qué herramientas de los conectores **ya conectados** cerrarían un hueco que
estamos programando a mano o a punto de pagar? Con llamada real, y **comprobando que no lo cubra
ya una pieza propia** — un conector que duplica un endpoint nuestro no es un hallazgo, es trabajo
tirado.

## Paso 1 — Criterio 1: huecos declarados
Para cada hueco de `HUECOS-ABIERTOS.md`, busca en el registro (`SearchMcpRegistry`) con palabras
del hueco, no del producto. Candidato encontrado → **llamada real** al endpoint que lo cerraría →
anota veredicto CON la evidencia.

## Paso 2 — Criterio 2: inventario de integraciones
Qué APIs externas consume el repo (Smoobu, Catastro, BOE, Enable Banking, FMP, Chekin,
SES.HOSPEDAJES, Tuya, Stripe…) y si hay conector que las sustituya o les dé **fallback**. Un
fallback para una integración que hoy es punto único de fallo vale más que un conector nuevo
brillante.

## Paso 3 — Canario: los conectores que YA usamos
Recorre el mapa «rutina → endpoint» de `VIGIA-CONECTORES.md` y haz **una** llamada barata a cada
endpoint. Es el paso que más vale: descubrir un conector nuevo es una oportunidad, pero que se
rompa el que sostiene `mercado-booking` o `trading-analista` es una avería — y una avería que hoy
nadie detectaría, porque el modo de fallo no es un error ruidoso: es un dato vacío que aguas abajo
se pinta como «no hay nada».

Cualquier cambio (endpoint que pasa a premium, se renombra, devuelve 401, cambia de forma) es
**hallazgo de Telegram**, aunque no rompa todavía.

## Paso 4 — Higiene de los conectados
`ListConnectors` y cruce con el uso real en el repo. Marca:
- **Sin uso:** conectado y nadie lo llama.
- **`installState: unknown`:** ni conectado ni desconectado — estado que nadie ha mirado.
- **Con herramientas de escritura:** el formulario de Rutinas adjunta conectores **en bloque**
  (el 08/08/2026 trajo 16 adjuntos de serie, entre ellos IBKR, Gmail y Vercel, para una rutina
  que solo escribe comparables). Cada conector de escritura sin uso es superficie regalada.

## Paso 5 — Salida (dos carriles)
- **Texto (siempre):** actualiza `docs/VIGIA-CONECTORES.md` — fecha de pasada SIEMPRE, aunque no
  haya hallazgos (sin fecha no se distingue «pasada limpia» de «rutina muerta»).
- **Telegram (si hay hallazgo):** `POST {PLATAFORMA_URL}/api/internal/alerta` con
  `Authorization: Bearer {ALERTA_TOKEN}` y `{ "text": "🔌 conectores-vigia: <resumen con evidencia>" }`.
- **PR draft (si hay trabajo que dejar hecho):** `claude/conectores-vigia-<fecha>`.
- **Sin hallazgos → sin ruido:** solo el doc con su fecha y un resumen en el chat.

**SIEMPRE dos PRs separados** si la pasada toca registro + comportamiento: el de registro se
automergea y no envejece; el de comportamiento espera a Alberto.

## Reglas
- **No puedes conectar nada.** Conectar requiere el OAuth de Alberto. Propones; el círculo lo
  cierra una persona. No es una limitación a sortear.
- **Nunca propongas adjuntar conectores a una rutina** «por si acaso»: mínimo alcance
  (`docs/RUTINAS-PROGRAMADAS.md` §4).
- **Lista negra:** `NEWS_SENTIMENT` y todo lo de noticias/sentimiento. Prohibido por regla de la
  casa — las noticias son contexto y jamás entran al modelo.
- **Cuidado con la cuota al hacer canarios:** una llamada por endpoint, y anota lo gastado. Si tus
  canarios agotan la cuota diaria de un conector, rompes esta noche la rutina que depende de él.
- **`LISTING_STATUS` no se consume por MCP** (182.000 tokens de CSV se comen la sesión): va por
  HTTP hacia el código que lo necesite.
- Máximo **3 candidatos** por pasada. Si no hay ninguno, dilo y calla: poder callar es lo que hace
  que tu Telegram signifique algo.

## Auto-informe (obligatorio al terminar la pasada)

Añade UNA entrada arriba del todo de «Entradas pendientes de procesar» de
`docs/AGENTES-BITACORA.md` (3-5 líneas máx.):

`- **YYYY-MM-DD · conectores-vigia** · hizo: …; dudas: …; fallos: …; PRs/commits: …`

Sin dudas ni fallos → `dudas: —; fallos: —` (el «todo bien» también es señal). La consume
`agentes-entrenador`; si no queda escrita, esta pasada no existió para él.

## Canal de aviso — protocolo común

**Preflight AL ARRANCAR** (no al final, cuando ya tengas algo que contar):
`GET {PLATAFORMA_URL}/api/internal/alerta` con `Authorization: Bearer {ALERTA_TOKEN}`.

- `200` → canal vivo, sigue.
- `401` → canal **mudo**. Según `docs/AVISOS-AGENTES.md`: avisa por el push nativo de la sesión
  empezando por `🔇 SIN TELEGRAM (401):` y deja el aviso **entero** en `docs/AGENTES-BITACORA.md`
  (`fallos:`).

Nunca te inventes el token, nunca uses `CRON_SECRET` en el prompt, y **nunca falles en silencio**.

## Primera pasada — verificar antes que nada

`SearchMcpRegistry` y `ListConnectors` parecen herramientas **nativas del harness**, no un
conector. Si es así, esta rutina no necesita NINGÚN conector adjunto (solo GitHub nativo +
`PLATAFORMA_URL` + `ALERTA_TOKEN`), y sería la de menor superficie del repo.

**No lo des por bueno: compruébalo.** Si no están disponibles dentro de la rutina, el paso 1 no
puede ejecutarse: dilo por Telegram y en la bitácora en vez de improvisar otro método.
```

- [ ] **Step 3: Comprueba que no has metido secretos**

Run: `npx --yes pnpm@10.33.0 run test:guardia`

Expected: PASS. `test/regression-secrets.test.ts` y `test/regression-rutina-tokens.test.ts` vigilan justo esto.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/conectores-vigia/SKILL.md
git commit -m "Skill conectores-vigia: el vigía de conectores MCP

Criterio de encaje = huecos declarados + inventario de integraciones. Descartado a
propósito el barrido semántico por vertical: siempre encuentra 'algo relacionado',
así que nunca calla, y un vigía que nunca calla se ignora a los dos meses.

El paso que más vale no es descubrir conectores nuevos: es el canario sobre los que
ya sostienen rutinas vivas. Ahí el modo de fallo no es un error ruidoso, es un dato
vacío que aguas abajo se pinta como 'no hay nada'."
```

### Task 2.4: Las cuatro fichas

**Files:**
- Modify: `docs/RUTINAS-PROGRAMADAS.md`, `docs/SKILLS.md`, `docs/AGENTES-MAPA.md`, `docs/FUENTES-DE-VERDAD.md`

- [ ] **Step 1: Ficha nº 16 en `docs/RUTINAS-PROGRAMADAS.md`**

Añádela después de la ficha 15, con el mismo formato de tabla:

```markdown
### 16. Vigía de conectores MCP — *pendiente de trigger*
| | |
|---|---|
| **Cuándo** | Mensual, **día 5**, ~04:00 CEST (el 15 lo ocupa `github-vigia`) |
| **Prompt** | `Ejecuta la skill conectores-vigia` |
| **MCPs / envs** | **Probablemente NINGÚN conector.** `SearchMcpRegistry`/`ListConnectors` parecen nativas del harness — la primera pasada lo verifica. **GitHub es nativo** al vincular el repo. `PLATAFORMA_URL` + `ALERTA_TOKEN` para el aviso (**NUNCA** `TELEGRAM_BOT_TOKEN`/`CHAT_ID` directos). |
| **Qué hace** | Cruza `docs/HUECOS-ABIERTOS.md` contra el registro de conectores; inventaría las APIs externas del repo buscando fallback; **canario** sobre los endpoints de los que dependen las rutinas vivas; higiene de los ya conectados (sin uso, `unknown`, con escritura). |
| **Resultado** | `docs/VIGIA-CONECTORES.md` siempre (con fecha de pasada, aunque no haya hallazgos). Telegram si hay hallazgo. PR draft `claude/conectores-vigia-<fecha>` si hay trabajo que dejar hecho. Sin hallazgos → sin ruido. |

**Regla dura de esta rutina:** ningún conector se recomienda sin una llamada real al endpoint que
supuestamente cierra el hueco. El catálogo describe lo que el producto hace, no lo que nuestro tier
deja hacer.
```

- [ ] **Step 2: Fila en `docs/SKILLS.md`**

Justo después de la fila de `buscador-ia`:

```markdown
| **`conectores-vigia`** | Vigía de conectores MCP: (1) cruza `docs/HUECOS-ABIERTOS.md` contra el registro, (2) inventaría las APIs externas del repo buscando fallback, (3) **canario** sobre los endpoints de los que dependen las rutinas vivas — un conector que pasa a premium o cambia rompe la rutina EN SILENCIO, (4) higiene de los ~28 conectados (sin uso, `installState: unknown`, con herramientas de escritura adjuntables en bloque). Estado en `docs/VIGIA-CONECTORES.md`. Regla dura: sin llamada real al endpoint, no hay veredicto. No puede conectar nada (requiere el OAuth de Alberto). Rutina mensual (día 5, 04:00 CEST) o a mano ("¿hay conectores nuevos que encajen?"). |
```

- [ ] **Step 3: Nodo y fila en `docs/AGENTES-MAPA.md`**

Junto a los otros nodos `A<n>[...]` (usa el siguiente número libre; comprueba con `grep -n 'A[0-9]*\["' docs/AGENTES-MAPA.md`):

```
    A16["conectores-vigia"]
```

Y en la tabla, tras la fila de «Buscador de IA»:

```markdown
| Vigía de conectores MCP | Huecos vs registro + canario sobre conectores en uso + higiene de los conectados | Día 5 mes 04:00 · *pendiente trigger* | PR draft | ✅ | `.claude/skills/conectores-vigia` |
```

- [ ] **Step 4: Filas en `docs/FUENTES-DE-VERDAD.md`**

En la tabla «Mapa»:

```markdown
| `docs/VIGIA-CONECTORES.md` | `.claude/skills/conectores-vigia/**`, `.claude/skills/*/SKILL.md` (el mapa rutina→endpoint envejece cuando una skill cambia de conector) |
| `docs/HUECOS-ABIERTOS.md` | `docs/TRADING-FUENTES-PAGO.md`, `packages/module-trading/**`, `apps/plataforma/app/api/trading/**` |
| skill `conectores-vigia` | `docs/VIGIA-CONECTORES.md`, `docs/HUECOS-ABIERTOS.md`, `.github/workflows/rutinas-automerge.yml` |
```

- [ ] **Step 5: Verifica que el guardián sigue verde**

Run: `npx --yes pnpm@10.33.0 run test:guardia`

Expected: PASS. En particular el test de la fase 1 debe seguir en verde: `docs/VIGIA-CONECTORES.md` ya lo reconoce `es_registro()` por el patrón `docs/VIGIA-*.md`, y `docs/HUECOS-ABIERTOS.md` NO — es un catálogo de decisiones, no registro.

- [ ] **Step 6: Commit**

```bash
git add docs/RUTINAS-PROGRAMADAS.md docs/SKILLS.md docs/AGENTES-MAPA.md docs/FUENTES-DE-VERDAD.md
git commit -m "Fichas de conectores-vigia: rutina 16, índice, mapa y fuentes de verdad"
```

---

# FASE 3 — El calendario de earnings de Alpha Vantage

**PR propio.** Es el entregable con valor directo: `docs/TRADING-FUENTES-PAGO.md` marca este hueco como **el único con coste directo en dinero real**.

**Estado de la fontanería (ya verificado, no lo re-investigues):** el camino existe entero.
`fundamentales.proximoEarnings` → `apps/plataforma/app/api/trading/analizar/route.ts:79` →
`earningsInminente()` en `packages/module-trading/src/riesgo.ts:42` → veto. Lo único que falta es
que alguien rellene la fecha.

### Task 3.1: «Sin fecha» no es «no hay earnings»

`riesgo.ts:43` hace `if (!proximoEarnings) return false` — sin fecha, no veta, y **nadie se entera**.
Es exactamente el fallo que `CLAUDE.md` describe: un «no lo sé» que sale pintado como «todo en
orden». Con dinero real, un gap de earnings no se puede deshacer.

No cambiamos el comportamiento del veto (sin fecha no se puede vetar), pero sí lo hacemos
**decible**: quien llama puede distinguir los tres estados y avisar.

**Files:**
- Modify: `packages/module-trading/src/riesgo.ts:42-45`
- Test: `packages/module-trading/test/riesgo.test.ts`

- [ ] **Step 1: Lee el estado actual**

```bash
sed -n '38,50p' packages/module-trading/src/riesgo.ts
grep -n "earningsInminente" packages/module-trading/test/riesgo.test.ts
```

- [ ] **Step 2: Escribe el test que falla**

Añade a `packages/module-trading/test/riesgo.test.ts`:

```typescript
test('estadoEarnings distingue los tres estados: desconocido, lejano, inminente', () => {
  // Sin fecha NO es "no hay earnings": es "no se ha podido mirar". Quien llame debe poder
  // decirlo, porque con dinero real un gap de earnings no se deshace.
  assert.equal(estadoEarnings(undefined, '2026-08-21'), 'desconocido')
  assert.equal(estadoEarnings('2026-10-20', '2026-08-21'), 'lejano')
  assert.equal(estadoEarnings('2026-08-23', '2026-08-21'), 'inminente')
})

test('earningsInminente sigue sin vetar cuando no hay fecha', () => {
  // No podemos vetar lo que no sabemos; el aviso es responsabilidad de quien llama.
  assert.equal(earningsInminente(undefined, '2026-08-21'), false)
  assert.equal(earningsInminente('2026-08-23', '2026-08-21'), true)
})
```

Y cambia la línea 3 de ese fichero, que hoy es exactamente:

```typescript
import { superaConcentracion, esPromediarPerdedor, superaLimiteOps, earningsInminente, bajoTendencia, factorFlojo } from '../src/riesgo.ts'
```

por:

```typescript
import { superaConcentracion, esPromediarPerdedor, superaLimiteOps, earningsInminente, estadoEarnings, bajoTendencia, factorFlojo } from '../src/riesgo.ts'
```

- [ ] **Step 3: Ejecuta el test y comprueba que falla**

Run: `npx --yes pnpm@10.33.0 -C packages/module-trading run test`

Expected: FALLA con algo del tipo `estadoEarnings is not a function` / error de importación.

- [ ] **Step 4: Implementa**

En `packages/module-trading/src/riesgo.ts`, justo antes de `earningsInminente`:

```typescript
/**
 * Tres estados, no dos (regla de la casa: `NULL` ≠ «no hay»).
 *
 * `desconocido` = no tenemos la fecha, NO «no hay earnings próximos». Sin fuente de calendario
 * la guarda no puede vetar, y ese silencio es justo lo que hay que poder contar: con dinero real
 * un gap de earnings no se deshace. Quien llama debe avisar, no tranquilizarse.
 */
export function estadoEarnings(
  proximoEarnings: string | undefined,
  hoy: string,
  dias = 3,
): 'desconocido' | 'lejano' | 'inminente' {
  if (!proximoEarnings) return 'desconocido'
  return earningsInminente(proximoEarnings, hoy, dias) ? 'inminente' : 'lejano'
}
```

Deja `earningsInminente` **exactamente como está**: otros sitios dependen de su booleano y este
cambio no debe alterar ninguna decisión existente.

- [ ] **Step 5: Ejecuta los tests y comprueba que pasan**

Run: `npx --yes pnpm@10.33.0 -C packages/module-trading run test`

Expected: PASS, incluidos los tests que ya existían.

- [ ] **Step 6: Commit**

```bash
git add packages/module-trading/src/riesgo.ts packages/module-trading/test/riesgo.test.ts
git commit -m "estadoEarnings: 'sin fecha' no es 'no hay earnings'

earningsInminente devuelve false cuando no hay fecha, y nadie se entera. Es el 'no
lo sé' pintado como 'todo en orden' que prohíbe CLAUDE.md, en una guarda que existe
para proteger dinero real.

El veto no cambia (no se puede vetar lo que no se sabe): lo que cambia es que ahora
se puede DECIR. earningsInminente queda intacto."
```

### Task 3.2: La pasada nocturna rellena la fecha

**Files:**
- Modify: `.claude/skills/trading-analista/references/pasada-diaria.md`

- [ ] **Step 1: Localiza dónde se montan los fundamentales**

Run: `grep -n "fundamentales\|proximoEarnings\|FMP\|analizar" .claude/skills/trading-analista/references/pasada-diaria.md`

- [ ] **Step 2: Inserta el paso de Alpha Vantage**

Justo antes del paso que hace `POST /api/trading/analizar`:

```markdown
### Calendario de earnings (Alpha Vantage)

Una llamada, **sin `symbol`**: `EARNINGS_CALENDAR(horizon: '3month')` devuelve el calendario
completo de todas las empresas cubiertas. **Filtra en local** por tus símbolos y rellena
`fundamentales.proximoEarnings` (formato ISO `YYYY-MM-DD`, el campo `reportDate`).

**Por qué una sola llamada y no una por símbolo:** el tier gratis son ~25 llamadas/día
compartidas. Símbolo a símbolo revienta la cuota con una watchlist de 15 y deja sin datos al
resto de la pasada.

**Qué desbloquea:** la guarda `earningsInminente` (veta abrir largos a ≤3 días de resultados).
Hasta hoy era best-effort del plan Free de FMP, que no da la fecha — y **sin fecha, no veta**.

**Si la llamada falla** (rate limit, 401, endpoint caído): NO sigas como si no hubiera earnings.
Usa `estadoEarnings()` de `@central/module-trading`: los símbolos en `desconocido` se reportan
**explícitamente** en el resumen de Telegram como *«earnings sin comprobar: X, Y»*. Un fallo de
fuente debe degradar visiblemente, nunca aparecer como «todo en orden».

⚠️ **No uses `NEWS_SENTIMENT`** aunque este conector lo ofrezca: las noticias son contexto por
regla de la casa y jamás entran al modelo.
```

- [ ] **Step 3: Verifica que no has metido secretos**

Run: `npx --yes pnpm@10.33.0 run test:guardia`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/trading-analista/references/pasada-diaria.md
git commit -m "La pasada nocturna rellena proximoEarnings desde Alpha Vantage

TRADING-FUENTES-PAGO.md marca la fecha de earnings como el ÚNICO hueco de datos con
coste directo en dinero real: sin ella la guarda no veta, y un gap de earnings con
dinero real no se deshace. EARNINGS_CALENDAR lo da gratis (verificado 21/08: ISRG →
2026-10-20).

Una llamada sin symbol y filtrado local: el tier gratis son ~25 llamadas/día
compartidas y símbolo a símbolo revienta la cuota con una watchlist de 15.

Si la fuente falla, los símbolos sin comprobar se reportan explícitamente. Un fallo
de fuente degrada visiblemente o miente."
```

### Task 3.3: Cierra el hueco en el catálogo

**Files:**
- Modify: `docs/HUECOS-ABIERTOS.md`, `docs/TRADING-FUENTES-PAGO.md`

- [ ] **Step 1: Comprueba que la fila ya está en «cerrados»**

La Task 2.1 ya la creó ahí. Verifica que sigue y que dice con qué se cerró.

Run: `grep -A4 "Huecos cerrados" docs/HUECOS-ABIERTOS.md`

- [ ] **Step 2: Anota en `docs/TRADING-FUENTES-PAGO.md`**

En la fila 2 de la tabla del §2 (la de FMP de pago), al final de la celda «Qué resuelve»:

```markdown
**Actualización 21/08/2026:** el calendario de earnings ya NO requiere pagar — Alpha Vantage lo da en su tier gratis (`EARNINGS_CALENDAR`, verificado: ISRG → 2026-10-20). De esta fila queda vivo solo el screener (H2 de `docs/HUECOS-ABIERTOS.md`).
```

Y en el §3.2 («Al abrir el Tramo 1»), tras la frase del calendario fiable:

```markdown
*(Cerrado el 21/08/2026 sin coste: Alpha Vantage `EARNINGS_CALENDAR`, tier gratis. Siguen haciendo falta las suscripciones de datos de mercado de IBKR, que son fontanería de ejecución.)*
```

- [ ] **Step 3: Commit**

```bash
git add docs/HUECOS-ABIERTOS.md docs/TRADING-FUENTES-PAGO.md
git commit -m "El calendario de earnings ya no hay que comprarlo

TRADING-FUENTES-PAGO lo listaba como el único gasto en datos que protege dinero real
de forma directa. Alpha Vantage lo da gratis. De esa fila queda vivo el screener."
```

---

## Cierre

- [ ] **Memoria.** Añade UNA entrada (máx. ~8 líneas, fecha `(dd/mm/aaaa)` en la primera) arriba del todo de `docs/CONTEXTO-SESIONES.md`.
- [ ] **Tests completos** antes del último push: `npx --yes pnpm@10.33.0 run test:guardia && npx --yes pnpm@10.33.0 -C packages/module-trading run test`
- [ ] **Tres PRs draft separados**, uno por fase. No los mezcles: la fase 1 toca un workflow, la 2 toca instrucciones de agente y la 3 toca código de trading; juntos son irrevisables.
- [ ] **Avisa a Alberto de lo que queda en su mano:** crear el trigger de la rutina 16 en `claude.ai → Rutinas` (día 5, 04:00 CEST, prompt `Ejecuta la skill conectores-vigia`), **adjuntando el mínimo de conectores** — a confirmar en la primera pasada si hace falta alguno.

## Fuera de alcance (YAGNI)

- Conectar conectores automáticamente: imposible, requiere el OAuth de Alberto.
- El barrido semántico por vertical (criterio 3): descartado en el spec §2.
- Cualquier conector de noticias/sentimiento: lista negra.
- Contratar EODHD para cerrar H1: es decisión de gasto de Alberto, no del plan.
