import { NextRequest, NextResponse } from 'next/server'
import { valorarDia } from '@/lib/trading/cartera-cohetes-io'

// 🚀 Cartera cohetes (paper) — cron DIARIO (mar-sáb, tras cierre US): punto de curva. SOLO paper.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await valorarDia()
  return NextResponse.json(r)
}

export { handler as GET, handler as POST }
