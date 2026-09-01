import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { isCronAuthorized } from '@/lib/cron-auth'
import { conciliarFacturasDesdeGmail } from '@/lib/agente-facturas/conciliar-gmail'
import { tgAviso } from '@/lib/telegram'
import { eur } from '@/lib/dinero'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // IMAP + OCR es lento; acotamos el lote en el propio agente.

// POST /api/finanzas/gastos/conciliar-gmail
// Barre el buzón de contabilidad de Gmail y ENGANCHA cada factura a su cargo del banco
// «sin justificante» (match conservador: mismo signo + importe al céntimo + fecha ±N días).
// Ataca el backlog "❗ N gastos deducibles sin justificante" del dashboard sin enlazar a ciegas.
//
// Auth: sesión de usuario (botón «buscar factura» de la pestaña Gastos) O `CRON_SECRET`
// (para dispararlo desde un cron). En modo cron la cuenta llega por `?cuenta=<id>`.
// Body/query opcionales: mesesAtras, etiqueta, tolDias, maxAdjuntos.
export async function POST(req: NextRequest) {
  const session = await getSession()
  const cron = isCronAuthorized(req)
  if (!session && !cron) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const num = (k: string): number | undefined => {
    const v = body[k] ?? searchParams.get(k)
    const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN
    return Number.isFinite(n) ? n : undefined
  }

  const cuentaId = session?.id
    ?? (typeof body.cuenta === 'string' ? body.cuenta : null)
    ?? searchParams.get('cuenta')
  if (!cuentaId) {
    return NextResponse.json({ error: 'Falta la cuenta' }, { status: 400 })
  }

  const etiqueta = (typeof body.etiqueta === 'string' && body.etiqueta)
    || searchParams.get('etiqueta')
    || undefined
  const avisar = body.avisar === true || searchParams.get('avisar') === '1' || cron

  try {
    const res = await conciliarFacturasDesdeGmail(cuentaId, {
      mesesAtras: num('mesesAtras'),
      etiqueta,
      tolDias: num('tolDias'),
      maxAdjuntos: num('maxAdjuntos'),
    })

    // Aviso Telegram (por defecto solo desde cron; opt-in con avisar=1 desde UI) — solo si
    // enganchó algo, para no generar ruido cuando el buzón está al día.
    if (avisar && res.enganchadas.length > 0) {
      const total = res.enganchadas.reduce((s, e) => s + e.importe, 0)
      const detalle = res.enganchadas
        .slice(0, 10)
        .map(e => `• ${e.proveedor} — ${eur(e.importe)} (${e.fecha})`)
        .join('\n')
      const mas = res.enganchadas.length > 10 ? `\n…y ${res.enganchadas.length - 10} más` : ''
      await tgAviso('facturas.conciliar-gmail', 
        `📎 <b>Facturas enganchadas desde Gmail</b>\n` +
        `${res.enganchadas.length} justificante(s) casado(s) por ${eur(total)} ` +
        `(de ${res.revisados} adjunto(s) en ${res.correos} correo(s)).\n\n${detalle}${mas}`,
      ).catch(() => {})
    }

    return NextResponse.json(res)
  } catch (e) {
    console.error('[/api/finanzas/gastos/conciliar-gmail]', e)
    return NextResponse.json({ error: 'Error al conciliar facturas desde Gmail' }, { status: 500 })
  }
}
