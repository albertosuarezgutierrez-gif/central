import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { riesgoDePolizaAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * POST { polizaId } — abre (o devuelve la abierta) la oportunidad de retarificar esa póliza, con
 * las personas que ya tiene. Gratis. El `actor` lo pone el servidor y va el ÚLTIMO.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const polizaId = typeof body?.polizaId === 'string' ? body.polizaId.trim() : ''
  if (polizaId === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta polizaId.' }, { status: 422 })
  const r = await riesgoDePolizaAsegura({ polizaId, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
