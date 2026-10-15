import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { encolarHumo } from '@/lib/tarificador-humo'
import { esHoraDeEncolarHumo } from '@/lib/tarificador-humo-reglas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/tarificador-humo — PRUEBA NOCTURNA DE HUMO de los bots tarificadores (15/10/2026): encola, a las 03:15 de
 * Madrid, un trabajo `humo` por cada pareja (compañía, ramo) activa y `rpa_autorizada` que no esté en pausa. El worker solo
 * hace login y llega a la pantalla de inicio del tarificador (nada de datos de clientes, ni «Tarificar», ni alta/emisión/pago).
 *
 * Vercel cron va en UTC: `vercel.json` lleva dos entradas (01:15 y 02:15 UTC) y la ruta solo actúa cuando en Madrid son las 03.
 * Cerrojos: `CRON_SECRET` por Bearer · `TARIFICADOR_HUMO_ACTIVO=1` · `TARIFICADOR_RPA_ACTIVO=1` · el SQL
 * `2026-10-15d_tarificador_humo.sql` (sin él, `omitido: sin_esquema_humo`). No avisa de nada: el aviso lo da
 * `/api/cron/tarificador-humo-informe` una hora después. Lo lanza el barrido de la cola (`tarificador-cola`, cada 5 min).
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!esHoraDeEncolarHumo(new Date())) return NextResponse.json({ estado: 'omitido', omitido: 'fuera_de_hora' })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    return NextResponse.json(await encolarHumo(correduria.id))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/tarificador-humo', e) }, { status: 503 })
  }
}
