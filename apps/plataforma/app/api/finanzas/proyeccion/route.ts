import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getResumenFinanciero } from '@/lib/finanzas'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/finanzas/proyeccion?year= — proyección fiscal a fin de año
// Combina ingresos reales acumulados + reservas futuras confirmadas de sivra
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()

  try {
    // Ingresos reales acumulados (mismo motor que ResumenFinanciero)
    const resumen = await getResumenFinanciero(session.id, year, 0)

    // Reservas futuras de sivra agrupadas por mes (schema sivra, tabla incomes)
    // check_in es la fecha de entrada de la reserva
    const hoy = new Date().toISOString().slice(0, 10)
    const finAnio = `${year}-12-31`

    const reservasFuturasRows = await prisma.$queryRaw<Array<{
      mes: string
      total_neto: unknown
      num_reservas: unknown
    }>>`
      SELECT
        to_char(date_trunc('month', "checkIn"), 'YYYY-MM') AS mes,
        coalesce(sum(amount), 0) AS total_neto,
        count(*)::int AS num_reservas
      FROM incomes
      WHERE "checkIn" > ${hoy}::date
        AND "checkIn" <= ${finAnio}::date
        AND amount > 0
      GROUP BY date_trunc('month', "checkIn")
      ORDER BY 1
    `

    const reservasFuturas = reservasFuturasRows.map(r => ({
      mes: r.mes as string,
      totalNeto: Number(r.total_neto),
      numReservas: Number(r.num_reservas),
    }))

    const ingresosFuturos = reservasFuturas.reduce((s, r) => s + r.totalNeto, 0)

    // Base imponible proyectada = real acumulada + futura estimada (pisos)
    const baseReal = resumen.fiscal.baseImponibleEstimada
    // Estimación: añadimos los ingresos futuros de pisos sobre la base ya calculada
    const baseProyectada = baseReal + ingresosFuturos

    return NextResponse.json({
      baseReal,
      baseProyectada,
      ingresosFuturos,
      reservasFuturas,
      tramoActual: resumen.fiscal.tramoActual,
      tramosIRPF: resumen.fiscal.tramosIRPF,
      margenHastaProximoTramo: resumen.fiscal.margenHastaProximoTramo,
      retencionesAcumuladas: resumen.fiscal.retencionesAcumuladas,
      year,
    })
  } catch (e) {
    console.error('[/api/finanzas/proyeccion]', e)
    return NextResponse.json({ error: 'Error al calcular proyección' }, { status: 500 })
  }
}
