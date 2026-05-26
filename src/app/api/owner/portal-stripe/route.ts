export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

function getStripeSecretKey(): string {
  const mode = (process.env.STRIPE_MODE ?? 'test').toLowerCase()
  return mode === 'test'
    ? process.env.STRIPE_SECRET_KEY_TEST!
    : process.env.STRIPE_SECRET_KEY!
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || !['owner', 'super_admin'].includes(session.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const supabase = createServerClient()
  const rid = getRestauranteId(req)

  // Buscar stripe_customer_id por restaurante_id (no por nombre — puede haber colisiones)
  const { data: restaurante } = await supabase
    .from('restaurantes')
    .select('stripe_customer_id')
    .eq('id', rid)
    .single()

  // Fallback: buscar en perfiles por camarero_id si restaurantes no tiene el campo
  let customerId = (restaurante as Record<string, unknown>)?.stripe_customer_id as string | null
  if (!customerId) {
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('stripe_customer_id')
      .eq('camarero_id', session.id)
      .single()
    customerId = perfil?.stripe_customer_id ?? null
  }

  if (!customerId) {
    return NextResponse.json({ error: 'No hay suscripción activa' }, { status: 404 })
  }

  const stripe = new Stripe(getStripeSecretKey(), { apiVersion: '2023-10-16' as never })
  const appUrl = process.env.APP_URL ?? 'https://www.iarest.es'

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/owner`,
  })

  return NextResponse.json({ url: portalSession.url })
}
