import { NextRequest, NextResponse } from 'next/server'
import { refrescarLoteBacktest, recogerGurusLupa } from '@/lib/trading/backtest'

// 🔭 RETROVISOR del radar (backtest punto-en-el-tiempo, SOLO paper). Ruta MANUAL (workflow
// trading-backtest.yml) — a propósito NO está en los crons de vercel.json: es una recolección
// puntual, no una rutina. Auth Bearer CRON_SECRET. `?accion=lote` (default) | `?accion=gurus`.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const accion = req.nextUrl.searchParams.get('accion') ?? 'lote'
  if (accion === 'gurus') return NextResponse.json({ ok: true, ...(await recogerGurusLupa()) })
  return NextResponse.json({ ok: true, ...(await refrescarLoteBacktest()) })
}
export { handler as GET, handler as POST }
