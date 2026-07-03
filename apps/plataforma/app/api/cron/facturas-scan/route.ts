// Cron: escanea Gmail en busca de nuevas facturas de proveedores,
// verifica pagos en curso con Enable Banking y auto-concilia con el extracto bancario.
// Programado en vercel.json: "15 6 * * *" (06:15 diario, tras psd2-sync 06:00).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { escanearNuevasFacturas, verificarPagosPendientes, conciliarConBanco, alertarFacturasAusentes } from '@/lib/agente-facturas/pagos'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isCronAuthorized(req: Request): boolean {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const qs = new URL(req.url).searchParams.get('secret')
  const secret = process.env.CRON_SECRET
  return !!secret && (bearer === secret || qs === secret)
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // La tabla `cuentas` no tiene columna de estado/lifecycle → todas las filas son activas.
  const cuentas = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM cuentas`
  )

  let totalNuevas = 0
  let totalConfirmados = 0
  let totalConciliados = 0
  let totalAlertas = 0

  for (const cuenta of cuentas) {
    try { totalNuevas += await escanearNuevasFacturas(cuenta.id) } catch { /* continuar */ }
    try { totalConfirmados += await verificarPagosPendientes() } catch { /* continuar */ }
    try { totalConciliados += await conciliarConBanco(cuenta.id) } catch { /* continuar */ }
    try { totalAlertas += await alertarFacturasAusentes(cuenta.id) } catch { /* continuar */ }
  }

  return NextResponse.json({ ok: true, nuevas: totalNuevas, confirmados: totalConfirmados, conciliados: totalConciliados, alertas: totalAlertas })
}
