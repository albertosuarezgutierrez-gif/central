export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)

  const { comanda_item_id, peso_gramos } = await req.json()
  if (!comanda_item_id || !peso_gramos || peso_gramos <= 0) {
    return NextResponse.json({ error: 'Faltan campos o peso inválido' }, { status: 400 })
  }

  // Obtener item + precio_por_kg del producto
  const { data: item, error: itemErr } = await supabase
    .from('comanda_items')
    .select('id, nombre, producto_id, precio_unitario, restaurante_id, comanda_id, productos(precio_por_kg)')
    .eq('id', comanda_item_id)
    .eq('local_id', restauranteId)
    .single()

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })
  }

  // Calcular precio según peso real
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const precioPorKg = (item.productos as any)?.precio_por_kg as number | null
  const precioCalculado = precioPorKg
    ? parseFloat((precioPorKg * peso_gramos / 1000).toFixed(2))
    : item.precio_unitario

  // Actualizar comanda_item con peso y precio calculado
  const { error: updateErr } = await supabase
    .from('comanda_items')
    .update({
      peso_gramos,
      pesado_en_cocina: true,
      precio_unitario: precioCalculado,
      precio_kg_en_venta: precioPorKg,
    })
    .eq('id', comanda_item_id)
    .eq('local_id', restauranteId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Registrar salida en stock_movimientos (si el producto tiene stock)
  if (item.producto_id) {
    const cantidad = -(peso_gramos / 1000) // negativo = salida, en kg
    await supabase.from('stock_movimientos').insert({
      local_id: restauranteId,
      producto_id: item.producto_id,
      tipo: 'salida_venta_directa',
      cantidad,
      unidad: 'kg',
      referencia_id: comanda_item_id,
      referencia_tipo: 'comanda_item',
      notas: `${item.nombre} · ${peso_gramos}g · comanda ${item.comanda_id}`,
    })
  }

  return NextResponse.json({
    ok: true,
    peso_gramos,
    precio_calculado: precioCalculado,
    precio_kg: precioPorKg,
  })
}
