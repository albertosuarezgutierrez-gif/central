export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const { id: inventarioId } = await params
  const { data, error } = await supabase
    .from('materiales_inventario_fisico_lineas')
    .select('id, inventario_id, material_id, cantidad_sistema, cantidad_contada, ajuste_generado, material:materiales(nombre, categoria)')
    .eq('inventario_id', inventarioId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lineas: data ?? [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()
  await params
  const { id, cantidad_contada } = await req.json()
  if (!id || cantidad_contada == null) return NextResponse.json({ error: 'id y cantidad_contada requeridos' }, { status: 400 })
  const { error } = await supabase
    .from('materiales_inventario_fisico_lineas')
    .update({ cantidad_contada: Number(cantidad_contada) })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
