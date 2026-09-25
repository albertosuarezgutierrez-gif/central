import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { accionSincroCimaAsegura, sincroCimaAsegura } from '@/lib/cima-sincro-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * /api/correduria/cima-sincro — ficha ↔ CIMA. Reenvía al puerto de asegura y
 * devuelve el MISMO status y json.
 *
 *   GET
 *   POST { accion:'volcar'|'rellenar' }  ·  { accion:'usar_cima'|'mantener', clienteId, campo }
 *   (el actor lo pone el servidor, el último)
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await sincroCimaAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ estado: 'invalida', motivo: 'Cuerpo vacío.' }, { status: 422 })
  const r = await accionSincroCimaAsegura({ ...body, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
