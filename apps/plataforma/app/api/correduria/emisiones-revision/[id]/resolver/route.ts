import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { resolverEmisionRevisionAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/correduria/emisiones-revision/{id}/resolver { nota? } — «Marcar revisada». Idempotente.
// Quién la cierra lo pone el puerto (`x-actor` = la sesión), nunca el cuerpo.
export async function POST(req: NextRequest, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const nota = typeof cuerpo.nota === 'string' ? cuerpo.nota.slice(0, 300) : null
  const r = await resolverEmisionRevisionAsegura(id, nota)
  return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : r.estado === 'sin_configurar' ? 503 : 502 })
}
