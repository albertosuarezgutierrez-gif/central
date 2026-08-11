# Radar del universo EEUU (S&P 500) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ampliar el análisis del agente de trading a las ~500 mayores de EEUU: caché incremental de fundamentales+precios (`trading_universo`), ranking semanal persistido (`trading_ranking`), sección "🌎 Radar del mercado" en `/trading` y digest Telegram con etiquetas de calidad, track record vs SPY y salud de datos. SOLO paper.

**Architecture:** Cron cada 6h refresca lotes de ~50 símbolos (SEC companyfacts + histórico Stooq→Yahoo) en `trading_universo`. Cron de los lunes lee la caché, rankea con el modelo de factores existente, calcula técnico solo del top-20, cruza gurús, evalúa snapshots pasados vs SPY y persiste+avisa. Lógica pura en `@central/module-trading/src/universo.ts`; IO en `apps/plataforma/lib/trading/{universo,radar}.ts`.

**Tech Stack:** TypeScript puro + `node --test` (módulo), Next.js 15 route handlers (crons), Prisma 5 (BD compartida), `@central/core-telegram`. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-07-19-trading-universo-eeuu-fase1-design.md`

**Convenciones de esta base de código (léelas antes de empezar):**
- Módulo puro: imports con extensión `.ts`, tests en `packages/module-trading/test/*.test.ts`, corren con `npm test` (= `node --test test/*.test.ts`).
- Tests de `apps/plataforma/lib/trading`: `node --test --experimental-strip-types lib/trading/*.test.ts`.
- Crons: patrón de `apps/plataforma/app/api/cron/paper-tracker/route.ts` (auth `Bearer ${process.env.CRON_SECRET}`, GET+POST, `force-dynamic`).
- Migraciones: archivo en `apps/plataforma/prisma/sql/` + modelo en `schema.prisma`; se aplican por Supabase MCP (proyecto `wswbehlcuxqxyinousql`); RLS habilitada sin políticas (patrón `trading_*`).
- Commits: `git config user.email noreply@anthropic.com && git config user.name Claude`; mensaje con trailers del repo.
- Precios en USD con formato es-ES (NUNCA `eur()`, que es solo para €).

---

### Task 1: Módulo puro `universo.ts` (rankear + etiqueta + diff + track record)

**Files:**
- Create: `packages/module-trading/src/universo.ts`
- Modify: `packages/module-trading/src/index.ts`
- Test: `packages/module-trading/test/universo.test.ts`

- [ ] **Step 1: Escribir los tests (fallarán)**

`packages/module-trading/test/universo.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankearUniverso, etiquetaCalidad, diffRanking, snapshotsParaEvaluar, resumenTrackRecord } from '../src/universo.ts'

const emp = (simbolo: string, extra: Record<string, unknown> = {}) => ({
  simbolo, nombre: `${simbolo} Corp`, piotroski: 6, roic: 0.12, earningsYield: 0.06, momentum: 0.1, mktCap: 1e10, guruScore: 0, ...extra,
})

test('rankearUniverso: excluye sin piotroski/roic, ordena mejor primero, respeta top', () => {
  const r = rankearUniverso([
    emp('AAA', { piotroski: 9, roic: 0.3, earningsYield: 0.12, momentum: 0.4 }),
    emp('BBB'),
    emp('CCC', { piotroski: null }),          // sin quality core → excluida
    emp('DDD', { piotroski: 2, roic: 0.01, earningsYield: 0.01, momentum: -0.2 }),
  ], { top: 2 })
  assert.equal(r.universoTotal, 4)
  assert.equal(r.conDatos, 3)                  // CCC fuera
  assert.equal(r.items.length, 2)
  assert.equal(r.items[0].simbolo, 'AAA')      // la mejor en todo
  assert.equal(r.items[0].nombre, 'AAA Corp')  // el nombre viaja con el item
  assert.ok(r.items[0].score > r.items[1].score)
})

test('etiquetaCalidad: débil sin datos completos; fuerte = calidad alta + confirmación; media el resto', () => {
  assert.equal(etiquetaCalidad(emp('X', { earningsYield: null })), 'debil')       // incompleto
  assert.equal(etiquetaCalidad(emp('X', { datosFrescos: false })), 'debil')       // rancio
  assert.equal(etiquetaCalidad(emp('X', { piotroski: 8, roic: 0.2, guruScore: 3 })), 'fuerte')
  assert.equal(etiquetaCalidad(emp('X', { piotroski: 8, roic: 0.2, momentum: 0.15 })), 'fuerte')  // confirma momentum
  assert.equal(etiquetaCalidad(emp('X', { piotroski: 8, roic: 0.2, momentum: -0.1 })), 'media')   // calidad sin confirmación
  assert.equal(etiquetaCalidad(emp('X')), 'media')
})

test('diffRanking: entradas y salidas del top', () => {
  const d = diffRanking(['A', 'B', 'C'], ['B', 'C', 'D'])
  assert.deepEqual(d.entran, ['D'])
  assert.deepEqual(d.salen, ['A'])
  assert.deepEqual(diffRanking([], ['A']).entran, ['A'])   // primer snapshot: todo "entra"
})

test('snapshotsParaEvaluar: el más cercano a cada objetivo dentro de tolerancia, sin repetir', () => {
  const hoy = '2026-07-19'
  const fechas = ['2026-07-13', '2026-06-22', '2026-05-25', '2026-04-20']
  // objetivos por defecto ~28/56/91 días atrás → 21/06 (27d), 25/05 (55d), 20/04 (90d)
  assert.deepEqual(snapshotsParaEvaluar(fechas, hoy), ['2026-06-22', '2026-05-25', '2026-04-20'])
  // sin snapshots dentro de tolerancia → vacío
  assert.deepEqual(snapshotsParaEvaluar(['2026-07-18'], hoy), [])
})

test('resumenTrackRecord: cuenta ventanas que baten al SPY por MEDIANA', () => {
  const r = resumenTrackRecord([
    { fecha: '2026-06-22', dias: 27, mediana: 0.05, retornoBench: 0.02, baten: 6, n: 10 },
    { fecha: '2026-05-25', dias: 55, mediana: 0.01, retornoBench: 0.04, baten: 3, n: 10 },
  ])
  assert.equal(r.ventanas, 2)
  assert.equal(r.bateVentanas, 1)
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `cd packages/module-trading && node --test test/universo.test.ts`
Expected: FAIL (módulo `../src/universo.ts` no existe).

- [ ] **Step 3: Implementar `src/universo.ts`**

```ts
// RADAR del universo EEUU (Fase 1): rankea las ~500 mayores por el modelo de factores YA existente
// (value+quality+momentum) y añade las capas informativas del spec — etiqueta de calidad por pick,
// diff semanal (entra/sale) y track record de snapshots pasados. La SELECCIÓN decide el QUÉ; el
// técnico (capa del consumidor) solo confirma el CUÁNDO. Puro y serializable.
import { rankearFactores, type MetricasFactor } from './factores.ts'

export type EmpresaUniverso = {
  simbolo: string
  nombre?: string
  piotroski?: number | null
  roic?: number | null
  earningsYield?: number | null
  momentum?: number | null
  mktCap?: number | null
  guruScore?: number           // convicción Dataroma (0 = sin señal)
  datosFrescos?: boolean       // false = la caché está rancia (lo decide el consumidor)
}

export type ItemRadar = {
  simbolo: string
  nombre?: string
  score: number
  zValor: number
  zCalidad: number
  zMomentum: number
  piotroski?: number | null
  roic?: number | null
  guru: boolean
  etiqueta: 'fuerte' | 'media' | 'debil'
}

export type ResultadoRadar = {
  items: ItemRadar[]      // top N, mejor primero
  universoTotal: number
  conDatos: number        // elegibles (con piotroski Y roic)
}

// Etiqueta de calidad POR PICK (idea A del spec). Regla determinista:
// débil = datos incompletos o rancios (no te fíes) · fuerte = calidad alta (Piotroski≥7, ROIC≥15%)
// + una confirmación (gurús comprando o momentum positivo) · media = el resto.
export function etiquetaCalidad(e: EmpresaUniverso): 'fuerte' | 'media' | 'debil' {
  const completos = e.piotroski != null && e.roic != null && e.earningsYield != null && e.momentum != null && e.mktCap != null
  if (!completos || e.datosFrescos === false) return 'debil'
  const calidadAlta = (e.piotroski ?? 0) >= 7 && (e.roic ?? 0) >= 0.15
  const confirmacion = (e.guruScore ?? 0) > 0 || (e.momentum ?? 0) > 0
  return calidadAlta && confirmacion ? 'fuerte' : 'media'
}

// Rankea el universo con el modelo de factores. Solo son elegibles los nombres con el núcleo de
// calidad (piotroski + roic); el resto cuenta como "sin datos" (va a la línea de salud, no al ranking).
export function rankearUniverso(empresas: EmpresaUniverso[], opts: { top?: number } = {}): ResultadoRadar {
  const top = opts.top ?? 20
  const elegibles = empresas.filter(e => e.piotroski != null && e.roic != null)
  const metricas: MetricasFactor[] = elegibles.map(e => ({
    simbolo: e.simbolo,
    earningsYield: e.earningsYield ?? undefined,
    roic: e.roic ?? undefined,
    piotroski: e.piotroski ?? undefined,
    momentum12m: e.momentum ?? undefined,
  }))
  const scores = rankearFactores(metricas)   // ya ordena mejor primero
  const por = new Map(elegibles.map(e => [e.simbolo, e]))
  const items: ItemRadar[] = scores.slice(0, top).map(s => {
    const e = por.get(s.simbolo)!
    return {
      simbolo: s.simbolo, nombre: e.nombre, score: s.score,
      zValor: s.zValor, zCalidad: s.zCalidad, zMomentum: s.zMomentum,
      piotroski: e.piotroski, roic: e.roic,
      guru: (e.guruScore ?? 0) > 0,
      etiqueta: etiquetaCalidad(e),
    }
  })
  return { items, universoTotal: empresas.length, conDatos: elegibles.length }
}

// Diff del top entre dos snapshots (para el digest y los futuros avisos por cambio material).
export function diffRanking(anterior: string[], actual: string[]): { entran: string[]; salen: string[] } {
  const prev = new Set(anterior)
  const act = new Set(actual)
  return { entran: actual.filter(s => !prev.has(s)), salen: anterior.filter(s => !act.has(s)) }
}

const dias = (d1: string, d2: string) => Math.round((Date.parse(d2) - Date.parse(d1)) / 86_400_000)

// Elige qué snapshots pasados evaluar: el más cercano a cada objetivo (~4/~8/~13 semanas) dentro de
// una tolerancia, sin repetir fechas. Determinista (el consumidor aporta "hoy").
export function snapshotsParaEvaluar(
  fechas: string[], hoy: string, objetivosDias: number[] = [28, 56, 91], toleranciaDias = 10,
): string[] {
  const usadas = new Set<string>()
  const out: string[] = []
  for (const objetivo of objetivosDias) {
    let mejor: string | undefined
    let mejorDist = Infinity
    for (const f of fechas) {
      if (usadas.has(f)) continue
      const dist = Math.abs(dias(f, hoy) - objetivo)
      if (dist <= toleranciaDias && dist < mejorDist) { mejor = f; mejorDist = dist }
    }
    if (mejor) { usadas.add(mejor); out.push(mejor) }
  }
  return out
}

export type EvaluacionSnapshot = {
  fecha: string
  dias: number
  mediana: number | null    // de la cesta top del snapshot (la métrica que decide)
  retornoBench: number      // SPY en la misma ventana
  baten: number             // nº de picks que batieron individualmente al SPY
  n: number
}

// Agregado del track record (idea B del spec): cuántas ventanas baten al SPY por MEDIANA.
export function resumenTrackRecord(evals: EvaluacionSnapshot[]): { ventanas: number; bateVentanas: number } {
  return {
    ventanas: evals.length,
    bateVentanas: evals.filter(e => e.mediana != null && e.mediana > e.retornoBench).length,
  }
}
```

- [ ] **Step 4: Exportar en `src/index.ts`** — añadir tras la línea de `riesgoCesta`:

```ts
export { rankearUniverso, etiquetaCalidad, diffRanking, snapshotsParaEvaluar, resumenTrackRecord } from './universo.ts'
export type { EmpresaUniverso, ItemRadar, ResultadoRadar, EvaluacionSnapshot } from './universo.ts'
```

- [ ] **Step 5: Correr TODOS los tests del módulo**

Run: `cd packages/module-trading && npm test`
Expected: PASS (100 previos + 5 nuevos).

- [ ] **Step 6: Commit**

```bash
git add packages/module-trading/src/universo.ts packages/module-trading/src/index.ts packages/module-trading/test/universo.test.ts
git commit -m "trading: módulo puro del radar del universo (rankear+etiqueta+diff+track record)"
```

---

### Task 2: EDGAR — lista del universo (ticker+nombre) y fundamentales ampliados

**Files:**
- Modify: `apps/plataforma/lib/trading/edgar.ts`
- Test: `apps/plataforma/lib/trading/edgar.test.ts` (añadir casos)

- [ ] **Step 1: Añadir tests (fallarán)** — en `edgar.test.ts`, al final:

```ts
test('listaUniverso: ticker+nombre+cik en orden del fichero, dedupe por CIK, filtra clases raras', () => {
  const json = {
    '0': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft Corp' },
    '1': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
    '2': { cik_str: 789019, ticker: 'MSFT-W', title: 'Microsoft Corp WT' },  // clase rara + CIK repetido
    '3': { cik_str: 1067983, ticker: 'BRK.B', title: 'Berkshire Hathaway' }, // punto de clase: se admite
  }
  const l = listaUniverso(json, 10)
  assert.deepEqual(l.map(x => x.simbolo), ['MSFT', 'AAPL', 'BRK.B'])
  assert.equal(l[0].nombre, 'Microsoft Corp')
  assert.equal(l[0].cik, '0000789019')
  assert.deepEqual(listaUniverso(json, 2).map(x => x.simbolo), ['MSFT', 'AAPL'])  // respeta n
})

test('extraerFundamentales expone deudaLp/caja/margenNeto/acciones para EV y mktCap', () => {
  // reutilizar el fixture `CF` existente en este archivo añadiéndole CashAndCashEquivalentsAtCarryingValue;
  // comprobar que el resultado trae deudaLp (nº), caja (nº), margenNeto (nº) y acciones (nº) del FY más reciente
  const f = extraerFundamentales(CF_CON_CAJA, 'TST')!
  assert.equal(typeof f.deudaLp, 'number')
  assert.equal(typeof f.caja, 'number')
  assert.equal(typeof f.margenNeto, 'number')
  assert.ok((f.acciones ?? 0) > 0)
})
```

(El fixture `CF_CON_CAJA` se construye clonando el fixture de companyfacts ya presente en el test y añadiendo el concepto `CashAndCashEquivalentsAtCarryingValue` con un punto FY/10-K. Importar `listaUniverso` en la cabecera del test.)

- [ ] **Step 2: Verificar que fallan** — `cd apps/plataforma && node --test --experimental-strip-types lib/trading/edgar.test.ts` → FAIL.

- [ ] **Step 3: Implementar en `edgar.ts`:**

(a) En `ALIAS`, añadir: `caja: ['CashAndCashEquivalentsAtCarryingValue'],`

(b) Ampliar el tipo y la extracción (campos OPCIONALES — no rompe consumidores):

```ts
export type FundamentalesEmpresa = {
  simbolo: string
  cik?: string
  anios: Array<{ fy: number; fin: AnioFinanciero }>
  ebit?: number
  capitalInvertido?: number
  roic?: number
  // Para EV y mktCap (radar): valores ABSOLUTOS del FY más reciente.
  deudaLp?: number
  caja?: number
  margenNeto?: number   // beneficio neto / ventas
  acciones?: number     // = anios[0].fin.acciones (comodidad del consumidor)
}
```

Y dentro de `extraerFundamentales`, tras calcular `roic`:

```ts
  const deudaLp = valorFy(facts, ALIAS.deudaLp, fyUlt)
  const caja = valorFy(facts, ALIAS.caja, fyUlt)
  const ventas = valorFy(facts, ALIAS.ventas, fyUlt)
  const neto = valorFy(facts, ALIAS.netIncome, fyUlt)
  const margenNeto = ventas ? div(neto, ventas) : undefined
  return { simbolo, cik: ..., anios, ebit, capitalInvertido, roic,
           deudaLp, caja, margenNeto, acciones: anios[0].fin.acciones || undefined }
```

(c) Lista del universo + fetch por CIK:

```ts
// Las N mayores de EEUU desde company_tickers.json (viene ~ordenado por capitalización — propiedad
// NO documentada; el consumidor tiene una semilla de respaldo). Dedupe por CIK (una clase por empresa)
// y filtro de tickers raros (warrants/units con guion).
export function listaUniverso(json: unknown, n = 550): Array<{ simbolo: string; cik: string; nombre: string }> {
  const out: Array<{ simbolo: string; cik: string; nombre: string }> = []
  const vistos = new Set<string>()
  const filas = json && typeof json === 'object' ? Object.values(json as Record<string, unknown>) : []
  for (const f of filas) {
    if (out.length >= n) break
    const fila = f as { ticker?: string; cik_str?: number | string; title?: string }
    if (!fila?.ticker || fila.cik_str == null || !fila.title) continue
    const simbolo = String(fila.ticker).toUpperCase()
    if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(simbolo)) continue    // fuera warrants/units (guiones)
    const cik = String(fila.cik_str).padStart(10, '0')
    if (vistos.has(cik)) continue
    vistos.add(cik)
    out.push({ simbolo, cik, nombre: String(fila.title) })
  }
  return out
}

// companyfacts por CIK ya conocido (el refresco del radar guarda el CIK y se ahorra resolverlo).
export async function fundamentalesCik(simbolo: string, cik: string, timeoutMs = 8000): Promise<FundamentalesEmpresa | null> {
  const cf = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, timeoutMs)
  return cf ? extraerFundamentales(cf as never, simbolo) : null
}

// El JSON crudo de company_tickers (para listaUniverso). Best-effort → null.
export async function descargarTickersSec(timeoutMs = 10000): Promise<unknown | null> {
  return getJson('https://www.sec.gov/files/company_tickers.json', timeoutMs)
}
```

- [ ] **Step 4: Tests en verde** — `node --test --experimental-strip-types lib/trading/edgar.test.ts` → PASS (todos, viejos incluidos).

- [ ] **Step 5: Commit** — `git add apps/plataforma/lib/trading/edgar.ts apps/plataforma/lib/trading/edgar.test.ts && git commit -m "trading: lista del universo SEC (ticker+nombre) y fundamentales ampliados para EV"`

---

### Task 3: BD — modelos Prisma + migración SQL (aplicar por Supabase MCP)

**Files:**
- Modify: `apps/plataforma/prisma/schema.prisma` (junto a los modelos `Trading*`)
- Create: `apps/plataforma/prisma/sql/2026-07-19_trading_universo.sql`

- [ ] **Step 1: Añadir modelos al schema** (tras `TradingPaperTrack`):

```prisma
// Radar del universo EEUU (Fase 1). Caché incremental de fundamentales+precio por símbolo; la
// refresca el cron `trading-universo` por lotes (los más rancios primero). SOLO lectura/medición.
model TradingUniverso {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  simbolo       String    @unique
  cik           String?
  nombre        String?
  piotroski     Int?
  roic          Float?
  earningsYield Float?    @map("earnings_yield")   // EBIT/EV (EV = mktCap + deudaLp − caja)
  momentum      Float?                              // 12-1 desde el histórico cacheado
  precio        Float?
  mktCap        Float?    @map("mkt_cap")
  datos         Json?                               // FundamentalesEmpresa crudo (debug/reuso)
  fuenteFy      Int?      @map("fuente_fy")         // ejercicio fiscal del dato
  error         String?                             // último fallo de fetch (salud de datos)
  actualizadoEn DateTime  @default(now()) @map("actualizado_en") @db.Timestamptz(6)
  @@index([actualizadoEn])
  @@map("trading_universo")
}

// Snapshot SEMANAL del ranking (una fila por lunes). `entries` = top-N con nombre/score/etiqueta/
// badges; trackRecord y salud van dentro para que la UI pinte sin recalcular. Idempotente por fecha.
model TradingRanking {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fecha         DateTime @unique @db.Date
  entries       Json
  trackRecord   Json?    @map("track_record")
  salud         Json?
  universoTotal Int      @map("universo_total")
  conDatos      Int      @map("con_datos")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@map("trading_ranking")
}
```

- [ ] **Step 2: Escribir la migración** `prisma/sql/2026-07-19_trading_universo.sql`:

```sql
-- Radar del universo EEUU (Fase 1) · caché incremental + snapshots semanales del ranking.
-- Tablas nuevas y AISLADAS (patrón trading_*). Aplicar por Supabase MCP (wswbehlcuxqxyinousql).
CREATE TABLE IF NOT EXISTS "trading_universo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "simbolo" TEXT NOT NULL,
    "cik" TEXT,
    "nombre" TEXT,
    "piotroski" INTEGER,
    "roic" DOUBLE PRECISION,
    "earnings_yield" DOUBLE PRECISION,
    "momentum" DOUBLE PRECISION,
    "precio" DOUBLE PRECISION,
    "mkt_cap" DOUBLE PRECISION,
    "datos" JSONB,
    "fuente_fy" INTEGER,
    "error" TEXT,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_universo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "trading_universo_simbolo_key" ON "trading_universo"("simbolo");
CREATE INDEX IF NOT EXISTS "trading_universo_actualizado_en_idx" ON "trading_universo"("actualizado_en");

CREATE TABLE IF NOT EXISTS "trading_ranking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fecha" DATE NOT NULL,
    "entries" JSONB NOT NULL,
    "track_record" JSONB,
    "salud" JSONB,
    "universo_total" INTEGER NOT NULL,
    "con_datos" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_ranking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "trading_ranking_fecha_key" ON "trading_ranking"("fecha");

ALTER TABLE "trading_universo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trading_ranking" ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: `npx prisma generate`** (en `apps/plataforma`) → sin errores.
- [ ] **Step 4: Aplicar la migración por Supabase MCP** (`apply_migration`, name `trading_universo_radar`, proyecto `wswbehlcuxqxyinousql`; verificar con `information_schema.columns`).
- [ ] **Step 5: Commit** — `git add apps/plataforma/prisma/schema.prisma apps/plataforma/prisma/sql/2026-07-19_trading_universo.sql && git commit -m "trading: tablas del radar (trading_universo + trading_ranking)"`

---

### Task 4: Semilla de respaldo del universo

**Files:**
- Create: `apps/plataforma/lib/trading/universo-semilla.ts`

- [ ] **Step 1: Crear la semilla** — ~60 megacaps con nombre (respaldo DEGRADADO si `company_tickers.json` cambia de forma; el universo normal viene de la SEC):

```ts
// Semilla de RESPALDO del universo (solo si company_tickers.json cambia de forma o no responde):
// las mayores de EEUU con su nombre. Con la semilla el radar degrada a ~60 nombres y lo AVISA en la
// línea de salud — nunca falla en silencio. El universo normal (550) viene de la SEC en runtime.
export const UNIVERSO_SEMILLA: Array<{ simbolo: string; nombre: string }> = [
  { simbolo: 'AAPL', nombre: 'Apple Inc.' }, { simbolo: 'MSFT', nombre: 'Microsoft Corp' },
  { simbolo: 'NVDA', nombre: 'NVIDIA Corp' }, { simbolo: 'AMZN', nombre: 'Amazon.com Inc' },
  { simbolo: 'GOOG', nombre: 'Alphabet Inc' }, { simbolo: 'META', nombre: 'Meta Platforms Inc' },
  { simbolo: 'BRK.B', nombre: 'Berkshire Hathaway' }, { simbolo: 'AVGO', nombre: 'Broadcom Inc' },
  { simbolo: 'TSLA', nombre: 'Tesla Inc' }, { simbolo: 'LLY', nombre: 'Eli Lilly & Co' },
  { simbolo: 'JPM', nombre: 'JPMorgan Chase & Co' }, { simbolo: 'V', nombre: 'Visa Inc' },
  { simbolo: 'XOM', nombre: 'Exxon Mobil Corp' }, { simbolo: 'UNH', nombre: 'UnitedHealth Group' },
  { simbolo: 'MA', nombre: 'Mastercard Inc' }, { simbolo: 'PG', nombre: 'Procter & Gamble' },
  { simbolo: 'JNJ', nombre: 'Johnson & Johnson' }, { simbolo: 'COST', nombre: 'Costco Wholesale' },
  { simbolo: 'HD', nombre: 'Home Depot Inc' }, { simbolo: 'ABBV', nombre: 'AbbVie Inc' },
  { simbolo: 'WMT', nombre: 'Walmart Inc' }, { simbolo: 'NFLX', nombre: 'Netflix Inc' },
  { simbolo: 'BAC', nombre: 'Bank of America' }, { simbolo: 'CRM', nombre: 'Salesforce Inc' },
  { simbolo: 'ORCL', nombre: 'Oracle Corp' }, { simbolo: 'CVX', nombre: 'Chevron Corp' },
  { simbolo: 'KO', nombre: 'Coca-Cola Co' }, { simbolo: 'AMD', nombre: 'Advanced Micro Devices' },
  { simbolo: 'PEP', nombre: 'PepsiCo Inc' }, { simbolo: 'TMO', nombre: 'Thermo Fisher Scientific' },
  { simbolo: 'LIN', nombre: 'Linde plc' }, { simbolo: 'ADBE', nombre: 'Adobe Inc' },
  { simbolo: 'MCD', nombre: "McDonald's Corp" }, { simbolo: 'CSCO', nombre: 'Cisco Systems' },
  { simbolo: 'ACN', nombre: 'Accenture plc' }, { simbolo: 'ABT', nombre: 'Abbott Laboratories' },
  { simbolo: 'MRK', nombre: 'Merck & Co' }, { simbolo: 'INTU', nombre: 'Intuit Inc' },
  { simbolo: 'GE', nombre: 'GE Aerospace' }, { simbolo: 'DIS', nombre: 'Walt Disney Co' },
  { simbolo: 'PFE', nombre: 'Pfizer Inc' }, { simbolo: 'QCOM', nombre: 'Qualcomm Inc' },
  { simbolo: 'TXN', nombre: 'Texas Instruments' }, { simbolo: 'CAT', nombre: 'Caterpillar Inc' },
  { simbolo: 'VZ', nombre: 'Verizon Communications' }, { simbolo: 'IBM', nombre: 'IBM Corp' },
  { simbolo: 'AMGN', nombre: 'Amgen Inc' }, { simbolo: 'GS', nombre: 'Goldman Sachs Group' },
  { simbolo: 'NOW', nombre: 'ServiceNow Inc' }, { simbolo: 'ISRG', nombre: 'Intuitive Surgical' },
  { simbolo: 'SPGI', nombre: 'S&P Global Inc' }, { simbolo: 'UBER', nombre: 'Uber Technologies' },
  { simbolo: 'BKNG', nombre: 'Booking Holdings' }, { simbolo: 'HON', nombre: 'Honeywell International' },
  { simbolo: 'MS', nombre: 'Morgan Stanley' }, { simbolo: 'BLK', nombre: 'BlackRock Inc' },
  { simbolo: 'DE', nombre: 'Deere & Co' }, { simbolo: 'LMT', nombre: 'Lockheed Martin' },
  { simbolo: 'SBUX', nombre: 'Starbucks Corp' }, { simbolo: 'AXP', nombre: 'American Express' },
]
```

- [ ] **Step 2: Commit** — `git add apps/plataforma/lib/trading/universo-semilla.ts && git commit -m "trading: semilla de respaldo del universo"`

---

### Task 5: Refresco incremental (`lib/trading/universo.ts` + cron)

**Files:**
- Create: `apps/plataforma/lib/trading/universo.ts`
- Create: `apps/plataforma/app/api/cron/trading-universo/route.ts`
- Modify: `apps/plataforma/vercel.json` (cron)

- [ ] **Step 1: Implementar `lib/trading/universo.ts`:**

```ts
import { prisma } from '@/lib/db'
import { piotroskiFScore, momentum12_1 } from '@central/module-trading'
import { descargarTickersSec, listaUniverso, fundamentalesCik } from './edgar'
import { cierresDiarios } from './precios-stooq'
import { UNIVERSO_SEMILLA } from './universo-semilla'

// Refresco INCREMENTAL del radar (Fase 1): mantiene trading_universo con fundamentales+precio de las
// ~550 mayores de EEUU. Lotes pequeños, los más rancios primero, a ritmo suave (la SEC limita ~10 req/s;
// vamos muy por debajo). Un fallo por símbolo se anota en la fila y NO rompe el lote. SOLO lectura.

export const UNIVERSO_TAM = 550
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const hoyIso = () => new Date().toISOString().slice(0, 10)
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

// Lista del universo: SEC primero; si viene rota/corta, degrada a la semilla (y el caller lo anota).
export async function listaUniversoActual(): Promise<{ lista: Array<{ simbolo: string; cik?: string; nombre: string }>; fuente: 'sec' | 'semilla' }> {
  const json = await descargarTickersSec()
  const lista = json ? listaUniverso(json, UNIVERSO_TAM) : []
  if (lista.length >= 100) return { lista, fuente: 'sec' }
  return { lista: UNIVERSO_SEMILLA, fuente: 'semilla' }
}

// Refresca el siguiente lote: siembra filas nuevas, elige las `lote` más rancias y las rellena.
export async function refrescarLoteUniverso(lote = 50): Promise<{ fuente: string; sembradas: number; procesadas: number; conDatos: number; errores: number }> {
  const { lista, fuente } = await listaUniversoActual()

  // 1) Sembrar las que falten (solo identidad; datos a null → van las primeras por rancias).
  const sembrado = await prisma.tradingUniverso.createMany({
    data: lista.map(x => ({ simbolo: x.simbolo, cik: x.cik ?? null, nombre: x.nombre, actualizadoEn: new Date(0) })),
    skipDuplicates: true,
  })

  // 2) Las `lote` más rancias DEL universo actual (no arrastramos símbolos que salieron de la lista).
  const simbolosUniverso = lista.map(x => x.simbolo)
  const filas = await prisma.tradingUniverso.findMany({
    where: { simbolo: { in: simbolosUniverso } },
    orderBy: { actualizadoEn: 'asc' },
    take: lote,
  })

  let conDatos = 0, errores = 0
  for (const fila of filas) {
    try {
      const f = fila.cik ? await fundamentalesCik(fila.simbolo, fila.cik) : null
      const cierres = await cierresDiarios(fila.simbolo, haceDias(400), hoyIso())
      const precio = cierres.at(-1) ?? null
      const piotroski = f && f.anios.length >= 2 ? piotroskiFScore(f.anios[0].fin, f.anios[1].fin).score : null
      const mktCap = precio != null && f?.acciones ? precio * f.acciones : null
      const ev = mktCap != null ? mktCap + (f?.deudaLp ?? 0) - (f?.caja ?? 0) : null
      const earningsYield = f?.ebit != null && ev ? f.ebit / ev : null
      const momentum = momentum12_1(cierres)
      const ok = piotroski != null && f?.roic != null
      if (ok) conDatos++
      await prisma.tradingUniverso.update({
        where: { id: fila.id },
        data: {
          piotroski, roic: f?.roic ?? null, earningsYield, momentum, precio, mktCap,
          datos: f ? (f as object) : undefined, fuenteFy: f?.anios[0]?.fy ?? null,
          error: ok ? null : (f ? 'datos incompletos' : 'sin companyfacts'),
          actualizadoEn: new Date(),
        },
      })
    } catch (e) {
      errores++
      await prisma.tradingUniverso.update({
        where: { id: fila.id },
        data: { error: e instanceof Error ? e.message.slice(0, 200) : 'error', actualizadoEn: new Date() },
      }).catch(() => {})
    }
    await sleep(250)   // ~4 símbolos/s (2 fetches c/u) — muy por debajo del límite SEC
  }
  return { fuente, sembradas: sembrado.count, procesadas: filas.length, conDatos, errores }
}
```

- [ ] **Step 2: Cron `app/api/cron/trading-universo/route.ts`** (patrón `paper-tracker`):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { refrescarLoteUniverso } from '@/lib/trading/universo'

// 🌎 Radar (Fase 1) — refresco INCREMENTAL del universo, cada 6h por lotes. Auth Bearer CRON_SECRET.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await refrescarLoteUniverso()
  return NextResponse.json({ ok: true, ...r })
}
export { handler as GET, handler as POST }
```

- [ ] **Step 3: Cron en `vercel.json`** — añadir al principio del array `crons`:

```json
    { "path": "/api/cron/trading-universo", "schedule": "20 */6 * * *" },
```

- [ ] **Step 4: Verificar** — `npx tsc --noEmit` → 0 errores · `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'));console.log('json ok')"`.
- [ ] **Step 5: Commit** — `git add lib/trading/universo.ts app/api/cron/trading-universo/route.ts vercel.json && git commit -m "trading: refresco incremental del universo (cron cada 6h)"`

---

### Task 6: Ranking semanal + digest (`lib/trading/radar.ts` + cron)

**Files:**
- Create: `apps/plataforma/lib/trading/radar.ts`
- Create: `apps/plataforma/app/api/cron/trading-ranking/route.ts`
- Modify: `apps/plataforma/vercel.json` (cron lunes 09:00)

- [ ] **Step 1: Implementar `lib/trading/radar.ts`:**

```ts
import { tgSend } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import {
  rankearUniverso, diffRanking, snapshotsParaEvaluar, resumenTrackRecord,
  evaluarCestaVsBench, agregarConviccion, sma, rsi,
  type EmpresaUniverso, type ItemRadar, type EvaluacionSnapshot,
} from '@central/module-trading'
import { cierresDiarios } from './precios-stooq'
import { movimientosGestorDataroma, GESTORES_DEFECTO } from './dataroma'

// RANKING SEMANAL del radar (Fase 1): lee la caché (cero llamadas a la SEC), rankea, confirma el
// timing del top-20 con técnico ligero (SMA50+RSI sobre cierres), cruza gurús, evalúa el track
// record de snapshots pasados vs SPY y persiste+avisa. La MEDIANA decide, como en el forward paper.

const hoyIso = () => new Date().toISOString().slice(0, 10)
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const pct = (x: number | null | undefined) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`)
const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const ETIQ = { fuerte: '🟢 fuerte', media: '🟡 media', debil: '⚪ débil' } as const

export type EntryRadar = ItemRadar & { tecnico: 'si' | 'esperar' | null }

// Cobertura mínima para rankear con la cabeza alta: mitad del universo con datos frescos (<14 días).
const FRESCURA_DIAS = 14
const COBERTURA_MIN = 0.5

export async function generarRadarSemanal(): Promise<{ ok: boolean; motivo?: string; enviado?: boolean; top?: number }> {
  const hoy = hoyIso()

  // 1) Caché + frescura.
  const filas = await prisma.tradingUniverso.findMany()
  const limiteFresco = new Date(Date.now() - FRESCURA_DIAS * 86_400_000)
  const frescas = filas.filter(f => f.piotroski != null && f.roic != null && f.actualizadoEn > limiteFresco)
  if (filas.length === 0 || frescas.length < filas.length * COBERTURA_MIN) {
    await tgSend(`🌎 <b>Radar del mercado</b>: datos insuficientes (${frescas.length}/${filas.length} frescos) — no ranqueo con datos flojos. El refresco sigue su curso; reintento el próximo lunes.`).catch(() => {})
    return { ok: false, motivo: 'cobertura', enviado: true }
  }

  // 2) Gurús (best-effort) → guruScore por símbolo.
  const porGestor = await Promise.all(GESTORES_DEFECTO.map(c => movimientosGestorDataroma(c).catch(() => [])))
  const guru = new Map(agregarConviccion(porGestor.flat()).map(c => [c.simbolo, c.score]))

  // 3) Rankear (puro).
  const empresas: EmpresaUniverso[] = filas.map(f => ({
    simbolo: f.simbolo, nombre: f.nombre ?? undefined,
    piotroski: f.piotroski, roic: f.roic, earningsYield: f.earningsYield,
    momentum: f.momentum, mktCap: f.mktCap, guruScore: guru.get(f.simbolo) ?? 0,
    datosFrescos: f.actualizadoEn > limiteFresco,
  }))
  const radar = rankearUniverso(empresas, { top: 20 })

  // 4) Técnico ligero del top-20 (precios frescos; SOLO confirma el cuándo).
  const entries: EntryRadar[] = []
  for (const item of radar.items) {
    let tecnico: EntryRadar['tecnico'] = null
    const cierres = await cierresDiarios(item.simbolo, haceDias(150), hoy)
    if (cierres.length >= 60) {
      const s50 = sma(cierres, 50); const r14 = rsi(cierres)
      if (s50 != null && r14 != null) {
        tecnico = cierres[cierres.length - 1] > s50 && r14 >= 40 && r14 <= 70 ? 'si' : 'esperar'
      }
    }
    entries.push({ ...item, tecnico })
  }

  // 5) Track record de snapshots pasados (mismo motor que el forward paper; MEDIANA decide).
  const previos = await prisma.tradingRanking.findMany({ orderBy: { fecha: 'asc' } })
  const fechas = previos.map(p => p.fecha.toISOString().slice(0, 10))
  const evals: EvaluacionSnapshot[] = []
  for (const fecha of snapshotsParaEvaluar(fechas, hoy)) {
    const snap = previos.find(p => p.fecha.toISOString().slice(0, 10) === fecha)!
    const simbolos = (snap.entries as EntryRadar[]).slice(0, 10).map(e => e.simbolo)
    const [bench, ...series] = await Promise.all([
      cierresDiarios('SPY', fecha, hoy), ...simbolos.map(s => cierresDiarios(s, fecha, hoy)),
    ])
    const r = evaluarCestaVsBench(simbolos.map((simbolo, i) => ({ simbolo, cierres: series[i] })), bench)
    if (!r) continue
    evals.push({
      fecha, dias: Math.round((Date.parse(hoy) - Date.parse(fecha)) / 86_400_000),
      mediana: mediana(r.porSimbolo.map(x => x.retorno)), retornoBench: r.retornoBench,
      baten: r.ganadoresVsBench, n: r.n,
    })
  }
  const track = resumenTrackRecord(evals)

  // 6) Persistir snapshot (idempotente por fecha) + salud.
  const errores = filas.filter(f => f.error != null).length
  const salud = { total: filas.length, frescas: frescas.length, errores }
  const ultimo = previos.at(-1)
  await prisma.tradingRanking.upsert({
    where: { fecha: new Date(hoy) },
    create: { fecha: new Date(hoy), entries: entries as object[], trackRecord: { evals, ...track } as object, salud, universoTotal: radar.universoTotal, conDatos: radar.conDatos },
    update: { entries: entries as object[], trackRecord: { evals, ...track } as object, salud, universoTotal: radar.universoTotal, conDatos: radar.conDatos },
  })

  // 7) Digest Telegram.
  const d = diffRanking(ultimo ? (ultimo.entries as EntryRadar[]).slice(0, 10).map(e => e.simbolo) : [], entries.slice(0, 10).map(e => e.simbolo))
  const nom = (s: string) => { const e = entries.find(x => x.simbolo === s); return e?.nombre ? `${s} — ${e.nombre}` : s }
  const lineas = [
    '🌎 <b>Radar del mercado — S&P 500</b> (SOLO paper)',
    '',
    ...entries.slice(0, 10).map((e, i) =>
      `${i + 1}. <b>${e.simbolo}</b> — ${e.nombre ?? '¿?'} · ${ETIQ[e.etiqueta]}${e.guru ? ' 🏆' : ''}${e.tecnico === 'si' ? ' 📈' : ''}`),
    '',
    ultimo ? `Cambios: ${d.entran.length ? `entra ${d.entran.map(nom).join(', ')}` : 'sin entradas'} · ${d.salen.length ? `sale ${d.salen.join(', ')}` : 'sin salidas'}` : 'Primer snapshot — sin comparativa aún.',
    evals.length
      ? `Track record: ${evals.map(e => `hace ${Math.round(e.dias / 7)}sem → mediana ${pct(e.mediana)} vs SPY ${pct(e.retornoBench)} (baten ${e.baten}/${e.n})`).join(' · ')} — ${track.bateVentanas}/${track.ventanas} ventanas ganadas`
      : 'Track record: acumulando historial (necesita ≥4 semanas de snapshots).',
    `Salud: ${frescas.length}/${filas.length} frescos · ${errores} con error`,
    '',
    '<i>La selección elige el QUÉ (calidad+gurús); 📈 solo confirma el CUÁNDO. SOLO paper.</i>',
  ]
  await tgSend(lineas.join('\n')).catch(() => {})
  return { ok: true, enviado: true, top: entries.length }
}
```

- [ ] **Step 2: Cron `app/api/cron/trading-ranking/route.ts`** — mismo patrón que Task 5 Step 2 pero importando `generarRadarSemanal` de `@/lib/trading/radar`, comentario "ranking SEMANAL del radar (lunes 09:00)" y `maxDuration = 300`.
- [ ] **Step 3: Cron en `vercel.json`:** `{ "path": "/api/cron/trading-ranking", "schedule": "0 9 * * 1" },`
- [ ] **Step 4: Verificar** — `npx tsc --noEmit` → 0 · JSON de vercel.json válido. Si `sma`/`rsi` no estuvieran exportados en el índice del módulo, añadirlos al export de `indicadores.ts` en `index.ts`.
- [ ] **Step 5: Commit** — `git add lib/trading/radar.ts app/api/cron/trading-ranking/route.ts vercel.json && git commit -m "trading: ranking semanal del radar + digest Telegram (cron lunes)"`

---

### Task 7: Sección "🌎 Radar del mercado" en `/trading`

**Files:**
- Modify: `apps/plataforma/app/(usuario)/trading/page.tsx`

- [ ] **Step 1: Añadir la query** — en el `Promise.all` de la página, añadir:

```ts
    safe(prisma.tradingRanking.findFirst({ orderBy: { fecha: 'desc' } }), null),
```

(recibirla como `radar`).

- [ ] **Step 2: Renderizar la sección** — debajo de la sección 🧪 Forward paper, con los MISMOS estilos (`card`, `th`, `td`) y tipos locales:

```tsx
      {/* Radar del mercado — ranking semanal del universo S&P 500 (caché trading_universo) */}
      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 17, marginBottom: 8 }}>🌎 Radar del mercado <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>(S&P 500 · la selección elige el QUÉ, 📈 confirma el CUÁNDO)</span></h2>
        {!radar ? (
          <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>
            El radar rankea las ~500 mayores de EEUU cada lunes (calidad + valor + momentum + gurús). Aún sin snapshot — la caché de fundamentales se está llenando; primer ranking el próximo lunes.
          </div>
        ) : (() => {
          type Entry = { simbolo: string; nombre?: string; score: number; piotroski?: number | null; roic?: number | null; guru: boolean; etiqueta: 'fuerte' | 'media' | 'debil'; tecnico: 'si' | 'esperar' | null }
          type Track = { evals: { fecha: string; dias: number; mediana: number | null; retornoBench: number; baten: number; n: number }[]; ventanas: number; bateVentanas: number }
          const entries = (radar.entries as Entry[]) ?? []
          const track = radar.trackRecord as Track | null
          const salud = radar.salud as { total: number; frescas: number; errores: number } | null
          const ETIQ = { fuerte: '🟢 fuerte', media: '🟡 media', debil: '⚪ débil' }
          return (
            <>
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 680 }}>
                  <thead><tr><th style={th}>#</th><th style={th}>Empresa</th><th style={th}>Score</th><th style={th}>Piotroski</th><th style={th}>ROIC</th><th style={th}>Señales</th><th style={th}>Calidad</th></tr></thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={e.simbolo}>
                        <td style={{ ...td, color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{e.simbolo} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— {e.nombre ?? '¿?'}</span></td>
                        <td style={td}>{e.score.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</td>
                        <td style={td}>{e.piotroski ?? '—'}</td>
                        <td style={td}>{e.roic != null ? `${(e.roic * 100).toFixed(0)}%` : '—'}</td>
                        <td style={td}>{e.guru ? '🏆 ' : ''}{e.tecnico === 'si' ? '📈 entrada' : e.tecnico === 'esperar' ? '⏳ esperar' : '—'}</td>
                        <td style={td}>{ETIQ[e.etiqueta]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                Snapshot del {fechaCorta(radar.fecha)} · universo {radar.universoTotal} ({radar.conDatos} con datos)
                {salud ? <> · salud: {salud.frescas}/{salud.total} frescos, {salud.errores} con error</> : null}
                {track && track.evals.length > 0
                  ? <> · track record: {track.bateVentanas}/{track.ventanas} ventanas baten al SPY ({track.evals.map(ev => `${Math.round(ev.dias / 7)}sem ${pct(ev.mediana ?? 0)} vs ${pct(ev.retornoBench)}`).join(' · ')})</>
                  : <> · track record: acumulando historial</>}
              </p>
            </>
          )
        })()}
      </section>
```

- [ ] **Step 3: Verificar** — `npx tsc --noEmit` → 0 · `timeout 560 npx next build` → exit 0 (la ruta `/trading` compila).
- [ ] **Step 4: Commit** — `git add "app/(usuario)/trading/page.tsx" && git commit -m "trading: sección Radar del mercado en /trading (ticker+nombre, calidad, track record)"`

---

### Task 8: `/api/trading/seleccion` — modo `universo:'sp500'` (cantera de cohortes)

**Files:**
- Modify: `apps/plataforma/app/api/trading/seleccion/route.ts`

- [ ] **Step 1: Añadir el modo** — leer `universo` del body; si es `'sp500'`, saltarse las descargas de EDGAR y construir `entradas` desde la caché (los gurús se siguen consultando igual):

```ts
  // Modo universo amplio (Fase 1): candidatos desde la caché del radar (sin llamadas a EDGAR).
  // La convicción de gurús sigue viniendo de Dataroma; los nombres sin gurús entran con score 0
  // (el desempate de seleccionCombinada ya prioriza calidad).
  if (universo === 'sp500') {
    const filas = await prisma.tradingUniverso.findMany({ where: { piotroski: { not: null }, roic: { not: null } } })
    const porSimbolo = new Map(convicciones.map(c => [c.simbolo, c]))
    const entradas: EntradaCombinada[] = filas.map(f => ({
      simbolo: f.simbolo,
      guruScore: porSimbolo.get(f.simbolo)?.score ?? 0,
      comprando: porSimbolo.get(f.simbolo)?.comprando ?? 0,
      piotroski: f.piotroski, roic: f.roic,
    }))
    const sel = seleccionCombinada(entradas, { minPiotroski, minRoic, tam })
    return NextResponse.json({
      universo: 'sp500', gestoresConDatos, candidatos: entradas.length, conFundamentales: entradas.length,
      params: sel.params, pesoPct: sel.pesoPct, cesta: sel.cesta, descartados: sel.descartados.slice(0, 20),
      simbolos: sel.cesta.map(x => x.simbolo),
      simbolosBase: seleccionSoloGurus(entradas, sel.params.tam),
      nota: 'universo S&P 500 desde la caché del radar. Al congelar una cohorte copia `simbolos` y `simbolosBase`. SOLO paper.',
    })
  }
```

(Colocarlo tras calcular `convicciones`/`gestoresConDatos`; añadir `import { prisma } from '@/lib/db'` y `universo` a la destructuración del body. El camino actual queda intacto.)

- [ ] **Step 2: Verificar** — `npx tsc --noEmit` → 0.
- [ ] **Step 3: Commit** — `git add app/api/trading/seleccion/route.ts && git commit -m "trading: /seleccion acepta universo sp500 desde la caché del radar"`

---

### Task 9: Verificación final, docs, memoria y PR

**Files:**
- Modify: `.claude/skills/trading-analista/SKILL.md` (sección nueva "Radar del universo")
- Modify: `docs/CONTEXTO-SESIONES.md` (entrada nueva arriba)

- [ ] **Step 1: Suite completa**
  - `cd packages/module-trading && npm test` → todos PASS.
  - `cd apps/plataforma && node --test --experimental-strip-types lib/trading/*.test.ts` → todos PASS.
  - `npx tsc --noEmit` → 0 · `timeout 560 npx next build` → exit 0.
- [ ] **Step 2: Skill** — añadir sección tras "Forward paper": qué es el radar, las 2 tablas, los 2 crons, el modo `universo:'sp500'` de `/seleccion`, y la regla "la selección elige el QUÉ; el técnico confirma el CUÁNDO".
- [ ] **Step 3: Memoria** — entrada nueva en `docs/CONTEXTO-SESIONES.md` (qué se montó, migración APLICADA por MCP, verificación, y que el primer ranking llega el próximo lunes con la caché ya poblada).
- [ ] **Step 4: Commit + push + PR draft** — push con `-u origin claude/interactive-brokers-mcp-hbww2h`, PR draft describiendo las 3 capas + verificación; suscribirse al PR.
- [ ] **Step 5: Prueba en producción (tras merge)** — disparar `POST /api/cron/trading-universo` con Bearer `CRON_SECRET` (o esperar al cron) y comprobar por Supabase MCP que `trading_universo` se puebla (`SELECT count(*), count(piotroski) FROM trading_universo`); anotar el resultado.

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec:** universo+semilla (T2/T4/T5), caché+crons (T3/T5/T6), ranking+etiquetas+nombre (T1/T6/T7), track record (T1/T6/T7), salud (T6/T7), digest (T6), UI (T7), cohortes desde universo (T8), docs (T9). ✔
- **Desviación consciente vs spec:** el técnico v1 usa **SMA50+RSI** (bastan los cierres que ya parseamos); ADX/rvol necesitan OHLCV → cuando el parser de Stooq guarde esas columnas (Fase 1.5). Anotado aquí y en la skill.
- **Tipos consistentes:** `EmpresaUniverso`/`ItemRadar`/`EvaluacionSnapshot` definidos en T1 y consumidos con esos nombres en T6/T7; `FundamentalesEmpresa` ampliado en T2 y usado en T5. ✔
- **Sin placeholders:** todo step con código o comando concreto. ✔
