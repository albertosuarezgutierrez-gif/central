# Cartera cohetes (paper) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un bolsillo simulado independiente (30.000€) que rota semanalmente a los cohetes confirmados del ranking, se valora a diario con precios gratis y mide su rendimiento vs SPY y vs la cesta núcleo — 100% paper, sin auto-modificar el criterio.

**Architecture:** Pieza PURA de reparto/valoración en `@central/module-trading` + wrapper de IO en `apps/plataforma/lib/trading/` que lee los cohetes del último `trading_ranking`, persiste un libro de rebalanceos inmutable (`trading_cohetes_rebalanceo`) y una curva diaria (`trading_cohetes_track`). Dos crons de Vercel (rebalanceo lunes, valoración mar-sáb). UI en `/trading` + bloque en el digest Telegram del paper-tracker. Sigue el patrón del forward paper del núcleo (`paper-tracker.ts` / `cartera-estudio-io.ts`).

**Tech Stack:** TypeScript, Next.js 15 App Router, Prisma 5 (Supabase compartida `wswbehlcuxqxyinousql`), `node --test` para el módulo puro, `@central/core-telegram` para avisos, precios gratis Stooq→Yahoo (`lib/trading/precios-stooq.ts`).

**Spec:** `docs/superpowers/specs/2026-07-23-cartera-cohetes-paper-design.md`

---

## Convenciones del repo (leer antes de empezar)

- **Dinero en €:** SIEMPRE `eur()` de `apps/plataforma/lib/dinero.ts` (formato español `30.000,00€`).
- **Cron auth:** header `Authorization: Bearer ${process.env.CRON_SECRET}`, handler exportado como GET y POST, `export const dynamic = 'force-dynamic'`, `export const maxDuration = 60`.
- **Módulo puro:** `packages/module-trading/src/*.ts` sin `@/` ni Prisma; se exporta en `packages/module-trading/src/index.ts` con extensión `.ts`; tests en `packages/module-trading/test/*.test.ts` con `import { test } from 'node:test'` + `import assert from 'node:assert/strict'`.
- **Best-effort:** toda lectura de precios/tabla va en `try/catch` y degrada a `null`/`[]` sin romper (patrón de `paper-tracker.ts`).
- **SOLO paper:** ninguna orden real, nunca; no se toca IBKR.

---

## Task 1: Pieza pura `carteraCohetes.ts` (reparto + valoración + sub-cesta IPO)

**Files:**
- Create: `packages/module-trading/src/carteraCohetes.ts`
- Test: `packages/module-trading/test/carteraCohetes.test.ts`
- Modify: `packages/module-trading/src/index.ts` (añadir export)

- [ ] **Step 1: Write the failing test**

Create `packages/module-trading/test/carteraCohetes.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rebalancear, valorar } from '../src/carteraCohetes.ts'

test('rebalancear reparte el capital a partes iguales por precio', () => {
  const reb = rebalancear(30000, [
    { simbolo: 'AAA', precio: 100, esIpo: false, mesesCotizando: null },
    { simbolo: 'BBB', precio: 50, esIpo: true, mesesCotizando: 3 },
  ])
  assert.equal(reb.capitalEur, 30000)
  assert.equal(reb.tenencias.length, 2)
  // 15.000€ por nombre → 150 uds de AAA, 300 uds de BBB
  assert.equal(reb.tenencias[0].unidades, 150)
  assert.equal(reb.tenencias[1].unidades, 300)
  assert.equal(reb.tenencias[1].esIpo, true)
})

test('rebalancear ignora picks sin precio válido', () => {
  const reb = rebalancear(10000, [
    { simbolo: 'AAA', precio: 100, esIpo: false, mesesCotizando: null },
    { simbolo: 'ZZZ', precio: 0, esIpo: false, mesesCotizando: null },
  ])
  assert.equal(reb.tenencias.length, 1)          // ZZZ fuera
  assert.equal(reb.tenencias[0].unidades, 100)   // 10.000€ enteros a AAA
})

test('valorar calcula valor, P&L y sub-cesta IPO; precio ausente mantiene entrada', () => {
  const reb = rebalancear(20000, [
    { simbolo: 'AAA', precio: 100, esIpo: false, mesesCotizando: null }, // 100 uds
    { simbolo: 'BBB', precio: 100, esIpo: true, mesesCotizando: 2 },     // 100 uds
  ])
  const v = valorar(reb, { AAA: 150, BBB: 50 })  // AAA +50%, BBB -50%
  assert.equal(v.valorEur, 100 * 150 + 100 * 50) // 20.000€ (se compensan)
  assert.equal(v.plPct, 0)
  assert.equal(v.nIpo, 1)
  assert.equal(v.ipoValorEur, 5000)              // BBB: 100 uds × 50
  assert.equal(v.ipoPlPct, -0.5)                 // desde 10.000€ de entrada
  // precio ausente → mantiene precioEntrada (no rompe la curva)
  const v2 = valorar(reb, { AAA: 150 })
  assert.equal(v2.porNombre[1].precioHoy, 100)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/module-trading && node --test test/carteraCohetes.test.ts`
Expected: FAIL — `Cannot find module '../src/carteraCohetes.ts'`.

- [ ] **Step 3: Write the implementation**

Create `packages/module-trading/src/carteraCohetes.ts`:

```ts
// CARTERA COHETES (paper, rotatoria) — pieza PURA. El satélite caza-cohetes (momentum>30% + calidad
// mala) tiene un bolsillo simulado propio que ROTA cada semana a los cohetes confirmados y se valora a
// diario. A diferencia del núcleo (cestas congeladas), esto rebalancea: cada rebalanceo reparte el valor
// vivo a partes iguales y compra "unidades" fraccionarias. SOLO estudio — cero órdenes reales.

export type CohetePick = {
  simbolo: string; precio: number; esIpo: boolean; mesesCotizando: number | null
}
export type Tenencia = {
  simbolo: string; unidades: number; precioEntrada: number; esIpo: boolean; mesesCotizando: number | null
}
export type Rebalanceo = { capitalEur: number; tenencias: Tenencia[] }
export type ValoracionNombre = {
  simbolo: string; precioEntrada: number; precioHoy: number; valorEur: number; plPct: number; esIpo: boolean
}
export type Valoracion = {
  valorEur: number; plPct: number; porNombre: ValoracionNombre[]
  ipoValorEur: number; ipoPlPct: number | null; nIpo: number
}

// Reparte `capitalEur` a partes iguales entre los picks con precio > 0 (ignora los sin precio válido).
export function rebalancear(capitalEur: number, picks: CohetePick[]): Rebalanceo {
  const validos = picks.filter(p => p.precio > 0)
  if (!validos.length) return { capitalEur, tenencias: [] }
  const porNombre = capitalEur / validos.length
  const tenencias = validos.map(p => ({
    simbolo: p.simbolo,
    unidades: porNombre / p.precio,
    precioEntrada: p.precio,
    esIpo: p.esIpo,
    mesesCotizando: p.mesesCotizando,
  }))
  return { capitalEur, tenencias }
}

// Valora las tenencias con los precios de hoy. Un precio ausente o <= 0 mantiene el de entrada (no
// contamina la curva con un cero espurio). Devuelve además la sub-cesta de los recién cotizados (IPO).
export function valorar(reb: Rebalanceo, precios: Record<string, number>): Valoracion {
  const porNombre: ValoracionNombre[] = reb.tenencias.map(t => {
    const p = precios[t.simbolo]
    const precioHoy = p != null && p > 0 ? p : t.precioEntrada
    return {
      simbolo: t.simbolo, precioEntrada: t.precioEntrada, precioHoy,
      valorEur: t.unidades * precioHoy,
      plPct: t.precioEntrada > 0 ? precioHoy / t.precioEntrada - 1 : 0,
      esIpo: t.esIpo,
    }
  })
  const valorEur = porNombre.reduce((a, x) => a + x.valorEur, 0)
  const plPct = reb.capitalEur > 0 ? valorEur / reb.capitalEur - 1 : 0

  const iposT = reb.tenencias.filter(t => t.esIpo)
  const ipoValorEur = porNombre.filter(x => x.esIpo).reduce((a, x) => a + x.valorEur, 0)
  const ipoEntradaEur = iposT.reduce((a, t) => a + t.unidades * t.precioEntrada, 0)
  const ipoPlPct = ipoEntradaEur > 0 ? ipoValorEur / ipoEntradaEur - 1 : null

  return { valorEur, plPct, porNombre, ipoValorEur, ipoPlPct, nIpo: iposT.length }
}
```

- [ ] **Step 4: Add the export to the module index**

In `packages/module-trading/src/index.ts`, after line 36 (the `universo.ts` exports), add:

```ts
export { rebalancear, valorar } from './carteraCohetes.ts'
export type { CohetePick, Tenencia, Rebalanceo, ValoracionNombre, Valoracion } from './carteraCohetes.ts'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/module-trading && node --test test/carteraCohetes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/module-trading/src/carteraCohetes.ts packages/module-trading/test/carteraCohetes.test.ts packages/module-trading/src/index.ts
git commit -m "feat(module-trading): pieza pura cartera cohetes (reparto + valoracion + sub-cesta IPO)"
```

---

## Task 2: Tablas `trading_cohetes_rebalanceo` y `trading_cohetes_track`

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-07-23_trading_cohetes.sql`
- Modify: `apps/plataforma/prisma/schema.prisma` (2 modelos nuevos, tras `TradingRanking`)

- [ ] **Step 1: Write the migration SQL**

Create `apps/plataforma/prisma/sql/2026-07-23_trading_cohetes.sql`:

```sql
-- 🚀 Cartera cohetes (paper, rotatoria). Bolsillo simulado independiente del núcleo. SOLO estudio.
-- Libro de rebalanceos INMUTABLE (una fila por lunes) + curva diaria. Data global del laboratorio
-- (como trading_ranking): sin RLS, revocado a anon/authenticated.

CREATE TABLE IF NOT EXISTS trading_cohetes_rebalanceo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha        date NOT NULL UNIQUE,          -- día del rebalanceo (lunes)
  capital_eur  double precision NOT NULL,     -- valor vivo arrastrado (30.000€ en el inicio)
  cesta        jsonb NOT NULL,                -- Tenencia[] { simbolo, unidades, precioEntrada, esIpo, mesesCotizando }
  spy_precio   double precision,              -- cierre SPY ese día (referencia)
  spy_unidades double precision,              -- unidades SPY del benchmark buy&hold (solo la fila de INICIO)
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trading_cohetes_track (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha         date NOT NULL UNIQUE,         -- día de la valoración
  valor_eur     double precision NOT NULL,    -- valor de la cartera cohetes
  spy_eur       double precision,             -- valor del benchmark SPY buy&hold (mismo capital inicial)
  pl_pct        double precision,             -- P&L de la cartera desde el rebalanceo vigente
  alpha_pct     double precision,             -- cartera vs SPY (ambas desde inicio)
  ipo_valor_eur double precision,             -- sub-cesta de recién cotizados
  ipo_pl_pct    double precision,
  n_ipo         integer,
  detalle       jsonb,                        -- P&L por nombre (ValoracionNombre[])
  creado_en     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trading_cohetes_rebalanceo DISABLE ROW LEVEL SECURITY;
ALTER TABLE trading_cohetes_track      DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON trading_cohetes_rebalanceo FROM anon, authenticated;
REVOKE ALL ON trading_cohetes_track      FROM anon, authenticated;
```

- [ ] **Step 2: Add the Prisma models**

In `apps/plataforma/prisma/schema.prisma`, immediately AFTER the `model TradingRanking { ... }` block (ends around line 248), add:

```prisma
// 🚀 Cartera cohetes (paper): libro de rebalanceos inmutable (ver lib/trading/cartera-cohetes-io.ts).
model TradingCohetesRebalanceo {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fecha       DateTime @unique @db.Date
  capitalEur  Float    @map("capital_eur")
  cesta       Json
  spyPrecio   Float?   @map("spy_precio")
  spyUnidades Float?   @map("spy_unidades")
  creadoEn    DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  @@map("trading_cohetes_rebalanceo")
}

// 🚀 Cartera cohetes (paper): curva diaria (valor + SPY + P&L + sub-cesta IPO).
model TradingCohetesTrack {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fecha       DateTime @unique @db.Date
  valorEur    Float    @map("valor_eur")
  spyEur      Float?   @map("spy_eur")
  plPct       Float?   @map("pl_pct")
  alphaPct    Float?   @map("alpha_pct")
  ipoValorEur Float?   @map("ipo_valor_eur")
  ipoPlPct    Float?   @map("ipo_pl_pct")
  nIpo        Int?     @map("n_ipo")
  detalle     Json?
  creadoEn    DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)
  @@map("trading_cohetes_track")
}
```

- [ ] **Step 3: Apply the migration to the shared DB**

Apply `apps/plataforma/prisma/sql/2026-07-23_trading_cohetes.sql` via the Supabase MCP tool (`execute_sql`, project `wswbehlcuxqxyinousql`). Then regenerate the Prisma client:

Run: `cd apps/plataforma && npx prisma generate`
Expected: "Generated Prisma Client" without errors.

- [ ] **Step 4: Verify the tables exist**

Via Supabase MCP `execute_sql`:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('trading_cohetes_rebalanceo','trading_cohetes_track');
```
Expected: 2 rows.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/prisma/sql/2026-07-23_trading_cohetes.sql apps/plataforma/prisma/schema.prisma
git commit -m "feat(trading): tablas cartera cohetes (rebalanceo inmutable + curva diaria)"
```

---

## Task 3: Wrapper de IO `cartera-cohetes-io.ts`

**Files:**
- Create: `apps/plataforma/lib/trading/cartera-cohetes-io.ts`

Contract (consumido por crons/UI/digest):
- `CAPITAL_COHETES_EUR: number` (30000)
- `rebalancearCartera(): Promise<{ ok: boolean; motivo?: string; fecha?: string; n?: number }>`
- `valorarDia(): Promise<{ ok: boolean; motivo?: string; valorEur?: number; plPct?: number }>`
- `resumenCohetes(): Promise<{ track: TradingCohetesTrack; tenencias: Tenencia[]; fechaRebalanceo: string } | null>`
- `curvaCohetes(): Promise<TradingCohetesTrack[]>`

- [ ] **Step 1: Write the implementation**

Create `apps/plataforma/lib/trading/cartera-cohetes-io.ts`:

```ts
// IO de la CARTERA COHETES (paper, rotatoria). Lee los cohetes confirmados del último trading_ranking,
// rebalancea semanalmente y valora a diario contra el SPY con precios gratis (Stooq→Yahoo). La valoración
// pura vive en @central/module-trading::carteraCohetes. SOLO estudio — cero órdenes reales.
import { prisma } from '@/lib/db'
import { cierresDiarios } from './precios-stooq'
import { rebalancear, valorar, type CohetePick, type Tenencia } from '@central/module-trading'

export const CAPITAL_COHETES_EUR = 30000
const BENCH = 'SPY'
const hoyIso = () => new Date().toISOString().slice(0, 10)

// Último cierre disponible de un símbolo (ventana de ~15 días para cubrir findes/festivos). null si no hay.
async function ultimoCierre(simbolo: string): Promise<number | null> {
  const desde = new Date(Date.now() - 15 * 86_400_000).toISOString().slice(0, 10)
  const serie = await cierresDiarios(simbolo, desde, hoyIso()).catch(() => [] as number[])
  const ult = serie.at(-1)
  return typeof ult === 'number' && ult > 0 ? ult : null
}

// Forma de los cohetes persistidos en trading_ranking.cohetes (ver radar.ts::Cohete).
type CoheteRanking = { simbolo: string; confirmado: boolean; mesesCotizando: number | null }

// REBALANCEO SEMANAL: coge los cohetes confirmados del snapshot más reciente, baja sus precios y arma la
// cesta equiponderada a partir del valor VIVO de la cartera (o 30.000€ en el arranque). Idempotente por día.
export async function rebalancearCartera(): Promise<{ ok: boolean; motivo?: string; fecha?: string; n?: number }> {
  const snap = await prisma.tradingRanking.findFirst({ orderBy: { fecha: 'desc' } }).catch(() => null)
  const cohetes = ((snap?.cohetes as unknown as CoheteRanking[] | null) ?? []).filter(c => c.confirmado)
  if (!cohetes.length) return { ok: false, motivo: 'sin cohetes confirmados' }

  const hoy = hoyIso()
  // Precios de los picks (best-effort) + SPY.
  const precios = new Map<string, number>()
  for (const c of cohetes) {
    const p = await ultimoCierre(c.simbolo)
    if (p != null) precios.set(c.simbolo, p)
  }
  const spyPrecio = await ultimoCierre(BENCH)
  const picks: CohetePick[] = cohetes
    .filter(c => precios.has(c.simbolo))
    .map(c => ({ simbolo: c.simbolo, precio: precios.get(c.simbolo)!, esIpo: c.mesesCotizando != null, mesesCotizando: c.mesesCotizando }))
  if (!picks.length) return { ok: false, motivo: 'sin precios' }

  // Valor vivo de arranque: valora la última cesta a precios de HOY; si no hay historia, arranca en 30.000€.
  const inicio = await prisma.tradingCohetesRebalanceo.findFirst({ orderBy: { fecha: 'asc' } }).catch(() => null)
  const ultima = await prisma.tradingCohetesRebalanceo.findFirst({ orderBy: { fecha: 'desc' } }).catch(() => null)
  let capital = CAPITAL_COHETES_EUR
  if (ultima) {
    const preciosUlt: Record<string, number> = {}
    for (const t of ultima.cesta as unknown as Tenencia[]) {
      const p = await ultimoCierre(t.simbolo); if (p != null) preciosUlt[t.simbolo] = p
    }
    capital = valorar({ capitalEur: ultima.capitalEur, tenencias: ultima.cesta as unknown as Tenencia[] }, preciosUlt).valorEur
  }

  const reb = rebalancear(capital, picks)
  const spyUnidades = inicio ? null : (spyPrecio ? CAPITAL_COHETES_EUR / spyPrecio : null)
  await prisma.tradingCohetesRebalanceo.upsert({
    where: { fecha: new Date(hoy) },
    create: { fecha: new Date(hoy), capitalEur: reb.capitalEur, cesta: reb.tenencias as object[], spyPrecio, spyUnidades },
    update: { capitalEur: reb.capitalEur, cesta: reb.tenencias as object[], spyPrecio },
  })
  return { ok: true, fecha: hoy, n: reb.tenencias.length }
}

// VALORACIÓN DIARIA: valora la cesta del último rebalanceo a precios de hoy + benchmark SPY buy&hold.
export async function valorarDia(): Promise<{ ok: boolean; motivo?: string; valorEur?: number; plPct?: number }> {
  const ultima = await prisma.tradingCohetesRebalanceo.findFirst({ orderBy: { fecha: 'desc' } }).catch(() => null)
  const inicio = await prisma.tradingCohetesRebalanceo.findFirst({ orderBy: { fecha: 'asc' } }).catch(() => null)
  if (!ultima) return { ok: false, motivo: 'sin rebalanceos' }

  const tenencias = ultima.cesta as unknown as Tenencia[]
  const precios: Record<string, number> = {}
  for (const t of tenencias) { const p = await ultimoCierre(t.simbolo); if (p != null) precios[t.simbolo] = p }
  const val = valorar({ capitalEur: ultima.capitalEur, tenencias }, precios)

  // Benchmark: unidades SPY fijadas en el arranque × precio SPY de hoy.
  const spyPrecioHoy = await ultimoCierre(BENCH)
  const spyEur = inicio?.spyUnidades != null && spyPrecioHoy != null ? inicio.spyUnidades * spyPrecioHoy : null
  const spyPlPct = spyEur != null ? spyEur / CAPITAL_COHETES_EUR - 1 : null
  // alpha desde INICIO: (valor/30k − 1) − (spy/30k − 1). Usa valor vivo global, no el plPct del tramo.
  const carteraDesdeInicio = val.valorEur / CAPITAL_COHETES_EUR - 1
  const alphaPct = spyPlPct != null ? carteraDesdeInicio - spyPlPct : null

  const hoy = hoyIso()
  await prisma.tradingCohetesTrack.upsert({
    where: { fecha: new Date(hoy) },
    create: {
      fecha: new Date(hoy), valorEur: val.valorEur, spyEur, plPct: carteraDesdeInicio, alphaPct,
      ipoValorEur: val.ipoValorEur, ipoPlPct: val.ipoPlPct, nIpo: val.nIpo, detalle: val.porNombre as object[],
    },
    update: {
      valorEur: val.valorEur, spyEur, plPct: carteraDesdeInicio, alphaPct,
      ipoValorEur: val.ipoValorEur, ipoPlPct: val.ipoPlPct, nIpo: val.nIpo, detalle: val.porNombre as object[],
    },
  }).catch(() => {})
  return { ok: true, valorEur: val.valorEur, plPct: carteraDesdeInicio }
}

// Resumen para UI/digest: último punto de curva + tenencias vigentes.
export async function resumenCohetes() {
  const [track, reb] = await Promise.all([
    prisma.tradingCohetesTrack.findFirst({ orderBy: { fecha: 'desc' } }).catch(() => null),
    prisma.tradingCohetesRebalanceo.findFirst({ orderBy: { fecha: 'desc' } }).catch(() => null),
  ])
  if (!track || !reb) return null
  return { track, tenencias: reb.cesta as unknown as Tenencia[], fechaRebalanceo: reb.fecha.toISOString().slice(0, 10) }
}

// Curva completa (para el gráfico), de más antigua a más reciente.
export async function curvaCohetes() {
  return prisma.tradingCohetesTrack.findMany({ orderBy: { fecha: 'asc' } }).catch(() => [])
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: exit 0 (no errors). If `cierresDiarios` return type differs, adjust `ultimoCierre` accordingly (it returns `number[]` of closes per `precios-stooq.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/trading/cartera-cohetes-io.ts
git commit -m "feat(trading): IO cartera cohetes (rebalanceo semanal + valoracion diaria vs SPY)"
```

---

## Task 4: Crons de Vercel (rebalanceo semanal + valoración diaria)

**Files:**
- Create: `apps/plataforma/app/api/cron/trading-cohetes-rebalanceo/route.ts`
- Create: `apps/plataforma/app/api/cron/trading-cohetes-track/route.ts`
- Modify: `apps/plataforma/vercel.json` (2 entradas nuevas en `crons`)

- [ ] **Step 1: Rebalanceo route**

Create `apps/plataforma/app/api/cron/trading-cohetes-rebalanceo/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { rebalancearCartera } from '@/lib/trading/cartera-cohetes-io'

// 🚀 Cartera cohetes (paper) — cron SEMANAL (lunes, tras el ranking): rota la cesta a los cohetes
// confirmados del snapshot. SOLO paper. Auth Bearer CRON_SECRET.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await rebalancearCartera()
  return NextResponse.json(r)
}

export { handler as GET, handler as POST }
```

- [ ] **Step 2: Track (valoración) route**

Create `apps/plataforma/app/api/cron/trading-cohetes-track/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { valorarDia } from '@/lib/trading/cartera-cohetes-io'

// 🚀 Cartera cohetes (paper) — cron DIARIO (mar-sáb, tras cierre US): punto de curva. SOLO paper.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await valorarDia()
  return NextResponse.json(r)
}

export { handler as GET, handler as POST }
```

- [ ] **Step 3: Register the crons**

In `apps/plataforma/vercel.json`, inside the `crons` array, add two entries next to the other `trading-*` crons:

```json
    { "path": "/api/cron/trading-cohetes-rebalanceo", "schedule": "30 9 * * 1" },
    { "path": "/api/cron/trading-cohetes-track", "schedule": "0 7 * * 2-6" }
```

(Lunes 09:30 = 30 min tras `trading-ranking` de las 09:00; valoración mar-sáb 07:00 UTC con el cierre US del día anterior ya asentado, misma familia que el watchdog.) Verify the file stays valid JSON:

Run: `cd apps/plataforma && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('json ok')"`
Expected: `json ok`.

- [ ] **Step 4: Type-check + build**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/app/api/cron/trading-cohetes-rebalanceo apps/plataforma/app/api/cron/trading-cohetes-track apps/plataforma/vercel.json
git commit -m "feat(trading): crons cartera cohetes (rebalanceo L 09:30 + valoracion mar-sab 07:00)"
```

---

## Task 5: Bloque Telegram en el digest del paper-tracker

**Files:**
- Modify: `apps/plataforma/lib/trading/paper-tracker.ts` (dentro de `enviarPaperTracker`, tras el bloque `💼 Cartera de estudio`)

- [ ] **Step 1: Add the cartera-cohetes block**

In `apps/plataforma/lib/trading/paper-tracker.ts`, inside `enviarPaperTracker`, AFTER the closing `}` of the `💼 Cartera de estudio` block (the block that starts with `{ const { valorarDesdeMedida } = ...`, ends before the "Nota de madurez" comment), insert:

```ts
  // 🚀 Cartera cohetes (paper): bolsillo APARTE que rota a los cohetes confirmados. Contexto, nunca filtro;
  // el criterio de selección NO se auto-modifica. Best-effort: sin datos, sin bloque.
  {
    const { resumenCohetes, CAPITAL_COHETES_EUR } = await import('./cartera-cohetes-io')
    const { eur } = await import('@/lib/dinero')
    const r = await resumenCohetes().catch(() => null)
    if (r) {
      const semanas = Math.round(dias(r.track.fecha.toISOString().slice(0, 10), hoy()) / 7)
      const bate = (r.track.alphaPct ?? -Infinity) > 0
      const lineas2 = [
        '',
        `🚀 <b>Cartera cohetes</b> (${eur(CAPITAL_COHETES_EUR)} SIMULADOS, bolsillo aparte — lotería, SOLO estudio):`,
        `Valor: ${eur(r.track.valorEur)} (${pct(r.track.plPct)}) · SPY: ${r.track.spyEur != null ? eur(r.track.spyEur) : '—'} ${bate ? '✅' : '⚠️'}`,
        r.track.nIpo ? `De los recién cotizados (IPO): ${eur(r.track.ipoValorEur ?? 0)} (${pct(r.track.ipoPlPct)}) · n=${r.track.nIpo}` : '',
        semanas >= 6
          ? `<i>Veredicto provisional: ${bate ? 'bate' : 'NO bate'} al SPY (${semanas} sem).</i>`
          : '<i>Reloj joven: aún NO es veredicto.</i>',
      ].filter(Boolean)
      lineas.push(...lineas2)
    }
  }
```

Note: `dias`, `hoy`, `pct` and `lineas` already exist in this file's scope.

- [ ] **Step 2: Type-check**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/plataforma/lib/trading/paper-tracker.ts
git commit -m "feat(trading): bloque cartera cohetes en el digest Telegram del paper-tracker"
```

---

## Task 5B: Narración IA de la cartera cohetes (contexto, NUNCA cifras)

**Files:**
- Modify: `apps/plataforma/lib/trading/cartera-cohetes-io.ts` (helper `narrarCohetes`)
- Modify: `apps/plataforma/lib/trading/paper-tracker.ts` (añadir la narración al bloque cohetes)

> **Disciplina (innegociable):** la IA SOLO narra en 1-2 frases sobre datos YA calculados por el código.
> NO elige nombres, NO pondera, NO produce ningún €. Degrada a `''` si la pasarela está caída (mismo patrón
> que `lib/resumen-mensual.ts`). Cadena gratis NIM→Groq→Gemini→Kimi vía `aiComplete`.

- [ ] **Step 1: Add `narrarCohetes` to the IO file**

En `apps/plataforma/lib/trading/cartera-cohetes-io.ts`, añade el import `import { aiComplete } from '@central/core-ai'` arriba, y al final este helper:

```ts
// Narración IA de la semana (CONTEXTO, nunca cifras ni selección). Compara el último rebalanceo con el
// anterior para saber qué ENTRÓ/SALIÓ y ordena las tenencias por P&L; pasa esos HECHOS al modelo para que
// los cuente en 1-2 frases. Degrada a '' si no hay datos o la IA falla. Los números salen del código.
export async function narrarCohetes(): Promise<string> {
  try {
    const r = await resumenCohetes()
    if (!r) return ''
    const rebs = await prisma.tradingCohetesRebalanceo.findMany({ orderBy: { fecha: 'desc' }, take: 2 })
    const actual = new Set(r.tenencias.map(t => t.simbolo))
    const previa = new Set(((rebs[1]?.cesta as unknown as Tenencia[] | undefined) ?? []).map(t => t.simbolo))
    const entraron = [...actual].filter(s => !previa.has(s))
    const salieron = [...previa].filter(s => !actual.has(s))
    const porPl = (r.track.detalle as unknown as { simbolo: string; plPct: number }[] | null) ?? []
    const orden = [...porPl].sort((a, b) => b.plPct - a.plPct)
    const mejor = orden[0], peor = orden.at(-1)
    const hechos = [
      `Valor cartera: ${r.track.plPct != null ? (r.track.plPct * 100).toFixed(1) : '—'}% (${r.track.alphaPct != null && r.track.alphaPct > 0 ? 'por encima' : 'por debajo'} del SPY).`,
      entraron.length ? `Entraron: ${entraron.join(', ')}.` : '',
      salieron.length ? `Salieron: ${salieron.join(', ')}.` : '',
      mejor ? `Mejor: ${mejor.simbolo} (${(mejor.plPct * 100).toFixed(0)}%).` : '',
      peor && peor !== mejor ? `Peor: ${peor.simbolo} (${(peor.plPct * 100).toFixed(0)}%).` : '',
    ].filter(Boolean).join(' ')
    const out = await aiComplete([
      { role: 'system', content: 'Eres un analista. Resume en 1-2 frases en español, tono llano. USA SOLO los datos dados; NUNCA inventes cifras ni recomiendes comprar/vender. Es una cartera de estudio en paper.' },
      { role: 'user', content: hechos },
    ], { signal: AbortSignal.timeout(8000) }).catch(() => '')
    return (out ?? '').trim()
  } catch { return '' }
}
```

Nota: verifica la firma real de `aiComplete` en `@central/core-ai` (mensajes + opciones). Si no acepta `signal`, quítalo — el helper debe degradar a `''` pase lo que pase.

- [ ] **Step 2: Inject into the digest block**

En el bloque `🚀 Cartera cohetes` de `paper-tracker.ts` (Task 5), justo ANTES de `lineas.push(...lineas2)`, añade:

```ts
      const narr = await (await import('./cartera-cohetes-io')).narrarCohetes().catch(() => '')
      if (narr) lineas2.push(`💬 <i>${narr}</i>`)
```

- [ ] **Step 3: Type-check**

Run: `cd apps/plataforma && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/plataforma/lib/trading/cartera-cohetes-io.ts apps/plataforma/lib/trading/paper-tracker.ts
git commit -m "feat(trading): narracion IA de la cartera cohetes (contexto, nunca cifras)"
```

---

## Task 6: UI — sección 🚀 Cartera cohetes en `/trading`

**Files:**
- Create: `apps/plataforma/app/(usuario)/trading/CarteraCohetes.tsx`
- Modify: `apps/plataforma/app/(usuario)/trading/TradingDashboard.tsx` (render de la sección)
- Modify: `apps/plataforma/app/(usuario)/trading/page.tsx` y `apps/plataforma/app/(usuario)/invitado/trading/page.tsx` (o la que cargue datos SSR) para pasar la prop

> **Contexto:** `/trading` y `/invitado/trading` renderizan `TradingDashboard.tsx` con datos cargados en el server component `page.tsx`. Replica el patrón de la sección "🧪 Forward paper" (que ya lee curva persistida y pinta mini-SVG). ABRE `TradingDashboard.tsx` y localiza esa sección como plantilla ANTES de escribir.

- [ ] **Step 1: Create the component**

Create `apps/plataforma/app/(usuario)/trading/CarteraCohetes.tsx`:

```tsx
'use client'
import { eur } from '@/lib/dinero'

type PuntoCurva = { fecha: string; valorEur: number; spyEur: number | null }
export type CarteraCohetesData = {
  valorEur: number; plPct: number | null; alphaPct: number | null
  spyEur: number | null; fechaRebalanceo: string
  ipoValorEur: number | null; ipoPlPct: number | null; nIpo: number | null
  tenencias: { simbolo: string; esIpo: boolean }[]
  curva: PuntoCurva[]
  // idea 1 — curva de la última cohorte del núcleo (mismo eje temporal). Encendida en v1.
  curvaNucleo?: { fecha: string; valorEur: number }[]
  narracion?: string | null   // 💬 IA (contexto, nunca cifras) — Task 5B
}

const pct = (x: number | null | undefined) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`)

export default function CarteraCohetes({ data }: { data: CarteraCohetesData | null }) {
  if (!data) {
    return (
      <section style={{ marginTop: 24 }}>
        <h3>🚀 Cartera cohetes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(paper · lotería)</span></h3>
        <p style={{ color: 'var(--muted)' }}>Aún sin datos: el bolsillo empieza a medir tras el primer rebalanceo (lunes) y su valoración diaria.</p>
      </section>
    )
  }
  const bate = (data.alphaPct ?? -Infinity) > 0
  return (
    <section style={{ marginTop: 24 }}>
      <h3>🚀 Cartera cohetes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(30.000€ SIMULADOS, bolsillo aparte · lotería · SOLO estudio)</span></h3>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 20 }}>{eur(data.valorEur)}</strong>
        <span style={{ color: data.plPct != null && data.plPct >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{pct(data.plPct)}</span>
        <span>vs SPY {data.spyEur != null ? eur(data.spyEur) : '—'} · alpha {pct(data.alphaPct)} {bate ? '✅' : '⚠️'}</span>
        <span style={{ color: 'var(--muted)' }}>rebalanceo {data.fechaRebalanceo} · {data.tenencias.length} pos.</span>
      </div>
      <CurvaSVG curva={data.curva} nucleo={data.curvaNucleo} />
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>🚀 cohetes · ⚪ cesta núcleo · 🟣 SPY</p>
      {data.narracion ? <p style={{ fontStyle: 'italic' }}>💬 {data.narracion}</p> : null}
      {data.nIpo ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          🆕 De los recién cotizados (IPO): {eur(data.ipoValorEur ?? 0)} ({pct(data.ipoPlPct)}), {data.nIpo} nombre(s).
          <br />Contexto: el retrovisor da a las IPO recientes la peor lotería (mediana +0,8%).
        </p>
      ) : null}
      <details style={{ marginTop: 8 }}>
        <summary>Tenencias actuales</summary>
        <ul>{data.tenencias.map(t => <li key={t.simbolo}>{t.simbolo}{t.esIpo ? ' 🆕 IPO' : ''}</li>)}</ul>
      </details>
    </section>
  )
}

// Mini-curva a 3 bandas: cohetes (var(--brand)) vs núcleo (var(--muted)) vs SPY (var(--accent)).
function CurvaSVG({ curva, nucleo }: { curva: PuntoCurva[]; nucleo?: { fecha: string; valorEur: number }[] }) {
  if (curva.length < 2) return null
  const W = 320, H = 90
  const series: { pts: number[]; color: string }[] = [
    { pts: curva.map(p => p.valorEur), color: 'var(--brand)' },
    { pts: curva.map(p => p.spyEur ?? NaN), color: 'var(--accent)' },
  ]
  if (nucleo?.length) series.push({ pts: nucleo.map(p => p.valorEur), color: 'var(--muted)' })
  const todos = series.flatMap(s => s.pts).filter(n => Number.isFinite(n))
  const min = Math.min(...todos), max = Math.max(...todos), span = max - min || 1
  const path = (pts: number[]) => pts.map((v, i) => {
    if (!Number.isFinite(v)) return ''
    const x = (i / (pts.length - 1)) * W, y = H - ((v - min) / span) * H
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, marginTop: 8 }} role="img" aria-label="Curva cartera cohetes vs SPY">
      {series.map((s, i) => <path key={i} d={path(s.pts)} fill="none" stroke={s.color} strokeWidth={i === 0 ? 2 : 1} />)}
    </svg>
  )
}
```

- [ ] **Step 2: Add a UI loader in the IO file**

In `apps/plataforma/lib/trading/cartera-cohetes-io.ts`, append a loader that shapes the data for the component. Enciende la **3ª banda** (curva de la última cohorte del núcleo, reusando `curvasCarteraEstudio` de `cartera-estudio-io.ts`) y adjunta la **narración IA** (Task 5B). Import arriba: `import { curvasCarteraEstudio } from './cartera-estudio-io'`.

```ts
export async function cargarCarteraCohetesUI() {
  const [r, curva, narracion, nucleoPorCohorte] = await Promise.all([
    resumenCohetes(), curvaCohetes(), narrarCohetes().catch(() => ''),
    curvasCarteraEstudio().catch(() => ({} as Record<string, { fecha: string; valorEur: number }[]>)),
  ])
  if (!r) return null
  // 3ª banda: la curva en € de la cohorte del núcleo MÁS reciente (la última clave del objeto).
  const versiones = Object.keys(nucleoPorCohorte)
  const curvaNucleo = versiones.length ? nucleoPorCohorte[versiones[versiones.length - 1]] : undefined
  return {
    valorEur: r.track.valorEur, plPct: r.track.plPct, alphaPct: r.track.alphaPct, spyEur: r.track.spyEur,
    fechaRebalanceo: r.fechaRebalanceo,
    ipoValorEur: r.track.ipoValorEur, ipoPlPct: r.track.ipoPlPct, nIpo: r.track.nIpo,
    tenencias: r.tenencias.map(t => ({ simbolo: t.simbolo, esIpo: t.esIpo })),
    curva: curva.map(p => ({ fecha: p.fecha.toISOString().slice(0, 10), valorEur: p.valorEur, spyEur: p.spyEur })),
    curvaNucleo: curvaNucleo?.map(p => ({ fecha: p.fecha, valorEur: p.valorEur })),
    narracion,
  }
}
```

Nota: `curvasCarteraEstudio` devuelve `Record<version, PuntoCurvaEur[]>` con `{ fecha, valorEur }` por punto (ver `cartera-estudio-io.ts`). Si el shape difiere, mapéalo a `{ fecha: string; valorEur: number }`.

- [ ] **Step 3: Wire into the page + dashboard**

In the trading page server component(s) that feed `TradingDashboard` (`app/(usuario)/trading/page.tsx` and the invitado page), call `cargarCarteraCohetesUI()` and pass the result as a `carteraCohetes` prop to `TradingDashboard`. In `TradingDashboard.tsx`, import `CarteraCohetes` and render `<CarteraCohetes data={carteraCohetes} />` right after the "🧪 Forward paper" section. Add `carteraCohetes: CarteraCohetesData | null` to the dashboard's props type.

- [ ] **Step 4: Type-check + build**

Run: `cd apps/plataforma && npx tsc --noEmit && npx next build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/app/\(usuario\)/trading/ apps/plataforma/lib/trading/cartera-cohetes-io.ts
git commit -m "feat(trading): seccion UI cartera cohetes en /trading (curva 3 bandas + sub-marcador IPO)"
```

---

## Task 7: Hipótesis pre-registrada + memoria + skill

**Files:**
- Modify: `docs/TRADING-HIPOTESIS-PREREGISTRO.md` (nueva Hx)
- Modify: `.claude/skills/trading-analista/SKILL.md` (2-3 líneas en la sección del satélite cohetes)
- Modify: `docs/CONTEXTO-SESIONES.md` (entrada nueva arriba)

- [ ] **Step 1: Pre-register the hypothesis**

Open `docs/TRADING-HIPOTESIS-PREREGISTRO.md`, mira el último Hx usado y añade el siguiente (p.ej. H7) con este contenido (fecha de hoy 2026-07-23, evaluación 2026-10-15):

```markdown
## H7 — Cartera cohetes rotatoria (paper) · firmada 2026-07-23, evaluación 2026-10-15
- **Hipótesis nula:** la cartera cohetes (momentum>30% + calidad mala, equiponderada, rebalanceo
  semanal a los confirmados, 30.000€ paper) NO bate al SPY ajustado a riesgo.
- **Sub-hipótesis IPO:** los cohetes recién cotizados (`mesesCotizando≠null`) rinden PEOR que los
  veteranos (lo que dice el retrovisor; la corazonada de Alberto predice lo contrario).
- **Criterio de éxito (para refutar la nula):** valor de la cartera > SPY el 2026-10-15, sostenido en
  la curva, con drawdown y tracking error razonables. Sin mover la portería.
- **Caveats firmados:** el retro-test dio +868% vs SPY +30% (2024-07→2026-04) pero con **survivorship
  bias** (favorece a la lotería) y **régimen junk-rally**; el forward NO debería replicar esa magnitud.
  Un mes malo puede caer ~20% (peor mes histórico −19,1%) — es el perfil, no un fallo.
- **Datos:** `trading_cohetes_track` (curva) + `trading_cohetes_rebalanceo` (libro). NO se auto-modifica
  el criterio de selección; cualquier cambio de reglas lo decide Alberto con este forward.
```

- [ ] **Step 2: Note it in the trading skill**

In `.claude/skills/trading-analista/SKILL.md`, en el párrafo del "🚀 Satélite caza-cohetes", añade al final:

```markdown
  **🚀 Cartera cohetes (paper, 23/07/2026):** bolsillo APARTE de 30.000€ simulados (`CAPITAL_COHETES_EUR`)
  que ROTA cada lunes a los cohetes confirmados (equiponderado) y se VALORA a diario vs SPY — libro
  `trading_cohetes_rebalanceo` + curva `trading_cohetes_track`, crons `trading-cohetes-rebalanceo`
  (L 09:30) y `trading-cohetes-track` (mar-sáb 07:00). Pieza pura `@central/module-trading::carteraCohetes`,
  IO `lib/trading/cartera-cohetes-io.ts`, UI en `/trading`, bloque en el digest del paper-tracker.
  **NUNCA entra en cohortes/núcleo; el criterio NO se auto-modifica** (H7 pre-registrada, eval 2026-10-15).
  SOLO paper.
```

- [ ] **Step 3: Update session memory**

En `docs/CONTEXTO-SESIONES.md`, añade una entrada NUEVA arriba con fecha 2026-07-23 resumiendo: se creó la cartera cohetes paper (bolsillo aparte 30k, rotatoria semanal, curva diaria vs SPY + núcleo, sub-experimento IPO, H7 pre-registrada); retro-test previo +868% vs SPY +30% con fuerte survivorship bias; 100% paper, criterio no auto-modificable.

- [ ] **Step 4: Commit**

```bash
git add docs/TRADING-HIPOTESIS-PREREGISTRO.md .claude/skills/trading-analista/SKILL.md docs/CONTEXTO-SESIONES.md
git commit -m "docs(trading): pre-registro H7 cartera cohetes + skill + memoria"
```

---

## Task 8: Verificación end-to-end + PR

- [ ] **Step 1: Full test + build gate**

Run: `cd /home/user/central && node --test packages/module-trading/test/carteraCohetes.test.ts && cd apps/plataforma && npx tsc --noEmit && npx next build`
Expected: tests PASS, tsc exit 0, build exit 0.

- [ ] **Step 2: Smoke test the crons locally against prod DB (opcional, requiere CRON_SECRET)**

Trigger `POST /api/cron/trading-cohetes-rebalanceo` then `POST /api/cron/trading-cohetes-track` with `Authorization: Bearer $CRON_SECRET` (o esperar al primer lunes). Verify via Supabase MCP that `trading_cohetes_rebalanceo` y `trading_cohetes_track` tienen una fila.

- [ ] **Step 3: Push + PR draft**

```bash
git push -u origin claude/agent-rocket-information-fspn6w
```
Abre un PR **draft** con resumen del spec + el hallazgo del retro-test (con su caveat de survivorship). Suscríbete a la actividad del PR.

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec:** bolsillo aparte 30k (Task 2/3), rotación semanal (Task 3/4), valoración diaria (Task 3/4), UI en /trading (Task 6), **curva 3 bandas ENCENDIDA** cohetes/núcleo/SPY (Task 6, núcleo vía `curvasCarteraEstudio`), sub-experimento IPO (Task 1/3/5/6), **narración IA contexto-nunca-cifras** (Task 5B), hipótesis pre-registrada (Task 7), digest Telegram + veredicto (Task 5), invariantes paper/no-auto-modificar (Task 5/5B/7). ✅
- **Fuera de v1 (spec §8):** benchmark MTUM, aviso pelotazo, hit-rate, stop intra-semana — NO incluidos, correcto (candidatos a v2 por pre-registro).
- **Consistencia de tipos:** `CohetePick`/`Tenencia`/`Rebalanceo`/`Valoracion` definidos en Task 1 y usados igual en Task 3; `rebalancear`/`valorar` mismas firmas en test, módulo e IO. `CAPITAL_COHETES_EUR` exportado en Task 3, consumido en Task 5/6. `narrarCohetes` (Task 5B) consumido en digest (Task 5) y loader UI (Task 6).
- **Disciplina IA:** la narración (Task 5B) es contexto puro sobre cifras del código; degrada a `''`. No toca selección/pesos/importes — consistente con H7 y la regla de oro.
