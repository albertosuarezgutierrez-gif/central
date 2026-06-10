import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// /api/pricing/settings
//
// Panel del PROPIETARIO. GET devuelve, por piso, todos los parámetros configurables
// de `pricing_settings` MÁS el contexto de mercado (percentiles reales), la ocupación
// propia, el precio BASE actual en Smoobu y el precio recomendado (huésped y base) que
// calcularía el motor con esos parámetros — la misma cadena que /api/pricing/apply.
//
// PATCH valida y guarda los parámetros que el propietario edita manualmente.
//
// Detrás del middleware (login admin), así que la sesión ya está validada.

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// Columnas editables y cómo se validan/normalizan antes de guardar.
const FIELDS: Record<string, (v: any) => any> = {
  enabled:         (v) => Boolean(v),
  apply_enabled:   (v) => Boolean(v),
  target_pctl:     (v) => clamp(Number(v), 0, 1),
  floor_pctl:      (v) => clamp(Number(v), 0, 1),
  ceil_pctl:       (v) => clamp(Number(v), 0, 1),
  position_factor: (v) => clamp(Number(v), 0.5, 2),
  quality_k:       (v) => clamp(Number(v), 0, 0.5),
  demand_k:        (v) => clamp(Number(v), 0, 1),
  demand_baseline: (v) => clamp(Number(v), 0, 1),
  own_score:       (v) => (v == null || v === "" ? null : clamp(Number(v), 0, 10)),
  min_price:       (v) => (v == null || v === "" ? null : Math.max(0, Math.round(Number(v)))),
  max_price:       (v) => (v == null || v === "" ? null : Math.max(0, Math.round(Number(v)))),
  max_change_pct:  (v) => clamp(Number(v), 0.01, 1),
  channel_markup:  (v) => clamp(Number(v), 1, 2),
  events_enabled:  (v) => Boolean(v),
  gap_discount_pct:(v) => clamp(Number(v), 0, 0.5),
}

export async function GET() {
  // Pisos + ajustes (defaults si no hay fila), igual que /recommend.
  const props = await prisma.$queryRaw<{
    property_id: string; name: string | null; max_guests: number | null
    enabled: boolean; apply_enabled: boolean; target_pctl: number; floor_pctl: number; ceil_pctl: number
    position_factor: number; quality_k: number; demand_k: number; demand_baseline: number
    own_score: number | null; min_price: number | null; max_price: number | null
    max_change_pct: number; channel_markup: number; events_enabled: boolean; gap_discount_pct: number
  }[]>(Prisma.sql`
    SELECT
      p.id AS property_id, p.name, p."maxGuests"::int AS max_guests,
      COALESCE(s.enabled, false)               AS enabled,
      COALESCE(s.apply_enabled, false)         AS apply_enabled,
      COALESCE(s.target_pctl, 0.50)::float8    AS target_pctl,
      COALESCE(s.floor_pctl, 0.25)::float8     AS floor_pctl,
      COALESCE(s.ceil_pctl, 0.90)::float8      AS ceil_pctl,
      COALESCE(s.position_factor, 1.0)::float8 AS position_factor,
      COALESCE(s.quality_k, 0.04)::float8      AS quality_k,
      COALESCE(s.demand_k, 0.16)::float8       AS demand_k,
      COALESCE(s.demand_baseline, 0.50)::float8 AS demand_baseline,
      s.own_score::float8 AS own_score, s.min_price, s.max_price,
      COALESCE(s.max_change_pct, 0.20)::float8  AS max_change_pct,
      COALESCE(s.channel_markup, 1.16)::float8  AS channel_markup,
      COALESCE(s.events_enabled, true)          AS events_enabled,
      COALESCE(s.gap_discount_pct, 0)::float8   AS gap_discount_pct
    FROM properties p
    LEFT JOIN pricing_settings s ON s.property_id = p.id
    WHERE p.id LIKE 'prop_%' AND p."maxGuests" IS NOT NULL
    ORDER BY p."maxGuests"
  `)

  // Mercado del snapshot más reciente por piso (precios + notas).
  const market = await prisma.$queryRaw<{ scenario: string; price: number; score: number | null }[]>(Prisma.sql`
    WITH latest AS (
      SELECT scenario, MAX(search_date) AS sd FROM market_rates
      WHERE scenario LIKE 'prop_%' AND price_night > 0 GROUP BY scenario
    )
    SELECT m.scenario, m.price_night::float8 AS price, m.score::float8 AS score
    FROM market_rates m JOIN latest l ON l.scenario = m.scenario AND l.sd = m.search_date
    WHERE m.price_night > 0
  `)
  const byScenario: Record<string, { prices: number[]; scores: number[] }> = {}
  for (const r of market) {
    const g = (byScenario[r.scenario] ??= { prices: [], scores: [] })
    g.prices.push(Number(r.price))
    if (r.score != null) g.scores.push(Number(r.score))
  }

  // Ocupación propia (señal de demanda) del snapshot más reciente.
  const occ = await prisma.$queryRaw<{ scenario: string; occupancy: number }[]>(Prisma.sql`
    SELECT property_id AS scenario, (1 - AVG(available))::float8 AS occupancy
    FROM rate_snapshots
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
      AND rate_date >= CURRENT_DATE AND available IS NOT NULL
    GROUP BY property_id
  `)
  const occByScenario: Record<string, number> = {}
  for (const o of occ) occByScenario[o.scenario] = Number(o.occupancy)

  // Precio BASE actual en Smoobu (price_pricelabs del snapshot más reciente) por piso —
  // mediana de los próximos días disponibles, como referencia de "lo que hay hoy".
  const baseNow = await prisma.$queryRaw<{ scenario: string; base_actual: number | null }[]>(Prisma.sql`
    SELECT property_id AS scenario,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY price_pricelabs)::int AS base_actual
    FROM rate_snapshots
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
      AND rate_date >= CURRENT_DATE AND price_pricelabs IS NOT NULL
    GROUP BY property_id
  `)
  const baseByScenario: Record<string, number | null> = {}
  for (const b of baseNow) baseByScenario[b.scenario] = b.base_actual

  function percentile(sorted: number[], q: number): number {
    if (sorted.length === 0) return NaN
    if (sorted.length === 1) return sorted[0]
    const idx = clamp(q, 0, 1) * (sorted.length - 1)
    const lo = Math.floor(idx), hi = Math.ceil(idx)
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
  }

  const properties = props.map((p) => {
    const g = byScenario[p.property_id]
    const occupancy = occByScenario[p.property_id]
    const baseActual = baseByScenario[p.property_id] ?? null
    const markup = Number(p.channel_markup) > 1 ? Number(p.channel_markup) : 1.16

    let market_ctx: any = { sample: 0 }
    let recommended_guest: number | null = null
    let recommended_base: number | null = null

    if (g && g.prices.length > 0) {
      const prices = [...g.prices].sort((a, b) => a - b)
      const scores = [...g.scores].sort((a, b) => a - b)
      const target = percentile(prices, p.target_pctl)
      const floor = percentile(prices, p.floor_pctl)
      const ceil = percentile(prices, p.ceil_pctl)
      const mktScore = scores.length ? percentile(scores, 0.5) : null

      const qualityFactor = (p.own_score != null && mktScore != null)
        ? clamp(1 + (Number(p.own_score) - mktScore) * Number(p.quality_k), 0.90, 1.10) : 1.0
      const demandFactor = (occupancy != null && Number.isFinite(occupancy))
        ? clamp(1 + (occupancy - Number(p.demand_baseline)) * Number(p.demand_k), 0.92, 1.10) : 1.0

      let guest = Math.round(target * Number(p.position_factor) * qualityFactor * demandFactor)
      guest = clamp(guest, Math.round(floor), Math.round(ceil))

      // huésped → base de Smoobu, luego cadena de topes del propietario (autoridad final).
      let base = Math.round(guest / markup)
      const floorBase = Math.round(floor / markup), ceilBase = Math.round(ceil / markup)
      base = clamp(base, floorBase, ceilBase)
      if (baseActual != null) {
        base = clamp(base, Math.round(baseActual * (1 - Number(p.max_change_pct))),
          Math.round(baseActual * (1 + Number(p.max_change_pct))))
      }
      if (p.min_price != null) base = Math.max(base, p.min_price)
      if (p.max_price != null) base = Math.min(base, p.max_price)

      recommended_guest = guest
      recommended_base = base
      market_ctx = {
        p25: Math.round(percentile(prices, 0.25)),
        p50: Math.round(percentile(prices, 0.50)),
        p90: Math.round(percentile(prices, 0.90)),
        floor: Math.round(floor),
        ceil: Math.round(ceil),
        market_score_median: mktScore != null ? Number(mktScore.toFixed(1)) : null,
        quality_factor: Number(qualityFactor.toFixed(3)),
        demand_factor: Number(demandFactor.toFixed(3)),
        sample: prices.length,
      }
    }

    return {
      property_id: p.property_id,
      name: p.name ?? p.property_id,
      max_guests: p.max_guests,
      settings: {
        enabled: p.enabled, apply_enabled: p.apply_enabled,
        target_pctl: p.target_pctl, floor_pctl: p.floor_pctl, ceil_pctl: p.ceil_pctl,
        position_factor: p.position_factor, quality_k: p.quality_k,
        demand_k: p.demand_k, demand_baseline: p.demand_baseline,
        own_score: p.own_score, min_price: p.min_price, max_price: p.max_price,
        max_change_pct: p.max_change_pct, channel_markup: p.channel_markup,
        events_enabled: p.events_enabled, gap_discount_pct: p.gap_discount_pct,
      },
      market: market_ctx,
      occupancy: occupancy != null ? Number(occupancy.toFixed(2)) : null,
      base_actual: baseActual,
      recommended_guest,
      recommended_base,
    }
  })

  return NextResponse.json({ ok: true, properties })
}

export async function PATCH(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const property_id = String(body?.property_id ?? "")
  if (!property_id.startsWith("prop_")) {
    return NextResponse.json({ error: "property_id inválido" }, { status: 400 })
  }

  // Sólo aceptamos columnas conocidas; cada una con su validación.
  const cols: string[] = []
  const vals: any[] = []
  for (const [key, norm] of Object.entries(FIELDS)) {
    if (key in (body ?? {})) {
      const v = norm(body[key])
      if (typeof v === "number" && !Number.isFinite(v)) {
        return NextResponse.json({ error: `valor inválido para ${key}` }, { status: 400 })
      }
      cols.push(key); vals.push(v)
    }
  }
  if (cols.length === 0) {
    return NextResponse.json({ error: "nada que actualizar" }, { status: 400 })
  }

  // Coherencia min/max si llegan ambos.
  if (cols.includes("min_price") && cols.includes("max_price")) {
    const mn = vals[cols.indexOf("min_price")], mx = vals[cols.indexOf("max_price")]
    if (mn != null && mx != null && mn > mx) {
      return NextResponse.json({ error: "min_price > max_price" }, { status: 400 })
    }
  }

  // UPSERT dinámico con identificadores citados de forma segura.
  const insertCols = ["property_id", ...cols].map((c) => Prisma.raw(`"${c}"`))
  const insertVals = [property_id, ...vals]
  const valuesSql = Prisma.join(insertVals.map((v) => Prisma.sql`${v}`))
  const updateSql = Prisma.join(cols.map((c) => Prisma.sql`${Prisma.raw(`"${c}"`)} = EXCLUDED.${Prisma.raw(`"${c}"`)}`))

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO pricing_settings (${Prisma.join(insertCols)}, updated_at)
    VALUES (${valuesSql}, NOW())
    ON CONFLICT (property_id) DO UPDATE SET ${updateSql}, updated_at = NOW()
  `)

  return NextResponse.json({ ok: true, property_id, updated: cols })
}
