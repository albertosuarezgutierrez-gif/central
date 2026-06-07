import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('espacios_evento')
    .select('*')
    .eq('local_id', restauranteId)
    .eq('activo', true)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ espacios: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { nombre, tipo, aforo_maximo, direccion, descripcion } = body

  const { data: rest } = await supabase
    .from('restaurantes').select('cuenta_id').eq('id', restauranteId).single()

  const { data, error } = await supabase
    .from('espacios_evento')
    .insert({ restaurante_id: restauranteId, cuenta_id: rest?.cuenta_id, nombre, tipo, aforo_maximo, direccion, descripcion })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ espacio: data }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id, ...updates } = await req.json()
  const { data, error } = await supabase
    .from('espacios_evento').update(updates)
    .eq('id', id).eq('local_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ espacio: data })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id } = await req.json()
  await supabase.from('espacios_evento').update({ activo: false })
    .eq('id', id).eq('local_id', restauranteId)

  return NextResponse.json({ ok: true })
}
