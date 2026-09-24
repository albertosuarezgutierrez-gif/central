import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { anotarBajaAsegura, quitarBajaAsegura } from '@/lib/formacion-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/formacion/baja — persona que deja de distribuir. Reenvía al puerto de asegura.
 *
 *   POST   { persona, desde }   (actor lo pone el servidor, el último)
 *   DELETE ?persona=
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ estado: 'invalida', motivos: ['Cuerpo vacío.'] }, { status: 422 })
  const r = await anotarBajaAsegura({ persona: body.persona, desde: body.desde, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function DELETE(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await quitarBajaAsegura(new URL(req.url).searchParams.get('persona') ?? '')
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
