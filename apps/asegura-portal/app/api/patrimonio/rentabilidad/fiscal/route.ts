import { NextResponse } from 'next/server'

import { csvFiscal, informeFiscal } from '@/lib/patrimonio/fiscal'
import { rentabilidadDeIdentidad } from '@/lib/patrimonio/rentabilidad-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/rentabilidad/fiscal?anio=` — CSV del informe fiscal. 🚨 La identidad sale SOLO de la cookie y todo
 * parte de `rentabilidadDeIdentidad` (→ `accesosPatrimonio`): sin patrimonio a la vista, 404; lectura fallida, 500 (jamás un
 * CSV con ceros). `anio` raro = el año en curso (`periodoDeAnio`).
 */
export async function GET(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-fiscal-csv:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  try {
    const d = await rentabilidadDeIdentidad(identidad.id, new URL(req.url).searchParams.get('anio'))
    if (!d) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })
    const inf = informeFiscal(d.resultado, d.inmuebles, d.periodo)
    return new NextResponse(csvFiscal(inf), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="informe-fiscal-alquiler-${inf.anio}.csv"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
    })
  } catch (e) {
    console.error('[patrimonio/fiscal csv]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'error' }, { status: 500 })
  }
}
