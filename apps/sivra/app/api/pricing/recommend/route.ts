import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/pricing/recommend
//
// Motor de precio ANCLADO AL MERCADO (idea #1), 100% ADAPTABLE POR PISO (producto
// vendible). Posiciona cada piso en un percentil del mercado comparable REAL (de
// `market_rates`, a su misma capacidad), ajustado por CALIDAD (reseñas) y, en el
// futuro, por DEMANDA. Los parámetros viven en `pricing_settings` por piso, y solo
// se calcula si el propietario tiene el servicio CONTRATADO (`enabled`).
//
// IMPORTANTE: sólo CALCULA y RECOMIENDA. No cambia el precio en vivo ni escribe en
// Smoobu. El "aplicar" (push a Smoobu) es un paso aparte con aprobación.

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// Percentil con interpolación lineal sobre una muestra ordenada.
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  if (sorted.length === 1) return sorted[0]
  const idx = clamp(q, 0, 1) * (sorted.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

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
    position_factor: number; quality_k: number
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
      s.own_score::float8 AS own_score, s.min_price, s.max_price
    FROM properties p
    LEFT JOIN pricing_settings s ON s.property_id = p.id
    WHERE p.id LIKE 'prop_%' AND p."maxGuests" IS NOT NULL
    ORDER BY p."maxGuests"
  `)

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
    if (!g || g.prices.length === 0) {
      return { scenario: p.scenario, property: p.name ?? p.scenario, max_guests: p.max_guests,
        enabled, recommended_price: null, confidence: "sin_datos", reason: "sin mercado" }
    }

    const prices = [...g.prices].sort((a, b) => a - b)
    const scores = [...g.scores].sort((a, b) => a - b)
    const target = percentile(prices, p.target_pctl)
    const floor  = percentile(prices, p.floor_pctl)
    const ceil   = percentile(prices, p.ceil_pctl)
    const mktScore = scores.length ? percentile(scores, 0.50) : null

    // Ajuste por CALIDAD: si nuestras reseñas superan la mediana del mercado, sube;
    // si están por debajo, baja. Acotado a ±10% para que no se dispare.
    const qualityFactor = (p.own_score != null && mktScore != null)
      ? clamp(1 + (Number(p.own_score) - mktScore) * Number(p.quality_k), 0.90, 1.10)
      : 1.0

    // Ajuste por DEMANDA (idea #3): hook listo, neutral hasta capturar disponibilidad
    // del mercado en los comps (próximo paso de datos).
    const demandFactor = 1.0

    let price = Math.round(target * Number(p.position_factor) * qualityFactor * demandFactor)
    price = clamp(price, Math.round(floor), Math.round(ceil))
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
        floor: Math.round(floor),
        median: Math.round(percentile(prices, 0.5)),
        target_price: Math.round(target),
        ceil: Math.round(ceil),
        quality_factor: Number(qualityFactor.toFixed(3)),
        demand_factor: demandFactor,
        market_score_median: mktScore != null ? Number(mktScore.toFixed(1)) : null,
        own_score: p.own_score,
        position_factor: p.position_factor,
        sample: prices.length,
      },
      confidence: prices.length >= 5 ? "alta" : "baja",
    }
  })

  return NextResponse.json({
    ok: true,
    model: "market-anchored",
    note: "Sólo recomienda; no cambia el precio en vivo ni escribe en Smoobu. Parámetros por piso en pricing_settings; sólo si enabled=true (contratado).",
    recommendations,
  })
}
