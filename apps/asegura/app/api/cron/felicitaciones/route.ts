import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { felicitarCumpleanos } from '@/lib/felicitaciones'

const AVERIAS_PROPIAS = ['cartera_sin_conexion', 'sin_correduria', 'sin_portal', 'sin_correo_configurado']

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/felicitaciones — felicita el cumpleaños a los clientes en vigor (correo + campana
 * del portal). Diario a las 07:00 UTC (`vercel.json`). `CRON_SECRET` por Bearer.
 * Modo cuenta salvo `ASEGURA_FELICITACIONES_ACTIVAS=1`; `?contar=1` fuerza el ensayo.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const forzarContar = new URL(req.url).searchParams.get('contar') === '1'
  try {
    if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
    const correduria = await correduriaUnica()
    if (!correduria) throw new Error('sin_correduria')
    const resumen = await felicitarCumpleanos(correduria.id, { forzarContar })
    return NextResponse.json({ estado: 'ok', ...resumen })
  } catch (e) {
    const propia = e instanceof Error && AVERIAS_PROPIAS.includes(e.message) ? e.message : null
    if (propia) console.error(`[felicitaciones] no se puede ejecutar: ${propia}`)
    return NextResponse.json(
      { estado: 'error', causa: propia ?? registrarErrorCartera('cron/felicitaciones', e) },
      { status: 503 },
    )
  }
}
