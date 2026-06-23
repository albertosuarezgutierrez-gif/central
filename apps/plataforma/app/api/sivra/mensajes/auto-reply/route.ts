import { NextRequest, NextResponse } from 'next/server'
import { getSmoobuKey } from '@/lib/smoobu'
import { isCronAuthorized } from '@/lib/cron-auth'
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'
import { mensajeYaProcesado } from '@/lib/sivra/agente-huesped/idempotencia'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function strip(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim()
}

// Los mensajes del HOST / automáticos de Smoobu/Booking llevan ASUNTO (RECORDATORIO, WHERE TO
// COLLECT, 📈 Ayúdanos…) o son el aviso "Check-in online disponible". Los del HUÉSPED llegan con
// asunto vacío y texto plano. (/api/threads NO trae `type` ni `sent_by_owner`, de ahí esta heurística.)
function esMensajeAutomatico(subject: string, text: string): boolean {
  if (subject.trim() !== '') return true
  return /check.?in online|disponible para tu reserva|self.?check.?in|c[oó]digo de acceso|how to (check|collect)|where to collect/i.test(text)
}

// Despedidas / cortesías que no necesitan respuesta.
function esTrivial(text: string): boolean {
  const t = text.toLowerCase().trim()
  return /ya (hemos|he|nos hemos) (salido|ido|marchado|dejado)|acabamos de dejar|gracias por (su|tu|la) (estancia|atención)|ha sido un placer|dejar(é|e) (una )?reseña|checked out|we.ve (left|checked out)|we have left|just left|all (done|good),? thanks|muchas gracias por todo|fue un placer|hasta la próxima|buen viaje|safe travels|thank you for everything/i.test(t)
}

// Cron (cada 3 min) + red de seguridad del webhook. Sondea los hilos de Smoobu y enruta cada
// pregunta NUEVA del huésped al agente (propone por Telegram / auto-envía y deja log). Idempotencia
// por msgId (tabla mensajes_procesados), compartida con el webhook.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  // Sin Telegram configurado no consumimos mensajes (se quedan pendientes en Smoobu).
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: true, skipped: 'sin TELEGRAM_BOT_TOKEN — agente en espera' })
  }

  // Disparo MANUAL de una reserva concreta (?booking=<id>&q=<pregunta opcional>): salta la
  // heurística del hilo (que omite un hilo si su ÚLTIMO mensaje es del host/automático) y enruta
  // directamente al agente. Útil para re-proponer una respuesta (p.ej. corregir la hora de salida).
  const manualBooking = req.nextUrl.searchParams.get('booking')
  if (manualBooking) {
    const q = req.nextUrl.searchParams.get('q') || undefined
    const msgId = q ? `manual:${manualBooking}:${Date.now()}` : undefined
    try {
      const r = await procesarMensajeHuesped(manualBooking, { pregunta: q, msgId })
      return NextResponse.json({ ok: true, manual: manualBooking, ...r })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
    }
  }

  const SMOOBU_KEY = await getSmoobuKey()
  if (!SMOOBU_KEY) {
    return NextResponse.json({ error: 'Missing SMOOBU_API_KEY' }, { status: 500 })
  }

  const results = { procesados: 0, trivial: 0, skipped: 0, errors: 0 }
  const detalle: any[] = []
  const debug = !!req.nextUrl.searchParams.get('debug')

  try {
    const res = await fetch('https://login.smoobu.com/api/threads?pageSize=50&page=1', {
      headers: { 'Api-Key': SMOOBU_KEY }, cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Smoobu threads ${res.status}`)
    const data = await res.json()
    const threads: any[] = data.threads || []

    for (const thread of threads) {
      try {
        const msg = thread.latest_message || {}
        const subject = String(msg.subject || '')
        const text = strip(msg.text_content || msg.message || '')
        const msgId = String(msg.id || '')
        const bookingId = String(thread.booking?.id || '')

        if (!msgId || !bookingId || !text) { results.skipped++; continue }
        if (esMensajeAutomatico(subject, text)) { results.skipped++; continue }
        if (esTrivial(text)) { results.trivial++; continue }
        if (await mensajeYaProcesado(msgId)) { results.skipped++; continue }

        const r = await procesarMensajeHuesped(bookingId, { pregunta: text, msgId })
        results.procesados++
        if (debug) detalle.push({ bookingId, pregunta: text.slice(0, 60), accion: r.accion })
      } catch (e: any) {
        console.error('auto-reply thread error:', e?.message)
        results.errors++
      }
    }

    return NextResponse.json({ ok: true, results, threads: threads.length, ...(debug ? { detalle } : {}) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results }, { status: 500 })
  }
}
