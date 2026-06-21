export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  getRestauranteId(req)
  const supabase = createServerClient()
  const { id: kitId } = await params
  const { data, error } = await supabase
    .from('materiales_kits_items')
    .select('id, kit_id, material_id, cantidad, material:materiales(nombre, categoria, unidad_medida)')
    .eq('kit_id', kitId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  getRestauranteId(req)
  const supabase = createServerClient()
  const { id: kitId } = await params
  const body = await req.json()
  if (!body.material_id) return NextResponse.json({ error: 'material_id requerido' }, { status: 400 })
  const { data, error } = await supabase.from('materiales_kits_items').insert({
    kit_id: kitId,
    material_id: body.material_id,
    cantidad: Number(body.cantidad) || 1,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  getRestauranteId(req)
  const supabase = createServerClient()
  await params
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const { error } = await supabase.from('materiales_kits_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
