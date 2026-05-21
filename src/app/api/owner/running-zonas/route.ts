export const dynamic = 'force-dynamic'

// /api/owner/running-zonas — Gestión de zonas asignadas a runnings
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const url = new URL(req.url)
  const camareroId = url.searchParams.get('camarero_id')

  let query = supabase
    .from('running_zonas')
    .select('id, camarero_id, zona_id, activo, created_at, zonas(id, nombre, tipo)')
    .eq('restaurante_id', rid)

  if (camareroId) query = query.eq('camarero_id', camareroId)

  const { data, error } = await query.order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { camarero_id, zona_id } = await req.json()

  if (!camarero_id || !zona_id)
    return NextResponse.json({ error: 'camarero_id y zona_id requeridos' }, { status: 400 })

  // Verificar que el camarero es running y del restaurante
  const { data: cam } = await supabase
    .from('personal')
    .select('rol')
    .eq('id', camarero_id)
    .eq('restaurante_id', rid)
    .single()

  if (!cam) return NextResponse.json({ error: 'Camarero no encontrado' }, { status: 404 })
  if (cam.rol !== 'running')
    return NextResponse.json({ error: 'Solo los runnings pueden tener zonas asignadas' }, { status: 400 })

  const { data, error } = await supabase
    .from('running_zonas')
    .upsert(
      { camarero_id, zona_id, restaurante_id: rid, activo: true },
      { onConflict: 'camarero_id,zona_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id, activo } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('running_zonas')
    .update({ activo })
    .eq('id', id)
    .eq('restaurante_id', rid)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabase
    .from('running_zonas')
    .delete()
    .eq('id', id)
    .eq('restaurante_id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
