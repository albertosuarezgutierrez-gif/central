import { NextResponse } from 'next/server'
import { createStripe } from '@central/core-payments'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 })
    }

    const stripe = createStripe()
    const body   = await req.text()
    const sig    = req.headers.get('stripe-signature') || ''

    let event: any
    try {
      event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
    } catch {
      return NextResponse.json({ error: 'Webhook inválido' }, { status: 400 })
    }

    // Dedup por event.id: un reenvío del mismo evento NO debe aplicar los efectos
    // dos veces (p.ej. doble UPDATE de plan). INSERT ... ON CONFLICT DO NOTHING →
    // filas afectadas: 1 = evento nuevo, 0 = ya procesado. Degrada limpio si la
    // tabla aún no existe (no bloquea el webhook; solo se pierde la protección).
    let yaProcesado = false
    try {
      const inserted = await prisma.$executeRaw(Prisma.sql`
        INSERT INTO stripe_eventos_procesados (event_id) VALUES (${event.id})
        ON CONFLICT (event_id) DO NOTHING
      `)
      if (inserted === 0) yaProcesado = true
    } catch {
      // Migración sin aplicar u otro fallo del dedup: no romper el webhook.
    }
    if (yaProcesado) {
      return NextResponse.json({ ok: true, duplicado: true })
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
