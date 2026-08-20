// Libro de OPERACIONES ejecutadas del bróker (Interactive Brokers).
// La app no habla con IBKR: es la pasada diaria del agente `trading-analista` quien lee
// `get_account_trades` por MCP (solo lectura) y empuja aquí las ejecuciones. Mismo contrato de
// auth que /api/trading/cartera (Bearer ALERTA_TOKEN o CRON_SECRET). El agente JAMÁS opera:
// esto solo registra lo que Alberto ya ha ejecutado, para el cálculo fiscal y el análisis.
//
// A diferencia de la cartera, esto NO reemplaza nada: añade lo que falte. Las pasadas se solapan
// a propósito (pedir de más y descartar duplicados es lo que garantiza que no se pierda ninguna
// ejecución si una pasada falla un día).
import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { resolverCuentaBuzon } from '@/lib/agente-facturas/cuenta-buzon'
import { normalizarOperaciones } from '@/lib/trading/operaciones'
import { guardarOperaciones, getEstadoLibro } from '@/lib/trading/operaciones-io'

export const dynamic = 'force-dynamic'

type Body = { operaciones?: unknown; broker?: string; cuentaId?: string }

async function resolverCuenta(cuentaIdBody?: string): Promise<string | null> {
  const cuentas = await prisma.$queryRaw<{ id: string; email: string | null; nombre: string }[]>(
    Prisma.sql`SELECT id, email, nombre FROM cuentas WHERE nombre NOT ILIKE '%[seed-demo]%'`
  )
  return resolverCuentaBuzon(
    cuentas.map(c => ({ id: c.id, email: c.email, esDemo: /\[seed-demo\]/i.test(c.nombre) })),
    { facturaCuentaId: cuentaIdBody || process.env.TRADING_CUENTA_ID, gmailUser: process.env.GMAIL_USER },
  )
}

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Body
  if (!Array.isArray(body.operaciones)) {
    return NextResponse.json({ error: 'body.operaciones debe ser un array (vacío = sin ejecuciones nuevas)' }, { status: 400 })
  }
  const { operaciones, descartadas } = normalizarOperaciones(body.operaciones)
  // Si TODO el payload venía ilegible, aceptarlo como «no hubo operaciones» convertiría un fallo
  // de lectura en un libro que parece al día. Se rechaza y la pasada lo ve en su respuesta.
  if (operaciones.length === 0 && descartadas.length > 0) {
    return NextResponse.json({ error: 'ninguna operación legible', descartadas }, { status: 422 })
  }

  const cuentaId = await resolverCuenta(body.cuentaId)
  if (!cuentaId) {
    return NextResponse.json({ error: 'no se pudo resolver la cuenta (define TRADING_CUENTA_ID o GMAIL_USER)' }, { status: 422 })
  }

  const broker = (body.broker || 'Interactive Brokers').trim()
  const r = await guardarOperaciones(cuentaId, broker, operaciones)

  return NextResponse.json({ ok: true, ...r, descartadas })
}

// Estado del libro, para que la pasada sepa desde cuándo pedir y para vigilar que no se quede
// mudo. `libro: null` = nunca sincronizado (≠ libro vacío).
export async function GET(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const cuentaId = await resolverCuenta()
  if (!cuentaId) return NextResponse.json({ error: 'no se pudo resolver la cuenta' }, { status: 422 })
  return NextResponse.json({ ok: true, libro: await getEstadoLibro(cuentaId) })
}
