import { NextRequest, NextResponse } from 'next/server'
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'
import { runSync } from '@/lib/sivra/smoobu-sync'

export const dynamic = 'force-dynamic'
// Procesa el mensaje del huésped con el agente (decisión IA + traducciones) → 60s se quedaba
// corto (504). 300s (máximo en plan Pro) cubre el caso con traducción y el sync de reservas.
export const maxDuration = 300

// Eventos de reserva de Smoobu: cualquiera de estos significa que hay dinero/fechas que actualizar.
const EVENTOS_RESERVA = new Set(['newReservation', 'updateReservation', 'cancelReservation'])

// POST público (Smoobu lo llama). Verifica un token por querystring (?k=SMOOBU_WEBHOOK_SECRET).
// Smoobu manda TODOS los eventos (no filtra): { action, data:{...} }. Enrutamos por `action`:
//  - newMessage            → agente de huéspedes (propone/auto-responde).
//  - new/update/cancel     → sync incremental idempotente de reservas → tabla `incomes` (tiempo real).
//  - cualquier otro        → ignorado.
export async function POST(req: NextRequest) {
  const secret = process.env.SMOOBU_WEBHOOK_SECRET
  if (secret && req.nextUrl.searchParams.get('k') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const body: any = await req.json().catch(() => ({}))
  const action = body?.action || body?.event
  const data = body?.data || body

  // Reservas y dinero EN TIEMPO REAL: reusa exactamente la lógica del cron (idempotente, no duplica).
  // Ventana corta (2 días) porque el evento llega justo cuando la reserva se acaba de modificar.
  if (EVENTOS_RESERVA.has(action)) {
    try {
      const synced = await runSync(2, 5)
      return NextResponse.json({ ok: true, action, synced })
    } catch (e: any) {
      return NextResponse.json({ ok: false, action, error: e?.message }, { status: 500 })
    }
  }

  // Mensajes de huésped: solo si quien escribe es el HUÉSPED (no nuestro propio mensaje).
  if (action === 'newMessage') {
    const sender = data?.sender || data?.message?.sender
    if (sender && sender !== 'guest') return NextResponse.json({ ok: true, skipped: 'sender' })

    const bookingId = String(data?.bookingId || data?.reservationId || data?.booking?.id || data?.id || '')
    if (!bookingId) return NextResponse.json({ ok: false, error: 'sin bookingId' }, { status: 400 })

    try {
      const r = await procesarMensajeHuesped(bookingId)
      return NextResponse.json({ ok: true, ...r })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
    }
  }

  // Cualquier otro evento de Smoobu (pagos, etc.): recibido pero sin acción.
  return NextResponse.json({ ok: true, skipped: action || 'unknown' })
}
