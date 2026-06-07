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
    .from('evento_pases')
    .select('*, items:evento_pase_items(id, nombre, cantidad, precio_unitario, notas, estado, producto_id)')
    .eq('evento_id', evento_id)
    .eq('local_id', restauranteId)
    .order('numero_pase')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pases: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { evento_id, numero_pase, nombre, hora_prevista, comensales, notas, items } = body

  const { data: pase, error } = await supabase
    .from('evento_pases')
    .insert({ evento_id, restaurante_id: restauranteId, numero_pase, nombre, hora_prevista, comensales, notas })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (items?.length) {
    await supabase.from('evento_pase_items').insert(
      items.map((i: { nombre: string; cantidad: number; precio_unitario?: number; notas?: string; producto_id?: string }) => ({
        pase_id: pase.id,
        evento_id,
        restaurante_id: restauranteId,
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        notas: i.notas,
        producto_id: i.producto_id,
      }))
    )
  }

  return NextResponse.json({ pase }, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { id, ...updates } = await req.json()

  // Si se marca como listo, registrar hora real
  if (updates.estado === 'listo' && !updates.hora_real) {
    updates.hora_real = new Date().toTimeString().slice(0, 5)
  }

  const { data, error } = await supabase
    .from('evento_pases').update(updates)
    .eq('id', id).eq('local_id', restauranteId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pase: data })
}
