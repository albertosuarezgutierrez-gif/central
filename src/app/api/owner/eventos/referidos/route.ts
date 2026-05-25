import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('evento_referidos')
    .select(`
      *, 
      evento_origen:eventos!evento_origen_id(id, cliente_nombre, fecha_evento),
      evento_referido:eventos!evento_referido_id(id, cliente_nombre, fecha_evento)
    `)
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ referidos: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { data, error } = await supabase
    .from('evento_referidos')
    .insert({ ...body, restaurante_id: restauranteId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ referido: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id, ...updates } = await req.json()
  const { data, error } = await supabase
    .from('evento_referidos')
    .update(updates)
    .eq('id', id)
    .eq('restaurante_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ referido: data })
}
