export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = createServerClient()
  const { data, error } = await sb
    .from('restaurantes')
    .select(`
      id, nombre, slug, plan, plan_status, activo, ciudad, created_at,
      trial_end, max_camareros, stripe_subscription_id,
      personal!local_id(count),
      mesas:mesas(count),
      comandas:comandas(count)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const restaurantes = (data ?? []).map((r: any) => ({
    id:               r.id,
    nombre:           r.nombre,
    slug:             r.slug,
    plan:             r.plan,
    plan_status:      r.plan_status,
    activo:           r.activo,
    ciudad:           r.ciudad,
    created_at:       r.created_at,
    trial_end:        r.trial_end,
    max_camareros:    r.max_camareros,
    tiene_stripe:     !!r.stripe_subscription_id,
    num_camareros:    r['personal']?.[0]?.count ?? 0,
    num_mesas:        r.mesas?.[0]?.count ?? 0,
    num_comandas:     r.comandas?.[0]?.count ?? 0,
  }))

  return NextResponse.json({ restaurantes })
}
