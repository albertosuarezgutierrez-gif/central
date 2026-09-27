import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { conversionLeadsWebAsegura } from '@/lib/leads-web-conversion-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/leads-web — de los leads captados por apps/asegura-web,
// cuántos son hoy cartera viva. Read-only.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  return NextResponse.json(await conversionLeadsWebAsegura())
}
