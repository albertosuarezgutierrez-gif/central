import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { esHoraResumen, resumenActivo } from '@/lib/whatsapp/resumen-diario-reglas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/whatsapp-resumen-diario — resumen por Telegram de lo que pasó hoy en el WhatsApp de la correduría.
 * Vercel cron va en UTC: `vercel.json` lo lanza a las 17 y a las 18 UTC y solo trabaja la pasada que cae a las 19:00 de Madrid
 * (verano/invierno). `?forzar=1` ignora la hora; `?contar=1` no envía y devuelve el texto (ensayo).
 * APAGADO por defecto (`ASEGURA_WHATSAPP_RESUMEN_ACTIVO=1`). Solo lee. Auth: `CRON_SECRET` por `Authorization: Bearer`.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!resumenActivo()) return NextResponse.json({ estado: 'apagado' })
  const q = new URL(req.url).searchParams
  if (q.get('forzar') !== '1' && !esHoraResumen(new Date())) return NextResponse.json({ estado: 'fuera_de_hora' })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const { ejecutarResumenDiario } = await import('@/lib/whatsapp/resumen-diario')
    const r = await ejecutarResumenDiario(correduria.id, { soloContar: q.get('contar') === '1' })
    return NextResponse.json(r, { status: r.estado === 'error_telegram' ? 502 : 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/whatsapp-resumen-diario', e) }, { status: 500 })
  }
}
