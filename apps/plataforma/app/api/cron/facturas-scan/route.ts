// Cron: escanea Gmail en busca de nuevas facturas de proveedores,
// verifica pagos en curso con Enable Banking y auto-concilia con el extracto bancario.
// Programado en vercel.json: "15 6 * * *" (06:15 diario, tras psd2-sync 06:00).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { escanearNuevasFacturas, verificarPagosPendientes, conciliarConBanco, alertarFacturasAusentes } from '@/lib/agente-facturas/pagos'
import { resolverCuentaBuzon } from '@/lib/agente-facturas/cuenta-buzon'

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

  // Cuentas reales (se excluyen las de prueba `[seed-demo]`: no tienen Gmail ni banca propios y solo
  // generarían ruido). La tabla `cuentas` no tiene columna de estado → el marcador es el nombre.
  const cuentas = await prisma.$queryRaw<{ id: string; email: string | null; nombre: string }[]>(
    Prisma.sql`SELECT id, email, nombre FROM cuentas WHERE nombre NOT ILIKE '%[seed-demo]%'`
  )

  let totalNuevas = 0
  let totalConfirmados = 0
  let totalConciliados = 0
  let totalAlertas = 0

  // Escaneo de Gmail: SOLO la cuenta dueña del buzón (evita duplicar las facturas en otros tenants).
  const cuentaBuzon = resolverCuentaBuzon(
    cuentas.map(c => ({ id: c.id, email: c.email, esDemo: /\[seed-demo\]/i.test(c.nombre) })),
    { facturaCuentaId: process.env.FACTURAS_CUENTA_ID, gmailUser: process.env.GMAIL_USER },
  )
  if (cuentaBuzon) {
    try { totalNuevas += await escanearNuevasFacturas(cuentaBuzon) } catch { /* continuar */ }
  }

  // Verificación de pagos en curso (global, sin cuentaId): una sola pasada.
  try { totalConfirmados += await verificarPagosPendientes() } catch { /* continuar */ }

  // Conciliación con banco y alertas de justificantes: por cada cuenta real (usan su propia banca).
  for (const cuenta of cuentas) {
    try { totalConciliados += await conciliarConBanco(cuenta.id) } catch { /* continuar */ }
    try { totalAlertas += await alertarFacturasAusentes(cuenta.id) } catch { /* continuar */ }
  }

  return NextResponse.json({ ok: true, nuevas: totalNuevas, confirmados: totalConfirmados, conciliados: totalConciliados, alertas: totalAlertas })
}
