import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getPLRango } from '@/lib/sivra/pl-rango'
import { mesPorDefecto } from '@/lib/sivra/pl-mensual'

export const dynamic = 'force-dynamic'
// Un rango de 24 meses son ~24 pasadas de P&L (cacheadas tras la primera).
export const maxDuration = 120

// P&L de los pisos por RANGO de meses (+ canales y cancelaciones del rango).
// `?desde=YYYY-MM&hasta=YYYY-MM` — sin parámetros, el mes anterior (mismo default que pl-mensual).
// `?fresco=1` se salta la caché por mes (lo usa la página tras subir una factura de limpieza).
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const def = mesPorDefecto()
  const desde = req.nextUrl.searchParams.get('desde') ?? def
  const hasta = req.nextUrl.searchParams.get('hasta') ?? def
  const fresco = req.nextUrl.searchParams.get('fresco') === '1'

  try {
    const data = await getPLRango(desde, hasta, { fresco })
    if (!data) {
      return NextResponse.json({ error: 'Rango inválido (YYYY-MM, desde ≤ hasta, máx. 24 meses)' }, { status: 400 })
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error('[pl-rango]', err)
    return NextResponse.json({ error: 'Error calculando el P&L del rango' }, { status: 500 })
  }
}
