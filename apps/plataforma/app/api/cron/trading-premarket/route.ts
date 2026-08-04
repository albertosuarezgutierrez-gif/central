import { NextRequest, NextResponse } from 'next/server'
import { avisoPremarket } from '@/lib/trading/premarket-aviso'

// 🌅 Vigía del premarket (L-V 13:00 UTC ≈ premarket maduro en EEUU): gap del top del radar,
// aviso Telegram solo si algo se mueve ≥ umbral. Auth Bearer CRON_SECRET.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await avisoPremarket()
  return NextResponse.json(r)
}
export { handler as GET, handler as POST }
