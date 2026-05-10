// POST /api/qr/webhook — Stripe webhook: checkout.session.completed
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_QR!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    return NextResponse.json({ error: 'Webhook signature failed' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { sesion_id, mesa_id, restaurante_id } = session.metadata || {}

    if (sesion_id) {
      const supabase = createServerClient()
      await supabase
        .from('qr_sesiones_cliente')
        .update({ estado: 'pagada', pagado_en: new Date().toISOString() })
        .eq('id', sesion_id)

      // Push al camarero: mesa pagada vía QR
      const { data: camareros } = await supabase
        .from('camareros')
        .select('id')
        .eq('restaurante_id', restaurante_id)
        .in('rol', ['camarero', 'jefe_sala'])

      for (const cam of camareros || []) {
        await fetch(`${process.env.SUPABASE_URL}/functions/v1/push-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({
            camarero_id: cam.id,
            titulo: '💳 Pagado por QR',
            cuerpo: `Mesa ${mesa_id} ha pagado desde su móvil`,
            datos: { tipo: 'qr_pagado', mesa_id, sesion_id }
          })
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}
