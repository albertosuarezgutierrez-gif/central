import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { analizarMovimientos } from '@/lib/categorizar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/banca/analizar — (re)categoriza por IA los movimientos pendientes de
// la cuenta. Idempotente (solo toca los que no tienen analizado_at). Scoped por sesión.
export async function POST() {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { categorizados } = await analizarMovimientos(session.id).catch(() => ({ categorizados: 0 }))
  return NextResponse.json({ ok: true, categorizados })
}
