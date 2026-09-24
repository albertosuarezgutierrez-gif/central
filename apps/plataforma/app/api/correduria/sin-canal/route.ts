import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { sinCanalAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

// GET /api/correduria/sin-canal — clientes de la cartera viva a los que no se
// puede avisar. Read-only: no envía nada, solo dice a quién no se llega.
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await sinCanalAsegura())
}
