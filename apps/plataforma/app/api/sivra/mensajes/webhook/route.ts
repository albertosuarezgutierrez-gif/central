import { NextRequest, NextResponse } from 'next/server'
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'

export const dynamic = 'force-dynamic'
// Procesa el mensaje del huésped con el agente (decisión IA + traducciones) → 60s se quedaba
// corto (504). 300s (máximo en plan Pro) cubre el caso con traducción.
export const maxDuration = 300

// POST público (Smoobu lo llama). Verifica un token por querystring (?k=SMOOBU_WEBHOOK_SECRET).
// Smoobu envía { action:"newMessage", data:{ ... booking id ..., sender:"guest" } }.
export async function POST(req: NextRequest) {
  const secret = process.env.SMOOBU_WEBHOOK_SECRET
  if (secret && req.nextUrl.searchParams.get('k') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const body: any = await req.json().catch(() => ({}))
  const action = body?.action || body?.event
  if (action !== 'newMessage') return NextResponse.json({ ok: true, skipped: 'action' })

  const data = body?.data || body
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
