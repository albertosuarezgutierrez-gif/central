import { NextResponse } from 'next/server'

import { puertosInquilino } from '@/lib/inquilino/inquilino-bd'
import { MAX_PETICIONES_PRECIO_HORA, responderPedirPrecioInquilino } from '@/lib/inquilino/precio-inquilino'
import { pedirPrecioInquilinoPorPuente } from '@/lib/inquilino/precio-puente'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/inquilino/<contrato>/pedir-precio` `{ que, nombre, canal, contacto, ofertas?, versionOfertas? }` — el inquilino
 * PIDE precio de un seguro para sus cosas y su responsabilidad civil. Crea una tarea para la correduría por el puente
 * (`lib/inquilino/precio-puente.ts`); no envía nada a nadie. `ofertas` (casilla aparte, opcional) es el consentimiento
 * comercial propio del inquilino y NO viaja al puente. Contrato que no es suyo: 404. La vista de corredor no llega aquí
 * (el middleware veta el POST).
 */
export async function POST(req: Request, ctx: { params: Promise<{ contratoId: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`inquilino-pedir-precio:${identidad.id}`, MAX_PETICIONES_PRECIO_HORA, 60 * 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429 })
  const { contratoId } = await ctx.params
  const cuerpo = await req.json().catch(() => null)
  const puertos = { ...puertosInquilino(identidad.id), pedirPorPuente: pedirPrecioInquilinoPorPuente }
  const r = await responderPedirPrecioInquilino(puertos, contratoId, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
