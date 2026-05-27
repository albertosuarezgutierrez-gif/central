export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as never,
})

function isSuperAdmin(req: NextRequest) {
  const s = getSession(req)
  return s?.rol === 'super_admin'
}

export async function POST(req: NextRequest) {
  if (!isSuperAdmin(req)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { cuenta_id } = await req.json()
  const sb = createServerClient()

  const { data: cuenta } = await sb
    .from('cuentas')
    .select('stripe_subscription_id')
    .eq('id', cuenta_id)
    .single()

  if (!cuenta?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Sin suscripción activa' }, { status: 400 })
  }

  // Cancelar al final del período — no corte inmediato
  await stripe.subscriptions.update(cuenta.stripe_subscription_id, {
    cancel_at_period_end: true,
  })

  await sb
    .from('cuentas')
    .update({ stripe_estado: 'cancelando' })
    .eq('id', cuenta_id)

  return NextResponse.json({ ok: true })
}
