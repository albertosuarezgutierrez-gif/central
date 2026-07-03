// /api/cron/correo-resumen-semanal — Resumen semanal del triaje (lunes). Señal de valor + deriva.
// Auth: Bearer CRON_SECRET (o ?secret= para disparo manual). Ver lib/correo/triaje.ts.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { resumenSemanal } from '@/lib/correo/triaje'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const r = await resumenSemanal()
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[cron/correo-resumen-semanal]', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
