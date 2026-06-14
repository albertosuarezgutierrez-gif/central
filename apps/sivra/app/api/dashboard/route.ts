import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()))
    const monthParam = searchParams.get("month")
    const month = monthParam ? parseInt(monthParam) : null
    const propertyId = searchParams.get("propertyId") || "all"
    const portal = searchParams.get("portal") || "all"

    // ── Usar strings ISO para evitar problemas de timezone con new Date() ──
    let startDate: string, endDate: string, prevStart: string, prevEnd: string
    if (month != null) {
      const lastDay = new Date(year, month, 0).getDate() // último día del mes
      startDate = `${year}-${String(month).padStart(2,"0")}-01`
      endDate   = `${year}-${String(month).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`
      const prevYear = year - 1
      const prevLastDay = new Date(prevYear, month, 0).getDate()
      prevStart = `${prevYear}-${String(month).padStart(2,"0")}-01`
      prevEnd   = `${prevYear}-${String(month).padStart(2,"0")}-${String(prevLastDay).padStart(2,"0")}`
    } else {
      startDate = `${year}-01-01`
      endDate   = `${year}-12-31`
      prevStart = `${year - 1}-01-01`
      prevEnd   = `${year - 1}-12-31`
    }

    const propCond   = propertyId !== "all" ? Prisma.sql`AND i."propertyId" = ${propertyId}` : Prisma.sql``
    const portalCond = portal     !== "all" ? Prisma.sql`AND i.portal::text = ${portal}`      : Prisma.sql``

    type KpiRow    = { ingresos: string; reservas: string; noches: string; ingresos_p: string; reservas_p: string; noches_p: string }
    type MonthRow  = { month: string; y0: string; y1: string; y2: string; gastos: string }
    type PortalRow = { portal: string; amount: string; count: string }
    type PropRow   = { name: string; amount: string; count: string }
    type GastosRow = { gastos: string; gastoscount: string; gastos_p: string }
    type CatRow    = { category: string; amount: string; count: string }
    type PropGRow  = { name: string; amount: string; count: string }
    type RecentRow = { id: string; guestName: string; checkIn: Date; checkOut: Date; amount: string; portal: string; propertyId: string; nights: string; propertyName: string }
    type PropListRow = { id: string; name: string; location: string }

    const [kpiRows, monthRows, portalRows, propRows, gastosRows, catRows, propGRows, recentRows, propList] = await Promise.all([

      // ── KPIs: usar ::date para comparación sin timezone ──
      prisma.$queryRaw<KpiRow[]>`
        SELECT
          COALESCE(SUM(CASE WHEN i."checkIn"::date >= ${startDate}::date AND i."checkIn"::date <= ${endDate}::date THEN i.amount END),0)::text AS ingresos,
          COUNT(CASE WHEN i."checkIn"::date >= ${startDate}::date AND i."checkIn"::date <= ${endDate}::date THEN 1 END)::text AS reservas,
          COALESCE(SUM(CASE WHEN i."checkIn"::date >= ${startDate}::date AND i."checkIn"::date <= ${endDate}::date THEN i.nights END),0)::text AS noches,
          COALESCE(SUM(CASE WHEN i."checkIn"::date >= ${prevStart}::date AND i."checkIn"::date <= ${prevEnd}::date THEN i.amount END),0)::text AS ingresos_p,
          COUNT(CASE WHEN i."checkIn"::date >= ${prevStart}::date AND i."checkIn"::date <= ${prevEnd}::date THEN 1 END)::text AS reservas_p,
          COALESCE(SUM(CASE WHEN i."checkIn"::date >= ${prevStart}::date AND i."checkIn"::date <= ${prevEnd}::date THEN i.nights END),0)::text AS noches_p
        FROM incomes i WHERE 1=1 ${propCond} ${portalCond}
      `,

      // ── Monthly chart ──
      prisma.$queryRaw<MonthRow[]>`
        SELECT
          gs.m::int AS month,
          COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM i."checkIn" AT TIME ZONE 'UTC')=${year}   AND (${propertyId}='all' OR i."propertyId"=${propertyId}) AND (${portal}='all' OR i.portal::text=${portal}) THEN i.amount END),0)::text AS y0,
          COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM i."checkIn" AT TIME ZONE 'UTC')=${year-1} AND (${propertyId}='all' OR i."propertyId"=${propertyId}) AND (${portal}='all' OR i.portal::text=${portal}) THEN i.amount END),0)::text AS y1,
          COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM i."checkIn" AT TIME ZONE 'UTC')=${year-2} AND (${propertyId}='all' OR i."propertyId"=${propertyId}) AND (${portal}='all' OR i.portal::text=${portal}) THEN i.amount END),0)::text AS y2,
          COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM g.fecha)=${year} AND EXTRACT(MONTH FROM g.fecha)=gs.m THEN g.total END),0)::text AS gastos
        FROM generate_series(1,12) gs(m)
        LEFT JOIN incomes i ON EXTRACT(MONTH FROM i."checkIn" AT TIME ZONE 'UTC') = gs.m
          AND EXTRACT(YEAR FROM i."checkIn" AT TIME ZONE 'UTC') IN (${year},${year-1},${year-2})
        LEFT JOIN gastos g ON EXTRACT(MONTH FROM g.fecha) = gs.m AND EXTRACT(YEAR FROM g.fecha) = ${year}
        GROUP BY gs.m ORDER BY gs.m
      `,

      // ── By portal ──
      prisma.$queryRaw<PortalRow[]>`
        SELECT portal::text AS portal, COALESCE(SUM(amount),0)::text AS amount, COUNT(id)::text AS count
        FROM incomes i
        WHERE i."checkIn"::date >= ${startDate}::date AND i."checkIn"::date <= ${endDate}::date ${propCond}
        GROUP BY portal ORDER BY SUM(amount) DESC
      `,

      // ── By property ──
      prisma.$queryRaw<PropRow[]>`
        SELECT p.name, COALESCE(SUM(i.amount),0)::text AS amount, COUNT(i.id)::text AS count
        FROM incomes i JOIN properties p ON p.id = i."propertyId"
        WHERE i."checkIn"::date >= ${startDate}::date AND i."checkIn"::date <= ${endDate}::date ${portalCond}
        GROUP BY p.name ORDER BY SUM(i.amount) DESC
      `,

      // ── Gastos KPIs ──
      prisma.$queryRaw<GastosRow[]>`
        SELECT
          COALESCE(SUM(CASE WHEN g.fecha >= ${startDate}::date AND g.fecha <= ${endDate}::date THEN g.total END),0)::text AS gastos,
          COUNT(CASE WHEN g.fecha >= ${startDate}::date AND g.fecha <= ${endDate}::date THEN 1 END)::text AS gastoscount,
          COALESCE(SUM(CASE WHEN g.fecha >= ${prevStart}::date AND g.fecha <= ${prevEnd}::date THEN g.total END),0)::text AS gastos_p
        FROM gastos g
      `,

      // ── Gastos by category ──
      prisma.$queryRaw<CatRow[]>`
        SELECT UPPER(COALESCE(g.categoria,'OTRO')) AS category,
          COALESCE(SUM(g.total),0)::text AS amount, COUNT(g.id)::text AS count
        FROM gastos g
        WHERE g.fecha >= ${startDate}::date AND g.fecha <= ${endDate}::date
        GROUP BY UPPER(COALESCE(g.categoria,'OTRO')) ORDER BY SUM(g.total) DESC
      `,

      // ── Gastos by property ──
      prisma.$queryRaw<PropGRow[]>`
        SELECT COALESCE(g.propiedad,'Sin propiedad') AS name,
          COALESCE(SUM(g.total),0)::text AS amount, COUNT(g.id)::text AS count
        FROM gastos g
        WHERE g.fecha >= ${startDate}::date AND g.fecha <= ${endDate}::date
        GROUP BY COALESCE(g.propiedad,'Sin propiedad') ORDER BY SUM(g.total) DESC
      `,

      // ── Recent by checkIn desc ──
      prisma.$queryRaw<RecentRow[]>`
        SELECT i.id, i."guestName", i."checkIn", i."checkOut", i.amount::text,
          i.portal::text, i."propertyId", COALESCE(i.nights,0)::text AS nights,
          COALESCE(p.name,i."propertyId") AS "propertyName"
        FROM incomes i LEFT JOIN properties p ON p.id=i."propertyId"
        WHERE 1=1 ${propCond} ${portalCond}
        ORDER BY i."checkIn" DESC LIMIT 10
      `,

      prisma.$queryRaw<PropListRow[]>`SELECT id, name, COALESCE(location,'') AS location FROM properties ORDER BY name`,
    ])

    const k = kpiRows[0] || {}
    const ingresos     = parseFloat(k.ingresos  || "0")
    const ingresosPrev = parseFloat(k.ingresos_p || "0")
    const reservas     = parseInt(k.reservas     || "0")
    const reservasPrev = parseInt(k.reservas_p   || "0")
    const noches       = parseInt(k.noches       || "0")
    const gk = gastosRows[0] || {}
    const gastos      = parseFloat(gk.gastos      || "0")
    const gastosPrev  = parseFloat(gk.gastos_p    || "0")
    const gastosCount = parseInt(gk.gastoscount   || "0")
    const beneficio   = ingresos - gastos
    const margen      = ingresos > 0 ? Math.round((beneficio / ingresos) * 100) : 0
    // Sin base de comparación (periodo previo a 0): si ahora hay valor es "nuevo" (null → UI "nuevo"), no 0%.
    const delta = (a: number, b: number): number | null => b === 0 ? (a > 0 ? null : 0) : Math.round(((a - b) / b) * 100)
    const adr = noches > 0 ? Math.round(ingresos / noches) : 0

    return NextResponse.json({
      filters: { year, month, propertyId, portal },
      properties: propList,
      kpis: {
        ingresos, ingresosPrev, ingresosDelta: delta(ingresos, ingresosPrev),
        reservas, reservasPrev, reservasDelta: delta(reservas, reservasPrev),
        noches, adr,
        gastos, gastosPrev, gastosCount, gastosDelta: delta(gastos, gastosPrev),
        beneficio, margen,
      },
      monthly: monthRows.map(r => ({
        month: parseInt(String(r.month)),
        [year]:     parseFloat(r.y0),
        [year - 1]: parseFloat(r.y1),
        [year - 2]: parseFloat(r.y2),
        gastos: parseFloat(r.gastos),
      })),
      byPortal:     portalRows.map(r => ({ portal: r.portal, amount: parseFloat(r.amount), count: parseInt(r.count) })),
      byProperty:   propRows.map(r   => ({ name: r.name,     amount: parseFloat(r.amount), count: parseInt(r.count) })),
      expByCategory: catRows.map(r   => ({ category: r.category, amount: parseFloat(r.amount), count: parseInt(r.count) })),
      expByProperty: propGRows.map(r => ({ name: r.name,     amount: parseFloat(r.amount), count: parseInt(r.count) })),
      recent: recentRows.map(r => ({ ...r, amount: parseFloat(String(r.amount)), nights: parseInt(String(r.nights || 0)) })),
      recentExpenses: [],
    })
  } catch (e: unknown) {
    console.error("Dashboard error:", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
