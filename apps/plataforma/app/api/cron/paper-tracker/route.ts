import { NextRequest, NextResponse } from 'next/server'
import { enviarPaperTracker } from '@/lib/trading/paper-tracker'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'

// 📈 Forward paper (Fase B, SOLO paper) — cron SEMANAL: mide la cesta congelada vs el SPY y avisa por
// Telegram. Vercel dispara por GET; POST para disparo manual. Auth Bearer CRON_SECRET (como los demás crons).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const r = await enviarPaperTracker()
    // La escalera de dinero real (puerta-fase2.ts) mide sobre `trading_paper_track`: si este cron
    // se calla, esa lectura queda ciega sin que nadie lo note (era la única huella sin vigía).
    await registrarLatido('paper-tracker', r.persistidos > 0, `${r.persistidos}/${r.medidas.length} cohortes persistidas, enviado=${r.enviado}`)
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    await registrarLatido('paper-tracker', false, String(e))
    throw e
  }
}

export { handler as GET, handler as POST }
