import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { generarRadarSemanal } from '@/lib/trading/radar'

// 🌎 Radar (Fase 1) — ranking SEMANAL del radar (lunes 09:00). Auth Bearer CRON_SECRET.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handler(req: NextRequest) {
  if (!isCronAuthorized(req, { soloCabecera: true })) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await generarRadarSemanal()
  return NextResponse.json(r)
}
export { handler as GET, handler as POST }
