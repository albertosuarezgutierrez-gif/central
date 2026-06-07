import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const comercial_id = searchParams.get('comercial_id')
  const desde = searchParams.get('desde') || new Date().toISOString()
  const hasta = searchParams.get('hasta')

  let query = supabase
    .from('comercial_agenda')
    .select(`
      *,
      comercial:personal!comercial_id(id, nombre),
      briefing:evento_briefing(id, cliente_nombre, estado),
      evento:eventos(id, cliente_nombre, fecha_evento)
    `)
    .eq('local_id', restauranteId)
    .gte('fecha_hora', desde)
    .order('fecha_hora')

  if (comercial_id) query = query.eq('comercial_id', comercial_id)
  if (hasta) query = query.lte('fecha_hora', hasta)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agenda: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  if (!body.titulo || !body.fecha_hora || !body.tipo)
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })

  const { data, error } = await supabase
    .from('comercial_agenda')
    .insert({
      ...body,
      local_id: restauranteId,
      comercial_id: body.comercial_id || session.id
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id, ...updates } = await req.json()
  if (updates.completado) updates.completado_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('comercial_agenda')
    .update(updates)
    .eq('id', id)
    .eq('local_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
