import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SMOOBU_KEY = process.env.SMOOBU_API_KEY || 'vqOXOSDtA7p80Fp~.ezOXPn_zPYq99gC'
const PROP_MAP: Record<string, string> = {
  '352007': 'prop_house_sevillana',
  '352418': 'prop_busto_reform',
  '352928': 'prop_duplex_center',
  '352943': 'prop_luxury_busto',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  // Generate sessions for next N days (default 14)
  const days = parseInt(searchParams.get('days') || '14')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  try {
    const dateFrom = today.toISOString().split('T')[0]
    const dateTo = new Date(today.getTime() + days * 86400000).toISOString().split('T')[0]

    // Fetch reservations: departures in window (need cleaning) + arrivals (checkin time needed)
    const [res1, res2] = await Promise.all([
      fetch(`https://login.smoobu.com/api/reservations?pageSize=100&departureFrom=${dateFrom}&departureTo=${dateTo}`,
        { headers: { 'Api-Key': SMOOBU_KEY }, cache: 'no-store' }),
      fetch(`https://login.smoobu.com/api/reservations?pageSize=100&arrivalFrom=${dateFrom}&arrivalTo=${dateTo}`,
        { headers: { 'Api-Key': SMOOBU_KEY }, cache: 'no-store' }),
    ])
    if (!res1.ok) throw new Error(`Smoobu departures ${res1.status}`)
    const data1 = await res1.json()
    const data2 = res2.ok ? await res2.json() : { bookings: [] }
    const allBookings = [...(data1.bookings || []), ...(data2.bookings || [])]

    // Deduplicate by id
    const seen = new Set<string>()
    const unique = allBookings.filter(b => {
      if (seen.has(String(b.id))) return false
      seen.add(String(b.id))
      return true
    })

    let created = 0, skipped = 0

    for (const b of unique) {
      if (b['is-blocked-booking'] || b.type === 'cancellation') continue
      const aptId = String(b.apartment?.id || '')
      const propId = PROP_MAP[aptId]
      if (!propId) continue

      const departure = b.departure // 'YYYY-MM-DD'
      const arrival = b.arrival
      if (!departure) continue

      // Check if session already exists for this property + date
      const existing = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT id FROM cleaning_sessions
        WHERE property_id = ${propId} AND session_date = ${departure}::date
        LIMIT 1
      `)
      if (existing.length > 0) { skipped++; continue }

      // Find the next checkin for this property on or after departure
      const nextCheckin = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT "checkIn"::text as check_in, "guestName" as guest_name
        FROM incomes
        WHERE "propertyId" = ${propId}
        AND "checkIn"::date >= ${departure}::date
        AND "checkIn"::date <= (${departure}::date + interval '3 days')
        ORDER BY "checkIn" ASC
        LIMIT 1
      `)

      const checkinTime = nextCheckin[0]?.check_in
        ? new Date(nextCheckin[0].check_in).toTimeString().slice(0,5) || '15:00'
        : '15:00'

      await prisma.$queryRaw(Prisma.sql`
        INSERT INTO cleaning_sessions 
          (property_id, reservation_id, session_date, checkout_time, checkin_time, guest_out, guest_in)
        VALUES (
          ${propId},
          ${String(b.id)},
          ${departure}::date,
          '11:00'::time,
          ${checkinTime}::time,
          ${b['guest-name'] || null},
          ${nextCheckin[0]?.guest_name || null}
        )
      `)
      created++
    }

    return NextResponse.json({ ok: true, created, skipped, total: unique.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
