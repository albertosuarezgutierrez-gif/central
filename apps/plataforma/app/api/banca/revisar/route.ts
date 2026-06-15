import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { asignarCategoria } from '@/lib/categorizar'

export const dynamic = 'force-dynamic'

// POST /api/banca/revisar { movimientoId, categoria } — el dueño asigna la categoría a un
// movimiento que la IA marcó "por revisar". Scoped por sesión (cuenta).
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as { movimientoId?: string; categoria?: string } | null
  if (!body?.movimientoId || !body.categoria) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const ok = await asignarCategoria(session.id, body.movimientoId, body.categoria).catch(() => false)
  if (!ok) return NextResponse.json({ error: 'No se pudo asignar (categoría inválida o movimiento no encontrado)' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
