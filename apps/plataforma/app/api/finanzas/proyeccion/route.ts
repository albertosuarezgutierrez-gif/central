import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getResumenFinanciero } from '@/lib/finanzas'
import { getProyeccionFiscal } from '@/lib/proyeccion-fiscal'

export const dynamic = 'force-dynamic'

// GET /api/finanzas/proyeccion?year= — proyección fiscal a fin de año
// Combina ingresos reales acumulados + reservas futuras confirmadas de sivra
// + ingresos recurrentes proyectados - gastos deducibles proyectados (detección IA)
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()

  try {
    const resumen = await getResumenFinanciero(session.id, year, 0)
    const proy = await getProyeccionFiscal(session.id, year, resumen)

    return NextResponse.json({
      baseReal: proy.baseReal,
      baseProyectada: proy.baseProyectada,
      ingresosFuturos: proy.ingresosFuturos,
      reservasFuturas: proy.reservasFuturas,
      tramoActual: resumen.fiscal.tramoActual,
      tramosIRPF: resumen.fiscal.tramosIRPF,
      margenHastaProximoTramo: resumen.fiscal.margenHastaProximoTramo,
      retencionesAcumuladas: resumen.fiscal.retencionesAcumuladas,
      year,
      patrones: proy.patrones,
      ingresosRecurrentesProyectados: proy.ingresosRecurrentesProyectados,
      gastosDeduciblesProyectados: proy.gastosDeduciblesProyectados,
      mesesRestantes: proy.mesesRestantes,
    })
  } catch (e) {
    console.error('[/api/finanzas/proyeccion]', e)
    return NextResponse.json({ error: 'Error al calcular proyección' }, { status: 500 })
  }
}
