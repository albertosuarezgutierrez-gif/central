// Cruza el corpus de subastas con los criterios de cada cuenta activa.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { pasadaRadar } from '@/lib/subastas-radar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const r = await pasadaRadar()
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    console.error('[subastas-radar]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}
