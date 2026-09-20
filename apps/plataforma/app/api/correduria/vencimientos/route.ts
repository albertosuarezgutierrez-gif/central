import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { vencimientosAsegura } from '@/lib/cartera-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/vencimientos?dias=90 — pólizas a renovar (puerto HTTP a
// central-asegura). Read-only.
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const pedidos = Number(new URL(req.url).searchParams.get('dias'))
  const dias = Number.isFinite(pedidos) && pedidos > 0 ? Math.min(Math.trunc(pedidos), 365) : 90
  return NextResponse.json(await vencimientosAsegura(dias))
}
