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
  if (!evento_id) return NextResponse.json({ error: 'Falta evento_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('evento_personal')
    .select('*, personal:personal(id, nombre, rol)')
    .eq('evento_id', evento_id)
    .eq('local_id', restauranteId)
    .order('rol')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ personal: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { evento_id, personal_id, nombre_externo, rol, hora_inicio, hora_fin, coste_hora } = body

  const { data, error } = await supabase
    .from('evento_personal')
    .insert({ evento_id, restaurante_id: restauranteId, personal_id, nombre_externo, rol, hora_inicio, hora_fin, coste_hora })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asignacion: data }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id, ...updates } = await req.json()

  // Si confirma llamamiento, registrar canal y timestamp
  if (updates.confirmado !== undefined && updates.llamamiento_canal) {
    updates.llamamiento_enviado_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('evento_personal').update(updates)
    .eq('id', id).eq('local_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asignacion: data })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id } = await req.json()
  await supabase.from('evento_personal').delete()
    .eq('id', id).eq('local_id', restauranteId)

  return NextResponse.json({ ok: true })
}
