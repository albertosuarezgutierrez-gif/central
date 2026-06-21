import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const now = new Date()
    const today    = now.toISOString().slice(0, 10)
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)

    const rows = await prisma.$queryRaw<{
      id: string; propertyId: string; propertyName: string | null;
      reservationId: string; guestName: string | null; portal: string;
      amount: unknown; checkIn: unknown; checkOut: unknown; nights: unknown;
    }[]>(Prisma.sql`
      SELECT
        i.id, i."propertyId", p.name as "propertyName",
        i."reservationId", i."guestName", i.portal::text as portal,
        i.amount, i."checkIn", i."checkOut", i.nights
      FROM incomes i
      LEFT JOIN properties p ON p.id = i."propertyId"
      WHERE i."checkIn"::date  = ${today}::date
         OR i."checkIn"::date  = ${tomorrow}::date
         OR i."checkOut"::date = ${today}::date
      ORDER BY i."checkIn" ASC
    `)

    const fmt = (r: typeof rows[0]) => ({
      id: r.id,
      propertyId: r.propertyId,
      propertyName: r.propertyName ?? null,
      reservationId: r.reservationId ?? '',
      guestName: r.guestName ?? null,
      portal: String(r.portal ?? ''),
      amount: Number(r.amount ?? 0),
      checkIn:  r.checkIn  instanceof Date ? r.checkIn.toISOString()  : String(r.checkIn  ?? ''),
      checkOut: r.checkOut instanceof Date ? r.checkOut.toISOString() : String(r.checkOut ?? ''),
      nights: Number(r.nights ?? 0),
    })

    const all = rows.map(fmt)
    return NextResponse.json({
      todayCheckIn:    all.filter(i => i.checkIn.slice(0,10)  === today),
      tomorrowCheckIn: all.filter(i => i.checkIn.slice(0,10)  === tomorrow),
      todayCheckOut:   all.filter(i => i.checkOut.slice(0,10) === today),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
