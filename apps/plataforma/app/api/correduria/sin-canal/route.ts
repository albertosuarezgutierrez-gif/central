import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { sinCanalAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

// GET /api/correduria/sin-canal — clientes de la cartera viva a los que no se
// puede avisar. Read-only: no envía nada, solo dice a quién no se llega.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(await sinCanalAsegura())
}
