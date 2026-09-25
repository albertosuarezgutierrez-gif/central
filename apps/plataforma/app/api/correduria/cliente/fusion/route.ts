import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { fusionAsegura, fusionarAsegura } from '@/lib/fusion-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/cliente/fusion — fichas duplicadas de la misma persona.
 * Reenvía al puerto de asegura con el secreto de operador y devuelve el mismo
 * status y json. El `actor` sale de la sesión, nunca del body.
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const url = new URL(req.url)
  const id = (url.searchParams.get('id') ?? '').trim()
  const con = (url.searchParams.get('con') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  const r = await fusionAsegura(id, con || undefined)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.id !== 'string' || typeof body.con !== 'string' || body.id === body.con) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Faltan las dos fichas.' }, { status: 422 })
  }
  const r = await fusionarAsegura({
    id: body.id,
    con: body.con,
    deAbsorbida: Array.isArray(body.deAbsorbida) ? body.deAbsorbida : [],
    confirmarSinDni: body.confirmarSinDni === true,
    actor: guarda.session.email,
  })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
