// Puerto ADMIN → plataforma lee las suscripciones (Stripe) de ia-rest con Bearer
// OPERADOR_SHARED_SECRET. Expone los MISMOS datos que GET /api/super/stripe-operador
// pero sin requerir x-ia-session. SOLO LECTURA: las escrituras (crear customer,
// checkout, cancelar) siguen viviendo en /api/super/stripe-operador.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

type Cuenta = {
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_estado: string | null
  precio_mensual: number | null
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = createServerClient()
  const { data, error } = await sb
    .from('cuentas')
    .select(`
      id, nombre, email, estado,
      stripe_customer_id, stripe_subscription_id,
      stripe_estado, precio_mensual,
      fecha_inicio_suscripcion, fecha_proximo_cobro,
      notas_comerciales,
      restaurantes(id, nombre)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cuentas = (data ?? []) as unknown as Cuenta[]

  // MRR = suma de precio_mensual de las cuentas con suscripción activa.
  // "cancelando" sigue facturando hasta fin de período → cuenta para MRR.
  const activas = cuentas.filter(c => c.stripe_subscription_id && c.stripe_estado !== 'cancelada')
  const totales = {
    mrr: activas.reduce((s, c) => s + (Number(c.precio_mensual) || 0), 0),
    activas: activas.length,
    pendientes: cuentas.filter(c => c.stripe_estado === 'pendiente_pago').length,
    cancelando: cuentas.filter(c => c.stripe_estado === 'cancelando').length,
    sin_stripe: cuentas.filter(c => !c.stripe_customer_id).length,
  }

  return NextResponse.json({ cuentas: data ?? [], totales })
}
