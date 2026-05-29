export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

const COMISION_TOTAL = 0.025 // 1.5% Stripe + 1% ia.rest

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as never })
  const { slug } = await params
  const supabase = createServerClient()

  const { item_id, nombre_pagador, email_pagador } = await req.json()
  if (!item_id || !nombre_pagador?.trim()) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }

  // Cargar portal con item y config comisión
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

  const item = (portal.cobros_grupo_items as any[]).find((i: any) => i.id === item_id && i.activo)
  if (!item) return NextResponse.json({ error: 'Menú no disponible' }, { status: 404 })

  // Calcular precio final
  const precioBase = Number(item.precio_eur)
  const precioFinal = portal.repercutir_comision
    ? Math.round(precioBase * (1 + COMISION_TOTAL) * 100) / 100
    : precioBase
  const precioStripe = Math.round(precioFinal * 100) // céntimos

  // Calcular application_fee (lo que cobra ia.rest = 1% del precio base)
  // Stripe se queda su 1.5% automáticamente del precio final
  const applicationFee = Math.round(precioBase * 0.01 * 100) // 1% ia.rest en céntimos

  // Crear registro de pago pendiente
  const { data: pago } = await supabase
    .from('cobros_grupo_pagos')
    .insert({
      cobro_grupo_id: portal.id,
      item_id,
      nombre_pagador: nombre_pagador.trim(),
      email_pagador: email_pagador?.trim() || null,
      importe_eur: precioFinal,
      importe_base_eur: precioBase,
      estado: 'pendiente'
    })
    .select('id')
    .single()

  // Crear Stripe Checkout Session
  const origin = req.headers.get('origin') || 'https://www.iarest.es'
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        unit_amount: precioStripe,
        product_data: { name: `${item.nombre} — ${portal.titulo}` }
      },
      quantity: 1
    }],
    customer_email: email_pagador?.trim() || undefined,
    metadata: {
      cobro_grupo_id: portal.id,
      pago_id: pago?.id ?? '',
      item_id,
      nombre_pagador: nombre_pagador.trim()
    },
    success_url: `${origin}/cobro/${slug}?pago=ok`,
    cancel_url: `${origin}/cobro/${slug}`,
    payment_intent_data: {
      application_fee_amount: applicationFee,
      transfer_data: { destination: portal.stripe_connect_id }
    }
  })

  // Guardar session id para el webhook
  if (pago?.id) {
    await supabase
      .from('cobros_grupo_pagos')
      .update({ stripe_checkout_session: session.id })
      .eq('id', pago.id)
  }

  return NextResponse.json({ checkout_url: session.url })
}
