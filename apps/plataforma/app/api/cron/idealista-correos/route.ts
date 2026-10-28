// Cron diario: analiza los correos nuevos de alertas de idealista (etiqueta Gmail `inmobiliaria`)
// y guarda/avisa los inmuebles nuevos. Lógica en `lib/sivra/inversion-correos.ts` (compartida con
// el botón «Analizar correos»). Requiere GMAIL_REFRESH_TOKEN + GOOGLE_CLIENT_ID/SECRET en el
// proyecto Vercel de plataforma; si faltan responde estado `gmail_no_disponible` sin lanzar.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { ejecutarCronIdealistaCorreos } from '@/lib/sivra/inversion-correos'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    return NextResponse.json(await ejecutarCronIdealistaCorreos())
  } catch (e: any) {
    console.error('[idealista-correos]', e)
    return NextResponse.json({ ok: false, estado: 'error', detalle: e?.message ?? String(e) })
  }
}
