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

  let query = supabase
    .from('personal_evento_asignacion')
    .select('*, personal:personal(id, nombre, rol)')
    .eq('restaurante_id', restauranteId)

  if (evento_id) query = query.eq('evento_id', evento_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asignaciones: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { data, error } = await supabase
    .from('personal_evento_asignacion')
    .insert({ ...body, restaurante_id: restauranteId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asignacion: data })
}

// PATCH — marcar pago extra / enviar recibo
export async function PATCH(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { id, accion, ...updates } = body

  let finalUpdates: Record<string, unknown> = updates

  if (accion === 'marcar_pagado') {
    finalUpdates = { estado_pago: 'pagado', pagado_at: new Date().toISOString() }
  } else if (accion === 'enviar_recibo') {
    finalUpdates = { recibo_enviado: true, recibo_enviado_at: new Date().toISOString() }
  }

  const { data, error } = await supabase
    .from('personal_evento_asignacion')
    .update(finalUpdates)
    .eq('id', id)
    .eq('restaurante_id', restauranteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asignacion: data })
}
