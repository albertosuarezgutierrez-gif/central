// Cron lunes 09:00: si hay >1 factura pendiente, envía resumen agrupado por Telegram
// con botones "Pagar todo" y "Revisar una a una".
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { resumenSemanal } from '@/lib/agente-facturas/pagos'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function isCronAuthorized(req: Request): boolean {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const qs = new URL(req.url).searchParams.get('secret')
  const secret = process.env.CRON_SECRET
  return !!secret && (bearer === secret || qs === secret)
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuentas = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM cuentas WHERE estado IS DISTINCT FROM 'inactiva'`
  )

  let enviados = 0
  for (const cuenta of cuentas) {
    try {
      const enviado = await resumenSemanal(cuenta.id)
      if (enviado) enviados++
    } catch { /* continuar */ }
  }

  return NextResponse.json({ ok: true, enviados })
}
