// /api/cron/psd2-sync — re-sincroniza a diario las conexiones PSD2 vinculadas (saldos
// y movimientos nuevos por GoCardless). Auth: Bearer CRON_SECRET (o ?secret=).
import { NextRequest, NextResponse } from 'next/server'
import { disponible } from '@/lib/gocardless'
import { sincronizarTodas } from '@/lib/psd2'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const ok = !!secret && (auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('secret') === secret)
  if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!disponible()) return NextResponse.json({ ok: true, nota: 'GoCardless sin configurar' })

  const res = await sincronizarTodas().catch(e => ({ conexiones: 0, insertados: 0, error: String(e) }))
  return NextResponse.json({ ok: true, ...res })
}
