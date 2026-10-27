import { NextResponse } from 'next/server'

import { responderRevocar } from '@/lib/patrimonio/autorizar-tercero-api'
import { puertosAutorizarPatrimonio } from '@/lib/patrimonio/autorizar-tercero-bd'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/autorizaciones/<id>` `{ accion: 'revocar' }` — quita un acceso al patrimonio. Lo puede el titular
 * (cualquiera de los suyos) o el propio autorizado (el suyo). Puerta `patrimonio` como toda API de Herramientas: si está
 * cerrada, ese acceso ya no abre nada. El acceso se corta en la siguiente petición (`accesosPatrimonio` lee `revocado_en`).
 * Un id ajeno = 404, nunca 403.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const { id } = await ctx.params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderRevocar(puertosAutorizarPatrimonio(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
