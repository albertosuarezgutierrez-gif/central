// Resumen mensual por Telegram (gastos + bandeja + recurrentes que faltan +
// rentabilidad por piso). Cron el día 1 → resume el mes ANTERIOR (cierre).
// Manual: ?year=2026&month=6&secret=...
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { calcularResumen, construirMensaje } from '@/lib/agente-facturas/resumen-mensual'
import { tgAlert } from '@/lib/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  let year = parseInt(sp.get('year') || '')
  let month = parseInt(sp.get('month') || '')
  if (!year || !month) {
    // Por defecto, el mes anterior al actual (cierre de mes).
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    year = prev.getFullYear()
    month = prev.getMonth() + 1
  }

  const resumen = await calcularResumen(year, month)
  const mensaje = construirMensaje(resumen)
  await tgAlert(mensaje, 'info')
  return NextResponse.json({ ok: true, resumen })
}
