import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { caducidadesCarnetDeIdentidad } from '@/lib/carnets-portal'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/portal/carnets?identidadId= — los carnés de conducir de la ficha
 * vinculada a esa identidad, con su próxima caducidad ya calculada (nunca las
 * fechas de origen — ver la cabecera de `lib/carnets-portal.ts`).
 *
 * Mismo secreto y misma resolución por `portal_vinculo` que
 * `/api/portal/contacto`: no acepta `clienteId`.
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const identidadId = (new URL(req.url).searchParams.get('identidadId') ?? '').trim()
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await caducidadesCarnetDeIdentidad(correduria.id, identidadId)
    const status = r.estado === 'ok' ? 200 : r.estado === 'error' ? 503 : 409
    return NextResponse.json(r, { status, headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('portal/carnets', e) },
      { status: 503 },
    )
  }
}
