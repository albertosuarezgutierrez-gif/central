import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { clamp, percentile, computeRecommendation, recommendedBaseFromEngine } from "@/lib/pricing-engine"

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
      // Motor compartido (lib/pricing-engine) → mismo recomendado que recommend y el agente.
      const eng = computeRecommendation(
        { target_pctl: p.target_pctl, floor_pctl: p.floor_pctl, ceil_pctl: p.ceil_pctl,
          position_factor: p.position_factor, quality_k: p.quality_k, demand_k: p.demand_k,
          demand_baseline: p.demand_baseline, own_score: p.own_score },
        g.prices, g.scores, occupancy ?? null,
      )
      recommended_guest = eng.guest
      // huésped → base de Smoobu + cadena de topes del propietario (autoridad final).
      recommended_base = recommendedBaseFromEngine(eng, {
        markup, max_change_pct: Number(p.max_change_pct),
        min_price: p.min_price, max_price: p.max_price, baseActual,
      })
      if (eng.basis) {
        market_ctx = {
          p25: Math.round(percentile(prices, 0.25)),
          p50: eng.basis.median,
          p90: Math.round(percentile(prices, 0.90)),
          floor: eng.basis.floor,
          ceil: eng.basis.ceil,
          market_score_median: eng.basis.market_score_median,
          quality_factor: eng.basis.quality_factor,
          demand_factor: eng.basis.demand_factor,
          sample: eng.basis.sample,
        }
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
