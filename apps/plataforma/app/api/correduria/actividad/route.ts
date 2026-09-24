import { NextResponse, type NextRequest } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { actividadAsegura } from '@/lib/actividad-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET — el muro de actividad de toda la cartera (puerto HTTP a central-asegura).
 *
 * Reenvía los filtros tal cual y devuelve la respuesta del puerto **con su mismo
 * status**: quien la interpreta es `interpretarActividad` en la pantalla, y un
 * error tiene que llegar como error y no como un muro vacío.
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta

  const params = new URL(req.url).searchParams
  const r = await actividadAsegura(params.toString())
  return NextResponse.json(r.json ?? { estado: 'error', motivo: 'respuesta_ilegible' }, { status: r.status })
}
