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
    .from('evento_sobrantes').select('*')
    .eq('evento_id', evento_id).eq('restaurante_id', restauranteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sobrantes: data })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient()
  const body = await req.json()
  const { evento_id, nombre, cantidad_pedida, cantidad_consumida, unidad, stock_articulo_id, notas } = body
  if (!evento_id || !nombre) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  const cantidad_sobrante = cantidad_pedida && cantidad_consumida ? cantidad_pedida - cantidad_consumida : null
  const porcentaje_merma = cantidad_pedida && cantidad_sobrante ? Math.round(cantidad_sobrante / cantidad_pedida * 100 * 10) / 10 : null
  const { data, error } = await supabase.from('evento_sobrantes').insert({
    evento_id, restaurante_id: restauranteId, nombre,
    cantidad_pedida, cantidad_consumida, cantidad_sobrante,
    unidad, stock_articulo_id, porcentaje_merma, notas,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si hay sobrante y stock_articulo_id, devolver al almacén automáticamente
  if (cantidad_sobrante && cantidad_sobrante > 0 && stock_articulo_id) {
    await supabase.from('stock_movimientos').insert({
      restaurante_id: restauranteId,
      stock_articulo_id,
      tipo: 'entrada',
      cantidad: cantidad_sobrante,
      motivo: `Sobrante evento ${evento_id}`,
    })
    await supabase.from('evento_sobrantes').update({ devuelto_almacen: true }).eq('id', data.id)
  }

  return NextResponse.json({ sobrante: data }, { status: 201 })
}
