import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { productos, ...updates } = body

  const { data, error } = await supabase
    .from('barra_tiers')
    .update(updates)
    .eq('id', id)
    .eq('restaurante_id', restauranteId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Reemplazar productos si se envían
  if (productos) {
    await supabase.from('barra_tier_productos').delete().eq('tier_id', id)
    if (productos.length) {
      await supabase.from('barra_tier_productos').insert(
        productos.map((p: { producto_id: string; categoria?: string; es_sin_alcohol?: boolean }) => ({
          restaurante_id: restauranteId, tier_id: id,
          producto_id: p.producto_id, categoria: p.categoria, es_sin_alcohol: !!p.es_sin_alcohol
        }))
      )
    }
  }

  return NextResponse.json({ tier: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { error } = await supabase
    .from('barra_tiers')
    .update({ activo: false })
    .eq('id', id)
    .eq('restaurante_id', restauranteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
