import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'
import { evaluarLatido, AGENTES_VIGILADOS } from '@/lib/monitoring/latidos'

// 💓 Latidos de agentes (cron diario 07:45 UTC ≈ 09:45 CEST). Comprueba que cada agente vigilado
// sigue dejando su huella en BD y avisa por Telegram los que llevan demasiado sin latir. Es el mismo
// concepto que el watchdog de trading, generalizado a la flota. Auth Bearer CRON_SECRET.
// Lógica pura + registro en lib/monitoring/latidos.ts (testeado).
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// SQL de la huella por agente (parametrizado con Prisma.sql, nunca interpolación de strings).
// Cada probe devuelve una fila { ultimo: timestamp | null } = el último latido del agente.
const PROBES: Record<string, Prisma.Sql> = {
  pricing: Prisma.sql`SELECT max(created_at) AS ultimo FROM market_rates WHERE scenario LIKE 'prop_%'`,
  correo_triaje: Prisma.sql`SELECT max(updated_at) AS ultimo FROM correo_cursor`,
}

async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ahora = new Date()
  const resultados: Array<Record<string, unknown>> = []
  const alertas: string[] = []

  for (const ag of AGENTES_VIGILADOS) {
    const probe = PROBES[ag.id]
    if (!probe) continue
    try {
      const rows = await prisma.$queryRaw<Array<{ ultimo: Date | null }>>(probe)
      const ultimo = rows[0]?.ultimo ?? null
      const ev = evaluarLatido({ ahora, ultimo, maxHoras: ag.maxHoras })
      resultados.push({ id: ag.id, ...ev, ultimo: ultimo?.toISOString() ?? null })
      if (ev.alerta) alertas.push(`• <b>${ag.etiqueta}</b>: ${ev.motivo}.\n  ${ag.nota}`)
    } catch (e) {
      // Fail-quiet: un error de la propia sonda (tabla ausente, etc.) NO debe generar falsa alarma.
      resultados.push({ id: ag.id, error: String((e as Error)?.message ?? e) })
    }
  }

  if (alertas.length > 0) {
    await tgSend(
      `💓⚠️ <b>Latidos de agentes — ${alertas.length} sin señal</b>\n\n${alertas.join('\n\n')}`,
      { html: true },
    )
  }

  return NextResponse.json({ ok: true, alertas: alertas.length, resultados })
}

export { handler as GET, handler as POST }
