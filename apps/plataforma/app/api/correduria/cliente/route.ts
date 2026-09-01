import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fichaAsegura } from '@/lib/ficha-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/cliente?id=<uuid> — ficha completa (puerto a asegura).
// Read-only: aquí no se gasta ni un céntimo. Retarificar vive en asegura.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'respuesta_ilegible' }, { status: 400 })
  return NextResponse.json(await fichaAsegura(id))
}
