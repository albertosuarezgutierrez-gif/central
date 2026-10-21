import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { marcarAvisosAdminVistos } from '@/lib/avisos-admin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** «Marcar como visto» los avisos de envío fallido. Siempre acotado a la empresa de la sesión. */
export async function POST(req: Request) {
  try {
    const { empresa_id } = await getSesion()
    const { ids } = await req.json().catch(() => ({}))
    const lista = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && UUID.test(x)) : undefined
    const n = await marcarAvisosAdminVistos(empresa_id, lista)
    return NextResponse.json({ ok: true, n })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 })
  }
}
