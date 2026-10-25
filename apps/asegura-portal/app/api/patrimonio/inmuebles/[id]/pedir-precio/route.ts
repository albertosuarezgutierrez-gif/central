import { NextResponse } from 'next/server'

import { pedirPrecioPorPuente } from '@/lib/patrimonio/pedir-precio-puente'
import { responderPedirPrecio } from '@/lib/patrimonio/pedir-precio-api'
import { puertosSegurosInmueble } from '@/lib/patrimonio/seguros-inmueble-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/inmuebles/<id>/pedir-precio` — «Pedir precio» de un inmueble SIN seguro (o con el seguro
 * caducado). Va por el PUENTE a `apps/asegura` (`/api/portal/patrimonio/pedir-precio`): el portal no escribe en
 * `oportunidades`. NO es `lead-declarada`. El cuerpo no manda nada: el servidor recalcula el estado y el tipo.
 * 🚨 Inmueble ajeno o nivel que no es Total (gestión, inquilino): 404 (nunca 403). La vista de corredor no pasa por el
 * middleware (POST vetado). Esto no envía ningún correo ni mensaje al cliente.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-pedir-precio:${identidad.id}`, 10, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await ctx.params
  const puertos = {
    ...puertosSegurosInmueble(identidad.id),
    pedirPorPuente: (x: { inmuebleId: string; tipo: 'inmueble_sin_seguro' | 'seguro_no_vigente' }) =>
      pedirPrecioPorPuente({ identidadId: identidad.id, ...x }),
  }
  const r = await responderPedirPrecio(puertos, id)
  return NextResponse.json(r.body, { status: r.status })
}
