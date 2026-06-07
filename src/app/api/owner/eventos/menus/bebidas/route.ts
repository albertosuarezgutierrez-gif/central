// src/app/api/owner/eventos/menus/bebidas/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// GET ?menu_id=xxx — cargar bebidas de un menú
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const menuId = searchParams.get('menu_id')
  if (!menuId) return NextResponse.json({ error: 'Falta menu_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('menu_bebidas_evento')
    .select('*, botellas:menu_bebidas_botellas(*)')
    .eq('menu_id', menuId)
    .eq('local_id', restauranteId)
    .eq('activo', true)
    .order('orden')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bebidas: data ?? [] })
}

// POST — crear o actualizar bloque de bebidas
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const body = await req.json()
  const { botellas, ...bebidaData } = body

  const { data: bebida, error: e1 } = await supabase
    .from('menu_bebidas_evento')
    .upsert({
      ...bebidaData,
      restaurante_id: restauranteId,
    })
    .select()
    .single()

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  // Reemplazar botellas si se enviaron
  if (Array.isArray(botellas)) {
    await supabase
      .from('menu_bebidas_botellas')
      .delete()
      .eq('bebida_evento_id', bebida.id)

    if (botellas.length > 0) {
      const { error: e2 } = await supabase.from('menu_bebidas_botellas').insert(
        botellas.map((b: Record<string, unknown>, i: number) => ({
          ...b,
          bebida_evento_id: bebida.id,
          restaurante_id: restauranteId,
          orden: i,
        }))
      )
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, bebida })
}

// DELETE ?bebida_id=xxx
export async function DELETE(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()

  const { searchParams } = new URL(req.url)
  const bebidaId = searchParams.get('bebida_id')
  if (!bebidaId) return NextResponse.json({ error: 'Falta bebida_id' }, { status: 400 })

  const { error } = await supabase
    .from('menu_bebidas_evento')
    .update({ activo: false })
    .eq('id', bebidaId)
    .eq('local_id', restauranteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
