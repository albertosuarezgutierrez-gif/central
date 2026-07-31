// Cron: escanea Gmail en busca de nuevas facturas de proveedores,
// verifica pagos en curso con Enable Banking y auto-concilia con el extracto bancario.
// Programado en vercel.json: "15 6 * * *" (06:15 diario, tras psd2-sync 06:00).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { escanearNuevasFacturas, verificarPagosPendientes, conciliarConBanco, alertarFacturasAusentes } from '@/lib/agente-facturas/pagos'
import { resolverCuentaBuzon } from '@/lib/agente-facturas/cuenta-buzon'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'

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
  // 🚨 El escaneo deja SIEMPRE su huella en `agente_latidos`, corra bien o mal:
  // es lo único que distingue «no llegó ninguna factura» de «el buzón lleva
  // semanas inaccesible». Sin ella, un IMAP muerto devolvía 0 y el chat
  // afirmaba «no tienes facturas pendientes 🎉» indefinidamente.
  let escaneoOk: boolean | null = null
  let escaneoError: string | null = null
  if (cuentaBuzon) {
    try {
      const r = await escanearNuevasFacturas(cuentaBuzon)
      totalNuevas += r.nuevas
      escaneoOk = r.ok
      escaneoError = r.error
    } catch (e: any) {
      escaneoOk = false
      escaneoError = String(e?.message ?? e).slice(0, 200)
    }
  } else {
    // Sin buzón resuelto tampoco se ha mirado nada: no es una pasada buena.
    escaneoOk = false
    escaneoError = 'no se ha podido resolver la cuenta dueña del buzón (GMAIL_USER / FACTURAS_CUENTA_ID)'
  }
  await registrarLatido(
    'facturas_gmail',
    escaneoOk === true,
    escaneoOk ? `${totalNuevas} factura(s) nueva(s)` : escaneoError,
  )

  // Verificación de pagos en curso (global, sin cuentaId): una sola pasada.
  try { totalConfirmados += await verificarPagosPendientes() } catch { /* continuar */ }

  // Conciliación con banco y alertas de justificantes: por cada cuenta real (usan su propia banca).
  for (const cuenta of cuentas) {
    try { totalConciliados += await conciliarConBanco(cuenta.id) } catch { /* continuar */ }
    try { totalAlertas += await alertarFacturasAusentes(cuenta.id) } catch { /* continuar */ }
  }

  // `escaneo` va aparte de `nuevas`: un 0 con `escaneo:false` no es «no había
  // facturas», es «no se pudo mirar el buzón».
  return NextResponse.json({
    ok: true,
    escaneo: { ok: escaneoOk, error: escaneoError },
    nuevas: totalNuevas, confirmados: totalConfirmados, conciliados: totalConciliados, alertas: totalAlertas,
  })
}
