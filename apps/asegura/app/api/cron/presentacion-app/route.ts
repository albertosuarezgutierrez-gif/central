import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { pasadaPresentacionApp } from '@/lib/presentacion-app'
import { presentacionAppActiva } from '@/lib/presentacion-app-seleccion'

const AVERIAS_PROPIAS = ['cartera_sin_conexion', 'sin_correduria', 'sin_correo_configurado']

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/cron/presentacion-app — el lote diario del correo «presentación de la app» a los leads
 * antiguos (`lib/presentacion-app.ts`). Laborables a las 08:47 UTC (`vercel.json`).
 *
 * Auth: `CRON_SECRET`. APAGADO: sin `ASEGURA_PRESENTACION_APP_ACTIVA=1` no consulta nada y dice
 * `apagado`; `?contar=1` hace el ensayo (cuántos saldrían hoy y por qué se descartan los demás) sin
 * mandar. Tope diario `ASEGURA_PRESENTACION_APP_TOPE_DIARIO` (20, goteo); variantes A/B `ASEGURA_PRESENTACION_APP_VARIANTES`. 503 si no ha podido mirar.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const forzarContar = new URL(req.url).searchParams.get('contar') === '1'
  if (!presentacionAppActiva() && !forzarContar) return NextResponse.json({ estado: 'apagado' })
  try {
    if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
    const correduria = await correduriaUnica()
    if (!correduria) throw new Error('sin_correduria')
    const r = await pasadaPresentacionApp(correduria.id, { forzarContar })
    if (r.estado === 'sin_migracion') return NextResponse.json(r, { status: 503 })
    return NextResponse.json(r)
  } catch (e) {
    const propia = e instanceof Error && AVERIAS_PROPIAS.includes(e.message) ? e.message : null
    if (propia) console.error(`[presentacion-app] no se puede ejecutar: ${propia}`)
    return NextResponse.json({ estado: 'error', causa: propia ?? registrarErrorCartera('cron/presentacion-app', e) }, { status: 503 })
  }
}
