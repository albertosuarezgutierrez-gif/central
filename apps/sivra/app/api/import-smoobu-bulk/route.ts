import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const PROP_MAP: Record<string, string> = {
  'house sevillana': 'prop_house_sevillana',
  'busto reform':    'prop_busto_reform',
  'duplex center':   'prop_duplex_center',
  'luxury busto':    'prop_luxury_busto',
}
const PORTAL_MAP: Record<string, string> = {
  'booking.com':    'BOOKING', 'airbnb': 'AIRBNB',
  'expedia':        'EXPEDIA', 'agoda': 'AGODA',
  'reserva directa':'DIRECTO', 'sitio web': 'DIRECTO', 'direct': 'DIRECTO',
  'vrbo / homeaway':'VRBO',    'vrbo': 'VRBO',
}

function parseDate(s: string): Date | null {
  if (!s) return null
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (!m) return null
  const y = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])
  return new Date(Date.UTC(y, parseInt(m[2]) - 1, parseInt(m[1])))
}

interface Reservation {
  smoobuId: string; llegada: string; salida: string
  propiedad: string; huesped: string; portal: string
  precio: string; comision: string; noches: string
}

export async function POST(req: NextRequest) {
  try {
    const { reservations }: { reservations: Reservation[] } = await req.json()
    if (!Array.isArray(reservations) || reservations.length === 0) {
      return NextResponse.json({ error: 'no reservations' }, { status: 400 })
    }

    let inserted = 0, updated = 0, skipped = 0, errors = 0
    const errorList: string[] = []

    for (const r of reservations) {
      const propId = PROP_MAP[(r.propiedad || '').toLowerCase().trim()]
      if (!propId) { skipped++; continue }
      const portal = PORTAL_MAP[(r.portal || '').toLowerCase().trim()] || 'OTRO'
      const checkIn = parseDate(r.llegada)
      const checkOut = parseDate(r.salida)
      if (!checkIn) { skipped++; continue }
      const gross  = parseFloat(r.precio)  || 0
      const comm   = parseFloat(r.comision) || 0
      const amount = portal === 'BOOKING' ? gross - comm : gross
      const nights = parseInt(r.noches) || 0
      const rid    = String(r.smoobuId)
      const date   = checkOut || checkIn

      try {
        const ex = await prisma.income.findUnique({ where: { reservationId: rid } })
        if (ex) {
          await prisma.$executeRaw(Prisma.sql`
            UPDATE incomes SET
              "propertyId"   = ${propId},
              amount         = ${amount},
              "amount_gross" = ${gross},
              portal         = ${portal}::"Portal",
              "guestName"    = ${r.huesped || ''},
              "checkIn"      = ${checkIn},
              "checkOut"     = ${checkOut},
              nights         = ${nights},
              date           = ${date}
            WHERE "reservationId" = ${rid}
          `)
          updated++
        } else {
          await prisma.$executeRaw(Prisma.sql`
            INSERT INTO incomes
              ("propertyId", date, amount, "amount_gross", portal, "reservationId", "guestName", "checkIn", "checkOut", nights)
            VALUES
              (${propId}, ${date}, ${amount}, ${gross}, ${portal}::"Portal", ${rid}, ${r.huesped || ''}, ${checkIn}, ${checkOut}, ${nights})
          `)
          inserted++
        }
      } catch (e: unknown) {
        errors++
        const msg = e instanceof Error ? e.message.slice(0, 80) : String(e)
        if (errorList.length < 3) errorList.push(`${rid}: ${msg}`)
      }
    }
    return NextResponse.json({ inserted, updated, skipped, errors, errorList, total: reservations.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
