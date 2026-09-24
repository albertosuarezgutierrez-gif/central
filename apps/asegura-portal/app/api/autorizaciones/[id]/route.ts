import { NextResponse } from 'next/server'

import { resolver, type ErrorResolver } from '@/lib/autorizaciones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/** Un uuid mal formado revienta dentro de Prisma con un 500 en vez de contestar 404. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * El código HTTP de cada motivo.
 *
 * `no_encontrada` (404) cubre a la vez «no existe» y «no es de ninguna de tus
 * fichas», a propósito: distinguirlas convertiría la ruta en un oráculo de
 * uuids válidos de la cartera ajena. `no_te_toca` (403) es otra cosa — la
 * autorización SÍ es tuya, pero por el lado que no puede hacer esa acción.
 */
const ESTADO_HTTP: Record<ErrorResolver, number> = {
  datos_invalidos: 400,
  no_encontrada: 404,
  no_te_toca: 403,
  ya_revocada: 409,
  no_pendiente: 409,
}

/**
 * María acepta lo que José concedió, o cualquiera de los dos lo revoca.
 *
 * La **doble aceptación** no es un trámite: hasta que la persona autorizada no
 * acepta, la autorización está `pendiente` y no abre nada. Y aceptar deja su
 * nombre en la fila, que es lo que la hace responsable de lo que mire.
 */
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

  const c = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>
  const accion = c.accion
  if (!UUID.test(id) || (accion !== 'aceptar' && accion !== 'revocar')) {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }

  // Quién puede hacer qué sobre esta fila lo decide `resolver()` contra
  // `portal_vinculo`: el uuid viaja en la URL y no lo firma nadie.
  const r = await resolver({ identidadId: identidad.id, autorizacionId: id, accion })

  if (!r.ok) {
    return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO_HTTP[r.error] })
  }

  // El estado sale de `estadoAutorizacion()` sobre la fila REleída, no de la
  // acción que se acaba de hacer: aceptar una que caducaba hoy no la deja
  // vigente, y decir «vigente» ahí sería abrir una puerta que no está abierta.
  return NextResponse.json({ estado: r.estado })
}
