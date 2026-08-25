import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { calcOurs, PRICING_HORIZON_DAYS } from '@/lib/pricing-calendar'
import { getSmoobuKey } from '@/lib/smoobu'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// `price_live` = el precio REAL vivo en Smoobu (GET /rates), lo haya escrito quien lo haya escrito
// (nuestro motor u otra cosa). Es la columna a leer para saber "qué precio tiene ahora mismo el
// piso". Se llamaba `price_pricelabs` —de cuando lo escribía PriceLabs, de baja el 09/08/2026— y
// ese nombre causó dos bugs; se renombró el 25/08/2026 y ambas conviven hasta el DROP (un trigger
// las sincroniza). `price_ours` = una fórmula estática LEGACY (`calcOurs`, base fija × estacional ×
// día-semana) de antes del motor real anclado al mercado — es un "shadow" histórico que NADIE
// debería confundir con el precio vivo (causó una falsa alarma el 27/07/2026: ver calcOurs en
// pricing-calendar.ts). Para diagnosticar pricing en vivo, usa `price_live` o `pricing_applied`.
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

      const tarifas: Record<string, { price: number; available: number; min_length_of_stay: number }> =
        (await res.json()).data?.[prop.smoobuId] ?? {}

      const rows: Prisma.Sql[] = []
      const cur = new Date(today)
      while (cur <= endDay) {
        const dateStr = fmtDate(cur)
        const t = tarifas[dateStr]
        const vivo = t?.price != null ? Math.round(t.price) : null
        rows.push(Prisma.sql`(${prop.propId}, ${dateStr}::date, ${snapshotDate}::date,
          ${vivo}::integer,
          ${vivo}::integer,
          ${calcOurs(prop.base, dateStr)}::integer,
          ${t?.available != null ? (t.available ? 1 : 0) : null}::smallint,
          ${t?.min_length_of_stay ?? null}::smallint)`)
        cur.setDate(cur.getDate() + 1)
      }

      if (rows.length) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO rate_snapshots
            (property_id, rate_date, snapshot_date, price_live, price_pricelabs, price_ours,
             available, min_stay)
          VALUES ${Prisma.join(rows)}
          ON CONFLICT (property_id, rate_date, snapshot_date)
          DO UPDATE SET
            -- Fase EXPAND: se escriben las DOS mientras el código viejo pueda seguir vivo.
            -- La vieja se va en la migración de contract (2026-08-26_pricelabs_drop.sql).
            price_live      = EXCLUDED.price_live,
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

  // 💓 Latido (hallazgo 🟡 6, 24/08/2026). Es el job que MÁS pesa de la cadena: alimenta la
  // ocupación y el precio vivo con el que se compara todo — y hasta hoy, si moría, lo único que
  // podía notarlo era el watchdog de pilot-track («snapshot viejo»), que era mudo. La huella no
  // puede ser `rate_snapshots` a secas: un upsert parcial (1 de 4 pisos) también refresca la tabla.
  await registrarLatido('sivra_rates_snapshot', errors.length === 0,
    `${upserted} noche(s) snapshoteadas` + (errors.length > 0 ? ` · fallos: ${errors.join(' · ')}`.slice(0, 400) : ''))

  return NextResponse.json({ ok: errors.length === 0, snapshot_date: snapshotDate, upserted, errors })
}
