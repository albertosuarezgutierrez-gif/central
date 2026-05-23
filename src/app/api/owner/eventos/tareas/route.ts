import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const evento_id = searchParams.get('evento_id')
  const templates = searchParams.get('templates') === 'true'

  if (templates) {
    // Listar plantillas de checklist
    let { data, error } = await supabase
      .from('checklist_templates')
      .select('*, items:checklist_template_items(*)')
      .eq('restaurante_id', restauranteId).eq('activo', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Si no hay plantillas, crear la de boda por defecto
    if (!data?.length) {
      await supabase.rpc('crear_checklist_defecto_boda', { p_restaurante_id: restauranteId })
      const res2 = await supabase.from('checklist_templates')
        .select('*, items:checklist_template_items(*)')
        .eq('restaurante_id', restauranteId).eq('activo', true)
      data = res2.data
    }
    return NextResponse.json({ templates: data ?? [] })
  }

  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id o templates=true' }, { status: 400 })

  const { data, error } = await supabase
    .from('evento_tareas')
    .select('*')
    .eq('evento_id', evento_id).eq('restaurante_id', restauranteId)
    .order('orden')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total = data?.length ?? 0
  const completadas = data?.filter(t => t.estado === 'completada').length ?? 0
  const vencidas = data?.filter(t => t.estado === 'pendiente' && t.fecha_limite && new Date(t.fecha_limite) < new Date()).length ?? 0

  return NextResponse.json({ tareas: data, resumen: { total, completadas, pendientes: total - completadas, vencidas } })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  // Aplicar template completo
  if (body.aplicar_template) {
    const { data, error } = await supabase.rpc('aplicar_checklist_evento', {
      p_evento_id: body.evento_id,
      p_template_id: body.template_id,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tareas_creadas: data })
  }

  // Tarea manual
  const { evento_id, titulo, descripcion, fecha_limite, responsable, orden } = body
  if (!evento_id || !titulo) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const { data, error } = await supabase.from('evento_tareas').insert({
    evento_id, restaurante_id: restauranteId, titulo, descripcion,
    fecha_limite, responsable: responsable ?? 'coordinador', orden: orden ?? 99,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tarea: data }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, estado, notas, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const patch: Record<string, unknown> = { ...updates }
  if (estado) {
    patch.estado = estado
    if (estado === 'completada') {
      patch.completada_por = session.id
      patch.completada_at = new Date().toISOString()
    }
  }
  if (notas !== undefined) patch.notas = notas

  const { data, error } = await supabase.from('evento_tareas').update(patch)
    .eq('id', id).eq('restaurante_id', restauranteId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tarea: data })
}
