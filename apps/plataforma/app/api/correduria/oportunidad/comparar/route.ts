import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { compararVariantesAsegura } from '@/lib/seguimiento-asegura'
import { interpretarComparacion } from '@/lib/riesgo-asegura'

export const dynamic = 'force-dynamic'

/** GET ?id=&a=&b= — dos variantes del mismo riesgo (a = la más antigua): qué cambia y precios por compañía. Gratis. */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const sp = new URL(req.url).searchParams
  const [id, a, b] = ['id', 'a', 'b'].map((k) => (sp.get(k) ?? '').trim())
  if (!id || !a || !b) return NextResponse.json({ estado: 'error', motivo: 'Faltan id, a o b.' }, { status: 422 })
  const r = await compararVariantesAsegura(id, a, b)
  return NextResponse.json(interpretarComparacion(r.status, r.json))
}
