import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { mandarJustificante, textoJustificante } from '@/lib/anulaciones-asegura'

export const dynamic = 'force-dynamic'

/** POST { id } — manda (o reenvía) al cliente su carta de baja firmada con el justificante. */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof b?.id === 'string' ? b.id : ''
  if (!id) return NextResponse.json({ ok: false, texto: 'Falta el expediente.' }, { status: 422 })
  const r = await mandarJustificante(id, guarda.session.email)
  if (!r.ok) return NextResponse.json(r, { status: 502 })
  return NextResponse.json(textoJustificante(r.archivo, r.correo))
}
