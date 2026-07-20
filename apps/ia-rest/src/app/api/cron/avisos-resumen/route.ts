export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { enviarResumenOperador } from '@/lib/avisos'

// Resumen diario de avisos al operador: manda UN email con todo lo acumulado por
// tgAlert (canal 'resumen') desde el último envío. Programado en vercel.json.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { enviados } = await enviarResumenOperador()
    return NextResponse.json({ ok: true, enviados })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 })
  }
}
