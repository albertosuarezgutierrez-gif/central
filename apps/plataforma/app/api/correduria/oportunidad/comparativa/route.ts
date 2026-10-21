import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { comparativaOportunidadAsegura } from '@/lib/correduria/ofertas-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/oportunidad/comparativa?oportunidadId= — la comparativa ÚNICA de la oportunidad (21/10/2026).
 * Reenvía al puerto de asegura y devuelve el MISMO status y json. GRATIS: no llama a Codeoscopic ni a la IA.
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const oportunidadId = (new URL(req.url).searchParams.get('oportunidadId') ?? '').trim()
  if (!oportunidadId) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const r = await comparativaOportunidadAsegura(oportunidadId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
