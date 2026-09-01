import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { buscarEnAsegura } from '@/lib/ficha-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/clientes?q=suarez — buscador de la cartera.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  return NextResponse.json(await buscarEnAsegura(q))
}
