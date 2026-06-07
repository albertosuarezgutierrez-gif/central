export const dynamic = 'force-dynamic'

// POST /api/storefront/webhook-pago
// Webhook de Stripe para confirmar pago online
// Cuando payment_intent.succeeded → confirmar pedido + crear comanda en sistema

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { crearPrintJobs } from '@/lib/courier'
import Stripe from 'stripe'

let _stripe: Stripe | null = null
function getStripe() { if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'placeholder', { apiVersion: '2026-04-22.dahlia' as never }); return _stripe }

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_STOREFRONT

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret!)
  } catch (err) {
    console.error('[WEBHOOK-STOREFRONT] Firma inválida', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type !== 'payment_intent.succeeded') {
    return NextResponse.json({ ok: true })
  }

  const pi = event.data.object as Stripe.PaymentIntent
  const pedido_id = pi.metadata?.pedido_id
  if (!pedido_id) return NextResponse.json({ ok: true })

  const supabase = createServerClient()

  // Cargar pedido
  const { data: pedido } = await supabase
    .from('pedidos_online')
    .select('*')
    .eq('id', pedido_id)
    .single()

  if (!pedido || pedido.stripe_status === 'paid') {
    return NextResponse.json({ ok: true }) // ya procesado
  }

  // Buscar turno activo del restaurante
  const { data: turno } = await supabase
    .from('turnos')
    .select('id')
    .eq('local_id', pedido.local_id)
    .eq('estado', 'activo')
    .single()

  if (!turno) {
    // Sin turno activo — marcamos pagado pero no creamos comanda aún
    // El owner verá el pedido online pendiente de procesar
    await supabase.from('pedidos_online').update({
      stripe_status: 'paid',
      pagado_at: new Date().toISOString(),
      estado: 'confirmado',
    }).eq('id', pedido_id)
    return NextResponse.json({ ok: true })
  }

  // Crear comanda interna
  const etiqueta = pedido.tipo === 'delivery'
    ? `DELIVERY · ${pedido.cliente_nombre}`
    : `RECOGIDA · ${pedido.cliente_nombre}`

  const { data: comanda, error: cmdErr } = await supabase
    .from('comandas')
    .insert({
      mesa_id: null,
      nombre_cuenta: etiqueta,
      camarero_id: null,
      turno_id: turno.id,
      tipo: 'comanda',
      estado: 'en_cocina',
      local_id: pedido.local_id,
      nota_general: pedido.cliente_notas ?? null,
      num_comensales: 1,
    })
    .select()
    .single()

  if (cmdErr || !comanda) {
    console.error('[WEBHOOK-STOREFRONT] Error creando comanda', cmdErr)
    return NextResponse.json({ error: 'Error creando comanda' }, { status: 500 })
  }

  // Items de la comanda
  const items = pedido.items as Array<{
    producto_id: string
    nombre: string
    cantidad: number
    precio_unitario: number
    notas: string | null
  }>

  await supabase.from('comanda_items').insert(
    items.map(it => ({
      comanda_id: comanda.id,
      nombre: it.nombre,
      cantidad: it.cantidad,
      notas: it.notas ?? null,
      producto_id: it.producto_id ?? null,
      precio_unitario: it.precio_unitario ?? null,
      local_id: pedido.local_id,
    }))
  )

  // Print jobs (KDS + impresora cocina)
  try {
    await crearPrintJobs(
      {
        id: comanda.id,
        tipo: 'comanda',
        mesa_codigo: etiqueta,
        camarero_nombre: pedido.tipo === 'delivery' ? 'Delivery' : 'Recogida',
        local_id: pedido.local_id,
      },
      items.map(i => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        notas: i.notas ?? undefined,
      }))
    )
  } catch (e) {
    console.error('[WEBHOOK-STOREFRONT] Print error', e)
  }

  // Actualizar pedido online como pagado y vinculado
  await supabase.from('pedidos_online').update({
    stripe_status: 'paid',
    pagado_at: new Date().toISOString(),
    estado: 'en_cocina',
    comanda_id: comanda.id,
  }).eq('id', pedido_id)

  return NextResponse.json({ ok: true })
}
