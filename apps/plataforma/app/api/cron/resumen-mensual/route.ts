import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { enviarResumenMensual, enviarCierreNegocios } from '@/lib/resumen-mensual'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 📤 Cierre de mes narrado → Telegram. Cron día 5 (ver lib/cron-dispatch.ts). Vercel dispara por GET; se
// mantiene POST para disparo manual. Auth Bearer CRON_SECRET (igual que resumen-semanal).
async function handler(req: NextRequest) {
  if (!isCronAuthorized(req, { soloCabecera: true })) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await enviarResumenMensual()
  const negocios = await enviarCierreNegocios().catch(() => null)
  return NextResponse.json({ ok: true, ...r, negocios })
}

export { handler as GET, handler as POST }
