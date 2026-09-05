import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { escribirBackfillDni } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'
// El otro lado descifra ~32.000 DNI antes de escribir y declara `maxDuration = 300`.
// Con el default de 10 s esta ruta cortaría la conexión antes de recibir nada, y el
// resultado se leería como «no se escribió», que es falso.
export const maxDuration = 300

/**
 * POST /api/correduria/backfill-dni — paso 3 del backfill del índice de búsqueda
 * por DNI: ESCRIBE los hashes que se pueden escribir.
 *
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura, que es
 * la única que tiene `PII_ENCRYPTION_KEY` y `PII_LOOKUP_KEY` — el hash sale de
 * descifrar el DNI, así que no se puede calcular desde aquí ni desde SQL.
 *
 * 🚨 Por qué existe: hasta el 05/09/2026 la escritura sólo se podía lanzar con un
 * `curl` llevando `ASEGURA_OPERADOR_SECRET` a mano. O sea, «hacer el backfill»
 * no lo podía hacer nadie desde ninguna pantalla.
 *
 * `limite` parte el trabajo en tandas. Es idempotente: sólo toca fichas con el
 * hash a NULL, así que repetirlo no cambia nada.
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const limite =
    body !== null && typeof body.limite === 'number' && Number.isFinite(body.limite) && body.limite > 0
      ? Math.floor(body.limite)
      : undefined
  const r = await escribirBackfillDni(limite)
  const status = r.estado === 'ok' ? 200 : r.estado === 'sin_configurar' ? 503 : 502
  return NextResponse.json(r, { status })
}
