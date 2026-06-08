import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { aiComplete } from "@/lib/ai-client"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const { question, history = [] } = await req.json()
  if (!question) return NextResponse.json({ error: "Falta question" }, { status: 400 })

  const now = new Date()
  const cy  = now.getFullYear()
  const cm  = now.getMonth() + 1

  try {
    const [byProp, byPortal, byMonth, upcoming, gastos, props] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT p.name, COUNT(i.id)::int as reservas, ROUND(SUM(i.amount)::numeric,0)::int as total,
          ROUND(AVG(i.amount)::numeric,0)::int as adr,
          SUM(CASE WHEN EXTRACT(YEAR FROM i."checkIn")=${cy} THEN i.amount ELSE 0 END)::int as total_year
        FROM properties p LEFT JOIN incomes i ON i."propertyId"=p.id
        WHERE p.id != 'prop_multi_apartamentos'
        GROUP BY p.id, p.name ORDER BY total DESC`),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT portal, COUNT(*)::int as reservas, ROUND(SUM(amount)::numeric,0)::int as total
        FROM incomes GROUP BY portal ORDER BY total DESC`),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT EXTRACT(YEAR FROM "checkIn")::int as year, EXTRACT(MONTH FROM "checkIn")::int as month,
          ROUND(SUM(amount)::numeric,0)::int as total, COUNT(*)::int as reservas
        FROM incomes WHERE EXTRACT(YEAR FROM "checkIn") IN (${cy},${cy-1})
        AND "checkIn" IS NOT NULL GROUP BY year, month ORDER BY year, month`),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT p.name as propiedad, i."guestName" as huesped, i.portal,
          i."checkIn"::date::text as entrada, i."checkOut"::date::text as salida,
          i.amount, i.nights
        FROM incomes i JOIN properties p ON p.id=i."propertyId"
        WHERE i."checkIn" >= NOW()::date AND i."checkIn" <= NOW()::date + INTERVAL '30 days'
        ORDER BY i."checkIn" LIMIT 15`),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT categoria, propiedad, ROUND(SUM(total)::numeric,0)::int as total, COUNT(*)::int as count
        FROM gastos GROUP BY categoria, propiedad ORDER BY total DESC LIMIT 20`),
      prisma.property.findMany({ where: { id: { not: "prop_multi_apartamentos" } } }),
    ])

    const MESES = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
    const context = `
Eres el asistente financiero de HouseSevillana, intranet de gestión de apartamentos turísticos en Sevilla.
Hoy es ${now.toLocaleDateString("es-ES", {weekday:"long",day:"numeric",month:"long",year:"numeric"})}.

PORTFOLIO (4 apartamentos VUT en Sevilla):
${byProp.map(p => `- ${p.name}: ${p.reservas} reservas históricas, €${p.total.toLocaleString("es-ES")} total, €${p.total_year?.toLocaleString("es-ES")} en ${cy}, ADR €${p.adr}`).join("\n")}

PORTALES (ingresos históricos):
${byPortal.map(p => `- ${p.portal}: ${p.reservas} res, €${p.total.toLocaleString("es-ES")}`).join("\n")}

INGRESOS ${cy} POR MES:
${byMonth.filter(r=>r.year===cy).map(r=>`  ${MESES[r.month]}: €${r.total.toLocaleString("es-ES")} (${r.reservas} res)`).join("\n")}

INGRESOS ${cy-1} POR MES:
${byMonth.filter(r=>r.year===cy-1).map(r=>`  ${MESES[r.month]}: €${r.total.toLocaleString("es-ES")} (${r.reservas} res)`).join("\n")}

PRÓXIMAS RESERVAS (30 días):
${upcoming.map(r=>`- ${r.entrada} → ${r.salida}: ${r.propiedad} | ${r.huesped||"?"} | ${r.portal} | €${r.amount} | ${r.nights}n`).join("\n")}

GASTOS RECIENTES POR CATEGORÍA:
${gastos.map(g=>`- ${g.categoria} / ${g.propiedad}: €${g.total} (${g.count} registros)`).join("\n")}

Responde en español, de forma concisa y directa. Si te preguntan por comparativas usa los datos disponibles.
Si no tienes el dato exacto dilo claramente. Usa €, %, cifras reales de la BD. Máximo 4-5 líneas salvo que pidan detalle.`

    const messages = [
      ...history.slice(-6).map((h: any) => ({ role: h.role as "user"|"assistant", content: h.content })),
      { role: "user" as const, content: question }
    ]

    const answer = await aiComplete(messages, { system: context, maxTokens: 600 })
    return NextResponse.json({ answer })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
