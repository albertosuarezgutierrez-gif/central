import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { conciliarMovimientos } from '@/lib/conciliacion'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/banca/conciliar — cruza los movimientos pendientes de la cuenta con los
// apuntes registrados en sivra/ialimp (BD compartida). Idempotente. Scoped por sesión.
export async function POST() {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const res = await conciliarMovimientos(session.id).catch(() => ({ conciliados: 0, pendientes: 0 }))
  return NextResponse.json({ ok: true, ...res })
}
