import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { ejecutarRevisionAnual } from '@/lib/revision-anual'

const AVERIAS_PROPIAS = ['cartera_sin_conexion', 'sin_proveedor_email']

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/cron/revision-anual — la revisión anual del portal (20/09/2026).
 * Mensual, el día 1 a las 09:00 UTC (`vercel.json`), después de los avisos.
 *
 * Auth: `CRON_SECRET` por `Authorization: Bearer`. Sin esa env no se autoriza
 * a nadie: detrás se escribe a clientes reales.
 *
 * Modo cuenta por defecto: sin `ASEGURA_REVISION_ANUAL_ACTIVA=1` no sale ni un
 * correo; la respuesta dice cuántos saldrían. `?contar=1` fuerza el ensayo.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const forzarContar = new URL(req.url).searchParams.get('contar') === '1'
  try {
    const resumen = await ejecutarRevisionAnual({ forzarContar })
    return NextResponse.json({ estado: 'ok', ...resumen })
  } catch (e) {
    const propia = e instanceof Error && AVERIAS_PROPIAS.includes(e.message) ? e.message : null
    if (propia) console.error(`[revision-anual] no se puede ejecutar: ${propia}`)
    return NextResponse.json(
      { estado: 'error', causa: propia ?? registrarErrorCartera('cron/revision-anual', e) },
      { status: 503 },
    )
  }
}
