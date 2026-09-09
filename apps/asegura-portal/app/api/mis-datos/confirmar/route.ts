import { NextResponse } from 'next/server'

import { confirmarMisDatos } from '@/lib/mis-datos'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * POST /api/mis-datos/confirmar — «Siguen igual»: el cliente sella que los datos
 * de contacto que le hemos enseñado siguen siendo los suyos, sin tocar nada.
 *
 * 🚨 La identidad sale de la COOKIE, nunca del cuerpo — la misma regla que en
 * `/api/mis-datos` y `/api/peticiones`. Aquí el cuerpo NI SE LEE: no hay nada
 * que esta ruta necesite saber además de quién tiene la sesión. Si aceptara un
 * `identidadId`, cualquiera con sesión podría sellar como «revisados» los datos
 * de otra persona, y el sello es justo lo que apaga el aviso durante un año.
 *
 * El sello lo pone asegura (`POST /api/portal/contacto-confirmar`), que es
 * quien tiene la ficha; esta app solo devuelve lo que aquella dijo. Un fallo
 * del puente NO es un «confirmado»: sale con su código y su estado, y la
 * pantalla lo dice.
 */
export async function POST() {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error', causa: 'sin_sesion' }, { status: 401 })
  }

  const r = await confirmarMisDatos(identidad.id)
  const status =
    r.estado === 'ok' ? 200
      : r.estado === 'sin_puente' ? 503
        : r.estado === 'error' ? 502
          : 409
  return NextResponse.json(r, { status })
}
