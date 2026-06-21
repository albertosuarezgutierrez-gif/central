import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { generarGastosFijos } from '@/lib/sivra/gastos-fijos'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  // Allow cron (CRON_SECRET Bearer) or logged-in session
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const now = new Date()
  const year  = parseInt(sp.get('year')  || '') || now.getFullYear()
  const month = parseInt(sp.get('month') || '') || now.getMonth() + 1
  const commit = sp.get('dryRun') !== '1'

  try {
    const res = await generarGastosFijos(year, month, { commit })
    return NextResponse.json({ ok: true, dryRun: !commit, ...res })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
