import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

// GET /api/owner/formatos?producto_id=xxx → lista formatos del producto
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const producto_id = req.nextUrl.searchParams.get('producto_id')

  const query = supabase
    .from('producto_formatos')
    .select('*')
    .eq('restaurante_id', rid)
    .order('orden')

  const finalQuery = producto_id ? query.eq('producto_id', producto_id) : query

  const { data, error } = await finalQuery
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ formatos: data })
}

// POST → crear formato
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const body = await req.json()
  const { producto_id, nombre, precio, orden } = body
  if (!producto_id || !nombre || precio == null)
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const { data, error } = await supabase.from('producto_formatos')
    .insert({ producto_id, nombre, precio: Number(precio), orden: orden ?? 0, restaurante_id: rid })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ formato: data })
}

// PUT → actualizar formato
export async function PUT(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { data, error } = await supabase.from('producto_formatos')
    .update(fields)
    .eq('id', id)
    .eq('restaurante_id', rid)
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ formato: data })
}

// DELETE → borrar formato
export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { error } = await supabase.from('producto_formatos')
    .delete()
    .eq('id', id)
    .eq('restaurante_id', rid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
