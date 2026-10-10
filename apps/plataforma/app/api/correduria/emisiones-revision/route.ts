import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { emisionesRevisionAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

// GET /api/correduria/emisiones-revision?desde=0 — la cola de revisión del descubrimiento de emisiones
// de Avant2 (50 por página). Solo lectura. La respuesta lleva SIEMPRE `estado`: un fallo es `error`.
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const d = Number(req.nextUrl.searchParams.get('desde'))
  const desde = Number.isInteger(d) && d >= 0 ? d : 0
  const cola = await emisionesRevisionAsegura(50, desde)
  return NextResponse.json(cola)
}
