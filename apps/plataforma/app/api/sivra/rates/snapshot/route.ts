import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { calcOurs, PRICING_HORIZON_DAYS } from '@/lib/pricing-calendar'
import { getSmoobuKey } from '@/lib/smoobu'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ⚠️ `price_pricelabs` = el precio REAL vivo en Smoobu (GET /rates), lo haya escrito quien lo haya
// escrito (nuestro motor u otra cosa) — pese al nombre, es la columna a leer para saber "qué precio
// tiene ahora mismo el piso". `price_ours` = una fórmula estática LEGACY (`calcOurs`, base fija ×
// estacional × día-semana) de antes del motor real anclado al mercado — es un "shadow" histórico que
// NADIE debería confundir con el precio vivo (causó una falsa alarma el 27/07/2026: ver calcOurs en
// pricing-calendar.ts). Para diagnosticar pricing en vivo, usa price_pricelabs o pricing_applied.
const PROPS = [
  { smoobuId: '352007', propId: 'prop_house_sevillana', base: 380 },
  { smoobuId: '352418', propId: 'prop_busto_reform', base: 175 },
  { smoobuId: '352928', propId: 'prop_duplex_center', base: 195 },
  { smoobuId: '352943', propId: 'prop_luxury_busto', base: 225 },
]

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const SMOOBU_KEY = await getSmoobuKey()
  const today = new Date()
  const startDate = fmtDate(today)
  const endDay = new Date(today)
  endDay.setDate(endDay.getDate() + PRICING_HORIZON_DAYS)
  const endDate = fmtDate(endDay)
  const snapshotDate = startDate

  let upserted = 0
  const errors: string[] = []

  for (const prop of PROPS) {
    try {
      const res = await fetch(
        `https://login.smoobu.com/api/rates?apartments[]=${prop.smoobuId}&start_date=${startDate}&end_date=${endDate}`,
        { headers: { 'Api-Key': SMOOBU_KEY, 'Cache-Control': 'no-cache' }, next: { revalidate: 0 } }
      )
      if (!res.ok) { errors.push(`${prop.propId}: HTTP ${res.status}`); continue }

      const plRates: Record<string, { price: number; available: number; min_length_of_stay: number }> =
        (await res.json()).data?.[prop.smoobuId] ?? {}

      const rows: Prisma.Sql[] = []
      const cur = new Date(today)
      while (cur <= endDay) {
        const dateStr = fmtDate(cur)
        const pl = plRates[dateStr]
        rows.push(Prisma.sql`(${prop.propId}, ${dateStr}::date, ${snapshotDate}::date,
          ${pl?.price != null ? Math.round(pl.price) : null}::integer,
          ${calcOurs(prop.base, dateStr)}::integer,
          ${pl?.available != null ? (pl.available ? 1 : 0) : null}::smallint,
          ${pl?.min_length_of_stay ?? null}::smallint)`)
        cur.setDate(cur.getDate() + 1)
      }

      if (rows.length) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO rate_snapshots
            (property_id, rate_date, snapshot_date, price_pricelabs, price_ours, available, min_stay)
          VALUES ${Prisma.join(rows)}
          ON CONFLICT (property_id, rate_date, snapshot_date)
          DO UPDATE SET
            price_pricelabs = EXCLUDED.price_pricelabs,
            price_ours      = EXCLUDED.price_ours,
            available       = EXCLUDED.available,
            min_stay        = EXCLUDED.min_stay,
            updated_at      = NOW()
        `)
        upserted += rows.length
      }
    } catch (e) {
      errors.push(`${prop.propId}: ${String(e).slice(0, 100)}`)
    }
  }

  try {
    await prisma.$executeRaw(Prisma.sql`SELECT update_rate_snapshots_booked()`)
  } catch { /* no crítico */ }

  return NextResponse.json({ ok: errors.length === 0, snapshot_date: snapshotDate, upserted, errors })
}
