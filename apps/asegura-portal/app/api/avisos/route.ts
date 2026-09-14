import { NextResponse } from 'next/server'

import { autorizacionesDeIdentidad } from '@/lib/autorizaciones'
import { avisosDe, type Avisos } from '@/lib/avisos'
import { obligacionesDeIdentidad } from '@/lib/obligaciones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * GET /api/avisos — lo que la campana de la cabecera pinta: las autorizaciones
 * pendientes (recibidas y otorgadas) y los vencimientos en ventana de la persona
 * que tiene la sesión.
 *
 * La identidad SIEMPRE sale de la cookie, nunca de un query param. Las dos
 * lecturas van con `allSettled` y no con `all` a propósito: si una falla, la
 * otra se sirve igual y el fallo se DECLARA en `fuentesIlegibles` — el globo
 * pasa a `n+` o `!`. Con `all`, un fallo en las obligaciones se llevaría por
 * delante la autorización que alguien está esperando que se acepte; con un
 * `catch` que devolviera `[]`, la campana diría «sin avisos» sobre algo que no
 * se ha mirado.
 *
 * Esta ruta no decide nada: la lista y el globo los compone `lib/avisos.ts`,
 * que es puro y tiene su test.
 */
export async function GET() {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const [autorizaciones, obligaciones] = await Promise.allSettled([
    autorizacionesDeIdentidad(identidad.id),
    obligacionesDeIdentidad(identidad.id),
  ])

  // Se deja rastro del fallo: la respuesta lo declara, pero sin el error en el
  // log nadie sabría POR QUÉ el globo lleva `+`.
  if (autorizaciones.status === 'rejected') console.error('[avisos] autorizaciones ilegibles', autorizaciones.reason)
  if (obligaciones.status === 'rejected') console.error('[avisos] obligaciones ilegibles', obligaciones.reason)

  const datos: Avisos = avisosDe({
    autorizaciones: autorizaciones.status === 'fulfilled' ? autorizaciones.value : null,
    obligaciones: obligaciones.status === 'fulfilled' ? obligaciones.value : null,
    hoy: new Date(),
  })

  // Sin caché: lo que dice la campana cambia al aceptar o revocar, y una copia
  // guardada seguiría enseñando el aviso ya resuelto.
  return NextResponse.json(datos, { headers: { 'cache-control': 'no-store' } })
}
