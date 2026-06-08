import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Booking = agency model: Smoobu reports gross, net = gross × 0.8028
// (includes 15% base commission + payment service fee + 21% VAT on both)
// Airbnb/Expedia/Agoda/VRBO = merchant model: Smoobu already reports net
const BOOKING_NET_FACTOR = 0.8028

const PROPERTY_MAP: Record<string, string> = {
  'house sevillana': 'prop_house_sevillana',
  'busto reform':    'prop_busto_reform',
  'duplex center':   'prop_duplex_center',
  'luxury busto':    'prop_luxury_busto',
}

const PORTAL_MAP: Record<string, string> = {
  'booking.com':     'BOOKING',
  'airbnb':          'AIRBNB',
  'expedia':         'EXPEDIA',
  'agoda':           'AGODA',
  'reserva directa': 'DIRECTO',
  'sitio web':       'DIRECTO',
  'direct':          'DIRECTO',
  'vrbo / homeaway': 'VRBO',
  'vrbo':            'VRBO',
}

function parseSmoobuDate(str: string): Date | null {
  if (!str) return null
  const m = str.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (!m) return null
  const d = parseInt(m[1]), mo = parseInt(m[2])
  const y = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])
  return new Date(Date.UTC(y, mo - 1, d))
}

interface ReservationInput {
  smoobuId:  string
  llegada:   string
  salida:    string
  propiedad: string
  huesped:   string
  portal:    string
  precio:    string
  comision:  string
  noches:    string
}

export async function POST(req: NextRequest) {
  try {
    const { reservations }: { reservations: ReservationInput[] } = await req.json()

    let inserted = 0, updated = 0, skipped = 0, errors = 0
    const errorList: string[] = []

    for (const r of reservations) {
      try {
        const propKey    = (r.propiedad || '').toLowerCase().trim()
        const propertyId = PROPERTY_MAP[propKey]
        if (!propertyId) { skipped++; continue }

        const portalKey = (r.portal || '').toLowerCase().trim()
        const portal    = PORTAL_MAP[portalKey] || 'OTRO'

        const checkIn  = parseSmoobuDate(r.llegada)
        const checkOut = parseSmoobuDate(r.salida)
        if (!checkIn || !checkOut) { skipped++; continue }

        const amountGross = parseFloat(r.precio) || 0
        // Booking: net = gross × 0.8028 (commission + payment fee + 21% VAT)
        // Other portals: merchant model, Smoobu already reports net
        const amount      = portal === 'BOOKING' ? Math.round(amountGross * BOOKING_NET_FACTOR * 100) / 100 : amountGross
        const nights      = parseInt(r.noches) || 0
        const reservationId = r.smoobuId?.toString()
        if (!reservationId) { skipped++; continue }

        const existing = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM incomes WHERE "reservationId" = ${reservationId} LIMIT 1
        `)

        if (existing.length > 0) {
          await prisma.$executeRaw(Prisma.sql`
            UPDATE incomes SET
              "propertyId"   = ${propertyId},
              amount         = ${amount},
              amount_gross   = ${amountGross},
              portal         = ${portal}::"Portal",
              "guestName"    = ${r.huesped || ''},
              "checkIn"      = ${checkIn},
              "checkOut"     = ${checkOut},
              nights         = ${nights},
              date           = ${checkOut}
            WHERE "reservationId" = ${reservationId}
          `)
          updated++
        } else {
          await prisma.$executeRaw(Prisma.sql`
            INSERT INTO incomes
              ("propertyId", date, amount, amount_gross, portal, "reservationId", "guestName", "checkIn", "checkOut", nights)
            VALUES
              (${propertyId}, ${checkOut}, ${amount}, ${amountGross}, ${portal}::"Portal", ${reservationId}, ${r.huesped || ''}, ${checkIn}, ${checkOut}, ${nights})
          `)
          inserted++
        }
      } catch (e: unknown) {
        errors++
        const msg = e instanceof Error ? e.message : String(e)
        if (errorList.length < 5) errorList.push(`${r.smoobuId}: ${msg}`)
      }
    }

    return NextResponse.json({ inserted, updated, skipped, errors, errorList })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
