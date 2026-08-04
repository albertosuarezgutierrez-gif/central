# Agente trading-analista (IBKR) — Fase 1 · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un copiloto de inversión que analiza (técnico + fundamental), corre un torneo de estrategias, opera SOLO en paper y aprende de su track record en BD, sin ejecución real (Fase 1).

**Architecture:** Lógica pura en `packages/module-trading` (indicadores, estrategias, motor paper, scoring walk-forward, barreras de riesgo), testeable con `node --test`. `apps/plataforma` aporta persistencia (modelos Prisma `trading_*`) y dos endpoints (`/api/trading/analizar`, `/api/trading/puntuar`). Una sesión Claude programada (`.claude/skills/trading-analista` + trigger) tira de IBKR/FMP por MCP, llama a los endpoints y resume por Telegram.

**Tech Stack:** TypeScript (ESM, `node:test`), Prisma + Postgres (Supabase compartida), Next.js App Router (endpoints), MCP de IBKR + FMP (datos), core-telegram (avisos).

**Spec de referencia:** `docs/superpowers/specs/2026-07-17-agente-trading-ibkr-design.md`

---

## Estructura de archivos

**Nuevo paquete `packages/module-trading/`:**
- `package.json`, `tsconfig.json`
- `src/types.ts` — tipos del dominio (Vela, Indicadores, Tesis, PaperOrden, PaperPosicion, Regimen…).
- `src/indicadores.ts` — SMA, EMA, RSI, MACD, ATR (puras sobre series de cierre/vela).
- `src/estrategias.ts` — evaluadores por familia (momentum, reversión, valor, catalizador) → Señal.
- `src/riesgo.ts` — barreras (tope concentración, no promediar perdedor, límite ops por nombre).
- `src/paper.ts` — motor de cartera simulada (abrir/cerrar, sizing, stop, P&L).
- `src/scoring.ts` — puntuación walk-forward de una tesis + agregación de stats por estrategia/régimen.
- `src/index.ts` — reexporta la API pública.
- `test/*.test.ts` — un archivo por módulo.

**`apps/plataforma/`:**
- `prisma/schema.prisma` — 6 modelos `trading_*` (Modify).
- `app/api/trading/analizar/route.ts` — recibe datos crudos del agente, computa y persiste tesis + órdenes paper (Create).
- `app/api/trading/puntuar/route.ts` — cron: puntúa tesis vencidas y actualiza stats + P&L (Create).
- `lib/trading-notify.ts` — resumen legible para Telegram con `eur()` (Create).
- `lib/agentes-catalogo.ts` — añadir la ficha del agente (Modify).

**Sesión Claude:**
- `.claude/skills/trading-analista/SKILL.md` — instrucciones de la pasada (Create).
- `docs/RUTINAS-PROGRAMADAS.md` — registrar cadencia y setup del trigger (Modify).

---

## Task 1: Scaffold del paquete `module-trading` + tipos

**Files:**
- Create: `packages/module-trading/package.json`
- Create: `packages/module-trading/tsconfig.json`
- Create: `packages/module-trading/src/types.ts`
- Create: `packages/module-trading/src/index.ts`

- [ ] **Step 1: Crear `package.json`** (copia fiel del patrón de `module-alquiler`)

```json
{
  "name": "@central/module-trading",
  "version": "0.0.0",
  "private": true,
  "description": "Módulo puro de análisis de inversión: indicadores técnicos, torneo de estrategias, motor de paper trading, scoring walk-forward y barreras de riesgo. Sin BD ni red; cada consumidor aporta los datos (precios IBKR, fundamentales FMP).",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "node --test test/*.test.ts" },
  "sideEffects": false,
  "license": "UNLICENSED"
}
```

- [ ] **Step 2: Crear `tsconfig.json`** (copiar el de `packages/module-alquiler/tsconfig.json` tal cual)

Run: `cp packages/module-alquiler/tsconfig.json packages/module-trading/tsconfig.json`

- [ ] **Step 3: Escribir `src/types.ts`**

```typescript
// Dominio del módulo de trading. Todo puro y serializable (JSON) para viajar entre la sesión
// Claude, los endpoints y la BD.

export type Vela = {
  fecha: string        // ISO yyyy-mm-dd
  apertura: number
  alto: number
  bajo: number
  cierre: number
  volumen: number
}

export type Direccion = 'alcista' | 'bajista' | 'neutral'
export type Regimen = 'tendencia_alcista' | 'tendencia_bajista' | 'lateral'
export type Estrategia = 'momentum' | 'reversion' | 'valor' | 'catalizador'

export type Indicadores = {
  sma20: number | null
  sma50: number | null
  ema12: number | null
  ema26: number | null
  rsi14: number | null
  macd: number | null
  macdSignal: number | null
  atr14: number | null
}

// Fundamentales mínimos (de FMP); todo opcional porque en técnico-solo no están.
export type Fundamentales = {
  per?: number
  deudaEbitda?: number
  margenNeto?: number
  proximoEarnings?: string   // ISO date
}

export type Senal = {
  estrategia: Estrategia
  direccion: Direccion
  confianza: number          // 0..100
  rationale: string
}

export type Tesis = {
  simbolo: string
  fecha: string              // ISO date de la pasada
  estrategia: Estrategia
  direccion: Direccion
  confianza: number
  horizonteDias: number
  precioRef: number
  indicadores: Indicadores
  rationale: string
}

export type PaperPosicion = {
  simbolo: string
  cantidad: number           // >0 largo
  precioEntrada: number
  stop: number
  abiertaEn: string          // ISO date
}

export type PaperOrden = {
  simbolo: string
  lado: 'BUY' | 'SELL'
  cantidad: number
  precio: number
  fecha: string
  motivo: string             // p.ej. "tesis momentum conf 78" | "stop" | "cierre horizonte"
}
```

- [ ] **Step 4: Escribir `src/index.ts` mínimo**

```typescript
// @central/module-trading — lógica pura de análisis de inversión (Fase 1, paper).
export type * from './types.ts'
```

- [ ] **Step 5: Commit**

```bash
git add packages/module-trading
git commit -m "feat(trading): scaffold module-trading + tipos del dominio"
```

---

## Task 2: Indicadores técnicos

**Files:**
- Create: `packages/module-trading/src/indicadores.ts`
- Test: `packages/module-trading/test/indicadores.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sma, ema, rsi, macd, atr, indicadoresDe } from '../src/indicadores.ts'
import type { Vela } from '../src/types.ts'

test('sma promedia las últimas n muestras', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 5), 3)
  assert.equal(sma([2, 4], 5), null)            // insuficientes → null
})

test('ema pondera lo reciente y arranca del sma', () => {
  const e = ema([1, 2, 3, 4, 5, 6, 7, 8], 3)
  assert.ok(e !== null && e > 6 && e < 8)
})

test('rsi de una serie estrictamente creciente tiende a 100', () => {
  const r = rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 14)
  assert.ok(r !== null && r > 99)
})

test('atr es positivo con rango real', () => {
  const velas: Vela[] = Array.from({ length: 20 }, (_, i) => ({
    fecha: `2026-01-${String(i + 1).padStart(2, '0')}`,
    apertura: 10, alto: 12, bajo: 9, cierre: 11, volumen: 100,
  }))
  const a = atr(velas, 14)
  assert.ok(a !== null && a > 0)
})

test('indicadoresDe devuelve todos los campos', () => {
  const cierres = Array.from({ length: 60 }, (_, i) => 100 + i)
  const velas: Vela[] = cierres.map((c, i) => ({
    fecha: `d${i}`, apertura: c, alto: c + 1, bajo: c - 1, cierre: c, volumen: 1,
  }))
  const ind = indicadoresDe(velas)
  assert.ok(ind.sma20 !== null && ind.rsi14 !== null && ind.macd !== null && ind.atr14 !== null)
})
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd packages/module-trading && node --test test/indicadores.test.ts`
Expected: FAIL ("Cannot find module '../src/indicadores.ts'").

- [ ] **Step 3: Implementar `src/indicadores.ts`**

```typescript
import type { Vela, Indicadores } from './types.ts'

export function sma(valores: number[], n: number): number | null {
  if (valores.length < n) return null
  const ventana = valores.slice(-n)
  return ventana.reduce((a, b) => a + b, 0) / n
}

export function ema(valores: number[], n: number): number | null {
  if (valores.length < n) return null
  const k = 2 / (n + 1)
  // Arranca en el SMA de las primeras n muestras y avanza.
  let e = valores.slice(0, n).reduce((a, b) => a + b, 0) / n
  for (let i = n; i < valores.length; i++) e = valores[i] * k + e * (1 - k)
  return e
}

export function rsi(cierres: number[], n = 14): number | null {
  if (cierres.length < n + 1) return null
  let ganancias = 0, perdidas = 0
  for (let i = cierres.length - n; i < cierres.length; i++) {
    const d = cierres[i] - cierres[i - 1]
    if (d >= 0) ganancias += d
    else perdidas -= d
  }
  if (perdidas === 0) return 100
  const rs = (ganancias / n) / (perdidas / n)
  return 100 - 100 / (1 + rs)
}

export function macd(cierres: number[]): { macd: number | null; signal: number | null } {
  const ema12 = ema(cierres, 12)
  const ema26 = ema(cierres, 26)
  if (ema12 === null || ema26 === null) return { macd: null, signal: null }
  const linea = ema12 - ema26
  // Signal = EMA9 de la línea MACD; aproximamos con la serie de MACD recalculada.
  const serie: number[] = []
  for (let i = 26; i <= cierres.length; i++) {
    const sub = cierres.slice(0, i)
    const a = ema(sub, 12), b = ema(sub, 26)
    if (a !== null && b !== null) serie.push(a - b)
  }
  const signal = ema(serie, 9)
  return { macd: linea, signal }
}

export function atr(velas: Vela[], n = 14): number | null {
  if (velas.length < n + 1) return null
  const trs: number[] = []
  for (let i = velas.length - n; i < velas.length; i++) {
    const v = velas[i], prev = velas[i - 1]
    trs.push(Math.max(v.alto - v.bajo, Math.abs(v.alto - prev.cierre), Math.abs(v.bajo - prev.cierre)))
  }
  return trs.reduce((a, b) => a + b, 0) / n
}

export function indicadoresDe(velas: Vela[]): Indicadores {
  const cierres = velas.map(v => v.cierre)
  const m = macd(cierres)
  return {
    sma20: sma(cierres, 20),
    sma50: sma(cierres, 50),
    ema12: ema(cierres, 12),
    ema26: ema(cierres, 26),
    rsi14: rsi(cierres, 14),
    macd: m.macd,
    macdSignal: m.signal,
    atr14: atr(velas, 14),
  }
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd packages/module-trading && node --test test/indicadores.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Exportar desde `index.ts`**

Añadir a `src/index.ts`:
```typescript
export { sma, ema, rsi, macd, atr, indicadoresDe } from './indicadores.ts'
```

- [ ] **Step 6: Commit**

```bash
git add packages/module-trading/src/indicadores.ts packages/module-trading/test/indicadores.test.ts packages/module-trading/src/index.ts
git commit -m "feat(trading): indicadores técnicos (SMA/EMA/RSI/MACD/ATR)"
```

---

## Task 2b: Régimen de mercado

**Files:**
- Modify: `packages/module-trading/src/indicadores.ts`
- Modify: `packages/module-trading/test/indicadores.test.ts`

- [ ] **Step 1: Añadir test**

```typescript
import { regimenDe } from '../src/indicadores.ts'

test('regimenDe detecta tendencia alcista con sma20>sma50', () => {
  assert.equal(regimenDe({ sma20: 110, sma50: 100 } as any), 'tendencia_alcista')
  assert.equal(regimenDe({ sma20: 90, sma50: 100 } as any), 'tendencia_bajista')
  assert.equal(regimenDe({ sma20: 100.2, sma50: 100 } as any), 'lateral')  // <1% dif
})
```

- [ ] **Step 2: Ver que falla** — Run: `cd packages/module-trading && node --test test/indicadores.test.ts` → FAIL.

- [ ] **Step 3: Implementar en `indicadores.ts`**

```typescript
import type { Regimen } from './types.ts'

export function regimenDe(ind: Indicadores): Regimen {
  if (ind.sma20 === null || ind.sma50 === null) return 'lateral'
  const dif = (ind.sma20 - ind.sma50) / ind.sma50
  if (dif > 0.01) return 'tendencia_alcista'
  if (dif < -0.01) return 'tendencia_bajista'
  return 'lateral'
}
```
Añadir `export { regimenDe }` al `index.ts`.

- [ ] **Step 4: Ver que pasa** — Run test → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(trading): régimen de mercado por cruce sma20/sma50"`

---

## Task 3: Evaluadores de estrategia (torneo)

**Files:**
- Create: `packages/module-trading/src/estrategias.ts`
- Test: `packages/module-trading/test/estrategias.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarMomentum, evaluarReversion, evaluarValor, evaluarCatalizador, torneo } from '../src/estrategias.ts'
import type { Indicadores, Fundamentales } from '../src/types.ts'

const alcista: Indicadores = { sma20: 110, sma50: 100, ema12: 111, ema26: 105, rsi14: 60, macd: 2, macdSignal: 1, atr14: 3 }

test('momentum es alcista cuando ema12>ema26 y macd>signal', () => {
  const s = evaluarMomentum(alcista)
  assert.equal(s.direccion, 'alcista')
  assert.ok(s.confianza > 50)
})

test('reversion es alcista con rsi bajo (sobreventa)', () => {
  const s = evaluarReversion({ ...alcista, rsi14: 25 })
  assert.equal(s.direccion, 'alcista')
})

test('valor es alcista con PER bajo y poca deuda', () => {
  const f: Fundamentales = { per: 10, deudaEbitda: 1, margenNeto: 0.2 }
  assert.equal(evaluarValor(f).direccion, 'alcista')
})

test('valor es neutral sin fundamentales', () => {
  assert.equal(evaluarValor({}).direccion, 'neutral')
})

test('catalizador marca alcista si earnings inminente', () => {
  const s = evaluarCatalizador({ proximoEarnings: '2026-07-20' }, '2026-07-17')
  assert.equal(s.direccion, 'alcista')
})

test('torneo devuelve una señal por estrategia', () => {
  const señales = torneo(alcista, { per: 10, deudaEbitda: 1, margenNeto: 0.2, proximoEarnings: '2026-07-20' }, '2026-07-17')
  assert.equal(señales.length, 4)
})
```

- [ ] **Step 2: Ver que falla** — Run: `cd packages/module-trading && node --test test/estrategias.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/estrategias.ts`**

```typescript
import type { Indicadores, Fundamentales, Senal } from './types.ts'

export function evaluarMomentum(ind: Indicadores): Senal {
  const cruceAlcista = ind.ema12 !== null && ind.ema26 !== null && ind.ema12 > ind.ema26
  const macdAlcista = ind.macd !== null && ind.macdSignal !== null && ind.macd > ind.macdSignal
  let direccion: Senal['direccion'] = 'neutral', confianza = 40
  if (cruceAlcista && macdAlcista) { direccion = 'alcista'; confianza = 75 }
  else if (!cruceAlcista && !macdAlcista) { direccion = 'bajista'; confianza = 65 }
  return { estrategia: 'momentum', direccion, confianza, rationale: `ema12${cruceAlcista ? '>' : '<='}ema26, macd${macdAlcista ? '>' : '<='}signal` }
}

export function evaluarReversion(ind: Indicadores): Senal {
  const r = ind.rsi14
  let direccion: Senal['direccion'] = 'neutral', confianza = 40, nota = 'rsi neutral'
  if (r !== null && r < 30) { direccion = 'alcista'; confianza = 70; nota = `rsi ${r.toFixed(0)} sobreventa` }
  else if (r !== null && r > 70) { direccion = 'bajista'; confianza = 70; nota = `rsi ${r.toFixed(0)} sobrecompra` }
  return { estrategia: 'reversion', direccion, confianza, rationale: nota }
}

export function evaluarValor(f: Fundamentales): Senal {
  if (f.per === undefined) return { estrategia: 'valor', direccion: 'neutral', confianza: 30, rationale: 'sin fundamentales' }
  const barato = f.per > 0 && f.per < 15
  const sano = (f.deudaEbitda ?? 99) < 3 && (f.margenNeto ?? 0) > 0.1
  const direccion = barato && sano ? 'alcista' : (f.per > 40 ? 'bajista' : 'neutral')
  return { estrategia: 'valor', direccion, confianza: barato && sano ? 65 : 45, rationale: `PER ${f.per}, deuda/EBITDA ${f.deudaEbitda ?? '?'}` }
}

export function evaluarCatalizador(f: Fundamentales, hoy: string): Senal {
  if (!f.proximoEarnings) return { estrategia: 'catalizador', direccion: 'neutral', confianza: 30, rationale: 'sin earnings próximos' }
  const dias = (new Date(f.proximoEarnings).getTime() - new Date(hoy).getTime()) / 86_400_000
  const inminente = dias >= 0 && dias <= 5
  return {
    estrategia: 'catalizador',
    direccion: inminente ? 'alcista' : 'neutral',
    confianza: inminente ? 55 : 35,
    rationale: inminente ? `earnings en ${Math.round(dias)}d` : 'earnings lejano',
  }
}

export function torneo(ind: Indicadores, f: Fundamentales, hoy: string): Senal[] {
  return [evaluarMomentum(ind), evaluarReversion(ind), evaluarValor(f), evaluarCatalizador(f, hoy)]
}
```

- [ ] **Step 4: Ver que pasa** — Run test → PASS (6 tests).

- [ ] **Step 5: Exportar + commit**

Añadir a `index.ts`: `export { evaluarMomentum, evaluarReversion, evaluarValor, evaluarCatalizador, torneo } from './estrategias.ts'`
```bash
git commit -am "feat(trading): torneo de estrategias (momentum/reversión/valor/catalizador)"
```

---

## Task 4: Barreras de riesgo (derivadas del historial de Alberto)

**Files:**
- Create: `packages/module-trading/src/riesgo.ts`
- Test: `packages/module-trading/test/riesgo.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { superaConcentracion, esPromediarPerdedor, superaLimiteOps } from '../src/riesgo.ts'
import type { PaperPosicion } from '../src/types.ts'

const pos: PaperPosicion = { simbolo: 'NVDA', cantidad: 10, precioEntrada: 100, stop: 90, abiertaEn: '2026-07-01' }

test('superaConcentracion true si la nueva posición pasa del 20% del NAV', () => {
  assert.equal(superaConcentracion(2500, 10_000, 0.2), true)   // 25% > 20%
  assert.equal(superaConcentracion(1500, 10_000, 0.2), false)  // 15% < 20%
})

test('esPromediarPerdedor true si añades a una posición en pérdida', () => {
  assert.equal(esPromediarPerdedor(pos, 90), true)   // precio 90 < entrada 100
  assert.equal(esPromediarPerdedor(pos, 110), false)
})

test('superaLimiteOps true al pasar el máximo de ops por nombre', () => {
  assert.equal(superaLimiteOps(5, 5), true)
  assert.equal(superaLimiteOps(3, 5), false)
})
```

- [ ] **Step 2: Ver que falla** — Run: `cd packages/module-trading && node --test test/riesgo.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/riesgo.ts`**

```typescript
import type { PaperPosicion } from './types.ts'

// Ninguna posición nueva puede pesar más de `maxPct` del NAV (default 20%).
export function superaConcentracion(valorNuevaPos: number, nav: number, maxPct = 0.2): boolean {
  if (nav <= 0) return true
  return valorNuevaPos / nav > maxPct
}

// Prohibido añadir a un nombre que ya está en pérdida (promediar a la baja).
export function esPromediarPerdedor(pos: PaperPosicion, precioActual: number): boolean {
  return precioActual < pos.precioEntrada
}

// Límite de operaciones por nombre en la ventana de estudio.
export function superaLimiteOps(opsDelNombre: number, maxOps = 5): boolean {
  return opsDelNombre >= maxOps
}
```

- [ ] **Step 4: Ver que pasa** — Run test → PASS (3 tests).

- [ ] **Step 5: Exportar + commit**

Añadir a `index.ts`: `export { superaConcentracion, esPromediarPerdedor, superaLimiteOps } from './riesgo.ts'`
```bash
git commit -am "feat(trading): barreras de riesgo (concentración, no promediar, límite ops)"
```

---

## Task 5: Motor de paper trading

**Files:**
- Create: `packages/module-trading/src/paper.ts`
- Test: `packages/module-trading/test/paper.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dimensionar, abrir, aplicarStop, cerrar, pnlPosicion } from '../src/paper.ts'
import type { PaperPosicion } from '../src/types.ts'

test('dimensionar respeta el riesgo por operación (1% del NAV / distancia al stop)', () => {
  // NAV 10.000, riesgo 1% = 100€; entrada 100, stop 90 → distancia 10 → 10 acciones.
  assert.equal(dimensionar(10_000, 100, 90, 0.01), 10)
})

test('dimensionar es 0 si el stop está por encima de la entrada (inválido)', () => {
  assert.equal(dimensionar(10_000, 100, 105, 0.01), 0)
})

test('abrir crea posición con stop bajo la entrada por ATR', () => {
  const p = abrir('NVDA', 10, 100, 3, '2026-07-17')  // stop = 100 - 2*ATR(3) = 94
  assert.equal(p.stop, 94)
})

test('aplicarStop cierra si el precio perfora el stop', () => {
  const p: PaperPosicion = { simbolo: 'X', cantidad: 10, precioEntrada: 100, stop: 94, abiertaEn: 'd' }
  assert.equal(aplicarStop(p, 93), true)
  assert.equal(aplicarStop(p, 95), false)
})

test('pnlPosicion calcula ganancia/pérdida', () => {
  const p: PaperPosicion = { simbolo: 'X', cantidad: 10, precioEntrada: 100, stop: 94, abiertaEn: 'd' }
  assert.equal(pnlPosicion(p, 110), 100)
  assert.equal(pnlPosicion(p, 95), -50)
})
```

- [ ] **Step 2: Ver que falla** — Run: `cd packages/module-trading && node --test test/paper.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/paper.ts`**

```typescript
import type { PaperPosicion, PaperOrden } from './types.ts'

// Nº de acciones para arriesgar `riesgoPct` del NAV si salta el stop.
export function dimensionar(nav: number, entrada: number, stop: number, riesgoPct = 0.01): number {
  const distancia = entrada - stop
  if (distancia <= 0) return 0
  return Math.floor((nav * riesgoPct) / distancia)
}

// Abre una posición larga con stop a 2*ATR bajo la entrada.
export function abrir(simbolo: string, cantidad: number, entrada: number, atr: number, fecha: string): PaperPosicion {
  return { simbolo, cantidad, precioEntrada: entrada, stop: entrada - 2 * atr, abiertaEn: fecha }
}

export function aplicarStop(pos: PaperPosicion, precio: number): boolean {
  return precio <= pos.stop
}

export function cerrar(pos: PaperPosicion, precio: number, fecha: string, motivo: string): PaperOrden {
  return { simbolo: pos.simbolo, lado: 'SELL', cantidad: pos.cantidad, precio, fecha, motivo }
}

export function pnlPosicion(pos: PaperPosicion, precio: number): number {
  return (precio - pos.precioEntrada) * pos.cantidad
}
```

- [ ] **Step 4: Ver que pasa** — Run test → PASS (5 tests).

- [ ] **Step 5: Exportar + commit**

Añadir a `index.ts`: `export { dimensionar, abrir, aplicarStop, cerrar, pnlPosicion } from './paper.ts'`
```bash
git commit -am "feat(trading): motor de paper trading (sizing, stop ATR, P&L)"
```

---

## Task 6: Scoring walk-forward

**Files:**
- Create: `packages/module-trading/src/scoring.ts`
- Test: `packages/module-trading/test/scoring.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puntuarTesis, agregarStats } from '../src/scoring.ts'
import type { Tesis } from '../src/types.ts'

const tesis = (over: Partial<Tesis> = {}): Tesis => ({
  simbolo: 'X', fecha: '2026-07-01', estrategia: 'momentum', direccion: 'alcista',
  confianza: 70, horizonteDias: 10, precioRef: 100,
  indicadores: {} as any, rationale: '', ...over,
})

test('puntuarTesis acierta si alcista y el precio subió', () => {
  const r = puntuarTesis(tesis(), 110)
  assert.equal(r.acierto, true)
  assert.ok(Math.abs(r.retorno - 0.1) < 1e-9)
})

test('puntuarTesis falla si alcista y el precio bajó', () => {
  assert.equal(puntuarTesis(tesis(), 95).acierto, false)
})

test('bajista acierta si el precio bajó', () => {
  assert.equal(puntuarTesis(tesis({ direccion: 'bajista' }), 95).acierto, true)
})

test('agregarStats calcula hit-rate por estrategia', () => {
  const stats = agregarStats([
    { estrategia: 'momentum', acierto: true, retorno: 0.1 },
    { estrategia: 'momentum', acierto: false, retorno: -0.05 },
    { estrategia: 'valor', acierto: true, retorno: 0.2 },
  ])
  assert.equal(stats.momentum.hitRate, 0.5)
  assert.equal(stats.valor.hitRate, 1)
})
```

- [ ] **Step 2: Ver que falla** — Run: `cd packages/module-trading && node --test test/scoring.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/scoring.ts`**

```typescript
import type { Tesis, Estrategia } from './types.ts'

export type Resultado = { estrategia: Estrategia; acierto: boolean; retorno: number }

// Puntúa una tesis contra un precio POSTERIOR (walk-forward: precioDespues es de después de precioRef).
export function puntuarTesis(t: Tesis, precioDespues: number): Resultado {
  const retorno = (precioDespues - t.precioRef) / t.precioRef
  const subio = precioDespues > t.precioRef
  const acierto =
    (t.direccion === 'alcista' && subio) ||
    (t.direccion === 'bajista' && !subio) ||
    (t.direccion === 'neutral' && Math.abs(retorno) < 0.02)
  return { estrategia: t.estrategia, acierto, retorno }
}

export type StatsEstrategia = { hitRate: number; retornoMedio: number; n: number }

export function agregarStats(resultados: Resultado[]): Record<string, StatsEstrategia> {
  const out: Record<string, StatsEstrategia> = {}
  const grupos = new Map<string, Resultado[]>()
  for (const r of resultados) {
    const g = grupos.get(r.estrategia) ?? []
    g.push(r); grupos.set(r.estrategia, g)
  }
  for (const [est, rs] of grupos) {
    const aciertos = rs.filter(r => r.acierto).length
    out[est] = {
      hitRate: aciertos / rs.length,
      retornoMedio: rs.reduce((a, b) => a + b.retorno, 0) / rs.length,
      n: rs.length,
    }
  }
  return out
}
```

- [ ] **Step 4: Ver que pasa** — Run test → PASS (4 tests).

- [ ] **Step 5: Exportar + correr TODA la suite del paquete**

Añadir a `index.ts`: `export { puntuarTesis, agregarStats } from './scoring.ts'` y `export type { Resultado, StatsEstrategia } from './scoring.ts'`
Run: `cd packages/module-trading && npm test`
Expected: PASS (todos los archivos).

- [ ] **Step 6: Commit** — `git commit -am "feat(trading): scoring walk-forward + agregación de stats por estrategia"`

---

## Task 7: Modelos Prisma `trading_*`

**Files:**
- Modify: `apps/plataforma/prisma/schema.prisma` (añadir al final)

- [ ] **Step 1: Añadir los 6 modelos al final de `schema.prisma`**

```prisma
model TradingWatchlist {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  simbolo   String
  capa      String   // 'A' ancla | 'B' conocido | 'C' cantera
  horizonte Int      @default(10)
  activo    Boolean  @default(true)
  promocionadoEn DateTime? @map("promocionado_en") @db.Timestamptz(6)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@unique([simbolo])
  @@map("trading_watchlist")
}

model TradingTesis {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  simbolo     String
  fecha       DateTime @db.Date
  estrategia  String
  direccion   String
  confianza   Int
  horizonteDias Int    @map("horizonte_dias")
  precioRef   Float    @map("precio_ref")
  indicadores Json
  rationale   String
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  resultado   TradingTesisResultado?
  @@index([simbolo, fecha])
  @@map("trading_tesis")
}

model TradingTesisResultado {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tesisId      String   @unique @map("tesis_id") @db.Uuid
  precioDespues Float   @map("precio_despues")
  ventanaDias  Int      @map("ventana_dias")
  retorno      Float
  acierto      Boolean
  puntuadoEn   DateTime @default(now()) @map("puntuado_en") @db.Timestamptz(6)
  tesis        TradingTesis @relation(fields: [tesisId], references: [id], onDelete: Cascade)
  @@map("trading_tesis_resultado")
}

model TradingPaperOrden {
  id      String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  simbolo String
  lado    String   // BUY | SELL
  cantidad Int
  precio  Float
  fecha   DateTime @db.Date
  motivo  String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@map("trading_paper_orden")
}

model TradingPaperPosicion {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  simbolo       String   @unique
  cantidad      Int
  precioEntrada Float    @map("precio_entrada")
  stop          Float
  abiertaEn     DateTime @map("abierta_en") @db.Date
  @@map("trading_paper_posicion")
}

model TradingEstrategiaStats {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  estrategia   String
  regimen      String
  hitRate      Float    @map("hit_rate")
  retornoMedio Float    @map("retorno_medio")
  n            Int
  actualizadoEn DateTime @default(now()) @map("actualizado_en") @db.Timestamptz(6)
  @@unique([estrategia, regimen])
  @@map("trading_estrategia_stats")
}
```

- [ ] **Step 2: Generar el cliente y crear la migración**

Run (desde `apps/plataforma`): `npx prisma migrate dev --name trading_fase1`
Expected: crea `prisma/migrations/*_trading_fase1/` y regenera el cliente sin error.
> Nota BD compartida: NO tocar tablas existentes ni RLS. Estas tablas son nuevas y aisladas.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/prisma
git commit -m "feat(trading): modelos Prisma trading_* (watchlist, tesis, resultado, paper, stats)"
```

---

## Task 8: Endpoint `/api/trading/analizar`

**Files:**
- Create: `apps/plataforma/app/api/trading/analizar/route.ts`

**Contrato:** el agente (sesión Claude) hace `POST` con `{ fecha, nav, simbolos: [{ simbolo, velas: Vela[], fundamentales?: Fundamentales, opsRecientes?: number }] }`. El endpoint computa indicadores + torneo por símbolo, elige la señal ganadora (mayor confianza no-neutral), aplica barreras de riesgo, persiste `trading_tesis` (todas las señales) y, para la ganadora que pase las barreras, registra una `trading_paper_orden` BUY + upsert de `trading_paper_posicion`. Devuelve el top de ideas.

- [ ] **Step 1: Implementar el route**

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import {
  indicadoresDe, torneo, dimensionar, abrir,
  superaConcentracion, superaLimiteOps,
} from '@central/module-trading'
import type { Vela, Fundamentales } from '@central/module-trading'

type Entrada = { simbolo: string; velas: Vela[]; fundamentales?: Fundamentales; opsRecientes?: number }

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { fecha, nav, simbolos } = (await req.json()) as { fecha: string; nav: number; simbolos: Entrada[] }
  if (!fecha || !nav || !Array.isArray(simbolos)) return NextResponse.json({ error: 'payload inválido' }, { status: 400 })

  const ideas: Array<{ simbolo: string; estrategia: string; direccion: string; confianza: number; operada: boolean; motivo?: string }> = []

  for (const s of simbolos) {
    if (!s.velas?.length) continue
    const ind = indicadoresDe(s.velas)
    const precioRef = s.velas[s.velas.length - 1].cierre
    const señales = torneo(ind, s.fundamentales ?? {}, fecha)

    // Persistir todas las señales como tesis.
    await prisma.tradingTesis.createMany({
      data: señales.map(se => ({
        simbolo: s.simbolo, fecha: new Date(fecha), estrategia: se.estrategia,
        direccion: se.direccion, confianza: se.confianza, horizonteDias: 10,
        precioRef, indicadores: ind as object, rationale: se.rationale,
      })),
    })

    // Ganadora = mayor confianza entre las no-neutrales.
    const ganadora = [...señales].filter(x => x.direccion !== 'neutral').sort((a, b) => b.confianza - a.confianza)[0]
    if (!ganadora || ganadora.direccion !== 'alcista') { ideas.push({ simbolo: s.simbolo, estrategia: ganadora?.estrategia ?? 'ninguna', direccion: ganadora?.direccion ?? 'neutral', confianza: ganadora?.confianza ?? 0, operada: false }); continue }

    // Barreras de riesgo.
    const cantidad = dimensionar(nav, precioRef, precioRef - 2 * (ind.atr14 ?? precioRef * 0.02), 0.01)
    const valorPos = cantidad * precioRef
    let motivo: string | undefined
    if (cantidad <= 0) motivo = 'sizing 0'
    else if (superaConcentracion(valorPos, nav)) motivo = 'excede concentración 20%'
    else if (superaLimiteOps(s.opsRecientes ?? 0)) motivo = 'límite de ops por nombre'

    if (!motivo) {
      const pos = abrir(s.simbolo, cantidad, precioRef, ind.atr14 ?? precioRef * 0.02, fecha)
      await prisma.tradingPaperOrden.create({ data: { simbolo: s.simbolo, lado: 'BUY', cantidad, precio: precioRef, fecha: new Date(fecha), motivo: `${ganadora.estrategia} conf ${ganadora.confianza}` } })
      await prisma.tradingPaperPosicion.upsert({
        where: { simbolo: s.simbolo },
        create: { simbolo: s.simbolo, cantidad, precioEntrada: precioRef, stop: pos.stop, abiertaEn: new Date(fecha) },
        update: {},   // no promediar: si ya existe, no se toca
      })
    }
    ideas.push({ simbolo: s.simbolo, estrategia: ganadora.estrategia, direccion: ganadora.direccion, confianza: ganadora.confianza, operada: !motivo, motivo })
  }

  ideas.sort((a, b) => b.confianza - a.confianza)
  return NextResponse.json({ fecha, top: ideas.slice(0, 5), total: ideas.length })
}
```

- [ ] **Step 2: Añadir `@central/module-trading` como dependencia de plataforma**

En `apps/plataforma/package.json`, dentro de `dependencies`, añadir (respetando el patrón `file:` de las demás deps `@central/*`):
```json
"@central/module-trading": "file:../../packages/module-trading",
```
Run (desde `apps/plataforma`): `npx --yes pnpm@10.33.0 install --no-frozen-lockfile`

- [ ] **Step 3: Verificar typecheck**

Run (desde `apps/plataforma`): `npx tsc --noEmit`
Expected: sin errores en `app/api/trading/analizar/route.ts`.

- [ ] **Step 4: Excluir la ruta del middleware si aplica**

Revisar `apps/plataforma/middleware.ts`: si protege `/api/*` por sesión, añadir `/api/trading` a las rutas públicas (igual que los otros crons). Buscar el patrón existente de `/api/pricing` o `/api/cron` y replicarlo.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/app/api/trading/analizar/route.ts apps/plataforma/package.json apps/plataforma/middleware.ts
git commit -m "feat(trading): endpoint /api/trading/analizar (torneo + barreras + paper)"
```

---

## Task 9: Endpoint `/api/trading/puntuar` (cron walk-forward)

**Files:**
- Create: `apps/plataforma/app/api/trading/puntuar/route.ts`

**Contrato:** el agente hace `POST` con `{ hoy, precios: { [simbolo]: number } }` (precios actuales). El endpoint busca tesis con `fecha + horizonteDias <= hoy` sin `resultado`, las puntúa (walk-forward), crea `trading_tesis_resultado`, recomputa `trading_estrategia_stats` por estrategia y régimen, y aplica stops a las posiciones paper.

- [ ] **Step 1: Implementar el route**

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { puntuarTesis, agregarStats, aplicarStop, cerrar } from '@central/module-trading'
import type { Tesis } from '@central/module-trading'

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { hoy, precios } = (await req.json()) as { hoy: string; precios: Record<string, number> }
  const hoyMs = new Date(hoy).getTime()

  // 1) Puntuar tesis vencidas sin resultado.
  const pendientes = await prisma.tradingTesis.findMany({ where: { resultado: null } })
  let puntuadas = 0
  for (const t of pendientes) {
    const vence = new Date(t.fecha).getTime() + t.horizonteDias * 86_400_000
    const precio = precios[t.simbolo]
    if (vence > hoyMs || precio === undefined) continue
    const r = puntuarTesis(t as unknown as Tesis, precio)
    await prisma.tradingTesisResultado.create({ data: { tesisId: t.id, precioDespues: precio, ventanaDias: t.horizonteDias, retorno: r.retorno, acierto: r.acierto } })
    puntuadas++
  }

  // 2) Recomputar stats por estrategia (régimen 'todos' en Fase 1; se refina con snapshot por tesis después).
  const resultados = await prisma.tradingTesisResultado.findMany({ include: { tesis: true } })
  const stats = agregarStats(resultados.map(r => ({ estrategia: r.tesis.estrategia as Tesis['estrategia'], acierto: r.acierto, retorno: r.retorno })))
  for (const [est, s] of Object.entries(stats)) {
    await prisma.tradingEstrategiaStats.upsert({
      where: { estrategia_regimen: { estrategia: est, regimen: 'todos' } },
      create: { estrategia: est, regimen: 'todos', hitRate: s.hitRate, retornoMedio: s.retornoMedio, n: s.n },
      update: { hitRate: s.hitRate, retornoMedio: s.retornoMedio, n: s.n },
    })
  }

  // 3) Stops sobre posiciones paper.
  const posiciones = await prisma.tradingPaperPosicion.findMany()
  let cerradas = 0
  for (const p of posiciones) {
    const precio = precios[p.simbolo]
    if (precio === undefined) continue
    if (aplicarStop({ simbolo: p.simbolo, cantidad: p.cantidad, precioEntrada: p.precioEntrada, stop: p.stop, abiertaEn: String(p.abiertaEn) }, precio)) {
      const o = cerrar({ simbolo: p.simbolo, cantidad: p.cantidad, precioEntrada: p.precioEntrada, stop: p.stop, abiertaEn: String(p.abiertaEn) }, precio, hoy, 'stop')
      await prisma.tradingPaperOrden.create({ data: { simbolo: o.simbolo, lado: 'SELL', cantidad: o.cantidad, precio: o.precio, fecha: new Date(hoy), motivo: o.motivo } })
      await prisma.tradingPaperPosicion.delete({ where: { simbolo: p.simbolo } })
      cerradas++
    }
  }

  return NextResponse.json({ puntuadas, cerradas, estrategias: Object.keys(stats).length })
}
```

- [ ] **Step 2: Typecheck** — Run (desde `apps/plataforma`): `npx tsc --noEmit` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/app/api/trading/puntuar/route.ts
git commit -m "feat(trading): endpoint /api/trading/puntuar (walk-forward + stats + stops paper)"
```

---

## Task 10: Resumen Telegram + ficha en el catálogo de agentes

**Files:**
- Create: `apps/plataforma/lib/trading-notify.ts`
- Modify: `apps/plataforma/lib/agentes-catalogo.ts`

- [ ] **Step 1: Escribir `lib/trading-notify.ts`**

```typescript
// Formatea el resumen de una pasada del agente de trading para Telegram.
// Importes en formato español con eur() (aunque la cuenta sea multi-divisa, mostramos EUR).
import { eur } from './dinero'

type Idea = { simbolo: string; estrategia: string; direccion: string; confianza: number; operada: boolean; motivo?: string }

export function resumenPasada(fecha: string, navEur: number, top: Idea[]): string {
  const lineas = top.map(i =>
    `• ${i.simbolo} — ${i.direccion} (${i.estrategia}, conf ${i.confianza})` +
    (i.operada ? ' ✅ paper' : i.motivo ? ` ⛔ ${i.motivo}` : ''))
  return [
    `📊 Trading-analista · ${fecha}`,
    `NAV paper base: ${eur(navEur)}`,
    '',
    ...(lineas.length ? lineas : ['Sin ideas accionables hoy.']),
  ].join('\n')
}
```

- [ ] **Step 2: Test rápido del formato**

Create `apps/plataforma/lib/trading-notify.test.ts`:
```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumenPasada } from './trading-notify.ts'

test('resumenPasada incluye NAV en formato español y las ideas', () => {
  const txt = resumenPasada('2026-07-17', 2162.49, [{ simbolo: 'NVDA', estrategia: 'momentum', direccion: 'alcista', confianza: 78, operada: true }])
  assert.ok(txt.includes('2.162,49€'))
  assert.ok(txt.includes('NVDA'))
  assert.ok(txt.includes('✅ paper'))
})
```
Run (desde `apps/plataforma`): `node --test lib/trading-notify.test.ts`
Expected: PASS.

- [ ] **Step 3: Añadir la ficha del agente a `RUTINAS_CLAUDE` en `lib/agentes-catalogo.ts`**

```typescript
  { id: 'trading-analista', nombre: 'Trading-analista (IBKR, paper)', tipo: 'rutina-claude',
    funcion: 'Analiza técnico+fundamental, torneo de estrategias y opera SOLO en paper; aprende por track record',
    cadencia: 'Diaria ~22:15 (cierre US)', disparo: 'Trigger Claude', entrega: 'lectura', telegram: true,
    archivo: '.claude/skills/trading-analista + /api/trading/*', vertical: 'Transversal (finanzas)', estado: 'pendiente-trigger' },
```

- [ ] **Step 4: Correr los tests de catálogo** — Run (desde `apps/plataforma`): `node --test lib/agentes-catalogo.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/lib/trading-notify.ts apps/plataforma/lib/trading-notify.test.ts apps/plataforma/lib/agentes-catalogo.ts
git commit -m "feat(trading): resumen Telegram + ficha en catálogo de agentes"
```

---

## Task 11: Skill de la sesión Claude + registro del trigger

**Files:**
- Create: `.claude/skills/trading-analista/SKILL.md`
- Modify: `docs/RUTINAS-PROGRAMADAS.md`

- [ ] **Step 1: Escribir `.claude/skills/trading-analista/SKILL.md`**

```markdown
---
name: trading-analista
description: Pasada diaria del agente de inversión sobre Interactive Brokers (Fase 1, SOLO paper). Lee cartera + watchlist, tira precios (IBKR) y fundamentales (FMP) por MCP, llama a /api/trading/analizar y /api/trading/puntuar de plataforma, y resume por Telegram. NUNCA ejecuta órdenes reales.
---

# Trading-analista (Fase 1 · paper)

## Regla de oro
NO ejecutar NINGUNA orden real en IBKR. Solo lectura (get_account_*, get_price_history, get_watchlist)
y llamadas a los endpoints de plataforma. La operativa es 100% simulada en BD.

## Pasada (orden exacto)
1. Leer NAV: `get_account_summary` → `net_liquidation` (EUR).
2. Cargar la watchlist activa (tabla `trading_watchlist`, capas A/B/C; ver spec).
3. Por símbolo: `get_price_history` (diario, ~120 velas) → mapear a `Vela[]`;
   si FMP está conectado, traer PER/deuda/margen/próximo earnings → `Fundamentales`.
4. `POST /api/trading/analizar` con `{ fecha, nav, simbolos: [...] }` (Bearer `CRON_SECRET`).
5. `POST /api/trading/puntuar` con `{ hoy, precios }` (precio snapshot de cada símbolo con posición/tesis viva).
6. Enviar por Telegram el `resumenPasada(...)` (o pedir a plataforma que lo mande).

## Fuentes / envs (solo nombres)
- MCP: Interactive Brokers (encendido en el chat del agente), FMP (opcional Fase 1).
- Endpoints: `PLATAFORMA_URL` + `CRON_SECRET`. Telegram: bot único (`core-telegram`).

## Puerta a Fase 2
No proponer ejecución real hasta que `trading_estrategia_stats` muestre rentabilidad sostenida
fuera de muestra. Esa decisión es de Alberto, con su propio spec.
```

- [ ] **Step 2: Registrar cadencia y setup del trigger en `docs/RUTINAS-PROGRAMADAS.md`**

Añadir una entrada: agente `trading-analista`, diaria ~22:15 hora Sevilla (tras cierre US), trigger Claude web, MCP IBKR requerido encendido en la sesión, envs `CRON_SECRET`/`PLATAFORMA_URL`. Marcar como **pendiente-trigger** hasta que Alberto cree el trigger.

- [ ] **Step 3: Sembrar la watchlist inicial (una vez)**

SQL de arranque (ejecutar en la BD compartida vía Supabase MCP o `prisma db execute`):
```sql
insert into trading_watchlist (simbolo, capa) values
 ('SPY','A'),('QQQ','A'),('IWM','A'),
 ('NVO','B'),('NVDA','B'),('META','B'),('MSFT','B'),('NFLX','B'),
 ('SPOT','B'),('RBLX','B'),('PLTR','B'),('LLY','B'),('CVX','B')
on conflict (simbolo) do nothing;
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/trading-analista/SKILL.md docs/RUTINAS-PROGRAMADAS.md
git commit -m "feat(trading): skill de la sesión trading-analista + registro del trigger"
```

---

## Verificación final (antes de dar Fase 1 por hecha)

- [ ] `cd packages/module-trading && npm test` → todos verdes.
- [ ] `cd apps/plataforma && npx tsc --noEmit` → sin errores.
- [ ] `cd apps/plataforma && node --test lib/trading-notify.test.ts lib/agentes-catalogo.test.ts` → verdes.
- [ ] Dry-run real: con el MCP de IBKR encendido, hacer UNA pasada manual (pasos 1-6 del SKILL) contra la watchlist sembrada y comprobar que se crean filas en `trading_tesis` y llega el resumen a Telegram — sin ninguna orden real en IBKR.
- [ ] Confirmar que NINGÚN `vercel.json` construye de más por este PR (todo Ignored salvo plataforma, que sí toca).
- [ ] Anotar la entrada en `docs/CONTEXTO-SESIONES.md`.

## Notas de seguridad / reglas del repo
- Secretos: `CRON_SECRET` por env (nunca literal). FMP API key puede caer a `|| ''` (solo rompe la llamada saliente).
- BD compartida: tablas `trading_*` nuevas y aisladas; no tocar RLS/GRANTs de otras verticales.
- Formato € español (`eur()`) en todo importe mostrado.
- El agente NUNCA opera real en Fase 1 — es la invariante que protege todo lo demás.
