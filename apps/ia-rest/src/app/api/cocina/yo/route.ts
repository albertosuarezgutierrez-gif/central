export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

/**
 * GET /api/cocina/yo — rol de cocina (responsable | cocinero | preparacion) y
 * partidas asignadas del usuario actual. Define qué ve en /produccion.
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session  = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  const { data } = await supabase
    .from('personal')
    .select('nombre, cocina_rol, partidas')
    .eq('id', session.id)
    .eq('local_id', rid)
    .maybeSingle()

  return NextResponse.json({
    nombre: data?.nombre ?? session.nombre ?? '',
    cocina_rol: data?.cocina_rol ?? 'responsable',
    partidas: data?.partidas ?? [],
  })
}
