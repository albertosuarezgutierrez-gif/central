import { NextResponse } from 'next/server'

import { carnetsPorTitularDeIdentidad, escribirCarnet } from '@/lib/carnets'
import { statusEscrituraCarnet, type OperacionCarnet } from '@/lib/carnets-escritura'

/**
 * Escribe por el puente y, si sale, devuelve la lista NUEVA de titulares para pintar sin recargar.
 * Si la relectura falla, `titulares: null`: lo guardado sigue guardado, y la pantalla lo dice («recarga
 * para verlo») en vez de pintar una lista vieja como si fuera la buena.
 */
export async function escribirYResponder(identidadId: string, op: OperacionCarnet): Promise<NextResponse> {
  const r = await escribirCarnet(identidadId, op)
  if (r.estado !== 'ok') return NextResponse.json(r, { status: statusEscrituraCarnet(r.estado) })
  const titulares = await carnetsPorTitularDeIdentidad(identidadId).catch((e: unknown) => {
    console.error('[mis-datos/carnets] guardado, pero no se pudo releer la lista:', e instanceof Error ? e.message : e)
    return null
  })
  return NextResponse.json({ ...r, titulares }, { status: statusEscrituraCarnet('ok', op.accion === 'alta') })
}
