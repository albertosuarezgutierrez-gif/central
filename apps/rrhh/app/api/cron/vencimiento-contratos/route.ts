import { NextResponse } from 'next/server'
import { autorizacionBearerValida } from '@central/core-identity'
import { ejecutarAvisosVencimiento } from '@/lib/vencimientos-repo'
import { hoyMadrid } from '@/lib/vencimientos'

export const maxDuration = 60

// Vercel Cron: 15 7 * * * (≈ 8-9h en España). Avisos de fin de contrato a 30 y 15 días (regla pura `lib/vencimientos.ts`,
// `hoy` en hora de Madrid). Idempotente por (contrato, fecha_fin, umbral). Solo intranet: sin email ni push.
// `fecha_fin` NULL = «no se sabe» → no avisa (tampoco lo trata como indefinido).
export async function GET(req: Request) {
  if (!autorizacionBearerValida(req, 'CRON_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const hoy = hoyMadrid()
  try {
    const r = await ejecutarAvisosVencimiento(hoy)
    return NextResponse.json({ ok: true, hoy, ...r })
  } catch (e) {
    console.error('[cron/vencimiento-contratos]', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, hoy, error: 'no se pudieron revisar los contratos' }, { status: 500 })
  }
}
