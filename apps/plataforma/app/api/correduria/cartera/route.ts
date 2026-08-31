import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { carteraAsegura } from '@/lib/cartera-asegura'

export const dynamic = 'force-dynamic'

// GET — cartera de la correduría en vivo (puerto HTTP a central-asegura).
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(await carteraAsegura())
}
