import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { impagadosAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

// GET /api/correduria/impagados — la cola de retención. Read-only.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(await impagadosAsegura())
}
