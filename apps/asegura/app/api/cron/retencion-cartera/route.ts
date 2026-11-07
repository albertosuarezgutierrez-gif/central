import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { ejecutarRetencionCartera } from '@/lib/retencion-cartera'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/cron/retencion-cartera — calendario automático de RENOVACIÓN de auto y hogar en vigor (F1, 07/11/2026).
 * Diario a las 19:17 UTC (`vercel.json`, fuera de la franja 13-16 UTC).
 *
 * Cerrojos: `CRON_SECRET` por Bearer (`isCronAuthorized`) · MODO CUENTA por defecto: sin `RENOVACION_AUTO_ACTIVA=1` (o con
 * `?contar=1`, o sin la migración 2026-11-07a) solo calcula y manda a Alberto un Telegram de ENSAYO, sin crear nada · filtro de
 * cartera EN VIGOR re-aplicado en TS · tope de pólizas por pasada · reserva por póliza (dos pasadas no se pisan).
 * Con el interruptor: T-60 propone la solicitud de datos (Telegram con ✅), T-45 bots (gratis), T-40 borrador de la renovación
 * con su Telegram de revisión (✅ por póliza) y un resumen diario. Avant2 NUNCA. NADA sale al cliente sin el ✅ de Alberto.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const contar = new URL(req.url).searchParams.get('contar') === '1'
  try {
    return NextResponse.json(await ejecutarRetencionCartera({ contar }))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('cron/retencion-cartera', e) }, { status: 503 })
  }
}
