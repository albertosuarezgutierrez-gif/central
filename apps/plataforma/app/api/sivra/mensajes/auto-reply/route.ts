import { NextRequest, NextResponse } from 'next/server'
import { getSmoobuKey, smoobuFetch } from '@/lib/smoobu'
import { isCronAuthorized } from '@/lib/cron-auth'
import { procesarMensajeHuesped } from '@/lib/sivra/agente-huesped/orquestador'
import { construirContexto } from '@/lib/sivra/agente-huesped/contexto'
import { decidir } from '@/lib/sivra/agente-huesped/decidir'
import { detectLang, detectCategory } from '@/lib/sivra/agente-huesped/reglas'
import { mensajeYaProcesado } from '@/lib/sivra/agente-huesped/idempotencia'
import { atribuirEmisor } from '@/lib/sivra/agente-huesped/atribucion'
import { barrerUltimoRecurso } from '@/lib/sivra/agente-huesped/noche-guardia'

export const dynamic = 'force-dynamic'
// El agente hace varias llamadas a IA por mensaje (decisión + traducciones), y el sondeo recorre
// muchos hilos. 60s se quedaba corto (504) en el disparo manual de una reserva con traducción
// EN→ES → subimos a 300s (máximo en plan Pro).
export const maxDuration = 300

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

  // SIMULACRO (?booking=<id>&q=<pregunta>&dry=1): recorre el pipeline completo —guía real del piso,
  // ventana de acceso, decisión— y DEVUELVE lo que saldría, sin enviar nada al huésped, sin proponer
  // por Telegram y sin escribir en la BD. Existe porque desde el 20/08/2026 el agente auto-envía
  // cuando la respuesta se apoya en una fuente: sin simulacro, «probar» con el disparo manual
  // significaba mandarle un mensaje de verdad a un huésped real.
  if (manualBooking && req.nextUrl.searchParams.get('dry')) {
    const pregunta = (req.nextUrl.searchParams.get('q') || '').trim()
    if (!pregunta) return NextResponse.json({ error: 'falta ?q=<pregunta a simular>' }, { status: 400 })
    const ctx0 = await construirContexto(manualBooking, 'en')
    if (!ctx0) return NextResponse.json({ error: 'sin contexto (¿reserva inexistente?)' }, { status: 404 })
    const lang = detectLang(pregunta, (['es','en','fr','de','it'].includes(ctx0.idiomaReserva) ? ctx0.idiomaReserva : 'en') as any)
    const categoria = detectCategory(pregunta) || 'general'
    const dec = await decidir({ ...ctx0, lang }, pregunta, categoria)
    return NextResponse.json({
      simulacro: true,
      piso: ctx0.property,
      // La distinción que sostiene toda la autonomía: `guiaCargada:false` es «no se pudo leer»,
      // y con eso NUNCA se auto-envía.
      guia: { cargada: ctx0.guiaCargada, secciones: (ctx0.guia || '').split('\n## ').length - (ctx0.guia ? 0 : 1), accesoOculto: ctx0.guiaAccesoOculto },
      hechos: ctx0.hechos.length,
      hilo: ctx0.historial.length,
      decision: {
        categoria: dec.categoria, needs_human: dec.needs_human, apoyada_en_fuente: !!dec.apoyada_en_fuente,
        sentimiento: dec.sentimiento, motivo: dec.motivo,
      },
      seEnviariaSolo: !dec.needs_human && !!dec.reply && dec.sentimiento !== 'negativo'
        && dec.requiere_respuesta !== false && (!!dec.apoyada_en_fuente || dec.es_cortesia === true),
      borrador: dec.reply,
    })
  }

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

  // MODO NOCHE — barrido del último recurso. Va ANTES de sondear los hilos y fuera del try grande a
  // propósito: si Smoobu falla al listar hilos, un huésped que lleva 15 min esperando de madrugada
  // seguiría sin salida. No corre en el simulacro (`dry=1`), que promete no enviar nada.
  const ultimoRecurso = await barrerUltimoRecurso().catch(() => 0)

  const SMOOBU_KEY = await getSmoobuKey()
  if (!SMOOBU_KEY) {
    return NextResponse.json({ error: 'Missing SMOOBU_API_KEY' }, { status: 500 })
  }

  const results = { procesados: 0, trivial: 0, skipped: 0, errors: 0 }
  const detalle: any[] = []
  const debug = !!req.nextUrl.searchParams.get('debug')

  try {
    const res = await smoobuFetch('/api/threads?pageSize=50&page=1', { cache: 'no-store' })
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
        // Si el ÚLTIMO mensaje del hilo es del HOST (lo envió Alberto a mano desde Smoobu, o es un
        // automático con `type`/`sent_by_owner`), no hay pregunta pendiente → fuera. Cuando Smoobu no
        // trae esas señales en /api/threads, `atribuirEmisor` devuelve 'guest' y caemos en la heurística
        // de asunto de abajo (sin regresión). Evita que un mensaje propio se procese como del huésped.
        if (atribuirEmisor(msg) === 'host') { results.skipped++; continue }
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

    return NextResponse.json({ ok: true, results, threads: threads.length, ultimoRecurso, ...(debug ? { detalle } : {}) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results }, { status: 500 })
  }
}
