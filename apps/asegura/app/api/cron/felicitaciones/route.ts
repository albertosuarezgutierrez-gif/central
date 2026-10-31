import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { felicitarCumpleanos } from '@/lib/felicitaciones'
import { felicitarExclientes } from '@/lib/felicitaciones-exclientes'

const AVERIAS_PROPIAS = ['cartera_sin_conexion', 'sin_correduria', 'sin_portal', 'sin_correo_configurado', 'felicitacion_sin_migracion']

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/felicitaciones — felicita el cumpleaños a los clientes en vigor (correo + campana
 * del portal). Diario a las 07:00 UTC y otra pasada a las 16:00 UTC (`?pase=tarde`, `vercel.json`):
 * la segunda recoge lo que la primera no pudo (caída, despliegue tardío) y no duplica, porque la fila
 * de `felicitacion` se reserva por persona y año. `CRON_SECRET` por Bearer.
 * Modo cuenta salvo `ASEGURA_FELICITACIONES_ACTIVAS=1`; `?contar=1` fuerza el ensayo.
 * Después, los EX-clientes (`exclientes` en la respuesta), con su propia puerta `ASEGURA_FELICITACIONES_EXCLIENTES`
 * (sin valor = nada · `aprobar` = Telegram con botones · `auto` = envía). Su avería da 503 pero no tapa el resumen de clientes.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const forzarContar = new URL(req.url).searchParams.get('contar') === '1'
  try {
    if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
    const correduria = await correduriaUnica()
    if (!correduria) throw new Error('sin_correduria')
    const resumen = await felicitarCumpleanos(correduria.id, { forzarContar })
    let exclientes: Record<string, unknown>
    try {
      exclientes = { estado: 'ok', ...(await felicitarExclientes(correduria.id, { forzarContar })) }
    } catch (e) {
      const propia = e instanceof Error && AVERIAS_PROPIAS.includes(e.message) ? e.message : null
      if (propia) console.error(`[felicitaciones/exclientes] no se puede ejecutar: ${propia}`)
      exclientes = { estado: 'error', causa: propia ?? registrarErrorCartera('cron/felicitaciones/exclientes', e) }
    }
    return NextResponse.json({ estado: 'ok', ...resumen, exclientes }, { status: exclientes.estado === 'error' ? 503 : 200 })
  } catch (e) {
    const propia = e instanceof Error && AVERIAS_PROPIAS.includes(e.message) ? e.message : null
    if (propia) console.error(`[felicitaciones] no se puede ejecutar: ${propia}`)
    return NextResponse.json(
      { estado: 'error', causa: propia ?? registrarErrorCartera('cron/felicitaciones', e) },
      { status: 503 },
    )
  }
}
