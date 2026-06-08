// ia.rest · TheFork POS API v1 — Cierre de orden
//
// ia.rest llama a este endpoint internamente al cerrar una comanda
// Docs: https://docs.thefork.io/POS-API/Flow/close-order
// TheFork endpoint: PUT https://api.thefork.io/pos/v1/orders/{ORDER_UUID}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  const { mesa_id, restaurante_id, importe_total, items } = await req.json()
  if (!mesa_id || !restaurante_id) {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  }

  // Buscar thefork_order_id de la mesa
  const { data: mesa } = await supabase
    .from('mesas')
    .select('thefork_order_id')
    .eq('id', mesa_id)
    .single()

  if (!mesa?.thefork_order_id) {
    // Mesa no viene de TheFork — OK, nada que hacer
    return NextResponse.json({ ok: true, skipped: true })
  }

  // Obtener credenciales TheFork del restaurante
  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('thefork_secret, thefork_customer_id')
    .eq('id', restaurante_id)
    .single()

  if (!restaurante?.thefork_secret) {
    return NextResponse.json({ ok: true, skipped: 'no thefork credentials' })
  }

  // Llamar a TheFork API para cerrar la orden
  // Docs: PUT /pos/v1/orders/{orderId}
  const tfApiKey = process.env.THEFORK_API_KEY
  if (!tfApiKey) {
    console.warn('[TheFork] THEFORK_API_KEY no configurada')
    return NextResponse.json({ ok: true, skipped: 'no api key' })
  }

  try {
    const res = await fetch(
      `https://api.thefork.io/pos/v1/orders/${mesa.thefork_order_id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': tfApiKey,
        },
        body: JSON.stringify({
          mealStatus: 'LEFT',
          totalAmount: importe_total ? Math.round(importe_total * 100) : undefined, // en céntimos
          items: items?.map((it: { nombre: string; cantidad: number; precio_unitario?: number }) => ({
            name: it.nombre,
            quantity: it.cantidad,
            unitPrice: it.precio_unitario ? Math.round(it.precio_unitario * 100) : 0,
          })),
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error('[TheFork] Error cerrando orden:', res.status, err)
      return NextResponse.json({ ok: false, status: res.status }, { status: 200 })
    }

    // Limpiar thefork_order_id de la mesa
    await supabase.from('mesas').update({ thefork_order_id: null }).eq('id', mesa_id)

    console.log('[TheFork] Orden cerrada:', mesa.thefork_order_id)
    return NextResponse.json({ ok: true, closed: mesa.thefork_order_id })

  } catch (err) {
    console.error('[TheFork] fetch error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 })
  }
}
