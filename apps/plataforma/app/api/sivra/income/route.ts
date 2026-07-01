// GET /api/sivra/income — listado completo de reservas con JOIN a properties (nombre).
// Usado por la página /sivra/income (tabla detallada con todos los campos).
// Para el calendario usa /api/sivra/incomes (filtro por fechas, campos simplificados).
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      i.id, i."propertyId" AS property_id, p.name AS property_name,
      i."reservationId" AS reservation_id, i."guestName" AS guest_name,
      i.portal, i.amount,
      i."checkIn" AS check_in, i."checkOut" AS check_out,
      i.nights, i.date
    FROM incomes i
    LEFT JOIN properties p ON p.id = i."propertyId"
    ORDER BY i."checkIn" DESC NULLS LAST
  `

  const incomes = rows.map(r => ({
    id: r.id,
    propertyId: r.property_id,
    propertyName: r.property_name ?? r.property_id,
    reservationId: r.reservation_id ?? '',
    guestName: r.guest_name ?? null,
    portal: r.portal,
    amount: Number(r.amount),
    checkIn: r.check_in?.toISOString?.() ?? r.check_in ?? null,
    checkOut: r.check_out?.toISOString?.() ?? r.check_out ?? null,
    nights: Number(r.nights ?? 0),
    date: r.date?.toISOString?.() ?? r.date,
  }))

  return NextResponse.json({ incomes })
}
