import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { avisarCompaniaSinPrecio } from '@/lib/tarificador-alarma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/tarificador-alarma — aviso diario (09:35 de Madrid) por Telegram a Alberto si alguna compañía con bot activo
 * ha dejado de dar precio (3 días sin precio habiendo trabajos, o ≥3 errores seguidos). UN mensaje agrupado, sin datos de
 * clientes; nada que avisar → silencio. Dos entradas UTC en `vercel.json` (07:35 y 08:35) y guarda de hora de Madrid.
 * Cerrojos: `CRON_SECRET` por Bearer · `TARIFICADOR_ALARMA_ACTIVA=1` (apagado por defecto). 502 si el aviso no salió.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await avisarCompaniaSinPrecio(correduria.id)
    return NextResponse.json(r, { status: r.estado === 'telegram_no_enviado' ? 502 : 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/tarificador-alarma', e) }, { status: 503 })
  }
}
