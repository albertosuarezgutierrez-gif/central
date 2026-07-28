// Ingesta diaria del corpus de subastas desde las alertas del BOE en el correo.
// Devuelve 200 con {ok:false} si la fuente falla: un fallo de red no debe teñir
// de rojo el cron ni borrar lo ya ingerido.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { ingerirDesdeCorreo, podarCorpus } from '@/lib/subastas-ingesta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  // `?dias=N` permite un backfill manual sin tocar el código.
  const dias = Math.min(Math.max(parseInt(sp.get('dias') || '7', 10) || 7, 1), 180)
  const max = Math.min(Math.max(parseInt(sp.get('max') || '100', 10) || 100, 1), 400)

  try {
    const r = await ingerirDesdeCorreo(dias, max)
    let podadas = 0
    try {
      podadas = await podarCorpus()
    } catch (e) {
      console.error('[subastas-ingesta] poda', e)
    }
    return NextResponse.json({ ok: true, ...r, podadas })
  } catch (e: any) {
    console.error('[subastas-ingesta]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}
