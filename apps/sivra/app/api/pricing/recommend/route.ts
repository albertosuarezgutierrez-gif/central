import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { computeRecommendation } from "@/lib/pricing-engine"

export const dynamic = "force-dynamic"

// GET /api/pricing/recommend
//
// Motor de precio ANCLADO AL MERCADO (idea #1), 100% ADAPTABLE POR PISO (producto
// vendible). Posiciona cada piso en un percentil del mercado comparable REAL (de
// `market_rates`, a su misma capacidad), ajustado por CALIDAD (reseñas) y DEMANDA
// (ocupación). El cálculo vive en `lib/pricing-engine.ts` (FUENTE ÚNICA, compartida
// con el panel `settings` y el agente `pilot-track`). Los parámetros viven en
// `pricing_settings` por piso, y solo se calcula si está CONTRATADO (`enabled`).
//
// IMPORTANTE: sólo CALCULA y RECOMIENDA. No cambia el precio en vivo ni escribe en
// Smoobu. El "aplicar" (push a Smoobu) es un paso aparte con aprobación.

export async function GET() {
  // 1) Mercado: precios y notas del snapshot más reciente de cada piso.
  const market = await prisma.$queryRaw<{ scenario: string; price: number; score: number | null }[]>(Prisma.sql`
    WITH latest AS (
      SELECT scenario, MAX(search_date) AS sd
      FROM market_rates
      WHERE scenario LIKE 'prop_%' AND price_night > 0
      GROUP BY scenario
    )
    SELECT m.scenario, m.price_night::float8 AS price, m.score::float8 AS score
    FROM market_rates m
    JOIN latest l ON l.scenario = m.scenario AND l.sd = m.search_date
    WHERE m.price_night > 0
  `)

  // 2) Pisos + ajustes por piso (defaults si no hay fila en pricing_settings).
  const props = await prisma.$queryRaw<{
    scenario: string; name: string | null; max_guests: number | null
    enabled: boolean; target_pctl: number; floor_pctl: number; ceil_pctl: number
    position_factor: number; quality_k: number; demand_k: number; demand_baseline: number
    own_score: number | null; min_price: number | null; max_price: number | null
  }[]>(Prisma.sql`
    SELECT
      p.id AS scenario, p.name, p."maxGuests"::int AS max_guests,
      COALESCE(s.enabled, false)        AS enabled,
      COALESCE(s.target_pctl, 0.50)::float8     AS target_pctl,
      COALESCE(s.floor_pctl, 0.25)::float8      AS floor_pctl,
      COALESCE(s.ceil_pctl, 0.90)::float8       AS ceil_pctl,
      COALESCE(s.position_factor, 1.0)::float8  AS position_factor,
      COALESCE(s.quality_k, 0.04)::float8       AS quality_k,
      COALESCE(s.demand_k, 0.16)::float8        AS demand_k,
      COALESCE(s.demand_baseline, 0.50)::float8 AS demand_baseline,
      s.own_score::float8 AS own_score, s.min_price, s.max_price
    FROM properties p
    LEFT JOIN pricing_settings s ON s.property_id = p.id
    WHERE p.id LIKE 'prop_%' AND p."maxGuests" IS NOT NULL
    ORDER BY p."maxGuests"
  `)

  // 1b) DEMANDA: ocupación propia (Smoobu) en fechas futuras, del snapshot más reciente.
  // Señal real de revenue management: si nos estamos llenando, subimos; si no, bajamos.
  const occ = await prisma.$queryRaw<{ scenario: string; occupancy: number }[]>(Prisma.sql`
    SELECT property_id AS scenario, (1 - AVG(available))::float8 AS occupancy
    FROM rate_snapshots
    WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
      AND rate_date >= CURRENT_DATE AND available IS NOT NULL
    GROUP BY property_id
  `)
  const occByScenario: Record<string, number> = {}
  for (const o of occ) occByScenario[o.scenario] = Number(o.occupancy)

  // Agrupa el mercado por piso.
  const byScenario: Record<string, { prices: number[]; scores: number[] }> = {}
  for (const r of market) {
    const g = (byScenario[r.scenario] ??= { prices: [], scores: [] })
    g.prices.push(Number(r.price))
    if (r.score != null) g.scores.push(Number(r.score))
  }

  const recommendations = props.map(p => {
    const g = byScenario[p.scenario]
    const enabled = Boolean(p.enabled)
    const occupancy = occByScenario[p.scenario] ?? null
    const eng = computeRecommendation(
      { target_pctl: p.target_pctl, floor_pctl: p.floor_pctl, ceil_pctl: p.ceil_pctl,
        position_factor: p.position_factor, quality_k: p.quality_k, demand_k: p.demand_k,
        demand_baseline: p.demand_baseline, own_score: p.own_score },
      g?.prices ?? [], g?.scores ?? [], occupancy,
    )
    if (eng.guest == null || eng.basis == null) {
      return { scenario: p.scenario, property: p.name ?? p.scenario, max_guests: p.max_guests,
        enabled, recommended_price: null, confidence: "sin_datos", reason: "sin mercado" }
    }

    // min/max del propietario sobre el huésped (comportamiento histórico; ver docs/pricing-automatico.md).
    let price = eng.guest
    if (p.min_price != null) price = Math.max(price, p.min_price)
    if (p.max_price != null) price = Math.min(price, p.max_price)

    return {
      scenario: p.scenario,
      property: p.name ?? p.scenario,
      max_guests: p.max_guests,
      enabled,
      recommended_price: price,
      basis: {
        target_pctl: p.target_pctl,
        floor: eng.basis.floor,
        median: eng.basis.median,
        target_price: eng.basis.target_price,
        ceil: eng.basis.ceil,
        quality_factor: eng.basis.quality_factor,
        demand_factor: eng.basis.demand_factor,
        occupancy: eng.basis.occupancy,
        market_score_median: eng.basis.market_score_median,
        own_score: p.own_score,
        position_factor: p.position_factor,
        sample: eng.basis.sample,
      },
      confidence: eng.confidence,
    }
  })

  return NextResponse.json({
    ok: true,
    model: "market-anchored",
    note: "Sólo recomienda; no cambia el precio en vivo ni escribe en Smoobu. Parámetros por piso en pricing_settings; sólo si enabled=true (contratado).",
    recommendations,
  })
}
