export const dynamic = 'force-dynamic'

// GET /api/comandas/activas
// ?camarero_id=xxx → solo del camarero
// ?todos=1         → todas las del turno activo
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { searchParams } = new URL(req.url)
  const camarero_id = searchParams.get('camarero_id')
  const todos = searchParams.get('todos') === '1'

  let q = supabase
    .from('comandas')
    .select(`id, estado, tipo, created_at,
      mesa:mesas(id, codigo, zona),
      camarero:camareros(id, nombre),
      items:comanda_items(cantidad, nombre, estado)`)
    .eq('restaurante_id', rid)
    .in('estado', ['nueva', 'en_cocina'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (!todos && camarero_id) {
    q = q.eq('camarero_id', camarero_id)
  }

  const { data, error } = await q
  if (error) {
    console.error('[comandas/activas]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ comandas: data ?? [] })
}
