import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const ESTADOS = ['nuevo','contactado','presupuesto_enviado','negociacion','ganado','perdido']

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')
  const coordinador_id = searchParams.get('coordinador_id')
  const lead_id = searchParams.get('id')

  if (lead_id) {
    const { data, error } = await supabase
      .from('leads_evento')
      .select('*, notas:leads_evento_notas(*), espacio:espacios_evento(id,nombre), coordinador:personal(id,nombre)')
      .eq('id', lead_id).eq('restaurante_id', restauranteId).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ lead: data })
  }

  let query = supabase
    .from('leads_evento')
    .select('*, espacio:espacios_evento(nombre), coordinador:personal(nombre)')
    .eq('restaurante_id', restauranteId)
    .order('updated_at', { ascending: false })

  // El coordinador solo ve sus propios leads
  if (session.rol === 'coordinador_eventos') {
    query = query.eq('coordinador_id', session.id)
  } else if (coordinador_id) {
    query = query.eq('coordinador_id', coordinador_id)
  }
  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pipeline stats
  const pipeline = ESTADOS.reduce((acc, e) => {
    acc[e] = data?.filter(l => l.estado === e).length ?? 0
    return acc
  }, {} as Record<string, number>)

  const valor_pipeline = data
    ?.filter(l => !['perdido'].includes(l.estado))
    .reduce((s, l) => s + (l.presupuesto_cliente ?? 0), 0) ?? 0

  return NextResponse.json({ leads: data, pipeline, valor_pipeline })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  const { nombre_cliente, email, telefono, tipo_evento, fecha_tentativa,
    aforo_estimado, espacio_id, presupuesto_cliente, proxima_accion,
    proxima_accion_fecha, notas, origen } = body

  if (!nombre_cliente) return NextResponse.json({ error: 'Falta nombre del cliente' }, { status: 400 })

  const { data, error } = await supabase
    .from('leads_evento')
    .insert({
      restaurante_id: restauranteId,
      coordinador_id: session.rol === 'coordinador_eventos' ? session.id : (body.coordinador_id ?? session.id),
      nombre_cliente, email, telefono, tipo_evento: tipo_evento ?? 'boda',
      fecha_tentativa, aforo_estimado, espacio_id, presupuesto_cliente,
      proxima_accion, proxima_accion_fecha, notas,
      origen: origen ?? 'manual',
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, nota, tipo_nota, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  // Si viene una nota, añadirla
  if (nota) {
    await supabase.from('leads_evento_notas').insert({
      lead_id: id, restaurante_id: restauranteId,
      personal_id: session.id,
      contenido: nota, tipo: tipo_nota ?? 'nota',
    })
  }

  // Si el estado cambia a 'ganado', registrar fecha de conversión
  if (updates.estado === 'ganado' && !updates.convertido_at) {
    updates.convertido_at = new Date().toISOString()
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('leads_evento').update(updates)
    .eq('id', id).eq('restaurante_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await req.json()
  await supabase.from('leads_evento').update({ estado: 'perdido', motivo_perdida: 'Eliminado manualmente' })
    .eq('id', id).eq('restaurante_id', restauranteId)
  return NextResponse.json({ ok: true })
}
