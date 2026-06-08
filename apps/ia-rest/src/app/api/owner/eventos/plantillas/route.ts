import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('plantillas_evento')
    .select('*, menu_evento:menus_evento(id,nombre), barra:barra_tiers(id,nombre)')
    .eq('local_id', restauranteId)
    .eq('activa', true)
    .order('usos', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plantillas: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  if (!body.nombre) return NextResponse.json({ error: 'Falta nombre' }, { status: 400 })

  const { data, error } = await supabase
    .from('plantillas_evento')
    .insert({ ...body, local_id: restauranteId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plantilla: data })
}
