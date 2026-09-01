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
import { tgAviso } from '@/lib/telegram'
import { saltoDeSaldo } from '@/lib/trading/precios-guardia'
import { eur } from '@/lib/dinero'

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

  // 🚨 El NAV es el otro número que se cogía a ciegas (ver `lib/trading/precios-guardia.ts`): con él se
  // dimensiona cada posición, así que un cero de más multiplica el tamaño de todas las compras. No se
  // puede rechazar —un salto puede ser un ingreso o una retirada REALES— pero tampoco tragarse en
  // silencio: se registra y se pregunta, porque solo Alberto distingue su ingreso de un error de lectura.
  // Se lee la MISMA fila que va a escribir `upsertBrokerSaldo` — misma normalización del nombre y,
  // sobre todo, filtrada por `cuentaId` (regla multi-tenant): comparar contra el NAV de otra cuenta
  // daría un salto inventado.
  const brokerNombre = (body.broker || 'Interactive Brokers').trim()
  const anterior = await prisma.brokerSaldo.findUnique({
    where: { cuentaId_broker: { cuentaId, broker: brokerNombre } },
    select: { saldo: true },
  }).catch(() => null)
  const { avisa, variacion } = saltoDeSaldo(saldo, anterior ? Number(anterior.saldo) : null)

  await upsertBrokerSaldo(cuentaId, saldo, { broker: body.broker, divisa: body.divisa })

  if (avisa && variacion != null) {
    const signo = variacion > 0 ? '+' : ''
    await tgAviso('trading.saldo', 
      `⚠️ <b>Trading:</b> el patrimonio del bróker ha saltado <b>${signo}${(variacion * 100).toFixed(1)}%</b> ` +
      `(${eur(Number(anterior!.saldo))} → ${eur(saldo)}).\n\n¿Has ingresado o retirado dinero? Si no, la lectura ` +
      `del NAV viene mal y con ella se dimensionan TODAS las compras: revísalo antes de la próxima pasada.`,
      { html: true },
    ).catch(() => {})
  }

  return NextResponse.json({ ok: true, cuentaId, saldo, divisa: (body.divisa || 'EUR').toUpperCase(), saltoNav: avisa ? variacion : null })
}
