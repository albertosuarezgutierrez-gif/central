import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

// GET /api/pricing/recommend
//
// Motor de precio ANCLADO AL MERCADO (idea #1). En vez de multiplicadores a mano
// (EVENTS/SEASONAL/DOW), posiciona cada piso en un percentil del mercado comparable
// REAL (de `market_rates`, a su misma capacidad), con suelo/techo de seguridad.
//
// IMPORTANTE: este endpoint sólo CALCULA y RECOMIENDA. No cambia el precio en vivo
// ni escribe en Smoobu. El "aplicar" (push a Smoobu) es un paso aparte con aprobación.
//
// Es explicable/vendible ("te pongo en la mediana de tu competencia real") y se
// autoajusta a Feria/Semana Santa sin tablas a mano, porque el mercado ya lo refleja.

// ── Perillas de negocio (configurables; aquí los valores por defecto seguros) ──
const TARGET_PCTL = 0.50   // posicionamiento objetivo: mediana del mercado comparable
const FLOOR_PCTL  = 0.25   // suelo de seguridad: nunca por debajo del p25
const CEIL_PCTL   = 0.90   // techo de seguridad: nunca por encima del p90
const MIN_SAMPLE  = 5      // por debajo de N comparables → confianza baja

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

export async function GET() {
  // Percentiles del mercado por piso, usando SÓLO el snapshot más reciente de cada uno.
  const rows = await prisma.$queryRaw<{
    scenario: string
    name: string | null
    max_guests: number | null
    n: number
    search_date: string
    p25: number; p50: number; p75: number; p90: number; avg: number
  }[]>(Prisma.sql`
    WITH latest AS (
      SELECT scenario, MAX(search_date) AS sd
      FROM market_rates
      WHERE scenario LIKE 'prop_%' AND price_night > 0
      GROUP BY scenario
    )
    SELECT
      m.scenario,
      p.name,
      p."maxGuests"::int                                                        AS max_guests,
      COUNT(*)::int                                                             AS n,
      MAX(m.search_date)::text                                                  AS search_date,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY m.price_night)::numeric(10,2) AS p25,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY m.price_night)::numeric(10,2) AS p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY m.price_night)::numeric(10,2) AS p75,
      percentile_cont(0.90) WITHIN GROUP (ORDER BY m.price_night)::numeric(10,2) AS p90,
      ROUND(AVG(m.price_night))                                                 AS avg
    FROM market_rates m
    JOIN latest   l ON l.scenario = m.scenario AND l.sd = m.search_date
    LEFT JOIN properties p ON p.id = m.scenario
    WHERE m.price_night > 0
    GROUP BY m.scenario, p.name, p."maxGuests"
    ORDER BY avg
  `)

  const pctl = (r: typeof rows[number], q: number) =>
    q === FLOOR_PCTL ? Number(r.p25) :
    q === TARGET_PCTL ? Number(r.p50) :
    q === 0.75 ? Number(r.p75) : Number(r.p90)

  const recommendations = rows.map(r => {
    const target = pctl(r, TARGET_PCTL)
    const floor  = pctl(r, FLOOR_PCTL)
    const ceil   = pctl(r, CEIL_PCTL)
    // positionFactor = 1.0 por ahora (neutral). Aquí entraría el ajuste por calidad
    // (nuestras reseñas vs la mediana del mercado) cuando tengamos ese dato por piso.
    const positionFactor = 1.0
    const recommended = clamp(Math.round(target * positionFactor), Math.round(floor), Math.round(ceil))

    return {
      scenario:    r.scenario,
      property:    r.name ?? r.scenario,
      max_guests:  r.max_guests,
      recommended_price: recommended,
      basis: {
        target_pctl: TARGET_PCTL,
        floor:  Math.round(Number(r.p25)),
        median: Math.round(Number(r.p50)),
        p75:    Math.round(Number(r.p75)),
        ceil:   Math.round(Number(r.p90)),
        avg:    Number(r.avg),
        sample: r.n,
        market_date: r.search_date,
      },
      confidence: r.n >= MIN_SAMPLE ? "alta" : "baja",
    }
  })

  return NextResponse.json({
    ok: true,
    model: "market-anchored",
    config: { target_pctl: TARGET_PCTL, floor_pctl: FLOOR_PCTL, ceil_pctl: CEIL_PCTL, min_sample: MIN_SAMPLE },
    note: "Sólo recomienda; no cambia el precio en vivo ni escribe en Smoobu.",
    recommendations,
  })
}
