export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ia.rest · POST /api/propinas/[token]/pagar
// Crea Stripe Checkout Session para la propina → devuelve URL
// Al completarse el pago, el webhook de Stripe llama a /api/propinas/webhook

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import Stripe from 'stripe'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createServerClient()

  const { importe } = await req.json()
  if (!importe || importe < 0.5) return NextResponse.json({ error: 'Importe mínimo 0,50€' }, { status: 400 })

  // Verificar token
  const { data: propina } = await supabase
    .from('propinas')
    .select('id, estado, restaurante_id, restaurantes(nombre)')
    .eq('token', token)
    .maybeSingle()

  if (!propina) return NextResponse.json({ error: 'Token no válido' }, { status: 404 })
  if (propina.estado === 'pagada') return NextResponse.json({ error: 'Ya pagada' }, { status: 409 })

  const rest = propina.restaurantes as unknown as { nombre: string } | null
  const importeCents = Math.round(importe * 100)

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as never })

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: `Propina — ${rest?.nombre ?? 'Restaurante'}`,
          description: 'Gracias por tu generosidad 💝',
        },
        unit_amount: importeCents,
      },
      quantity: 1,
    }],
    success_url: `${process.env.NEXT_PUBLIC_URL ?? 'https://www.iarest.es'}/propina/${token}?ok=1`,
    cancel_url:  `${process.env.NEXT_PUBLIC_URL ?? 'https://www.iarest.es'}/propina/${token}`,
    metadata: {
      propina_id: propina.id,
      token,
      importe: importe.toString(),
      restaurante_id: propina.restaurante_id,
    },
  })

  // Guardar importe y payment_intent en propina
  await supabase.from('propinas').update({
    importe,
    stripe_payment_intent: session.payment_intent as string ?? null,
  }).eq('token', token)

  return NextResponse.json({ url: session.url })
}
