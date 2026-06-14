export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const url = new URL(req.url)
  let q = supabase
    .from('materiales_reservas')
    .select('id, material_id, cantidad, fecha_desde, fecha_hasta, estado, notas, cliente_id, parent_tipo, parent_id, created_at, material:materiales(nombre, categoria), cliente:materiales_clientes(nombre)')
    .eq('restaurante_id', rid)
    .order('fecha_desde', { ascending: true })
  const materialId = url.searchParams.get('material_id')
  const estado = url.searchParams.get('estado')
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')
  if (materialId) q = q.eq('material_id', materialId)
  if (estado) q = q.eq('estado', estado)
  if (desde) q = q.gte('fecha_hasta', desde)
  if (hasta) q = q.lte('fecha_desde', hasta)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reservas: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.material_id) return NextResponse.json({ error: 'material_id requerido' }, { status: 400 })
  if (!body.fecha_desde || !body.fecha_hasta) return NextResponse.json({ error: 'fecha_desde y fecha_hasta requeridos' }, { status: 400 })
  const { data, error } = await supabase.from('materiales_reservas').insert({
    restaurante_id: rid,
    material_id: body.material_id,
    cantidad: Number(body.cantidad) || 1,
    fecha_desde: body.fecha_desde,
    fecha_hasta: body.fecha_hasta,
    cliente_id: body.cliente_id ?? null,
    parent_tipo: body.parent_tipo ?? null,
    parent_id: body.parent_id ?? null,
    estado: 'confirmada',
    notas: body.notas ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reserva: data })
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const { error } = await supabase.from('materiales_reservas').update({ estado: 'cancelada' }).eq('id', id).eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
