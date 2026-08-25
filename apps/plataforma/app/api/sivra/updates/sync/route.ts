import { NextRequest, NextResponse } from 'next/server'
import { runSync } from '@/lib/sivra/smoobu-sync'
import { isRoutineAuthorized } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// El handler revalida SIEMPRE (isRoutineAuthorized = ALERTA_TOKEN o CRON_SECRET): hasta ahora
// dependía solo del gate del middleware, y para que una rutina pueda disparar un backfill por
// ventana (p.ej. reparar el hueco jun-jul 2025) la ruta entra en RUTAS_RUTINA — y toda ruta ahí
// necesita su propia auth (guardián test/regression-rutas-rutina.test.ts). runSync es idempotente
// y no expone datos del huésped en la respuesta.
export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  try {
    const b = await req.json().catch(() => ({}))
    return NextResponse.json(await runSync(b.days || 2, b.maxPages || 20, b.from, b.to))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  try {
    const u = new URL(req.url)
    const days = Number(u.searchParams.get('days')) || 2
    const maxPages = Number(u.searchParams.get('maxPages')) || 20
    const arrFrom = u.searchParams.get('from') || undefined
    const arrTo = u.searchParams.get('to') || undefined
    return NextResponse.json(await runSync(days, maxPages, arrFrom, arrTo))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
