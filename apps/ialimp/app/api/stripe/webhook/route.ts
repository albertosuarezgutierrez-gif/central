import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 })
    }

    const Stripe = (await import('stripe')).default
    const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY!)
    const body    = await req.text()
    const sig     = req.headers.get('stripe-signature') || ''

    let event: any
    try {
      event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
    } catch {
      return NextResponse.json({ error: 'Webhook inválido' }, { status: 400 })
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub        = event.data.object
      const empresa_id = sub.metadata?.empresa_id
      const isAgency   = sub.items?.data?.[0]?.price?.nickname?.toLowerCase().includes('agency')
      const plan       = isAgency ? 'agency' : 'pro'
      const activo     = sub.status === 'active'
      if (empresa_id) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE empresas SET plan = ${activo ? plan : 'starter'},
            stripe_subscription_id = ${sub.id}
          WHERE id = ${empresa_id}::uuid
        `)
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub        = event.data.object
      const empresa_id = sub.metadata?.empresa_id
      if (empresa_id) {
        await prisma.$executeRaw(Prisma.sql`UPDATE empresas SET plan = 'starter' WHERE id = ${empresa_id}::uuid`)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
