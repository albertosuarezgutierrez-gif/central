// /api/cron/psd2-sync — re-sincroniza a diario las conexiones PSD2 vinculadas (saldos
// y movimientos nuevos por Enable Banking) y, a continuación, auto-categoriza con IA los
// movimientos nuevos (marcando "por revisar" los dudosos). Auth: Bearer CRON_SECRET (o ?secret=).
import { NextRequest, NextResponse } from 'next/server'
import { disponible } from '@/lib/enablebanking'
import { sincronizarTodas } from '@/lib/psd2'
import { categorizarPendientesTodas } from '@/lib/categorizar'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const ok = !!secret && (auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('secret') === secret)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!disponible()) return NextResponse.json({ ok: true, nota: 'Enable Banking sin configurar' })

  const sync = await sincronizarTodas().catch(e => ({ conexiones: 0, insertados: 0, error: String(e) }))
  // Tras sincronizar, categorizar los movimientos nuevos (degrada limpio sin NVIDIA_API_KEY).
  const cat = await categorizarPendientesTodas().catch(e => ({ cuentas: 0, categorizados: 0, error: String(e) }))
  return NextResponse.json({ ok: true, ...sync, categorizacion: cat })
}
