import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { buscarAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

// GET /api/correduria/buscar?q=… — el buscador de TODO. Read-only.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  return NextResponse.json(await buscarAsegura(q))
}
