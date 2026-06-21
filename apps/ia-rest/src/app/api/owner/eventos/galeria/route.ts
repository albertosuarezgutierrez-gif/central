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
  const pendiente_aprobar = searchParams.get('pendiente_aprobar')

  let query = supabase
    .from('evento_galeria')
    .select('*, evento:eventos(id, cliente_nombre)')
    .eq('local_id', restauranteId)
    .order('created_at', { ascending: false })

  if (evento_id) query = query.eq('evento_id', evento_id)
  if (pendiente_aprobar === 'true') query = query.eq('aprobada_marketing', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fotos: data })
}

export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id, ...updates } = await req.json()
  const { data, error } = await supabase
    .from('evento_galeria')
    .update(updates)
    .eq('id', id)
    .eq('local_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ foto: data })
}
