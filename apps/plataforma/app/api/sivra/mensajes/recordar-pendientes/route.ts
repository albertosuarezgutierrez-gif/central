import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { tgSend, escapeHtml } from '@central/core-telegram'

export const dynamic = 'force-dynamic'

const HORAS_LIMITE = 3

// Cron horario: recuerda por Telegram los escalados que llevan > HORAS_LIMITE sin OK,
// para que ningún huésped quede sin respuesta. No reenvía nada al huésped.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pendientes = await prisma.$queryRaw<{ booking_id: string; categoria: string | null; borrador: string | null; created_at: Date }[]>(Prisma.sql`
    SELECT booking_id, categoria, borrador, created_at
    FROM mensajes_pendientes_tg
    WHERE created_at < now() - (${HORAS_LIMITE} || ' hours')::interval
    ORDER BY created_at ASC
    LIMIT 10
  `)
  if (!pendientes.length) return NextResponse.json({ ok: true, recordados: 0 })

  const lineas = pendientes.map(p => {
    const horas = Math.round((Date.now() - new Date(p.created_at).getTime()) / 3600_000)
    return `• reserva ${p.booking_id} (${p.categoria || 'general'}, hace ${horas}h): ${escapeHtml((p.borrador || '').slice(0, 80))}`
  }).join('\n')
  await tgSend(`⏳ <b>Escalados pendientes de tu OK</b> (${pendientes.length})\n${lineas}`)

  return NextResponse.json({ ok: true, recordados: pendientes.length })
}
