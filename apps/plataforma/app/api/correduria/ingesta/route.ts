import { NextResponse } from 'next/server'

import { getSession } from '@/lib/session'
import { leerIngestaCima } from '@/lib/correduria/ingesta-cima'

export const dynamic = 'force-dynamic'
// Dos llamadas al puerto de asegura (ingesta + huérfanas), cada una con su
// timeout de 8 s. El default de 10 s las dejaría a un pelo.
export const maxDuration = 30

/**
 * GET — la salud de la INGESTA de CIMA para la pantalla de la correduría.
 *
 * Es el MISMO lector que usa el cron `correduria-ingesta` (`leerIngestaCima`),
 * no una segunda implementación: si la pantalla y el Telegram pudieran discrepar
 * sobre el mismo hecho, Alberto dejaría de creerse los dos.
 *
 * 🚨 Responde SIEMPRE 200 con el estado dentro del cuerpo —`ok` /
 * `sin_configurar` / `error` con su motivo—, porque los tres son respuestas
 * válidas de este endpoint: «no he podido mirar» es información, no un fallo de
 * esta ruta. Lo que NO puede pasar es que un fallo llegue al navegador con forma
 * de «todo bien», y de eso se encarga `interpretarVistaIngesta`, que vuelve a
 * validar la forma al otro lado del cable.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    return NextResponse.json(await leerIngestaCima())
  } catch {
    // Un `throw` inesperado no puede acabar en un 500 sin cuerpo: la pantalla lo
    // leería como «respuesta ilegible» igual, pero con el motivo se sabe dónde
    // mirar.
    return NextResponse.json({ estado: 'error', motivo: 'respuesta_ilegible' })
  }
}
