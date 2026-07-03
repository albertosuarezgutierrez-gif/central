import { NextRequest, NextResponse } from 'next/server'
import { enviarResumenSemanal } from '@/lib/resumen-semanal-gastos'

export const dynamic = 'force-dynamic'

// Vercel dispara los crons por GET → el handler debe responder a GET. Se mantiene POST
// para disparo manual. (Antes solo exportaba POST → el cron recibía 405 y NUNCA corría.)
async function handler(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await enviarResumenSemanal()
  return NextResponse.json({ ok: true })
}

export { handler as GET, handler as POST }
