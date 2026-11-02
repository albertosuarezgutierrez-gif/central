import { NextRequest, NextResponse } from 'next/server'
import { runQA } from '@/lib/qa-runner'
import { cronAutorizado } from '@/lib/cron-auth'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Determinar trigger por hora (lunes 7AM → semanal, resto → diario)
  const ahora = new Date()
  const esSemanal = ahora.getDay() === 1 && ahora.getHours() === 7
  const trigger = esSemanal ? 'semanal' : 'diario'

  try {
    const result = await runQA(trigger)
    return NextResponse.json({
      ok: true, trigger, score: result.score,
      total: result.total, criticos: result.criticos,
      regresiones: result.regresiones, run_id: result.run_id
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
}
