import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('evento_conceptos_gasto')
    .select('*')
    .eq('local_id', restauranteId)
    .eq('activo', true)
    .order('orden')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si no hay conceptos, crear los por defecto
  if (!data?.length) {
    const { data: rest } = await supabase
      .from('restaurantes').select('cuenta_id').eq('id', restauranteId).single()
    await supabase.rpc('crear_conceptos_gasto_defecto', {
      p_restaurante_id: restauranteId,
      p_cuenta_id: rest?.cuenta_id ?? null,
    })
    const { data: nuevos } = await supabase
      .from('evento_conceptos_gasto')
      .select('*').eq('local_id', restauranteId).eq('activo', true).order('orden')
    return NextResponse.json({ conceptos: nuevos ?? [] })
  }

  return NextResponse.json({ conceptos: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { nombre, tipo, importe_defecto, icono, orden } = body

  const { data: rest } = await supabase
    .from('restaurantes').select('cuenta_id').eq('id', restauranteId).single()

  const { data, error } = await supabase
    .from('evento_conceptos_gasto')
    .insert({ local_id: restauranteId, cuenta_id: rest?.cuenta_id, nombre, tipo, importe_defecto, icono: icono ?? '💶', orden: orden ?? 99 })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ concepto: data }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id, ...updates } = await req.json()
  const { data, error } = await supabase
    .from('evento_conceptos_gasto').update(updates)
    .eq('id', id).eq('local_id', restauranteId)
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ concepto: data })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await req.json()
  await supabase.from('evento_conceptos_gasto').update({ activo: false })
    .eq('id', id).eq('local_id', restauranteId)
  return NextResponse.json({ ok: true })
}
