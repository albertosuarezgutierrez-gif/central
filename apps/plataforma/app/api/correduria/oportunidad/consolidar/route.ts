import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { consolidarOfertasAsegura } from '@/lib/correduria/ofertas-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 100

/**
 * POST { oportunidadId, ofertaIds?, superficieM2? } — las ofertas REVISADAS → un presupuesto de origen
 * `ofertas` (borrador, no sale nada al cliente). Reenvía al puerto de asegura. El `actor` lo pone el
 * servidor y va el ÚLTIMO.
 */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!cuerpo) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const r = await consolidarOfertasAsegura({ ...cuerpo, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
