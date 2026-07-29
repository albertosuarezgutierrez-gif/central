import { NextRequest, NextResponse } from 'next/server'
import { enviarPaperTracker } from '@/lib/trading/paper-tracker'

// 📈 Forward paper (Fase B, SOLO paper) — cron SEMANAL: mide la cesta congelada vs el SPY y avisa por
// Telegram. Vercel dispara por GET; POST para disparo manual. Auth Bearer CRON_SECRET (como los demás crons).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await enviarPaperTracker()
  return NextResponse.json({ ok: true, ...r })
}

export { handler as GET, handler as POST }
