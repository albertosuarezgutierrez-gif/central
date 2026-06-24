import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  calcularConciliacion,
  calcularConciliacionKutxa,
  persistirConciliacion,
  limpiarDuplicadosKutxaBooking,
  limpiarDuplicadosBBVA,
} from '@/lib/sivra/conciliacion-booking'

export const dynamic = 'force-dynamic'

// GET — vista previa: qué transferencias se pueden conciliar (sin escribir).
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? '2026-03-01'

  const [bbva, kutxa] = await Promise.all([
    calcularConciliacion(desde),
    calcularConciliacionKutxa(desde),
  ])
  return NextResponse.json({
    bbva: { resumen: bbva.resumen, resultados: bbva.resultados },
    kutxa: { resumen: kutxa.resumen, resultados: kutxa.resultados },
  })
}

// POST — ejecuta y persiste: concilia los matches y limpia duplicados Kutxa.
// Body opcional: { desde: 'YYYY-MM-DD', soloPreview: boolean }
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const desde: string = body.desde ?? '2026-03-01'
  const soloPreview: boolean = body.soloPreview === true

  const [bbva, kutxa] = await Promise.all([
    calcularConciliacion(desde),
    calcularConciliacionKutxa(desde),
  ])

  if (soloPreview) {
    return NextResponse.json({
      soloPreview: true,
      bbva: { resumen: bbva.resumen, resultados: bbva.resultados },
      kutxa: { resumen: kutxa.resumen, resultados: kutxa.resultados },
    })
  }

  const [actualizadosBBVA, actualizadosKutxa, dupKutxaBooking, dupBBVA] = await Promise.all([
    persistirConciliacion(bbva.resultados),
    persistirConciliacion(kutxa.resultados),
    limpiarDuplicadosKutxaBooking(),
    limpiarDuplicadosBBVA(),
  ])

  return NextResponse.json({
    ok: true,
    actualizados: actualizadosBBVA + actualizadosKutxa,
    duplicadosLimpiados: dupKutxaBooking + dupBBVA,
    bbva: { resumen: bbva.resumen, actualizados: actualizadosBBVA },
    kutxa: { resumen: kutxa.resumen, actualizados: actualizadosKutxa },
  })
}
