import { NextResponse } from 'next/server'
import { z } from 'zod'

import { MAX_MOTIVO, registrarSupresion, retirarSupresion, supresionesDeIdentidad } from '@/lib/supresion'
import { ipDe, userAgentDe } from '@/lib/peticiones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * «Quiero que borréis mis datos» — el derecho de supresión del art. 17 RGPD.
 *
 * 🚨 ESTA RUTA NO BORRA NADA, y eso es lo correcto, no una limitación. El art.
 * 17.3.b y el 17.3.e excluyen la supresión cuando hace falta cumplir una
 * obligación legal o defender reclamaciones, y una correduría tiene las dos.
 * Lo que se registra es la SOLICITUD, con su reloj de un mes (art. 12.3), y lo
 * que se devuelve es el **acuse con el alcance**: qué se borra, qué se conserva
 * y con qué base legal cada cosa (art. 12.4).
 *
 * 🚫 Y por lo mismo NO hay aquí un `DELETE` de datos ni un endpoint que lo
 * dispare. Si algún día lo hay, no puede vivir en el portal: quien resuelve una
 * solicitud es el corredor, tras comprobar qué se puede borrar de verdad.
 */

const Entrada = z.object({
  // Opcional a propósito: el art. 17 **no exige motivar** la solicitud. Pedirlo
  // como obligatorio pondría un peaje al ejercicio de un derecho.
  motivo: z.string().max(MAX_MOTIVO * 4).optional(),
})

const Retirada = z.object({ id: z.string().uuid() })

/** Lo que ya ha pedido. Sin `try/catch`: si la consulta falla, que suba — una
 *  lista vacía haría pasar un fallo de BD por «no has pedido nada», justo en la
 *  pantalla donde decide si insiste. */
export async function GET() {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  return NextResponse.json({ solicitudes: await supresionesDeIdentidad(identidad.id) })
}

export async function POST(req: Request) {
  // La identidad SIEMPRE sale de la cookie, nunca del cuerpo: quien pide es
  // quien tiene la sesión, y eso es lo que se guarda en la fila.
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const parsed = Entrada.safeParse((await req.json().catch(() => null)) ?? {})
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const r = await registrarSupresion(identidad.id, {
    motivo: parsed.data.motivo,
    ip: ipDe(req),
    userAgent: userAgentDe(req),
  })
  // `ya_pendiente` es un 200 y no un error: su solicitud existe, y lo que hay
  // que enseñarle es ESA, con su plazo. Un 409 pelado le dejaría sin saber
  // cuándo le contestan.
  return NextResponse.json(r)
}

/** Retirarla. La retira quien la pidió; **no es lo mismo que denegarla**. */
export async function PATCH(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const parsed = Retirada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const s = await retirarSupresion(identidad.id, parsed.data.id)
  // 404 y nunca 403: un 403 confirmaría que esa solicitud existe y es de otro.
  if (!s) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })
  return NextResponse.json({ solicitud: s })
}
