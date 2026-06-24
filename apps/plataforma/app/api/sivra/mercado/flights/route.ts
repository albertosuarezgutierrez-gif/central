import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST /api/sivra/mercado/flights
//
// Fase 3: señal de demanda ADELANTADA por vuelos entrantes a Sevilla (SVQ). Un agente en
// sesión (Expedia MCP `search_flights`) o un cron con API de vuelos free-tier calcula, por
// fecha de llegada, un `demand_index` (≥1.0; 1.0 normal, >1 = pico de vuelos/precio → más
// demanda de alojamiento) y lo empuja aquí. Se upserta en `pricing_flight_demand`.
//
// El motor (apply) solo lo usa si `pricing_settings.flight_demand_k > 0` para el piso → mientras
// k=0 (default) esto NO cambia precios: es solo recolección de señal, segura de desplegar.
//
// Cuerpo:
// { "days": [ { "rate_date":"2027-04-10", "demand_index":1.35, "median_fare":210, "fares_sample":24 } ] }
//
// Auth: CRON_SECRET (Bearer o ?secret=). Si no está definido, no exige auth (patrón del repo).

type Day = { rate_date?: string; demand_index?: number; median_fare?: number; fares_sample?: number }

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    const qs = req.nextUrl.searchParams.get("secret")
    if (bearer !== secret && qs !== secret) {
      return NextResponse.json({ error: "no autorizado" }, { status: 401 })
    }
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }
  const days: Day[] = Array.isArray(body?.days) ? body.days : []
  if (days.length === 0) return NextResponse.json({ error: "days vacío" }, { status: 400 })

  let upserted = 0
  const skipped: string[] = []
  for (const d of days) {
    const rateDate = d.rate_date
    const idx = Number(d.demand_index)
    if (!rateDate || !/^\d{4}-\d{2}-\d{2}$/.test(rateDate) || !Number.isFinite(idx) || idx <= 0) {
      skipped.push(String(rateDate ?? "?")); continue
    }
    // Acotado a [0.5, 2.5] por seguridad (el factor del motor no debe disparar).
    const demand = Math.min(Math.max(idx, 0.5), 2.5)
    const sample = Number.isFinite(Number(d.fares_sample)) ? Math.round(Number(d.fares_sample)) : null
    const fare = Number.isFinite(Number(d.median_fare)) ? Number(d.median_fare) : null
    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO pricing_flight_demand (rate_date, demand_index, fares_sample, median_fare, raw, updated_at)
        VALUES (${rateDate}::date, ${demand}::numeric, ${sample}::int, ${fare}::numeric,
          ${JSON.stringify({ src: "agente" })}::jsonb, now())
        ON CONFLICT (rate_date) DO UPDATE
          SET demand_index = EXCLUDED.demand_index, fares_sample = EXCLUDED.fares_sample,
              median_fare = EXCLUDED.median_fare, updated_at = now()`)
      upserted++
    } catch (e) {
      skipped.push(`${rateDate}: ${String(e).slice(0, 80)}`)
    }
  }

  return NextResponse.json({ ok: true, upserted, skipped })
}
