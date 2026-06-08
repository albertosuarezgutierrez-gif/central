import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0]
    const d30   = new Date(Date.now() + 30  * 86400000).toISOString().split("T")[0]
    const d60   = new Date(Date.now() + 60  * 86400000).toISOString().split("T")[0]
    const d90   = new Date(Date.now() + 90  * 86400000).toISOString().split("T")[0]

    // Ingresos futuros confirmados (reservas con checkIn >= hoy)
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        i."propertyId",
        i.portal,
        i.amount,
        i."checkIn",
        i."checkOut",
        p.name AS property_name
      FROM incomes i
      LEFT JOIN properties p ON p.id = i."propertyId"
      WHERE i."checkIn" >= ${today}::date
        AND i."checkIn" <= ${d90}::date
      ORDER BY i."checkIn" ASC
    `)

    // Aplicar comisión Booking
    const COMMISSION: Record<string, number> = {
      BOOKING: 0.8028, AIRBNB: 1, EXPEDIA: 1,
      AGODA: 1, VRBO: 1, DIRECTO: 1, OTRO: 1
    }

    const calcNet = (r: any) => Number(r.amount) * (COMMISSION[r.portal] ?? 1)

    const sum30 = rows.filter(r => r.checkIn <= d30).reduce((a, r) => a + calcNet(r), 0)
    const sum60 = rows.filter(r => r.checkIn <= d60).reduce((a, r) => a + calcNet(r), 0)
    const sum90 = rows.reduce((a, r) => a + calcNet(r), 0)

    // Por piso
    const byProp: Record<string, { name: string; amount: number; reservas: number }> = {}
    for (const r of rows) {
      const key = r.propertyId || "unknown"
      if (!byProp[key]) byProp[key] = { name: r.property_name || key, amount: 0, reservas: 0 }
      byProp[key].amount  += calcNet(r)
      byProp[key].reservas += 1
    }

    // Próximas 5 salidas (checkouts inminentes)
    const proximas = rows.slice(0, 5).map(r => ({
      property: r.property_name,
      portal:   r.portal,
      checkIn:  r.checkIn,
      checkOut: r.checkOut,
      net:      Math.round(calcNet(r))
    }))

    // Semana actual (lunes a domingo)
    const lunes = new Date()
    lunes.setDate(lunes.getDate() - lunes.getDay() + 1)
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
    const semana = rows.filter(r => r.checkIn >= lunes.toISOString().split("T")[0] && r.checkIn <= domingo.toISOString().split("T")[0])
    const semana_net = semana.reduce((a, r) => a + calcNet(r), 0)

    return NextResponse.json({
      forecast: { d30: Math.round(sum30), d60: Math.round(sum60), d90: Math.round(sum90) },
      semana: { net: Math.round(semana_net), reservas: semana.length },
      por_piso: Object.values(byProp).map(p => ({ ...p, amount: Math.round(p.amount) })).sort((a,b) => b.amount - a.amount),
      proximas,
      total_reservas: rows.length
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
