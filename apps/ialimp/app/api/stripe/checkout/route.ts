import { NextResponse } from 'next/server'
import { requireEmpresaId } from '@/lib/tenant'

const PRICES: Record<string, Record<string, string>> = {
  pro:    { monthly: 'price_pro_monthly',    annual: 'price_pro_annual'    },
  agency: { monthly: 'price_agency_monthly', annual: 'price_agency_annual' }
}

export async function POST(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { plan, annual = false } = await req.json()

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({
        error: 'Stripe no configurado. Contacta con soporte.',
        demo: true
      }, { status: 503 })
    }

    // Dynamic import para evitar problemas si Stripe no está instalado
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

    const priceKey = annual ? 'annual' : 'monthly'
    const priceId  = PRICES[plan]?.[priceKey]

    if (!priceId) {
      return NextResponse.json({ error: 'Plan no válido' }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { empresa_id },
      success_url: (process.env.NEXTAUTH_URL || 'https://app.ialimp.es') + '/dashboard?plan=ok',
      cancel_url:  (process.env.NEXTAUTH_URL || 'https://app.ialimp.es') + '/admin/planes',
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
