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

// Mensajes automáticos del propio canal/anfitrión (no son preguntas del huésped).
function isAutoHost(subject: string): boolean {
  return /Booking Confirmation|Check-in|RECORDATORIO|Bienvenid|LLAVES|Mejorar|Ayuda|WHERE TO|Help us|Confirmaci|survey|📈|💃|⚠|🔑/i.test(subject)
}

// Despedidas / cortesías que no necesitan respuesta (no se proponen, no molestan).
function esTrivial(text: string, subject = ''): boolean {
  const t = (text + ' ' + subject).toLowerCase().trim()
  return /ya (hemos|he|nos hemos) (salido|ido|marchado|dejado)|acabamos de dejar|disponible para (su )?limpieza|gracias por (su|tu|la) estancia|ha sido un placer|dejar(é|e) (una )?reseña|checked out|we.ve (left|checked out)|we have left|just left|all (done|good),? thanks|muchas gracias por todo|fue un placer|hasta la próxima|buen viaje|safe travels|thank you for everything/i.test(t)
}

// Cron (cada 3 min) + red de seguridad del webhook. Sondea los hilos de Smoobu y enruta
// cada mensaje NUEVO del huésped al agente (que propone por Telegram / auto-envía y deja log).
// La idempotencia la lleva el orquestador (tabla mensajes_procesados), compartida con el webhook.
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // El agente notifica por Telegram. Si aún no está configurado, NO consumimos mensajes:
  // se quedan pendientes en Smoobu para cuando se añadan TELEGRAM_BOT_TOKEN/CHAT_ID.
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: true, skipped: 'sin TELEGRAM_BOT_TOKEN — agente en espera' })
  }

  const SMOOBU_KEY = await getSmoobuKey()
  if (!SMOOBU_KEY) {
    return NextResponse.json({ error: 'Missing SMOOBU_API_KEY' }, { status: 500 })
  }

  const results = { procesados: 0, trivial: 0, skipped: 0, errors: 0 }

  try {
    const res = await fetch('https://login.smoobu.com/api/threads?pageSize=50&page=1', {
      headers: { 'Api-Key': SMOOBU_KEY }, cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Smoobu threads ${res.status}`)
    const data = await res.json()
    const threads: any[] = data.threads || []
    console.log('[auto-reply] threads=', threads.length)

    for (const thread of threads) {
      try {
        const msg = thread.latest_message || {}
        const subject = msg.subject || ''
        const text = strip(msg.text_content || msg.message || '')
        const msgId = String(msg.id || '')
        const bookingId = String(thread.booking?.id || '')
        console.log('[auto-reply] th', JSON.stringify({ msgId, type: msg.type, subject: subject.slice(0, 50), bookingId, textLen: text.length }))

        if (!msgId || !bookingId) continue
        if (msg.type !== 1) { results.skipped++; continue }      // no es del huésped
        if (isAutoHost(subject)) { results.skipped++; continue }  // mensaje automático
        if (esTrivial(text, subject)) { results.trivial++; continue }
        if (await mensajeYaProcesado(msgId)) { results.skipped++; continue }

        const r = await procesarMensajeHuesped(bookingId)
        console.log('[auto-reply] agente', bookingId, r.accion)
        results.procesados++
      } catch (e: any) {
        console.error('auto-reply thread error:', e?.message)
        results.errors++
      }
    }

    console.log('[auto-reply] results', JSON.stringify(results))
    return NextResponse.json({ ok: true, results, threads: threads.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results }, { status: 500 })
  }
}
