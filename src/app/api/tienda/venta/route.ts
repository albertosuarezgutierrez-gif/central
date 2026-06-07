export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/tienda/venta — crea una venta de tienda (comanda tipo='tienda',
// sin mesa) y devuelve comanda_id para que el front la cobre con
// /api/factura/cerrar (reutiliza cobro/VeriFactu/caja/ticket del núcleo).
//
// Decisión de arquitectura: el descuento de stock se hace AQUÍ (código), no
// en un trigger sobre comanda_items (hot-path de todas las comandas).
// Body: { items: [{ producto_id, nombre, cantidad, precio_unitario? }], nota? }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

interface ItemIn {
  producto_id?: string | null
  nombre: string
  cantidad: number
  precio_unitario?: number
}

export async function POST(req: NextRequest) {
  try {
    const session = getSession(req)
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const supabase = createServerClient()
    const rid = session.restaurante_id
    const body = await req.json().catch(() => ({}))
    const items: ItemIn[] = Array.isArray(body.items) ? body.items : []
    const nota: string | null = typeof body.nota === 'string' ? body.nota : null

    if (items.length === 0) {
      return NextResponse.json({ error: 'Sin artículos en la venta' }, { status: 400 })
    }

    // Verificar precios en servidor (mismo patrón que pedido-operador)
    const productoIds = items.map(i => i.producto_id).filter((x): x is string => !!x)
    let precioMap: Record<string, number> = {}
    let stockMap: Record<string, number | null> = {}
    if (productoIds.length > 0) {
      const { data: prods } = await supabase
        .from('productos')
        .select('id, precio, stock_actual')
        .in('id', productoIds)
        .eq('local_id', rid)
      precioMap = Object.fromEntries((prods ?? []).map(p => [p.id, Number(p.precio ?? 0)]))
      stockMap = Object.fromEntries((prods ?? []).map(p => [p.id, p.stock_actual]))
    }

    let total = 0
    const itemsVerificados = items.map(item => {
      const precio = item.producto_id != null
        ? (precioMap[item.producto_id] ?? item.precio_unitario ?? 0)
        : (item.precio_unitario ?? 0)
      const cantidad = Number(item.cantidad) || 1
      total += precio * cantidad
      return {
        producto_id: item.producto_id ?? null,
        nombre: item.nombre,
        cantidad,
        precio_unitario: precio,
      }
    })
    total = Math.round(total * 100) / 100
    if (total <= 0) {
      return NextResponse.json({ error: 'Importe total 0 — revisa precios' }, { status: 422 })
    }

    // Turno activo (necesario para caja/arqueo)
    const { data: turno } = await supabase
      .from('turnos')
      .select('id')
      .eq('local_id', rid)
      .eq('estado', 'activo')
      .is('camarero_id', null)
      .maybeSingle()
    if (!turno) {
      return NextResponse.json({ error: 'Sin turno activo — abre turno antes de vender' }, { status: 400 })
    }

    // Crear comanda de tienda (sin mesa, no entra al KDS)
    const { data: comanda, error: cmdErr } = await supabase
      .from('comandas')
      .insert({
        mesa_id: null,
        nombre_cuenta: 'Tienda',
        camarero_id: session.id,
        turno_id: turno.id,
        tipo: 'tienda',
        estado: 'nueva',
        restaurante_id: rid,
        nota_general: nota,
        num_comensales: 1,
      })
      .select('id')
      .single()
    if (cmdErr || !comanda) throw cmdErr ?? new Error('Error creando la venta')

    // Items
    const { error: itErr } = await supabase.from('comanda_items').insert(
      itemsVerificados.map(it => ({
        comanda_id: comanda.id,
        nombre: it.nombre,
        cantidad: it.cantidad,
        producto_id: it.producto_id,
        precio_unitario: it.precio_unitario,
        restaurante_id: rid,
      }))
    )
    if (itErr) throw itErr

    // Descuento de stock (en código, gobernado por config_tienda.descontar_stock)
    const { data: cfg } = await supabase
      .from('config_tienda')
      .select('descontar_stock')
      .eq('local_id', rid)
      .maybeSingle()
    if (cfg?.descontar_stock !== false) {
      for (const it of itemsVerificados) {
        if (!it.producto_id) continue
        const actual = stockMap[it.producto_id]
        if (actual == null) continue // producto sin control de stock
        const nuevo = Number(actual) - it.cantidad
        await supabase
          .from('productos')
          .update({ stock_actual: nuevo, updated_at: new Date().toISOString() })
          .eq('id', it.producto_id)
          .eq('local_id', rid)
      }
    }

    return NextResponse.json({ ok: true, comanda_id: comanda.id, total }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('[TIENDA/VENTA]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
