import { NextRequest, NextResponse, after } from 'next/server'
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'
import { runSync } from '@/lib/sivra/smoobu-sync'
import { GET as autoSessionsGET } from '@/app/api/sivra/limpiadoras/auto-sessions/route'
import { GET as applyAutoGET } from '@/app/api/sivra/pricing/apply-auto/route'

export const dynamic = 'force-dynamic'
// Procesa el mensaje del huésped con el agente (decisión IA + traducciones) → 60s se quedaba
// corto (504). 300s (máximo en plan Pro) cubre el caso con traducción, el sync y el repricing.
export const maxDuration = 300

// Eventos de reserva de Smoobu: cualquiera de estos significa que hay dinero/fechas que actualizar.
const EVENTOS_RESERVA = new Set(['newReservation', 'updateReservation', 'cancelReservation'])

// Reacciones a un cambio de reserva que NO deben bloquear la respuesta a Smoobu (si tardaran,
// Smoobu daría el webhook por fallido y reintentaría). Reutilizan endpoints existentes con sus
// propios guards; van autorizadas con CRON_SECRET. Se ejecutan en `after()` (tras responder).
//  - Limpieza: crea/ajusta sesiones de las reservas próximas (idempotente: salta las ya creadas).
//  - Pricing reactivo: reajusta tarifas de la ventana CERCANA (45d) según la nueva ocupación; el
//    motor respeta pausa global, guardia de confianza y apply_enabled por piso (no aplica si está off).
//    El cron diario sigue tarificando la ventana completa (365d) como red de seguridad.
function reaccionarAReserva(): void {
  const secret = process.env.CRON_SECRET || ''
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
  const authedReq = (path: string, params: Record<string, string> = {}) => {
    const u = new URL(path, base)
    if (secret) u.searchParams.set('secret', secret)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    return new NextRequest(u, { headers: secret ? { authorization: `Bearer ${secret}` } : {} })
  }
  after(async () => {
    try { await autoSessionsGET(authedReq('/api/sivra/limpiadoras/auto-sessions')) }
    catch (e: any) { console.error('[webhook] auto-sessions:', e?.message) }
    try { await applyAutoGET(authedReq('/api/sivra/pricing/apply-auto', { days: '45' })) }
    catch (e: any) { console.error('[webhook] pricing reactivo:', e?.message) }
  })
}

// POST público (Smoobu lo llama). Verifica un token por querystring (?k=SMOOBU_WEBHOOK_SECRET).
// Smoobu manda TODOS los eventos (no filtra): { action, data:{...} }. Enrutamos por `action`:
//  - newMessage            → agente de huéspedes (propone/auto-responde).
//  - new/update/cancel     → sync incremental idempotente de reservas → tabla `incomes` (tiempo real)
//                            + limpieza automática + pricing reactivo (en segundo plano).
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
      const synced = await runSync(2, 5, undefined, undefined, 'webhook')
      // Limpieza + pricing reactivo en segundo plano (no bloquean la respuesta a Smoobu).
      reaccionarAReserva()
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
