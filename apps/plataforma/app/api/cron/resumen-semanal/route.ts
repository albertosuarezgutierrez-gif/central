import { NextRequest, NextResponse } from 'next/server'
import { enviarResumenSemanal } from '@/lib/resumen-semanal-gastos'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await enviarResumenSemanal()
  return NextResponse.json({ ok: true })
}
