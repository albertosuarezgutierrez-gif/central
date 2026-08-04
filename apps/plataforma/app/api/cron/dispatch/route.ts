// /api/cron/dispatch — ÚNICO cron declarado en vercel.json (cada minuto). Lee el manifiesto
// `lib/cron-dispatch.ts`, calcula qué jobs tocan este minuto (con catch-up de minutos que el
// scheduler de Vercel haya omitido, vía cursor en BD) y los dispara por HTTP con el mismo
// `Authorization: Bearer CRON_SECRET` que adjuntaba Vercel — los handlers y el middleware no
// notan la diferencia. Motivo: Vercel Pro admite 40 crons/proyecto y este llegó a 60, y el
// scheduler empezó a omitir disparos en silencio (psd2-sync 29/07/2026, PR #1162).
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { jobsDue, truncarAMinuto, ventanaMinutos } from '@/lib/cron-dispatch'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function baseUrl(): string {
  const base = process.env.CRON_DISPATCH_BASE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || 'http://localhost:3000'
  return base.replace(/\/$/, '')
}

// Reclama en BD la ventana de minutos a procesar. El cursor (fila única) hace dos cosas:
// evita el doble disparo si coinciden dos instancias, y habilita el catch-up (si el scheduler
// se saltó las 06:00, la pasada de las 06:01 procesa ambos minutos). Sin tabla (migración
// `prisma/sql/2026-07-30_cron_dispatch_cursor.sql` sin aplicar) degrada al minuto actual.
async function reclamarVentana(ahora: Date): Promise<Date[] | 'ya-procesado'> {
  try {
    await prisma.$executeRaw`
      INSERT INTO cron_dispatch_cursor (id, ultimo_minuto)
      VALUES (1, ${new Date(ahora.getTime() - 60_000)})
      ON CONFLICT (id) DO NOTHING`
    const filas = await prisma.$queryRaw<{ anterior: Date }[]>`
      WITH previo AS (
        SELECT ultimo_minuto FROM cron_dispatch_cursor WHERE id = 1 FOR UPDATE
      )
      UPDATE cron_dispatch_cursor c
      SET ultimo_minuto = ${ahora}
      FROM previo
      WHERE c.id = 1 AND previo.ultimo_minuto < ${ahora}
      RETURNING previo.ultimo_minuto AS anterior`
    if (filas.length === 0) return 'ya-procesado'
    return ventanaMinutos(filas[0].anterior, ahora)
  } catch (e) {
    console.warn('[cron-dispatch] cursor no disponible, sin catch-up:', e)
    return ventanaMinutos(null, ahora)
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const ahora = truncarAMinuto(new Date())
  const ventana = await reclamarVentana(ahora)
  if (ventana === 'ya-procesado') return NextResponse.json({ ok: true, saltado: 'minuto ya procesado' })

  const jobs = jobsDue(ventana).filter(j => j.path !== '/api/cron/dispatch')
  if (jobs.length === 0) return NextResponse.json({ ok: true, minuto: ahora.toISOString(), jobs: 0 })

  const base = baseUrl()
  const secret = process.env.CRON_SECRET
  const resultados = await Promise.allSettled(jobs.map(async j => {
    const res = await fetch(`${base}${j.path}`, {
      headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
      signal: AbortSignal.timeout(280_000),
      cache: 'no-store',
    })
    // El cuerpo no interesa aquí; se consume para liberar la conexión.
    await res.text().catch(() => '')
    return { path: j.path, status: res.status }
  }))

  const disparados = resultados.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : { path: jobs[i].path, status: 0, error: String(r.reason) })
  for (const d of disparados) {
    if (d.status < 200 || d.status >= 300) console.error('[cron-dispatch] job con fallo:', d)
  }

  return NextResponse.json({
    ok: true,
    minuto: ahora.toISOString(),
    minutosProcesados: ventana.map(m => m.toISOString()),
    disparados,
  })
}
