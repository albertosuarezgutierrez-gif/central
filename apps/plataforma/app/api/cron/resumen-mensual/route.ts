import { NextRequest, NextResponse } from 'next/server'
import { enviarResumenMensual } from '@/lib/resumen-mensual'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 📤 Cierre de mes narrado → Telegram. Cron día 1 (ver vercel.json). Vercel dispara por GET; se
// mantiene POST para disparo manual. Auth Bearer CRON_SECRET (igual que resumen-semanal).
async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await enviarResumenMensual()
  return NextResponse.json({ ok: true, ...r })
}

export { handler as GET, handler as POST }
