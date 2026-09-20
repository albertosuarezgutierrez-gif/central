import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { buscarAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

// GET /api/correduria/buscar?q=… — el buscador de TODO. Read-only.
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  return NextResponse.json(await buscarAsegura(q))
}
