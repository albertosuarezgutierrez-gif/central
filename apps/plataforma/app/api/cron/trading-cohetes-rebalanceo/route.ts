import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { rebalancearCartera } from '@/lib/trading/cartera-cohetes-io'

// 🚀 Cartera cohetes (paper) — cron SEMANAL (lunes, tras el ranking): rota la cesta a los cohetes
// confirmados del snapshot. SOLO paper. Auth Bearer CRON_SECRET.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handler(req: NextRequest) {
  if (!isCronAuthorized(req, { soloCabecera: true })) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await rebalancearCartera()
  return NextResponse.json(r)
}

export { handler as GET, handler as POST }
