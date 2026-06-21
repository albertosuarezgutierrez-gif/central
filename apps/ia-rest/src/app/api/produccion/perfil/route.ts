export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET — tareas de hoy del cocinero logueado (personal_id = session.camarero_id),
//       ordenadas por orden, con tiempo estimado y estado.
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const cocineroId = session.camarero_id
  const hoy = new Date().toISOString().slice(0, 10)

  if (!cocineroId) {
    return NextResponse.json({ tareas: [], productividad: null, error: 'sesión sin camarero_id' })
  }

  const { data, error } = await supabase
    .from('produccion_tareas')
    .select('id, fecha, elaboracion_nombre, cantidad, tiempo_estimado_min, tiempo_real_min, orden, estado, started_at, done_at, seccion_cocina_id')
    .eq('restaurante_id', rid)
    .eq('personal_id', cocineroId)
    .eq('fecha', hoy)
    .order('orden', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tareas = data ?? []
  // Productividad del día: suma estimado vs real de las tareas hechas
  let estimado = 0
  let real = 0
  let hechas = 0
  for (const t of tareas) {
    if (t.estado === 'hecha') {
      estimado += Number(t.tiempo_estimado_min) || 0
      real += Number(t.tiempo_real_min) || 0
      hechas += 1
    }
  }
  const productividad = real > 0 ? Math.round((estimado / real) * 100) : null

  return NextResponse.json({
    tareas,
    productividad: { estimado_min: estimado, real_min: real, pct: productividad, tareas_hechas: hechas },
  })
}
