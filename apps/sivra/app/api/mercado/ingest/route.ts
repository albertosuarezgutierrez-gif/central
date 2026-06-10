import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST /api/mercado/ingest
// Ingesta de comparables de mercado REALES (Booking, Trivago, Expedia…) obtenidos
// por un conector externo o un agente, sin depender del scraping de Google (Serper).
// Hace upsert en market_rates con la MISMA clave que usa el cron (search_date,
// portal, scenario, comp_name, checkin_date), así que es idempotente por día.
//
// Cuerpo esperado:
// {
//   "portal":   "booking",                // booking | trivago | expedia | tripadvisor | ...
//   "scenario": "prop_busto_reform",      // prop_<id> para comparables por piso, o normal/corpus
//   "checkin":  "2026-06-13",
//   "checkout": "2026-06-14",
//   "guests":   4,                          // opcional, def. 4
//   "currency": "EUR",                      // opcional, def. EUR
//   "apartments": [
//     { "name": "Singular Metropol", "price_night": 177, "price_total": 177,
//       "score": 8.7, "review_count": 1263, "location": "Centro" }
//   ]
// }
//
// Protegido por CRON_SECRET si está definido: cabecera `Authorization: Bearer <secret>`
// o query `?secret=<secret>`. Si CRON_SECRET no está, no exige auth (igual que los crons GET).
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    const qs     = req.nextUrl.searchParams.get("secret")
    if (bearer !== secret && qs !== secret) {
      return NextResponse.json({ error: "no autorizado" }, { status: 401 })
    }
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { portal, scenario, checkin, checkout } = body
  const guests   = Number(body.guests ?? 4)
  const currency = String(body.currency ?? "EUR")
  const apartments: any[] = Array.isArray(body.apartments) ? body.apartments : []

  if (!portal || !scenario || !checkin || !checkout) {
    return NextResponse.json({ error: "Faltan campos: portal, scenario, checkin, checkout" }, { status: 400 })
  }
  if (apartments.length === 0) {
    return NextResponse.json({ error: "apartments vacío" }, { status: 400 })
  }

  let inserted = 0
  const skipped: string[] = []

  for (const apt of apartments) {
    const name  = apt?.name
    const night = Number(apt?.price_night)
    if (!name || !Number.isFinite(night) || night <= 0) { skipped.push(String(name ?? "?")); continue }
    const total  = Number.isFinite(Number(apt?.price_total)) ? Number(apt.price_total) : night
    const score  = apt?.score != null && Number.isFinite(Number(apt.score)) ? Number(apt.score) : null
    const reviews = Number.isFinite(Number(apt?.review_count)) ? Number(apt.review_count) : 0
    const location = apt?.location != null ? String(apt.location) : ""

    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO market_rates
          (search_date, checkin_date, checkout_date, guests, portal, scenario,
           comp_name, price_night, price_total, score, review_count, location, currency)
        VALUES (CURRENT_DATE, ${checkin}::date, ${checkout}::date, ${guests},
          ${String(portal)}, ${String(scenario)}, ${String(name)},
          ${Math.round(night)}::integer, ${Math.round(total)}::integer,
          ${score}::numeric, ${reviews}::integer, ${location}, ${currency})
        ON CONFLICT (search_date, portal, scenario, comp_name, checkin_date) DO UPDATE
        SET price_night=EXCLUDED.price_night, price_total=EXCLUDED.price_total,
            score=EXCLUDED.score, review_count=EXCLUDED.review_count,
            location=EXCLUDED.location, created_at=NOW()`)
      inserted++
    } catch (e) {
      skipped.push(`${name}: ${String(e).slice(0, 80)}`)
    }
  }

  return NextResponse.json({ ok: true, portal, scenario, checkin, checkout, inserted, skipped })
}
