import { NextResponse } from 'next/server'

import { ipDe, resolverPeticion, userAgentDe, type ErrorResolverPeticion } from '@/lib/peticiones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/** Un uuid mal formado revienta dentro de Prisma con un 500 en vez de contestar 404. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * El código HTTP de cada motivo.
 *
 * 🚨 `no_encontrada` (404) cubre a la vez «no existe» y «no es tuya», a
 * propósito: un 403 confirmaría que esa petición existe, y con ella que existe
 * la persona a la que se le pidió. Es la misma decisión que toma
 * `app/api/autorizaciones/[id]/route.ts`.
 *
 * 📌 Aquí vivió `solicitante_sin_ficha` (409) hasta el 04/09/2026: conceder
 * exigía que quien pidió fuera YA cliente, porque `autorizado_cliente_id` era
 * NOT NULL. Ya no: se le autoriza por su IDENTIDAD del portal. El motivo se
 * borró en vez de dejarlo de adorno — un código que no puede pasar en una tabla
 * de códigos es una promesa falsa para quien lea esto dentro de tres meses.
 */
const ESTADO_HTTP: Record<ErrorResolverPeticion, number> = {
  datos_invalidos: 400,
  no_encontrada: 404,
  no_pendiente: 409,
  nivel_insuficiente: 403,
  ficha_no_activa: 409,
  alcance_no_disponible: 409,
}

/**
 * El padre concede o rechaza; el hijo retira lo que pidió.
 *
 * Quién puede hacer qué NO se decide aquí: lo decide `resolverPeticion()`
 * contra `portal_vinculo` (conceder y rechazar) o contra la identidad que pidió
 * (retirar). El uuid viaja en la URL y no lo firma nadie.
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

  // `null` y `3` son JSON válidos: sin esta guarda el acceso a las propiedades
  // revienta con un 500 en vez de decir qué falta.
  const c = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>
  const accion = c.accion
  if (!UUID.test(id) || (accion !== 'conceder' && accion !== 'rechazar' && accion !== 'retirar')) {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }

  const r = await resolverPeticion({
    identidadId: identidad.id,
    peticionId: id,
    accion,
    ip: ipDe(req),
    userAgent: userAgentDe(req),
  })

  if (!r.ok) {
    // El `mensaje` viaja siempre: un 409 sin su razón deja a la persona sin
    // saber si el problema es suyo, del otro o nuestro.
    return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO_HTTP[r.error] })
  }

  // `autorizacionId` es la costura entre las dos tablas: es lo que permite
  // enseñarle a quien pidió que su petición sirvió para algo.
  return NextResponse.json({ estado: r.estado, autorizacionId: r.autorizacionId })
}
