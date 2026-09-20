import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { conversionLeadsWebAsegura } from '@/lib/leads-web-conversion-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/leads-web — de los leads captados por apps/asegura-web,
// cuántos son hoy cartera viva. Read-only.
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await conversionLeadsWebAsegura())
}
