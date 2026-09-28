import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { pasadaBackfillCoberturas } from '@/lib/codeoscopic/backfill-coberturas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/cron/coberturas-backfill — cada hora (min 17): completa las coberturas de los precios
 * de tarificación que aún no las tienen, incluidas las filas VIEJAS sin `oferta_id` (se relee el
 * proyecto y se casa cada fila con su precio). Solo GET gratuitos a Codeoscopic: NO mira el
 * interruptor de gasto. Tarificaciones de una en una, dentro de ~240 s. `CRON_SECRET` por Bearer.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) throw new Error('cartera_sin_conexion')
    const correduria = await correduriaUnica()
    if (!correduria) throw new Error('sin_correduria')
    const resumen = await pasadaBackfillCoberturas(correduria.id, { limite: 40, presupuestoMs: 240_000 })
    return NextResponse.json({ estado: 'ok', ...resumen })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/coberturas-backfill', e) }, { status: 503 })
  }
}
