import { NextResponse } from 'next/server'

import { marcarAvisoLeidoDeSesion } from '@/lib/avisos-leidos'

export const runtime = 'nodejs'

/**
 * POST /api/avisos/leido — la campana sella el aviso que se acaba de pulsar para que no vuelva a
 * salir. Solo marca como LEÍDO, y solo avisos informativos (`esClaveDescartable`): no acepta, no
 * firma, no resuelve nada. La identidad sale de la sesión; del cuerpo solo se lee la clave.
 */
export async function POST(req: Request) {
  const cuerpo = (await req.json().catch(() => null)) as { clave?: unknown } | null
  const clave = typeof cuerpo?.clave === 'string' ? cuerpo.clave : ''
  const r = await marcarAvisoLeidoDeSesion(clave)
  if (r === 'sin_sesion') return NextResponse.json({ error: r }, { status: 401 })
  if (r === 'clave_no_valida') return NextResponse.json({ error: r }, { status: 422 })
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
}
