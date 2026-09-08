import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { escribirBackfillContacto } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'
// El otro lado descifra la cartera entera antes de escribir y declara `maxDuration = 300`.
export const maxDuration = 300

/**
 * POST /api/correduria/backfill-contacto — ESCRIBE el índice de búsqueda por
 * email y teléfono que falta (ficha + tablas hijas). Reenvía al puerto de
 * asegura, que es la única con `PII_ENCRYPTION_KEY` y `PII_LOOKUP_KEY`.
 *
 * `limite` parte el trabajo en tandas. Idempotente: sólo toca filas con el hash
 * a NULL.
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const limite =
    body !== null && typeof body.limite === 'number' && Number.isFinite(body.limite) && body.limite > 0
      ? Math.floor(body.limite)
      : undefined
  const r = await escribirBackfillContacto(limite)
  const status = r.estado === 'ok' ? 200 : r.estado === 'sin_configurar' ? 503 : 502
  return NextResponse.json(r, { status })
}
