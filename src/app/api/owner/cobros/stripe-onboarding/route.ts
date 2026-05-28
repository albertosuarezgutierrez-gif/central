export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as never
})

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)

  // Obtener stripe_connect_id del restaurante
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('configuracion, stripe_connect_onboarded, nombre')
    .eq('id', rid)
    .single()

  const stripeAccountId = rest?.configuracion?.stripe_connect_id
  if (!stripeAccountId) {
    return NextResponse.json({ error: 'Cuenta Stripe no configurada. Contacta con soporte.' }, { status: 400 })
  }

  // Verificar estado actual en Stripe
  try {
    const account = await stripe.accounts.retrieve(stripeAccountId)
    if (account.charges_enabled && account.payouts_enabled) {
      // Ya está activo — actualizar BD
      await supabase.from('restaurantes').update({ stripe_connect_onboarded: true }).eq('id', rid)
      return NextResponse.json({ ok: true, activo: true })
    }
  } catch {}

  // Generar link fresco (caduca en 5 min)
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://www.iarest.es'
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${baseUrl}/owner?tab=cobros&stripe=refresh`,
    return_url: `${baseUrl}/owner?tab=cobros&stripe=ok`,
    type: 'account_onboarding',
  })

  return NextResponse.json({ ok: true, activo: false, onboarding_url: accountLink.url })
}
