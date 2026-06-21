import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

export async function GET() {
  const stats = await prisma.$queryRaw<{
    property_id: string
    days_total: bigint; days_ours_higher: bigint; days_pl_higher: bigint
    booked_ours_higher: bigint; booked_pl_higher: bigint
    avg_our_price: number; avg_pl_price: number
    revenue_ours: number; revenue_pl: number
  }[]>(Prisma.sql`
    SELECT
      property_id,
      COUNT(*)                                                               AS days_total,
      COUNT(*) FILTER (WHERE price_ours > price_pricelabs)                  AS days_ours_higher,
      COUNT(*) FILTER (WHERE price_pricelabs > price_ours)                  AS days_pl_higher,
      COUNT(*) FILTER (WHERE was_booked AND price_ours > price_pricelabs)   AS booked_ours_higher,
      COUNT(*) FILTER (WHERE was_booked AND price_pricelabs > price_ours)   AS booked_pl_higher,
      ROUND(AVG(price_ours)::numeric, 0)                                    AS avg_our_price,
      ROUND(AVG(price_pricelabs)::numeric, 0)                               AS avg_pl_price,
      COALESCE(SUM(price_ours      FILTER (WHERE was_booked)), 0)           AS revenue_ours,
      COALESCE(SUM(price_pricelabs FILTER (WHERE was_booked)), 0)           AS revenue_pl
    FROM rate_snapshots
    WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
      AND price_pricelabs IS NOT NULL
      AND was_booked IS NOT NULL
    GROUP BY property_id
  `)

  const opportunities = await prisma.$queryRaw<{
    property_id: string; rate_date: string
    price_ours: number; price_pricelabs: number; diff: number
  }[]>(Prisma.sql`
    SELECT property_id, rate_date::text, price_ours, price_pricelabs,
           (price_ours - price_pricelabs) AS diff
    FROM rate_snapshots
    WHERE snapshot_date = CURRENT_DATE
      AND rate_date > CURRENT_DATE
      AND available = 1
      AND price_pricelabs IS NOT NULL
      AND price_ours - price_pricelabs >= 15
    ORDER BY diff DESC
    LIMIT 20
  `)

  const meta = await prisma.$queryRaw<{ total: bigint; since: string | null }[]>(Prisma.sql`
    SELECT COUNT(*) AS total, MIN(snapshot_date)::text AS since FROM rate_snapshots
  `)

  return NextResponse.json({
    stats: stats.map(r => ({
      ...r,
      days_total:         Number(r.days_total),
      days_ours_higher:   Number(r.days_ours_higher),
      days_pl_higher:     Number(r.days_pl_higher),
      booked_ours_higher: Number(r.booked_ours_higher),
      booked_pl_higher:   Number(r.booked_pl_higher),
    })),
    opportunities,
    meta: { total: Number(meta[0]?.total ?? 0), since: meta[0]?.since ?? null },
  })
}
