import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { ingestaDia } from '@/lib/borme-ingesta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Cron diario: ingiere el BORME del día (concursos, disoluciones, ampliaciones, ceses).
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const hoy = new Date().toISOString().slice(0, 10)
  try {
    const r = await ingestaDia(hoy)
    return NextResponse.json({ ok: true, fecha: hoy, ...r })
  } catch (e) {
    console.error('[borme-ingesta cron]', e)
    return NextResponse.json({ ok: false, fecha: hoy, error: String(e) }, { status: 500 })
  }
}
