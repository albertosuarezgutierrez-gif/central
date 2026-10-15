import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { editarConsultaAsegura } from '@/lib/correduria/consultas-companias-asegura'

export const dynamic = 'force-dynamic'

/** PATCH { asunto?, cuerpo?, adjuntos?, responderAntes? } → edita un borrador. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!c) return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const cuerpo: Record<string, unknown> = {}
  if (typeof c.asunto === 'string') cuerpo.asunto = c.asunto
  if (typeof c.cuerpo === 'string') cuerpo.cuerpo = c.cuerpo
  if (Array.isArray(c.adjuntos)) cuerpo.adjuntos = c.adjuntos.filter((x) => typeof x === 'string')
  if ('responderAntes' in c) cuerpo.responderAntes = typeof c.responderAntes === 'string' && c.responderAntes ? c.responderAntes : null
  const r = await editarConsultaAsegura(id, cuerpo, guarda.acceso.correduriaId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
