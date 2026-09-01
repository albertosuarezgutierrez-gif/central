import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgAviso } from '@/lib/telegram'
export const dynamic = 'force-dynamic'

// Cron diario: resumen de actividad del agente por Telegram + huecos de la guía.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stats = await prisma.$queryRaw<{ total: number; auto: number; pendientes: number }[]>(Prisma.sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE auto_sent)::int AS auto,
           count(*) FILTER (WHERE needs_human AND NOT auto_sent)::int AS pendientes
    FROM mensajes_log WHERE created_at >= now() - interval '24 hours'
  `)
  const gaps = await prisma.$queryRaw<{ pregunta: string; veces: number }[]>(Prisma.sql`
    SELECT pregunta, veces FROM mensajes_guia_gaps ORDER BY veces DESC, ultima_fecha DESC LIMIT 3
  `)
  const s = stats[0] || { total: 0, auto: 0, pendientes: 0 }
  const lineaGaps = gaps.length ? `\n📈 Guía floja en: ${gaps.map(g => `${g.pregunta} (x${g.veces})`).join(' · ')}` : ''
  await tgAviso('huespedes.resumen-diario', `📊 <b>Huéspedes (24h)</b>\n${s.total} mensajes · ${s.auto} auto · ${s.pendientes} te esperan${lineaGaps}`)
  return NextResponse.json({ ok: true, ...s })
}
