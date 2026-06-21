import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

// GET /api/sivra/incomes — reservas de los apartamentos turísticos para el calendario.
// Devuelve el mismo formato que sivra /api/incomes para poder compartir componentes.
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const fromParam = searchParams.get('from')
  const toParam   = searchParams.get('to')

  const now = new Date()
  const fromDate = fromParam ? new Date(fromParam) : new Date(now.getFullYear() - 1, 0, 1)
  const toDate   = toParam   ? new Date(toParam)   : new Date(now.getFullYear() + 1, 11, 31)

  try {
    const rows = await prisma.$queryRaw<Array<{
      id: string
      propertyId: string
      guestName: string | null
      checkIn: Date | null
      checkOut: Date | null
      portal: string | null
      amount: number
      nights: number | null
    }>>`
      SELECT id, "propertyId", "guestName", "checkIn", "checkOut",
             portal::text AS portal, amount::float, nights::int
      FROM incomes
      WHERE "checkIn" >= ${fromDate} AND "checkIn" < ${toDate}
      ORDER BY "checkIn" ASC
    `

    const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null)

    return NextResponse.json({
      incomes: rows.map(r => ({
        id: r.id,
        propertyId: r.propertyId,
        guestName: r.guestName,
        checkIn: iso(r.checkIn as Date),
        checkOut: iso(r.checkOut as Date),
        portal: r.portal,
        amount: Number(r.amount),
        nights: r.nights ? Number(r.nights) : null,
      })),
    })
  } catch (err) {
    console.error('[sivra/incomes]', err)
    return NextResponse.json({ incomes: [], error: 'Error cargando reservas' }, { status: 500 })
  }
}
