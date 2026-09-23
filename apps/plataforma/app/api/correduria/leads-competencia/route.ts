import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { interpretarLeads, leadsCompetenciaAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/leads-competencia?dias=90 — carril de LEADS de
// Vencimientos (puerto de asegura, solo lectura). La fecha es ESTIMADA.
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const pedidos = Number(new URL(req.url).searchParams.get('dias'))
  const dias = Number.isFinite(pedidos) && pedidos > 0 ? Math.min(Math.trunc(pedidos), 365) : 90
  const r = await leadsCompetenciaAsegura(dias)
  return NextResponse.json(interpretarLeads(r.status, r.json))
}
