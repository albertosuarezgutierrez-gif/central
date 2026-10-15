import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { informarHumo } from '@/lib/tarificador-humo'
import { esHoraDeInformarHumo } from '@/lib/tarificador-humo-reglas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/tarificador-humo-informe — resultado de la prueba nocturna de humo (15/10/2026), a las 04:15 de Madrid.
 * Si alguna compañía ha fallado: UN solo aviso por Telegram a Alberto con la lista y el motivo corto. Si todo va bien, no
 * avisa. Cierra como fallo los humos que nadie lanzó. Dos entradas UTC en `vercel.json` (02:15 y 03:15) y guarda de hora de
 * Madrid. Cerrojos: `CRON_SECRET` por Bearer · `TARIFICADOR_HUMO_ACTIVO=1` · el SQL del humo. Responde 502 si el aviso no salió.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esHoraDeInformarHumo(new Date())) return NextResponse.json({ estado: 'omitido', omitido: 'fuera_de_hora' })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await informarHumo(correduria.id)
    return NextResponse.json(r, { status: r.estado === 'telegram_no_enviado' ? 502 : 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/tarificador-humo-informe', e) }, { status: 503 })
  }
}
