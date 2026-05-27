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

// GET — lista cuentas con estado Stripe
export async function GET(req: NextRequest) {
  if (!isSuperAdmin(req)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const sb = createServerClient()
  const { data, error } = await sb
    .from('cuentas')
    .select(`
      id, nombre, email, estado,
      stripe_customer_id, stripe_subscription_id,
      stripe_estado, precio_mensual,
      fecha_inicio_suscripcion, fecha_proximo_cobro,
      stripe_checkout_url, notas_comerciales,
      restaurantes(id, nombre)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cuentas: data })
}

// POST — crea Customer en Stripe para una cuenta
export async function POST(req: NextRequest) {
  if (!isSuperAdmin(req)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { cuenta_id, email, nombre_empresa } = await req.json()
  if (!cuenta_id || !email || !nombre_empresa) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const sb = createServerClient()

  const { data: cuenta } = await sb
    .from('cuentas')
    .select('stripe_customer_id')
    .eq('id', cuenta_id)
    .single()

  if (cuenta?.stripe_customer_id) {
    return NextResponse.json({ error: 'Ya tiene customer de Stripe' }, { status: 400 })
  }

  const customer = await stripe.customers.create({
    email,
    name: nombre_empresa,
    metadata: { cuenta_id },
  })

  const { error } = await sb
    .from('cuentas')
    .update({ stripe_customer_id: customer.id })
    .eq('id', cuenta_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, customer_id: customer.id })
}
