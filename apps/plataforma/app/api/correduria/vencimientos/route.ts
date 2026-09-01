import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { vencimientosAsegura } from '@/lib/cartera-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/vencimientos?dias=90 — pólizas a renovar (puerto HTTP a
// central-asegura). Read-only.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const pedidos = Number(new URL(req.url).searchParams.get('dias'))
  const dias = Number.isFinite(pedidos) && pedidos > 0 ? Math.min(Math.trunc(pedidos), 365) : 90
  return NextResponse.json(await vencimientosAsegura(dias))
}
