import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/session'
import { resolverDuplicados } from '@/lib/banca'

export const dynamic = 'force-dynamic'

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  estado: z.enum(['ignorado', 'confirmado']).nullable(),
})

// POST /api/banca/duplicados { ids, estado } — el dueño resuelve un par sospechoso de cobro
// doble: 'ignorado' (es normal), 'confirmado' (es un cobro doble real) o null (deshacer).
// Scoped por sesión (cuenta).
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const actualizados = await resolverDuplicados(session.id, parsed.data.ids, parsed.data.estado).catch(() => -1)
  if (actualizados < 0) return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 400 })
  return NextResponse.json({ ok: true, actualizados })
}
