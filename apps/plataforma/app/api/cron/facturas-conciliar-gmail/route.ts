// /api/cron/facturas-conciliar-gmail — Pasada DIARIA que engancha justificantes desde Gmail.
// Recorre las cuentas, barre el buzón de contabilidad y ata cada factura a su cargo del
// banco «sin justificante» (match conservador: mismo signo + importe al céntimo + fecha ±N
// días, nunca a ciegas). Ataca el backlog "❗ N deducibles sin justificante" del dashboard.
// Auth: Bearer CRON_SECRET (o ?secret= para disparo manual). Mismo patrón que banca-alertas.
// Reutiliza la lógica del endpoint on-demand (lib/agente-facturas/conciliar-gmail.ts).
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { conciliarFacturasDesdeGmail } from '@/lib/agente-facturas/conciliar-gmail'
import { tgSend } from '@central/core-telegram'
import { eur } from '@/lib/dinero'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // IMAP + OCR es lento; el lote se acota en el propio agente.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const isCron = !!secret && auth === `Bearer ${secret}`
  const isManual = !!secret && req.nextUrl.searchParams.get('secret') === secret
  if (!isCron && !isManual) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cuentas = await prisma.cuenta.findMany({ select: { id: true, nombre: true } })

  let enganchadasTotal = 0
  const resumen: Array<{ cuenta: string; enganchadas: number; importe: number }> = []

  for (const cuenta of cuentas) {
    const res = await conciliarFacturasDesdeGmail(cuenta.id, {}).catch(() => null)
    if (!res || res.enganchadas.length === 0) continue
    const importe = res.enganchadas.reduce((s, e) => s + e.importe, 0)
    enganchadasTotal += res.enganchadas.length
    resumen.push({ cuenta: cuenta.nombre, enganchadas: res.enganchadas.length, importe })
  }

  // Un solo aviso por pasada, y solo si enganchó algo (sin ruido cuando el buzón está al día).
  if (enganchadasTotal > 0) {
    const lineas = resumen.map(r => `• ${r.cuenta}: ${r.enganchadas} justificante(s) — ${eur(r.importe)}`)
    await tgSend(
      `📎 <b>Facturas enganchadas desde Gmail</b>\n` +
      `${enganchadasTotal} cargo(s) del banco casados con su factura.\n\n${lineas.join('\n')}`,
    ).catch(() => {})
  }

  return NextResponse.json({ ok: true, enganchadas: enganchadasTotal, cuentas: resumen })
}
