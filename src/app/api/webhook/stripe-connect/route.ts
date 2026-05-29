export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'
import { tgAlert } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as never })
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body, sig,
      process.env.STRIPE_WEBHOOK_SECRET_CONNECT!
    )
  } catch {
    return NextResponse.json({ error: 'Webhook signature invalida' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Cuenta Connect activada — Fran completó el onboarding bancario
  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account
    const activo = account.charges_enabled && account.payouts_enabled

    // Actualizar BD
    await supabase
      .from('restaurantes')
      .update({ stripe_connect_onboarded: activo })
      .eq('configuracion->>stripe_connect_id', account.id)

    // Notificar a Alberto si acaba de activarse
    if (activo) {
      // Buscar nombre del restaurante para el mensaje
      const { data: rest } = await supabase
        .from('restaurantes')
        .select('nombre, email_contacto')
        .eq('configuracion->>stripe_connect_id', account.id)
        .single()

      const nombre = rest?.nombre ?? account.id
      await tgAlert(
        `🏦 <b>Onboarding bancario completado</b>\n\n` +
        `<b>${nombre}</b> ha configurado su cuenta bancaria en Stripe.\n` +
        `Ya puede recibir cobros directamente.\n\n` +
        `Stripe ID: <code>${account.id}</code>`,
        'resuelto'
      )
    }
  }

  // Pago completado
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    await supabase
      .from('cobros_grupo_pagos')
      .update({ estado: 'pagado', pagado_at: new Date().toISOString() })
      .eq('stripe_checkout_session', session.id)
  }

  return NextResponse.json({ ok: true })
}
