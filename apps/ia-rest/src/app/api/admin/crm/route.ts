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

  const [leadsRes, contactosRes] = await Promise.all([
    sb.from('leads')
      .select('id, nombre, restaurante, empresa, ciudad, web, telefono, email, estado, score, tpv, locales, notas, created_at, updated_at')
      .order('created_at', { ascending: false }),
    sb.from('leads_contactos')
      .select('id, lead_id, nombre, cargo, telefono, email, es_decisor, canal_preferido'),
  ])

  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })

  const contactosPorLead: Record<string, unknown[]> = {}
  for (const c of (contactosRes.data ?? [])) {
    if (!contactosPorLead[(c as any).lead_id]) contactosPorLead[(c as any).lead_id] = []
    contactosPorLead[(c as any).lead_id].push(c)
  }

  const leads = (leadsRes.data ?? []).map(l => ({
    ...l,
    contactos: contactosPorLead[(l as any).id] ?? [],
  }))

  const totales = {
    total: leads.length,
    por_estado: leads.reduce((acc: Record<string, number>, l: any) => {
      const e = l.estado || 'sin_estado'
      acc[e] = (acc[e] || 0) + 1
      return acc
    }, {}),
  }

  return NextResponse.json({ leads, totales })
}
