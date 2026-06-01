export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

const COMISION_TOTAL = 0.025

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as never })
  const { slug } = await params
  const supabase = createServerClient()

  const body = await req.json()
  const { nombre_pagador, email_pagador } = body

  // Soporta array de items (multi) y item_id único (legacy)
  let itemsInput: { item_id: string; cantidad: number }[] = []
  if (body.items && Array.isArray(body.items)) {
    itemsInput = body.items
  } else if (body.item_id) {
    itemsInput = [{ item_id: body.item_id, cantidad: 1 }]
  }

  if (!itemsInput.length || !nombre_pagador?.trim()) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }

  const { data: portal } = await supabase
    .from('cobros_grupo')
    .select(`
      id, titulo, estado, stripe_connect_id, repercutir_comision,
      cobros_grupo_items(id, nombre, precio_eur, activo)
    `)
    .eq('slug', slug)
    .single()

  if (!portal) return NextResponse.json({ error: 'Portal no encontrado' }, { status: 404 })
  if (portal.estado === 'cerrado') return NextResponse.json({ error: 'Portal cerrado' }, { status: 410 })
  if (!portal.stripe_connect_id) return NextResponse.json({ error: 'Cobros no configurados' }, { status: 400 })

  const allItems = portal.cobros_grupo_items as { id: string; nombre: string; precio_eur: number; activo: boolean }[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineItems: any[] = []
  let totalBase = 0
  const pagosInsert: Record<string, unknown>[] = []

  for (const { item_id, cantidad } of itemsInput) {
    if (!cantidad || cantidad < 1) continue
    const item = allItems.find(i => i.id === item_id && i.activo)
    if (!item) return NextResponse.json({ error: `Menú no disponible: ${item_id}` }, { status: 404 })

    const precioBase = Number(item.precio_eur)
    const precioFinal = portal.repercutir_comision
      ? Math.round(precioBase * (1 + COMISION_TOTAL) * 100) / 100
      : precioBase

    lineItems.push({
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(precioFinal * 100),
        product_data: { name: `${item.nombre} — ${portal.titulo}` }
      },
      quantity: cantidad
    })

    totalBase += precioBase * cantidad

    pagosInsert.push({
      cobro_grupo_id: portal.id,
      item_id,
      nombre_pagador: nombre_pagador.trim(),
      email_pagador: email_pagador?.trim() || null,
      importe_eur: precioFinal * cantidad,
      importe_base_eur: precioBase * cantidad,
      estado: 'pendiente',
      cantidad
    })
  }

  if (!lineItems.length) return NextResponse.json({ error: 'Sin items válidos' }, { status: 400 })

  const applicationFee = Math.round(totalBase * 0.01 * 100)

  const { data: pagos, error: pagosError } = await supabase
    .from('cobros_grupo_pagos')
    .insert(pagosInsert)
    .select('id')

  // Si no podemos registrar el pago, NO creamos la sesión de Stripe: de lo
  // contrario el invitado pagaría pero no quedaría rastro y el panel mostraría
  // 0 cobrado (el webhook no tendría ninguna fila que actualizar).
  if (pagosError || !pagos?.length) {
    return NextResponse.json(
      { error: 'No se pudo registrar el pago, inténtalo de nuevo' },
      { status: 500 }
    )
  }

  const pagoIds = pagos.map((p: { id: string }) => p.id).join(',')

  const origin = req.headers.get('origin') || 'https://www.iarest.es'
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: lineItems,
    customer_email: email_pagador?.trim() || undefined,
    metadata: {
      cobro_grupo_id: portal.id,
      pago_ids: pagoIds,
      nombre_pagador: nombre_pagador.trim()
    },
    success_url: `${origin}/cobro/${slug}?pago=ok`,
    cancel_url: `${origin}/cobro/${slug}`,
    payment_intent_data: {
      application_fee_amount: applicationFee,
      transfer_data: { destination: portal.stripe_connect_id }
    }
  })

  if (pagos?.length) {
    await supabase
      .from('cobros_grupo_pagos')
      .update({ stripe_checkout_session: session.id })
      .in('id', (pagos as { id: string }[]).map(p => p.id))
  }

  return NextResponse.json({ checkout_url: session.url })
}
