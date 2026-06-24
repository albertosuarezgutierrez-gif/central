import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/duplex/cuadre-booking?año=2026 — cuadre mensual de los ingresos de Booking del Dúplex:
// lo COBRADO en banco (BBVA, transferencias planas clasificadas como Booking→Dúplex) vs lo que dice
// SMOOBU (importe NETO de las reservas Booking del Dúplex). OJO: Booking AGRUPA pagos y con desfase,
// así que el cuadre fiable es el TOTAL/acumulado; el mes a mes es orientativo.
const DUPLEX_PROP = 'prop_duplex_center'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const año = parseInt(searchParams.get('año') || '') || new Date().getFullYear()

  // Banco: lo cobrado de Booking en BBVA (por mes del abono), scoped por cuenta. Se cuenta por
  // DESTINO (clasificación canónica = Booking del Dúplex), no por el texto del concepto: el feed
  // PSD2 trae "ABONO... LIQ. OP. Nº" y la importación antigua de Excel traía "Transferencia
  // recibida"; ambos son Booking y los dos cuentan. (Los duplicados Excel↔PSD2 del solapamiento
  // se depuraron, ver prisma/sql/2026-06-23_dedupe_booking_psd2_xls.sql.)
  const banco = await prisma.$queryRaw<Array<{ mes: string; total: number }>>`
    SELECT to_char(date_trunc('month', mb.fecha_operacion), 'YYYY-MM') AS mes,
           sum(mb.importe)::float AS total
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND cb.banco ILIKE '%BBVA%'
      AND mb.destino = 'turistico_duplex' AND mb.importe > 0
      AND EXTRACT(year FROM mb.fecha_operacion) = ${año}
    GROUP BY 1
  `

  // Smoobu: neto de reservas Booking del Dúplex (por mes de la reserva/check-in).
  const smoobu = await prisma.$queryRaw<Array<{ mes: string; total: number }>>`
    SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS mes, sum(amount)::float AS total
    FROM incomes
    WHERE "propertyId" = ${DUPLEX_PROP} AND portal = 'BOOKING' AND amount IS NOT NULL
      AND EXTRACT(year FROM date) = ${año}
    GROUP BY 1
  `

  const bMap = new Map(banco.map(r => [r.mes, Number(r.total)]))
  const sMap = new Map(smoobu.map(r => [r.mes, Number(r.total)]))
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = `${año}-${String(i + 1).padStart(2, '0')}`
    return {
      mes,
      banco: Math.round((bMap.get(mes) ?? 0) * 100) / 100,
      smoobu: Math.round((sMap.get(mes) ?? 0) * 100) / 100,
    }
  })
  const totalBanco = Math.round(meses.reduce((s, m) => s + m.banco, 0) * 100) / 100
  const totalSmoobu = Math.round(meses.reduce((s, m) => s + m.smoobu, 0) * 100) / 100

  return NextResponse.json({ año, meses, totalBanco, totalSmoobu })
}
