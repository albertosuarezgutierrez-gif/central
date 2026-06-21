export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST — body { tarea_id, accion: 'empezar'|'terminar' }
//   empezar  → estado 'en_proceso', started_at = now
//   terminar → estado 'hecha', done_at = now, tiempo_real_min = minutos started_at..now
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { tarea_id, accion } = await req.json() as { tarea_id?: string; accion?: 'empezar' | 'terminar' }
  if (!tarea_id || (accion !== 'empezar' && accion !== 'terminar')) {
    return NextResponse.json({ error: 'tarea_id y accion (empezar|terminar) requeridos' }, { status: 400 })
  }

  const ahora = new Date()

  if (accion === 'empezar') {
    const { data, error } = await supabase
      .from('produccion_tareas')
      .update({ estado: 'en_proceso', started_at: ahora.toISOString() })
      .eq('id', tarea_id)
      .eq('restaurante_id', rid)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tarea: data })
  }

  // terminar — necesitamos started_at para calcular el tiempo real
  const { data: actual, error: errGet } = await supabase
    .from('produccion_tareas')
    .select('started_at')
    .eq('id', tarea_id)
    .eq('restaurante_id', rid)
    .single()
  if (errGet) return NextResponse.json({ error: errGet.message }, { status: 500 })

  let tiempoReal: number | null = null
  if (actual?.started_at) {
    const ms = ahora.getTime() - new Date(actual.started_at).getTime()
    tiempoReal = Math.max(0, Math.round((ms / 60000) * 10) / 10) // minutos, 1 decimal
  }

  const { data, error } = await supabase
    .from('produccion_tareas')
    .update({ estado: 'hecha', done_at: ahora.toISOString(), tiempo_real_min: tiempoReal })
    .eq('id', tarea_id)
    .eq('restaurante_id', rid)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tarea: data })
}
