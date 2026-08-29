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
    // ?ventana=N = ventana de LLEGADA hoy..+N días calculada aquí (los paths del cron-dispatch son
    // estáticos y no pueden llevar fechas). Con days alto (p.ej. 800) re-sincroniza TODAS las
    // reservas que llegan en la ventana aunque no se hayan modificado — es lo que va rellenando
    // adults/children (aforo) de las reservas antiguas y caza cancelaciones a semanas vista.
    const ventana = Number(u.searchParams.get('ventana')) || 0
    const hoy = new Date().toISOString().slice(0, 10)
    const arrFrom = u.searchParams.get('from') || (ventana > 0 ? hoy : undefined)
    const arrTo = u.searchParams.get('to')
      || (ventana > 0 ? new Date(Date.now() + ventana * 86400000).toISOString().slice(0, 10) : undefined)
    return NextResponse.json(await runSync(days, maxPages, arrFrom, arrTo))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
