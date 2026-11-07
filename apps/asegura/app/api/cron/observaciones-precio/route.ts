import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { barrerObservacionesPrecio } from '@/lib/observaciones-precio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/cron/observaciones-precio — barrido nocturno y BACKFILL del almacén de precios (fase 0, 07/11/2026; diseño
 * docs/superpowers/specs/2026-11-07-almacen-precios.md §2.6 y §3). Diario a las 04:29 UTC (`vercel.json`).
 *
 * Es la garantía de «no se pierde ningún precio»: proyecta las tarificaciones reales (Avant2 y bots) que el enganche en
 * caliente no escribió, con la MISMA función pura e idempotente (UNIQUE clave + huella). El backfill es este mismo barrido.
 *
 * Cerrojos: `CRON_SECRET` por Bearer · MODO CONTAR por defecto: sin `OBSERVACIONES_PRECIO_ACTIVO=1`, sin
 * `ASEGURA_PRECIOS_HUELLA_SECRET`, sin la tabla (SQL 2026-11-07b) o con `?contar=1` NO escribe y devuelve los recuentos por
 * fuente (la verificación antes de encender) · tope de tarificaciones por pasada (`?tope=`, defecto 500).
 * `?todo=1` re-proyecta todas (tras subir `NIVEL_VERSION`/`NORMALIZACION_VERSION`; lo ya igual no se duplica).
 * Lee y escribe solo tablas de la cartera; nada sale fuera ni se avisa a nadie.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const tope = Number(q.get('tope'))
  try {
    const informe = await barrerObservacionesPrecio({
      contar: q.get('contar') === '1',
      todo: q.get('todo') === '1',
      ...(Number.isInteger(tope) && tope > 0 ? { tope } : {}),
    })
    return NextResponse.json({ estado: 'ok', ...informe })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/observaciones-precio', e) }, { status: 503 })
  }
}
