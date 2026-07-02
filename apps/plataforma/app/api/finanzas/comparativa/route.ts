import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getResumenFinanciero, getResumenPilar } from '@/lib/finanzas'
import { compararDeclaracion, importesDe } from '@/lib/fiscal-deducciones'

export const dynamic = 'force-dynamic'

// GET /api/finanzas/comparativa?year= — conjunta vs separada IRPF
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()

  try {
    const [resumen, pilar] = await Promise.all([
      getResumenFinanciero(session.id, year, 0),
      getResumenPilar(session.id, year, 0),
    ])

    const imp = importesDe(year)
    const comparativa = compararDeclaracion(
      resumen.fiscal.baseImponibleSinReduccion,
      resumen.correduria.retencionesEstimadas,
      pilar.rendimientoNeto,
      pilar.retenciones,
      resumen.deducciones.perfil,
      resumen.deducciones.descendientes.map(d => ({
        nombre: d.nombre,
        fechaNacimiento: d.fechaNacimiento,
        gradoDiscapacidad: d.gradoDiscapacidad,
        computoCompleto: d.computoCompleto,
      })),
      year,
      imp,
    )

    return NextResponse.json(comparativa)
  } catch (e) {
    console.error('[/api/finanzas/comparativa]', e)
    return NextResponse.json({ error: 'Error al calcular comparativa' }, { status: 500 })
  }
}
