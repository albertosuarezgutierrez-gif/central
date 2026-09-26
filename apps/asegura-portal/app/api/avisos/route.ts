import { NextResponse } from 'next/server'

import { autorizacionesDeIdentidad } from '@/lib/autorizaciones'
import { avisosDe, type Avisos } from '@/lib/avisos'
import { anulacionesPendientes } from '@/lib/anulacion-firma'
import { carnetsDeIdentidad } from '@/lib/carnets'
import { felicitacionesDeIdentidad } from '@/lib/felicitaciones'
import { reparosDeMisDatos } from '@/lib/mis-datos'
import { obligacionesDeIdentidad } from '@/lib/obligaciones'
import { peticionesDeIdentidad } from '@/lib/peticiones'
import { partesAvisoDeIdentidad } from '@/lib/partes-aviso'
import { polizasNuevasDeIdentidad } from '@/lib/polizas-nuevas'
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

  const [autorizaciones, obligaciones, peticiones, datos, carnets, firmas, felicitaciones, polizasNuevas, partes] = await Promise.allSettled([
    autorizacionesDeIdentidad(identidad.id),
    obligacionesDeIdentidad(identidad.id),
    peticionesDeIdentidad(identidad.id),
    // Esta cuarta sale por el PUENTE a `apps/asegura` (la dirección va cifrada
    // y esta app no tiene la clave), así que es la que más fácil falla — razón
    // de más para que vaya en el `allSettled` y no tumbe a las otras tres.
    reparosDeMisDatos(identidad.id),
    // Quinta, mismo puente: la fecha de carné y de nacimiento también van cifradas.
    carnetsDeIdentidad(identidad.id),
    // Sexta, mismo puente: las anulaciones que esperan su firma (solo del tomador, lo decide asegura).
    anulacionesPendientes(identidad.id),
    // Séptima: la felicitación de cumpleaños de hoy (la escribe el cron de asegura).
    felicitacionesDeIdentidad(identidad.id),
    // Octava: las pólizas nuevas (emitidas o recién llegadas por CIMA), con el cambio de compañía si lo es.
    polizasNuevasDeIdentidad(identidad.id),
    partesAvisoDeIdentidad(identidad.id),
  ])

  // Se deja rastro del fallo: la respuesta lo declara, pero sin el error en el
  // log nadie sabría POR QUÉ el globo lleva `+`.
  if (autorizaciones.status === 'rejected') console.error('[avisos] autorizaciones ilegibles', autorizaciones.reason)
  if (obligaciones.status === 'rejected') console.error('[avisos] obligaciones ilegibles', obligaciones.reason)
  if (peticiones.status === 'rejected') console.error('[avisos] peticiones ilegibles', peticiones.reason)
  if (datos.status === 'rejected') console.error('[avisos] datos de contacto ilegibles', datos.reason)
  if (carnets.status === 'rejected') console.error('[avisos] carnés ilegibles', carnets.reason)
  if (firmas.status === 'rejected') console.error('[avisos] firmas pendientes ilegibles', firmas.reason)
  if (felicitaciones.status === 'rejected') console.error('[avisos] felicitaciones ilegibles', felicitaciones.reason)
  if (polizasNuevas.status === 'rejected') console.error('[avisos] pólizas nuevas ilegibles', polizasNuevas.reason)
  if (partes.status === 'rejected') console.error('[avisos] partes ilegibles', partes.reason)
  // `null` del puente = no se pudo mirar (no «no hay»).
  const firmasLeidas = firmas.status === 'fulfilled' && firmas.value !== null
    ? firmas.value.anulaciones.map((a) => ({ id: a.id, compania: a.compania }))
    : null

  const respuesta: Avisos = avisosDe({
    autorizaciones: autorizaciones.status === 'fulfilled' ? autorizaciones.value : null,
    obligaciones: obligaciones.status === 'fulfilled' ? obligaciones.value : null,
    peticiones: peticiones.status === 'fulfilled' ? peticiones.value.recibidas : null,
    datos: datos.status === 'fulfilled' ? datos.value : null,
    carnets: carnets.status === 'fulfilled' ? carnets.value : null,
    firmas: firmasLeidas,
    felicitaciones: felicitaciones.status === 'fulfilled' ? felicitaciones.value : null,
    polizasNuevas: polizasNuevas.status === 'fulfilled' ? polizasNuevas.value : null,
    partes: partes.status === 'fulfilled' ? partes.value : null,
    hoy: new Date(),
  })

  // Sin caché: lo que dice la campana cambia al aceptar o revocar, y una copia
  // guardada seguiría enseñando el aviso ya resuelto.
  return NextResponse.json(respuesta, { headers: { 'cache-control': 'no-store' } })
}
