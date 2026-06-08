import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const SMOOBU_KEY = process.env.SMOOBU_API_KEY ?? "vqOXOSDtA7p80Fp~.ezOXPn_zPYq99gC"
const BASE       = "https://login.smoobu.com/api"

const PROPS = [
  { smoobuId: "352007", propId: "prop_house_sevillana", base: 380 },
  { smoobuId: "352418", propId: "prop_busto_reform",    base: 175 },
  { smoobuId: "352928", propId: "prop_duplex_center",   base: 195 },
  { smoobuId: "352943", propId: "prop_luxury_busto",    base: 225 },
]

const EVENTS: Record<string, number> = {
  "2026-03-29":2.20,"2026-03-30":2.30,"2026-03-31":2.40,"2026-04-01":2.50,
  "2026-04-02":2.60,"2026-04-03":3.00,"2026-04-04":2.80,"2026-04-05":2.50,
  "2026-04-18":2.75,"2026-04-20":2.50,"2026-04-21":2.80,"2026-04-22":3.00,
  "2026-04-23":3.20,"2026-04-24":3.50,"2026-04-25":3.00,"2026-04-26":2.80,
  "2026-05-04":1.30,"2026-05-05":1.30,"2026-05-06":1.30,"2026-05-07":1.30,
  "2026-05-08":1.30,"2026-05-09":1.30,"2026-05-15":1.20,"2026-05-16":1.40,
  "2026-05-22":1.40,"2026-05-23":1.50,"2026-05-24":1.50,"2026-05-25":1.40,
  "2026-06-06":1.40,"2026-06-12":1.40,"2026-06-13":1.60,"2026-06-14":1.60,
  "2026-06-19":1.60,"2026-06-20":1.60,"2026-06-21":1.30,"2026-06-26":1.40,
  "2026-07-03":1.40,"2026-07-16":1.50,"2026-07-18":1.30,
  "2026-11-16":1.40,"2026-11-17":1.40,"2026-11-18":1.40,"2026-11-19":1.40,
  "2026-11-20":1.40,"2026-11-21":1.35,"2026-11-22":1.30,"2026-12-31":1.60,
}
const SEASONAL = [0.65,0.65,1.10,1.00,1.40,1.45,0.85,0.85,1.40,1.10,1.10,1.00]
const DOW      = [0.95,0.88,0.88,0.90,0.95,1.12,1.18]

function calcOurs(base: number, dateStr: string): number {
  const d   = new Date(dateStr + "T00:00:00")
  const mon = d.getMonth()
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
  return Math.round(base * Math.max(EVENTS[dateStr] ?? 0, SEASONAL[mon]) * DOW[dow])
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const today        = new Date()
  const startDate    = fmtDate(today)
  const endDay       = new Date(today); endDay.setDate(endDay.getDate() + 7)
  const endDate      = fmtDate(endDay)
  const snapshotDate = startDate

  let upserted = 0
  const errors: string[] = []

  for (const prop of PROPS) {
    try {
      const res = await fetch(
        `${BASE}/rates?apartments[]=${prop.smoobuId}&start_date=${startDate}&end_date=${endDate}`,
        { headers: { "Api-Key": SMOOBU_KEY, "Cache-Control": "no-cache" }, next: { revalidate: 0 } }
      )
      if (!res.ok) { errors.push(`${prop.propId}: HTTP ${res.status}`); continue }

      const plRates: Record<string, { price: number; available: number; min_length_of_stay: number }> =
        (await res.json()).data?.[prop.smoobuId] ?? {}

      // Iterar los 21 días y hacer upsert individual (Hobby 10s limit)
      const cur = new Date(today)
      while (cur <= endDay) {
        const dateStr = fmtDate(cur)
        const pl      = plRates[dateStr]
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO rate_snapshots
            (property_id, rate_date, snapshot_date, price_pricelabs, price_ours, available, min_stay)
          VALUES (${prop.propId}, ${dateStr}::date, ${snapshotDate}::date, ${pl?.price != null ? Math.round(pl.price) : null}::integer, ${calcOurs(prop.base, dateStr)}::integer, ${pl?.available != null ? (pl.available ? 1 : 0) : null}::smallint, ${pl?.min_length_of_stay ?? null}::smallint)
          ON CONFLICT (property_id, rate_date, snapshot_date)
          DO UPDATE SET
            price_pricelabs = EXCLUDED.price_pricelabs,
            price_ours      = EXCLUDED.price_ours,
            available       = EXCLUDED.available,
            min_stay        = EXCLUDED.min_stay,
            updated_at      = NOW()
        `)
        upserted++
        cur.setDate(cur.getDate() + 1)
      }
    } catch (e) {
      errors.push(`${prop.propId}: ${String(e).slice(0, 100)}`)
    }
  }

  // Marcar was_booked en fechas pasadas (función SQL ya creada en migración)
  try {
    await prisma.$executeRaw(Prisma.sql`SELECT update_rate_snapshots_booked()`)
  } catch { /* no crítico */ }

  return NextResponse.json({ ok: errors.length === 0, snapshot_date: snapshotDate, upserted, errors })
}
