import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { verificarCodigoDni } from '@/lib/correduria/dni-otp'
import { revelarDniAsegura } from '@/lib/cliente-edicion-asegura'

export const dynamic = 'force-dynamic'

// POST /api/correduria/cliente/[id]/dni-revelar — { codigo } → el DNI completo,
// SOLO si el código pedido en /dni-codigo sigue vigente, sin usar y coincide.
// Un código erróneo o caducado no distingue el motivo: no hace falta, y decirlo
// solo ayudaría a fuerza bruta.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const codigo = typeof body?.codigo === 'string' ? body.codigo.trim() : ''

  const ok = await verificarCodigoDni(session.id, id, codigo)
  if (!ok) return NextResponse.json({ estado: 'invalido' }, { status: 422 })

  const r = await revelarDniAsegura({ id, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
