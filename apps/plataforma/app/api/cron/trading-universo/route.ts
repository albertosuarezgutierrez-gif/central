import { NextRequest, NextResponse } from 'next/server'
import { refrescarLoteUniverso } from '@/lib/trading/universo'

// 🌎 Radar (Fase 1) — refresco INCREMENTAL del universo, cada 6h por lotes. Auth Bearer CRON_SECRET.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await refrescarLoteUniverso()
  return NextResponse.json({ ok: true, ...r })
}
export { handler as GET, handler as POST }
