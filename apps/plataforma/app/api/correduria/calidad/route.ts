import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { calidadAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

// GET /api/correduria/calidad — incidencias de calidad del dato de la cartera en vigor.
// Read-only: no envía nada, solo reporta lo que falta o es incorrecto.
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await calidadAsegura())
}
