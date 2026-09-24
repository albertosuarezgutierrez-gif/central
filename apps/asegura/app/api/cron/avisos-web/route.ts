import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { pasadaAvisosWeb } from '@/lib/aviso-web'
import { avisosWebActivos } from '@/lib/aviso-web-reglas'

const AVERIAS_PROPIAS = ['cartera_sin_conexion', 'sin_correduria', 'sin_portal', 'sin_correo_configurado', 'sin_clave_pii']

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/avisos-web — los avisos de vencimiento a quien se apuntó en la web y confirmó su
 * correo: a 70 días («tu compañía tiene hasta X para comunicarte cambios») y a 45 («quedan N días
 * para decir que no»). Diario a las 08:30 UTC (`vercel.json`), después de los otros dos crons de
 * correo para no coincidir con ellos.
 *
 * Auth: `CRON_SECRET`. Sin `ASEGURA_AVISOS_WEB_ACTIVOS=1` solo cuenta; `?contar=1` fuerza el ensayo.
 * 503 si no ha podido mirar: un cron que no miró no puede ponerse verde.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const forzarContar = new URL(req.url).searchParams.get('contar') === '1'
  // Apagado y sin ensayo pedido: no se consulta nada (la tabla puede no existir aún). Se dice
  // `apagado`, no `ok`: no ha mirado y no lo finge.
  if (!avisosWebActivos() && !forzarContar) return NextResponse.json({ estado: 'apagado' })
  try {
    if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
    const correduria = await correduriaUnica()
    if (!correduria) throw new Error('sin_correduria')
    const resumen = await pasadaAvisosWeb(correduria.id, { forzarContar })
    return NextResponse.json({ estado: 'ok', ...resumen })
  } catch (e) {
    const propia = e instanceof Error && AVERIAS_PROPIAS.includes(e.message) ? e.message : null
    if (propia) console.error(`[avisos-web] no se puede ejecutar: ${propia}`)
    return NextResponse.json({ estado: 'error', causa: propia ?? registrarErrorCartera('cron/avisos-web', e) }, { status: 503 })
  }
}
