import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo } from '@/lib/riesgo-asegura'

export const dynamic = 'force-dynamic'

/** GET ?id= — el riesgo entero (figuras, vínculos, variantes P1…Pn) para su pantalla. */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'Falta el id.' }, { status: 422 })
  const r = await riesgoAsegura(id)
  return NextResponse.json(interpretarRiesgo(r.status, r.json))
}
