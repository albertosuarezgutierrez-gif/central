// Cron del día 1: imputa los gastos fijos del mes en curso.
// También se puede lanzar a mano desde el panel (sesión admin) o con
// ?year=2026&month=6&secret=... para regenerar/backfillear un mes concreto.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { generarGastosFijos } from '@/lib/agente-facturas/gastos-fijos'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!(await isCronAuthorized(req, { allowSession: true }))) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }
  const sp = req.nextUrl.searchParams
  const now = new Date()
  const year = parseInt(sp.get('year') || '') || now.getFullYear()
  const month = parseInt(sp.get('month') || '') || now.getMonth() + 1
  const commit = sp.get('dryRun') !== '1'

  try {
    // Sincroniza reglas aprendidas → gastos_fijos y luego imputa el mes.
    const res = await generarGastosFijos(year, month, { commit })
    return NextResponse.json({ ok: true, dryRun: !commit, ...res })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
