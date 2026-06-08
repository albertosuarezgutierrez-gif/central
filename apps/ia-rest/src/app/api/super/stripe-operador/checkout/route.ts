export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import Stripe from 'stripe'

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as never,
}) }

function isSuperAdmin(req: NextRequest) {
  const s = getSession(req)
  return s?.rol === 'super_admin'
}

export async function POST(req: NextRequest) {
  if (!isSuperAdmin(req)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { cuenta_id, precio_mensual, descripcion } = await req.json()
  if (!cuenta_id || !precio_mensual) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const sb = createServerClient()
  const { data: cuenta } = await sb
    .from('cuentas')
    .select('stripe_customer_id, nombre')
    .eq('id', cuenta_id)
    .single()

  if (!cuenta?.stripe_customer_id) {
    return NextResponse.json({ error: 'Primero crea el customer de Stripe' }, { status: 400 })
  }

  // Precio ad-hoc por cliente (no usa price IDs fijos)
  const price = await getStripe().prices.create({
    unit_amount: Math.round(precio_mensual * 100),
    currency: 'eur',
    recurring: { interval: 'month' },
    product_data: {
      name: descripcion || `ia.rest — ${cuenta.nombre}`,
    },
  })

  const checkoutSession = await getStripe().checkout.sessions.create({
    customer: cuenta.stripe_customer_id,
    mode: 'subscription',
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `https://www.iarest.es/super?tab=cobro&stripe=ok`,
    cancel_url: `https://www.iarest.es/super?tab=cobro&stripe=cancel`,
    metadata: { cuenta_id },
    subscription_data: { metadata: { cuenta_id } },
    payment_method_collection: 'always',
    locale: 'es',
    invoice_creation: { enabled: true },
  })

  await sb
    .from('cuentas')
    .update({
      precio_mensual,
      stripe_checkout_url: checkoutSession.url,
      stripe_estado: 'pendiente_pago',
    })
    .eq('id', cuenta_id)

  return NextResponse.json({ ok: true, checkout_url: checkoutSession.url })
}
