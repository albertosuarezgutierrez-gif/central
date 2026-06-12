export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

// POST { kit_id, cantidad, espacio_destino_id?, notas? }
// Expande kit × N generando N movimientos tipo 'salida' (uno por item × cantidad)
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()
  const { kit_id, cantidad, espacio_destino_id, notas } = await req.json()
  const n = Number(cantidad)
  if (!kit_id || !(n > 0)) return NextResponse.json({ error: 'kit_id y cantidad requeridos' }, { status: 400 })

  const { data: items, error: eItems } = await supabase
    .from('materiales_kits_items')
    .select('material_id, cantidad')
    .eq('kit_id', kit_id)
  if (eItems || !items?.length) return NextResponse.json({ error: 'Kit sin items o no encontrado' }, { status: 404 })

  const movimientos: { material_id: string; cantidad: number }[] = []
  for (const item of items) {
    const totalCant = item.cantidad * n
    const { data: mat } = await supabase
      .from('materiales')
      .select('cantidad_disponible')
      .eq('id', item.material_id).eq('restaurante_id', rid).single()
    if (!mat || (mat.cantidad_disponible ?? 0) < totalCant) {
      return NextResponse.json({ error: `Stock insuficiente para material ${item.material_id} (necesario: ${totalCant}, disponible: ${mat?.cantidad_disponible ?? 0})` }, { status: 409 })
    }
    movimientos.push({ material_id: item.material_id, cantidad: totalCant })
  }

  const insertados = []
  for (const mv of movimientos) {
    const { data: mov } = await supabase.from('materiales_movimientos').insert({
      restaurante_id: rid,
      material_id: mv.material_id,
      tipo: 'salida',
      cantidad: mv.cantidad,
      espacio_destino_id: espacio_destino_id ?? null,
      notas: notas ?? `Kit ×${n}`,
      realizado_por: session.camarero_id ?? null,
      fecha: new Date().toISOString().slice(0, 10),
    }).select().single()
    if (mov) {
      insertados.push(mov)
      const { data: matActual } = await supabase.from('materiales').select('cantidad_disponible').eq('id', mv.material_id).single()
      if (matActual) {
        await supabase.from('materiales').update({
          cantidad_disponible: Math.max(0, (matActual.cantidad_disponible ?? 0) - mv.cantidad),
          updated_at: new Date().toISOString(),
        }).eq('id', mv.material_id).eq('restaurante_id', rid)
      }
    }
  }

  return NextResponse.json({ movimientos: insertados, total: insertados.length })
}
