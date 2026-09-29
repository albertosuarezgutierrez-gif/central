import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { figuraAsegura, quitarFiguraAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * Figuras del riesgo. Reenvía al puerto de asegura; el `actor` lo pone el servidor y va el ÚLTIMO.
 *   POST { accion:'asignar', oportunidadId, rol, clienteId }
 *   POST { accion:'nueva', oportunidadId, rol, tipoRelacion, persona }
 *   DELETE { oportunidadId, rol }
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.oportunidadId !== 'string' || typeof body.rol !== 'string') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Faltan oportunidadId y rol.' }, { status: 422 })
  }
  const r = await figuraAsegura({ ...body, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function DELETE(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.oportunidadId !== 'string' || typeof body.rol !== 'string') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Faltan oportunidadId y rol.' }, { status: 422 })
  }
  const r = await quitarFiguraAsegura({ ...body, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
