// ────────────────────────────────────────────────────────────────────────────
// WhatsApp de la correduría: el mensajero de los cambios de CONEXIÓN (05/10/2026).
//
// asegura guarda el estado cuando Meta manda `account_update` (PARTNER_REMOVED con su motivo —p. ej.
// 14 días sin abrir la app del móvil—, ACCOUNT_OFFBOARDED, ACCOUNT_RECONNECTED) y deja el aviso
// pendiente. Este cron lo lee por el puerto, lo manda por Telegram (texto SIN datos personales, ya
// compuesto por asegura) y lo marca. Silenciado en /telegram → se marca igual (el estado se ve en
// /correduria/ajustes/whatsapp) para no reintentar cada 10 min.
// 🚨 Solo se marca si el Telegram SALIÓ (o está silenciado): si falla, se reintenta en la pasada siguiente.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { tgSend } from '@/lib/telegram'
import { avisoEnviado, avisoPermitido } from '@/lib/telegram/avisos'
import { isCronAuthorized } from '@/lib/cron-auth'
import { conexionWhatsappAsegura, whatsappAvisadoAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const r = await conexionWhatsappAsegura()
  const j = (r.json && typeof r.json === 'object' ? r.json : {}) as { estado?: unknown; conexion?: { aviso?: { texto?: unknown; eventoAt?: unknown } | null } | null }
  // «No se ha podido mirar» ≠ «no hay nada»: se dice tal cual.
  if (r.status !== 200 || j.estado !== 'ok') return NextResponse.json({ ok: false, estado: 'sin_datos', http: r.status })
  const aviso = j.conexion?.aviso
  if (!aviso || typeof aviso.texto !== 'string' || typeof aviso.eventoAt !== 'string') return NextResponse.json({ ok: true, enviados: 0 })

  // ⚠️ Id LITERAL: `lib/telegram/catalogo.test.ts` lee el fuente.
  const permitido = await avisoPermitido('correduria.whatsapp-conexion')
  if (permitido) {
    const id = await tgSend(aviso.texto).catch(() => null)
    if (id === null) return NextResponse.json({ ok: false, enviados: 0, motivo: 'el Telegram no salió (se reintenta)' })
    await avisoEnviado('correduria.whatsapp-conexion')
  }
  const m = await whatsappAvisadoAsegura(aviso.eventoAt)
  return NextResponse.json({ ok: m.status === 200, enviados: permitido ? 1 : 0, silenciado: !permitido, marcado: m.status === 200 })
}
