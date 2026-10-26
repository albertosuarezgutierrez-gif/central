import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { descartarSenalPatrimonio, senalesPatrimonio } from '@/lib/correduria/oportunidades-patrimonio'

export const dynamic = 'force-dynamic'

/** GET — la cola «Patrimonio». `apagado` y `error` se distinguen de «no hay ninguna». Solo lectura: no envía nada. */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await senalesPatrimonio())
}

/** POST { id, motivo } — «Descartar» (arranca los 180 días). El actor sale de la SESIÓN, nunca del cuerpo. */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof b?.id === 'string' ? b.id.trim() : ''
  const motivo = typeof b?.motivo === 'string' ? b.motivo.trim() : ''
  if (!id || !motivo) return NextResponse.json({ estado: 'invalida', motivo: 'falta id o motivo' }, { status: 422 })
  const r = await descartarSenalPatrimonio(id, motivo, guarda.session.email)
  return NextResponse.json(r.json, { status: r.status })
}
