import { NextRequest, NextResponse } from 'next/server'
import { getSession, getRestauranteId } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: espacioId } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('espacio_mantenimiento')
    .select('*')
    .eq('local_id', restauranteId)
    .eq('espacio_id', espacioId)
    .order('proxima_revision', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: espacioId } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()

  const { data, error } = await supabase
    .from('espacio_mantenimiento')
    .insert({
      restaurante_id: restauranteId,
      espacio_id: espacioId,
      tipo: body.tipo,
      descripcion: body.descripcion,
      periodicidad_dias: body.periodicidad_dias,
      ultima_revision: body.ultima_revision || null,
      proxima_revision: body.proxima_revision,
      alerta_dias_antes: body.alerta_dias_antes ?? 30,
      proveedor_nombre: body.proveedor_nombre || null,
      coste_estimado: body.coste_estimado || null,
      notas: body.notas || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: espacioId } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  const { itemId, ...updates } = body

  if (updates.ultima_revision) {
    const { data: item } = await supabase
      .from('espacio_mantenimiento')
      .select('periodicidad_dias')
      .eq('id', itemId)
      .eq('espacio_id', espacioId)
      .single()

    if (item) {
      const proxima = new Date(updates.ultima_revision)
      proxima.setDate(proxima.getDate() + item.periodicidad_dias)
      updates.proxima_revision = proxima.toISOString().split('T')[0]
      updates.notificado_at = null
    }
  }

  const { data, error } = await supabase
    .from('espacio_mantenimiento')
    .update(updates)
    .eq('id', itemId)
    .eq('local_id', restauranteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: espacioId } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const itemId = searchParams.get('itemId')

  const { error } = await supabase
    .from('espacio_mantenimiento')
    .delete()
    .eq('id', itemId!)
    .eq('local_id', restauranteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
