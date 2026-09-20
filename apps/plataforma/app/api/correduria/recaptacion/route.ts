import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { colaRecaptacionAsegura } from '@/lib/recaptacion-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/recaptacion — la cola de leads sin vencimiento a
// recaptar. Read-only, reenvía al puerto de asegura.
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await colaRecaptacionAsegura())
}
