import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { carteraAsegura } from '@/lib/cartera-asegura'

export const dynamic = 'force-dynamic'

// GET — cartera de la correduría en vivo (puerto HTTP a central-asegura).
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await carteraAsegura())
}
