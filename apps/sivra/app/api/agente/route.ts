import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const now = new Date()
    const cy = now.getFullYear()
    const cm = now.getMonth() + 1
    const cd = now.getDate()

    const [byYear, byMonth, byPortal, byProp, props, ytdCur, ytdPrev, gastos] = await Promise.all([
      prisma.$queryRaw<{year:number,reservas:number,total:number,avg_nights:number}[]>(
        Prisma.sql`SELECT EXTRACT(YEAR FROM "checkIn")::int as year, COUNT(*)::int as reservas, ROUND(SUM(amount)::numeric,0)::int as total, ROUND(AVG(nights)::numeric,1)::float as avg_nights FROM incomes WHERE "checkIn" IS NOT NULL GROUP BY year ORDER BY year DESC LIMIT 6`
      ),
      prisma.$queryRaw<{year:number,month:number,total:number,reservas:number}[]>(
        Prisma.sql`SELECT EXTRACT(YEAR FROM "checkIn")::int as year, EXTRACT(MONTH FROM "checkIn")::int as month, ROUND(SUM(amount)::numeric,0)::int as total, COUNT(*)::int as reservas FROM incomes WHERE EXTRACT(YEAR FROM "checkIn") IN (${cy},${cy-1}) AND "checkIn" IS NOT NULL GROUP BY year, month ORDER BY year, month`
      ),
      prisma.$queryRaw<{portal:string,reservas:number,total:number,avg_amount:number,avg_nights:number}[]>(
        Prisma.sql`SELECT portal, COUNT(*)::int as reservas, ROUND(SUM(amount)::numeric,0)::int as total, ROUND(AVG(amount)::numeric,0)::int as avg_amount, ROUND(AVG(nights)::numeric,1)::float as avg_nights FROM incomes GROUP BY portal ORDER BY total DESC`
      ),
      prisma.$queryRaw<{propertyId:string,reservas:number,total:number,avg_amount:number,avg_nights:number}[]>(
        Prisma.sql`SELECT "propertyId", COUNT(*)::int as reservas, ROUND(SUM(amount)::numeric,0)::int as total, ROUND(AVG(amount)::numeric,0)::int as avg_amount, ROUND(AVG(nights)::numeric,1)::float as avg_nights FROM incomes GROUP BY "propertyId" ORDER BY total DESC`
      ),
      prisma.property.findMany(),
      prisma.$queryRaw<{total:number,reservas:number}[]>(
        Prisma.sql`SELECT ROUND(SUM(amount)::numeric,0)::int as total, COUNT(*)::int as reservas FROM incomes WHERE EXTRACT(YEAR FROM "checkIn")=${cy} AND (EXTRACT(MONTH FROM "checkIn")<${cm} OR (EXTRACT(MONTH FROM "checkIn")=${cm} AND EXTRACT(DAY FROM "checkIn")<=${cd}))`
      ),
      prisma.$queryRaw<{total:number,reservas:number}[]>(
        Prisma.sql`SELECT ROUND(SUM(amount)::numeric,0)::int as total, COUNT(*)::int as reservas FROM incomes WHERE EXTRACT(YEAR FROM "checkIn")=${cy-1} AND (EXTRACT(MONTH FROM "checkIn")<${cm} OR (EXTRACT(MONTH FROM "checkIn")=${cm} AND EXTRACT(DAY FROM "checkIn")<=${cd}))`
      ),
      prisma.$queryRaw<{total:number,count:number}[]>(
        Prisma.sql`SELECT ROUND(SUM(total)::numeric,0)::int as total, COUNT(*)::int as count FROM gastos`
      ),
    ])

    const propMap: Record<string, string> = {}
    props.forEach(p => { propMap[p.id] = p.name })

    const ytd  = ytdCur[0]  || { total: 0, reservas: 0 }
    const ytdP = ytdPrev[0] || { total: 0, reservas: 0 }
    const yoyPct = ytdP.total > 0 ? Math.round(((ytd.total - ytdP.total) / ytdP.total) * 100) : null
    const gastoTotal = gastos[0]?.total || 0
    const beneficio = ytd.total - gastoTotal

    const curMonthData      = byMonth.find(r => r.year === cy   && r.month === cm)
    const prevYearMonthData = byMonth.find(r => r.year === cy-1 && r.month === cm)
    const monthYoY = prevYearMonthData && prevYearMonthData.total > 0
      ? Math.round(((curMonthData?.total||0) - prevYearMonthData.total) / prevYearMonthData.total * 100)
      : null

    const thisYearMonths = byMonth.filter(r => r.year === cy)
    const bestMonth = thisYearMonths.reduce((a,b) => a.total > b.total ? a : b, thisYearMonths[0] || {month:0,total:0})
    const MESES = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

    const alerts: string[] = []
    if (yoyPct !== null && yoyPct < -10) alerts.push(`⚠️ Ingresos YTD ${Math.abs(yoyPct)}% por debajo del mismo periodo ${cy-1}`)
    if (yoyPct !== null && yoyPct > 10)  alerts.push(`✅ Ingresos YTD ${yoyPct}% por encima del mismo periodo ${cy-1}`)
    if (monthYoY !== null && monthYoY < -20) alerts.push(`⚠️ ${MESES[cm]} ${cy} muy por debajo de ${MESES[cm]} ${cy-1} (${monthYoY}%)`)
    const topPortal = byPortal[0]
    if (topPortal && byPortal.length > 1) {
      const topPct = Math.round(topPortal.total / byPortal.reduce((s,p) => s+p.total, 0) * 100)
      if (topPct > 75) alerts.push(`⚠️ Dependencia alta de ${topPortal.portal}: ${topPct}% del total. Diversificar canales.`)
    }
    if (beneficio < 0) alerts.push(`⚠️ Resultado negativo: gastos superan ingresos YTD`)

    const insights: string[] = []
    const avgBooking = ytd.reservas > 0 ? Math.round(ytd.total / ytd.reservas) : 0
    insights.push(`Ticket medio ${cy}: ${avgBooking}€ por reserva`)
    if (byYear.length > 1) {
      const prev = byYear[1]; const cur = byYear[0]
      if (prev.total > 0) {
        const diff = Math.round((cur.total - prev.total) / prev.total * 100)
        insights.push(`${cy} vs ${cy-1}: ${diff > 0 ? "+" : ""}${diff}% en ingresos totales`)
      }
    }
    const topProp = byProp[0]
    if (topProp) insights.push(`Propiedad ★: ${propMap[topProp.propertyId] || topProp.propertyId} (${topProp.total.toLocaleString("es-ES")}€)`)
    if (bestMonth?.month) insights.push(`Mejor mes ${cy}: ${MESES[bestMonth.month]} (${bestMonth.total.toLocaleString("es-ES")}€)`)

    return NextResponse.json({
      timestamp: now.toISOString(),
      summary: { ytd: { total: ytd.total, reservas: ytd.reservas, beneficio, gastos: gastoTotal }, ytdPrev: { total: ytdP.total, reservas: ytdP.reservas }, yoyPct, monthYoY, avgBooking, currentMonth: cm, currentYear: cy },
      byYear:     byYear.map(r => ({ ...r })),
      byMonth:    byMonth.map(r => ({ ...r })),
      byPortal:   byPortal.map(r => ({ ...r })),
      byProperty: byProp.map(r => ({ ...r, name: propMap[r.propertyId] || r.propertyId })),
      alerts, insights, MESES
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
