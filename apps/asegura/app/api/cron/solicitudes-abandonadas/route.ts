import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { pasadaSolicitudesAbandonadas } from '@/lib/solicitudes-abandonadas'

const AVERIAS_PROPIAS = ['cartera_sin_conexion', 'sin_correduria']

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/cron/solicitudes-abandonadas — avisa a Alberto por Telegram de los enlaces de datos (`/datos/<token>`)
 * pendientes y sin completar a las 24 h, con ramo, último paso alcanzado y enlace a la ficha. Una sola vez por
 * solicitud (sello `aviso_abandono_at`). NUNCA escribe al cliente. Cada hora de 07:41 a 20:41 UTC (`vercel.json`).
 *
 * Cerrojos: `CRON_SECRET` (Bearer); modo CUENTA por defecto (sin `ASEGURA_AVISO_ABANDONO_ACTIVO=1` solo cuenta;
 * `?contar=1` fuerza el ensayo). Sin el SQL `2026-10-26_solicitud_datos_borrador.sql` → 503 `sin_migracion`.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const forzarContar = new URL(req.url).searchParams.get('contar') === '1'
  try {
    if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
    const correduria = await correduriaUnica()
    if (!correduria) throw new Error('sin_correduria')
    const r = await pasadaSolicitudesAbandonadas(correduria.id, { forzarContar })
    if (r.estado === 'sin_migracion' || r.estado === 'sin_telegram') return NextResponse.json(r, { status: 503 })
    return NextResponse.json(r)
  } catch (e) {
    const propia = e instanceof Error && AVERIAS_PROPIAS.includes(e.message) ? e.message : null
    if (propia) console.error(`[solicitudes-abandonadas] no se puede ejecutar: ${propia}`)
    return NextResponse.json({ estado: 'error', causa: propia ?? registrarErrorCartera('cron/solicitudes-abandonadas', e) }, { status: 503 })
  }
}
