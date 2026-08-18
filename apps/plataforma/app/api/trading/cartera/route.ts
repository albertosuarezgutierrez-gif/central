// Refresco de la CARTERA REAL del bróker (Interactive Brokers) para el panel /trading.
// La app no habla con IBKR: es la pasada diaria del agente `trading-analista` quien lee
// `get_account_positions` por MCP (solo lectura) y empuja aquí la foto completa. Mismo contrato
// de auth que /api/trading/saldo (Bearer ALERTA_TOKEN o CRON_SECRET). El agente JAMÁS opera:
// esto solo persiste lo que Alberto ya tiene comprado, para verlo con su P&L en el panel.
import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { resolverCuentaBuzon } from '@/lib/agente-facturas/cuenta-buzon'
import { normalizarPosiciones } from '@/lib/trading/cartera-real'
import { reemplazarCarteraReal, registrarTrackCartera } from '@/lib/trading/cartera-real-io'

export const dynamic = 'force-dynamic'

type Body = { posiciones?: unknown; broker?: string; cuentaId?: string }

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Body
  if (!Array.isArray(body.posiciones)) {
    return NextResponse.json({ error: 'body.posiciones debe ser un array (vacío = cartera sin posiciones)' }, { status: 400 })
  }
  const { posiciones, descartadas } = normalizarPosiciones(body.posiciones)
  // Si TODO el payload venía ilegible, guardarlo como «cartera vacía» convertiría un fallo de
  // lectura en un «has vendido todo» — se rechaza y la pasada lo verá en su respuesta.
  if (posiciones.length === 0 && descartadas.length > 0) {
    return NextResponse.json({ error: 'ninguna posición legible', descartadas }, { status: 422 })
  }

  // ¿De quién es la cuenta de IBKR? La misma resolución que /api/trading/saldo: override explícito
  // (body.cuentaId o TRADING_CUENTA_ID) → cuenta cuyo email == GMAIL_USER → única cuenta real.
  const cuentas = await prisma.$queryRaw<{ id: string; email: string | null; nombre: string }[]>(
    Prisma.sql`SELECT id, email, nombre FROM cuentas WHERE nombre NOT ILIKE '%[seed-demo]%'`
  )
  const cuentaId = resolverCuentaBuzon(
    cuentas.map(c => ({ id: c.id, email: c.email, esDemo: /\[seed-demo\]/i.test(c.nombre) })),
    { facturaCuentaId: body.cuentaId || process.env.TRADING_CUENTA_ID, gmailUser: process.env.GMAIL_USER },
  )
  if (!cuentaId) {
    return NextResponse.json({ error: 'no se pudo resolver la cuenta (define TRADING_CUENTA_ID o GMAIL_USER)' }, { status: 422 })
  }

  const broker = (body.broker || 'Interactive Brokers').trim()
  await reemplazarCarteraReal(cuentaId, broker, posiciones)

  // 📈 Punto del día para la curva de evolución. Best-effort A PROPÓSITO: la foto ya está guardada
  // y perder un punto de la serie no puede tumbar el refresco de la cartera. El fallo viaja en la
  // respuesta (`trackError`) para que la pasada lo cante — no se pierde en silencio.
  let track: number | null = null
  let trackError: string | null = null
  try {
    track = await registrarTrackCartera(cuentaId, broker, posiciones)
  } catch (e) {
    trackError = e instanceof Error ? e.message : 'error desconocido'
  }

  return NextResponse.json({ ok: true, guardadas: posiciones.length, descartadas, track, trackError })
}
