// Cron: el agente de contabilidad habla primero (spec §7). Envía un resumen breve a Telegram
// SOLO si hay algo que decir (por revisar / facturas sin cerrar / cargos sin justificante).
// Programado en vercel.json: "0 9 * * 1" (lunes 09:00). Auth por CRON_SECRET.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { resumenProactivo } from '@/lib/contable/proactivo'

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

  const cuentas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM cuentas`).catch(() => [])
  let enviados = 0
  for (const c of cuentas) {
    if (await resumenProactivo(c.id).catch(() => false)) enviados++
  }
  return NextResponse.json({ ok: true, cuentas: cuentas.length, enviados })
}
