import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { sincronizarSesion } from '@/lib/psd2'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/banca/psd2/sync — re-sincroniza AHORA las conexiones vinculadas de la cuenta del
// dueño, sin esperar al cron diario (06:00 UTC) ni quemar otro SCA re-vinculando. Nació el
// 17/08/2026 depurando Kutxabank: el único camino para reintentar /transactions era re-vincular
// (SCA + SMS) o esperar un día — este botón cierra ese hueco.
export async function POST() {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const conns = await prisma.$queryRaw<Array<{ sociedad_id: string; requisition_id: string }>>`
    SELECT sociedad_id, requisition_id FROM conexiones_banco
    WHERE cuenta_id = ${session.id}::uuid AND estado = 'vinculada'
  `
  if (conns.length === 0) return NextResponse.json({ error: 'Sin conexiones vinculadas' }, { status: 404 })

  let insertados = 0
  const avisos: string[] = []
  for (const c of conns) {
    const r = await sincronizarSesion(session.id, c.sociedad_id, c.requisition_id).catch((e: unknown) => {
      avisos.push(`sesión …${c.requisition_id.slice(-6)}: sync falló — ${String(e).slice(0, 160)}`)
      return null
    })
    if (r) { insertados += r.insertados; avisos.push(...r.avisos) }
  }
  return NextResponse.json({ ok: true, conexiones: conns.length, insertados, avisos })
}
