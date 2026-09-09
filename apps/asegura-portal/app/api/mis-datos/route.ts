import { NextResponse } from 'next/server'
import { z } from 'zod'

import { guardarMisDatos } from '@/lib/mis-datos'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * POST /api/mis-datos — el cliente corrige SUS datos de contacto (dirección,
 * teléfono, correo).
 *
 * 🚨 La identidad sale de la COOKIE, nunca del cuerpo. Es la misma regla que en
 * `/api/peticiones`: quien escribe es quien tiene la sesión. Si el cuerpo
 * pudiera decir de quién es la dirección, cualquiera con sesión le cambiaría el
 * domicilio a cualquiera.
 *
 * Los topes de aquí son de FORMA (que no llegue un cuerpo enorme); las reglas de
 * verdad —longitudes por campo, forma del CP, del teléfono y del correo— las
 * aplica asegura con las MISMAS funciones que validan cuando lo corrige Alberto.
 *
 * El teléfono y el correo NO admiten `null`: desde el portal se cambian por
 * otro, no se borran. Sin ninguno de los dos no habría por dónde avisarle.
 */
const Entrada = z.object({
  direccion: z.string().max(400).nullable().optional(),
  codigoPostal: z.string().max(20).nullable().optional(),
  ciudad: z.string().max(200).nullable().optional(),
  provincia: z.string().max(200).nullable().optional(),
  telefono: z.string().max(40).optional(),
  email: z.string().max(255).optional(),
})

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error', causa: 'sin_sesion' }, { status: 401 })
  }

  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ estado: 'invalido', motivo: 'datos_invalidos', campo: null }, { status: 400 })

  const r = await guardarMisDatos(identidad.id, parsed.data)
  const status =
    r.estado === 'ok' || r.estado === 'sin_cambios' ? 200
      : r.estado === 'invalido' ? 422
        : r.estado === 'sin_puente' ? 503
          : r.estado === 'error' ? 502
            : 409
  return NextResponse.json(r, { status })
}
