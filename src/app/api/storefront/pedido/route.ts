export const dynamic = 'force-dynamic'

// POST /api/storefront/pedido
// Crea el pedido online + Stripe Payment Intent
// Público — sin auth de camarero

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import Stripe from 'stripe'

let _stripe: Stripe | null = null
function getStripe() { if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'placeholder', { apiVersion: '2026-04-22.dahlia' as never }); return _stripe }

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await req.json()

    const {
      slug,
      tipo,           // 'delivery' | 'recogida'
      cliente_nombre,
      cliente_telefono,
      cliente_direccion,
      cliente_notas,
      items,          // [{ producto_id, nombre, cantidad, precio_unitario, notas? }]
    } = body

    // Validaciones básicas
    if (!slug || !tipo || !cliente_nombre || !cliente_telefono || !items?.length) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }
    if (tipo === 'delivery' && !cliente_direccion) {
      return NextResponse.json({ error: 'Dirección requerida para delivery' }, { status: 400 })
    }

    // Cargar config del storefront
    const { data: config } = await supabase
      .from('storefront_config')
      .select('*')
      .eq('slug', slug)
      .eq('activo', true)
      .single()

    if (!config) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

    // Calcular total (verificamos precios en servidor — nunca fiarse del cliente)
    const productoIds = items.map((i: { producto_id: string }) => i.producto_id)
    const { data: productosDB } = await supabase
      .from('productos')
      .select('id, nombre, precio')
      .in('id', productoIds)
      .eq('local_id', config.restaurante_id)

    const precioMap = Object.fromEntries((productosDB ?? []).map(p => [p.id, p.precio]))

    let subtotal = 0
    const itemsVerificados = items.map((item: {
      producto_id: string
      nombre: string
      cantidad: number
      notas?: string
    }) => {
      const precio = precioMap[item.producto_id] ?? 0
      subtotal += precio * item.cantidad
      return {
        producto_id: item.producto_id,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precio_unitario: precio,
        notas: item.notas ?? null,
      }
    })

    const total = subtotal

    // Verificar pedido mínimo
    if (total < (config.pedido_minimo_eur ?? 0)) {
      return NextResponse.json({
        error: `Pedido mínimo: ${config.pedido_minimo_eur}€`
      }, { status: 400 })
    }

    // Crear registro en BD (estado pendiente, sin pago aún)
    const { data: pedido, error: pedErr } = await supabase
      .from('pedidos_online')
      .insert({
        local_id: config.restaurante_id,
        tipo,
        estado: 'pendiente',
        cliente_nombre: cliente_nombre.trim(),
        cliente_telefono: cliente_telefono.trim(),
        cliente_direccion: cliente_direccion?.trim() ?? null,
        cliente_notas: cliente_notas?.trim() ?? null,
        items: itemsVerificados,
        subtotal,
        total,
        stripe_status: 'unpaid',
      })
      .select()
      .single()

    if (pedErr || !pedido) throw pedErr ?? new Error('Error creando pedido')

    // Crear Stripe Payment Intent
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'eur',
      metadata: {
        pedido_id: pedido.id,
        local_id: config.restaurante_id,
        slug,
      },
      description: `Pedido #${pedido.numero} — ${config.nombre_publico ?? slug}`,
    })

    // Guardar el payment intent ID
    await supabase
      .from('pedidos_online')
      .update({ stripe_payment_intent: paymentIntent.id })
      .eq('id', pedido.id)

    return NextResponse.json({
      ok: true,
      pedido_id: pedido.id,
      numero: pedido.numero,
      total,
      client_secret: paymentIntent.client_secret,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('[STOREFRONT/PEDIDO]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/storefront/pedido?id=xxx — estado del pedido para tracking
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { data: pedido } = await supabase
    .from('pedidos_online')
    .select('id, numero, estado, tipo, cliente_nombre, items, total, created_at, updated_at')
    .eq('id', id)
    .single()

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  return NextResponse.json({ pedido })
}
