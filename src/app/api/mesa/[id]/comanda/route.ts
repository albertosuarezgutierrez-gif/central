// GET /api/mesa/[id]/comanda
// Devuelve la comanda activa de una mesa (estado nueva|en_cocina|cuenta)
// con todos sus items, camarero que la abrió y tiempo transcurrido

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: mesa_id } = await params
    const supabase = createServerClient()
    const rid = getRestauranteId(req)

    // Comanda activa más reciente de la mesa
    const { data: comanda, error } = await supabase
      .from('comandas')
      .select(`
        id, estado, tipo, created_at, numero_ticket,
        num_comensales, total_cobrado, estado_cobro,
        camarero:camareros(id, nombre),
        items:comanda_items(
          id, nombre, cantidad, notas, estado,
          precio_unitario, formato_nombre, created_at
        )
      `)
      .eq('mesa_id', mesa_id)
      .eq('restaurante_id', rid)
      .in('estado', ['nueva', 'en_cocina', 'cuenta'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!comanda) return NextResponse.json({ comanda: null })

    // Calcular total estimado
    const total = (comanda.items as { precio_unitario: number | null; cantidad: number }[])
      .reduce((acc, it) => acc + (it.precio_unitario ?? 0) * it.cantidad, 0)

    // Tiempo desde apertura
    const minutos = Math.floor((Date.now() - new Date(comanda.created_at).getTime()) / 60000)

    return NextResponse.json({ comanda: { ...comanda, total_estimado: total, minutos_abierta: minutos } })
  } catch (err) {
    console.error('[MESA COMANDA]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
