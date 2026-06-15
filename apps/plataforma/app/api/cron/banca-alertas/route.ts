// /api/cron/banca-alertas — Alerta de tesorería por cuenta. Si el saldo PROYECTADO
// a 30 días (saldo actual ± recurrentes detectados) baja de un umbral, avisa al dueño
// por email. Auth: Bearer CRON_SECRET (o ?secret= para disparo manual). Degrada limpio
// sin RESEND_API_KEY. Mismo patrón que /api/cron/briefing.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTesoreria } from '@/lib/tesoreria'
import { fmtEur } from '@/lib/banca'
import { enviarAvisoEmail } from '@/lib/notificaciones'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UMBRAL = Number(process.env.BANCA_ALERTA_UMBRAL ?? 0)   // avisa si proyectado < umbral

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const isCron = !!secret && auth === `Bearer ${secret}`
  const isManual = !!secret && req.nextUrl.searchParams.get('secret') === secret
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuentas = await prisma.cuenta.findMany({ select: { id: true, nombre: true, email: true } })

  let avisados = 0
  for (const cuenta of cuentas) {
    const tes = await getTesoreria(cuenta.id).catch(() => null)
    if (!tes || tes.recurrentes.length === 0) continue
    const p30 = tes.proyecciones.find(p => p.dias === 30)
    if (!p30 || p30.proyectado >= UMBRAL) continue

    const asunto = `⚠️ Aviso de tesorería — ${cuenta.nombre}`
    const cuerpo = [
      `Hola ${cuenta.nombre}, atención a tu tesorería consolidada:`,
      '',
      `Saldo actual del grupo:   ${fmtEur(tes.saldoActual)}`,
      `Proyección a 30 días:     ${fmtEur(p30.proyectado)}  (entran ${fmtEur(p30.entradas)}, salen ${fmtEur(p30.salidas)})`,
      '',
      `Según tus movimientos recurrentes, el saldo proyectado baja de ${fmtEur(UMBRAL)}.`,
    ].join('\n')
    await enviarAvisoEmail([cuenta.email], asunto, cuerpo)
    avisados += 1
  }

  return NextResponse.json({ ok: true, cuentas: cuentas.length, avisados })
}
