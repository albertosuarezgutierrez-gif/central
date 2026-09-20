import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { buscarEnAsegura } from '@/lib/ficha-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/clientes?q=suarez — buscador de la cartera.
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  return NextResponse.json(await buscarEnAsegura(q))
}
