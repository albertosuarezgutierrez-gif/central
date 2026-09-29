import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { garantiasFiltradasAsegura } from '@/lib/garantias-filtradas-asegura'

export const dynamic = 'force-dynamic'

// GET /api/correduria/garantias-filtradas — qué garantías marcan los clientes en el filtro del
// portal (últimos 90 días). Read-only.
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await garantiasFiltradasAsegura())
}
