// Refresco del SALDO del bróker (Interactive Brokers) para la vista 💶 Dinero de /banca.
// La app no habla con IBKR: es la pasada diaria del agente `trading-analista` quien lee el NAV
// (net_liquidation, EUR) por MCP y lo empuja aquí (Bearer CRON_SECRET). Persistimos el último
// saldo conocido por cuenta+bróker para pintarlo como una tarjeta más y sumarlo al total del grupo.
import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { resolverCuentaBuzon } from '@/lib/agente-facturas/cuenta-buzon'
import { upsertBrokerSaldo } from '@/lib/broker'

export const dynamic = 'force-dynamic'

type Body = { saldo?: number; divisa?: string; broker?: string; cuentaId?: string }

export async function POST(req: NextRequest) {
  // Endpoint de rutina: acepta el token de bajo privilegio ALERTA_TOKEN (el que la rutina lleva en
  // su entorno de texto plano) o el CRON_SECRET maestro. Ver lib/cron-auth::isRoutineAuthorized.
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Body
  const saldo = Number(body.saldo)
  if (!Number.isFinite(saldo)) {
    return NextResponse.json({ error: 'saldo inválido (número requerido)' }, { status: 400 })
  }

  // ¿De quién es la cuenta de IBKR? La misma resolución que el buzón de facturas: override explícito
  // (body.cuentaId o TRADING_CUENTA_ID) → cuenta cuyo email == GMAIL_USER → única cuenta real. El
  // bróker es de Alberto, así que casa por GMAIL_USER cuando hay varias cuentas reales (Alberto+Pilar).
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

  await upsertBrokerSaldo(cuentaId, saldo, { broker: body.broker, divisa: body.divisa })
  return NextResponse.json({ ok: true, cuentaId, saldo, divisa: (body.divisa || 'EUR').toUpperCase() })
}
