import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

function percentile(sorted: number[], p: number) {
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT DISTINCT ON (scenario, portal, comp_name)
        scenario, portal, comp_name, price_night, price_total, score,
        review_count, location, checkin_date, checkout_date, search_date
      FROM market_rates
      ORDER BY scenario, portal, comp_name, search_date DESC
    `)

    const byKey: Record<string, any> = {}
    for (const row of rows) {
      const key = `${row.scenario}_${row.portal}`
      if (!byKey[key]) {
        byKey[key] = {
          scenario: row.scenario, portal: row.portal,
          checkin: row.checkin_date, checkout: row.checkout_date,
          search_date: row.search_date, apartments: []
        }
      }
      byKey[key].apartments.push({
        name: row.comp_name,
        price_night: Number(row.price_night),
        price_total: Number(row.price_total),
        score: row.score ? Number(row.score) : null,
        review_count: row.review_count,
        location: row.location,
      })
    }

    // Estadísticas por escenario+portal
    for (const key of Object.keys(byKey)) {
      const apts = byKey[key].apartments
      const prices = apts.map((a: any) => a.price_night).filter(Boolean).sort((a: number, b: number) => a - b)
      if (prices.length > 0) {
        byKey[key].stats = {
          min:   prices[0],
          p25:   percentile(prices, 0.25),
          p50:   percentile(prices, 0.50),
          p75:   percentile(prices, 0.75),
          max:   prices[prices.length - 1],
          avg:   Math.round(prices.reduce((s: number, p: number) => s + p, 0) / prices.length),
          count: prices.length,
        }
      }
    }

    // Estadísticas combinadas (todos los portales) por escenario
    const scenarios = [...new Set(Object.values(byKey).map((v: any) => v.scenario))]
    for (const sc of scenarios) {
      const allApts = Object.values(byKey)
        .filter((v: any) => v.scenario === sc)
        .flatMap((v: any) => v.apartments)
      const prices = allApts.map((a: any) => a.price_night).filter(Boolean).sort((a: number, b: number) => a - b)
      if (prices.length > 0) {
        byKey[`${sc}_all`] = {
          scenario: sc, portal: "all",
          stats: {
            min:   prices[0],
            p25:   percentile(prices, 0.25),
            p50:   percentile(prices, 0.50),
            p75:   percentile(prices, 0.75),
            max:   prices[prices.length - 1],
            avg:   Math.round(prices.reduce((s: number, p: number) => s + p, 0) / prices.length),
            count: prices.length,
          }
        }
      }
    }

    // Portales disponibles
    const portals = [...new Set(rows.map(r => r.portal))]

    return NextResponse.json({ ok: true, data: byKey, portals })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
