import { NextResponse } from 'next/server'

import { retirarInvitacion, type ErrorRetirar } from '@/lib/invitaciones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * José retira una invitación que todavía no han contestado.
 *
 * 🚨 `no_encontrada` (404) cubre a la vez «no existe» y «no es tuya», a
 * propósito: un 403 confirmaría que esa invitación existe, y con ella que
 * alguien invitó a alguien. Misma decisión que
 * `app/api/peticiones/[id]/route.ts` y que `app/api/autorizaciones/[id]/route.ts`.
 *
 * Retirar NO es rechazar: quien rechaza es el invitado, y eso va por
 * `app/api/invitaciones/responder`. Aquí solo entra quien invitó, y quién puede
 * NO se decide en esta ruta: lo decide `retirarInvitacion()` contra la identidad
 * de la cookie. El uuid viaja en la URL y no lo firma nadie.
 */
const ESTADO_HTTP: Record<ErrorRetirar, number> = {
  datos_invalidos: 400,
  no_encontrada: 404,
  no_pendiente: 409,
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // La identidad SIEMPRE sale de la cookie, nunca del cuerpo ni de la URL.
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const { id } = await ctx.params

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }

  // `null` y `3` son JSON válidos: sin esta guarda el acceso a las propiedades
  // revienta con un 500 en vez de decir qué falta.
  const c = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>
  // La acción se exige explícita aunque hoy solo haya una: un POST sin verbo se
  // convierte en «lo que haga esta ruta», y mañana hace otra cosa.
  if (c.accion !== 'retirar') {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }

  const r = await retirarInvitacion({ identidadId: identidad.id, invitacionId: id })

  if (!r.ok) {
    return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO_HTTP[r.error] })
  }

  return NextResponse.json({ estado: r.estado })
}
