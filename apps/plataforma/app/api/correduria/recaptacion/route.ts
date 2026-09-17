import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { colaRecaptacionAsegura } from '@/lib/recaptacion-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/recaptacion — la cola de leads sin vencimiento a
// recaptar. Read-only, reenvía al puerto de asegura.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(await colaRecaptacionAsegura())
}
