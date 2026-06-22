// lib/sivra/agente-huesped/orquestador.ts — procesa el último mensaje del huésped de una reserva.
import { construirContexto } from './contexto'
import { detectLang, detectCategory } from './reglas'
import { decidir, type Decision } from './decidir'
import { recomendar } from './recomendar'
import { enviarAlHuesped } from './enviar'
import { proponerPorTelegram } from './telegram-msg'
import { logMensaje, registrarGap, autoPermitido } from './aprender'

const RE_RECO = /recomien|recommend|qué hacer|what to do|restaurante|restaurant|visit|ver en|things to do/i

// La idempotencia (no reprocesar el mismo mensaje) la gestiona el llamador (webhook).
export async function procesarMensajeHuesped(bookingId: string): Promise<{ accion: string }> {
  // 1) Contexto; el idioma se recalcula con el último mensaje del huésped.
  const ctx0 = await construirContexto(bookingId, 'en')
  if (!ctx0) return { accion: 'sin_contexto' }
  const ultimoGuest = [...ctx0.historial].reverse().find(h => h.from === 'guest')
  if (!ultimoGuest) return { accion: 'sin_mensaje_huesped' }

  const pregunta = ultimoGuest.text
  const lang = detectLang(pregunta)
  const categoria = detectCategory(pregunta) || 'general'
  const ctx = { ...ctx0, lang }

  // 2) Recomendaciones → búsqueda web; resto → decisión IA con grounding.
  let dec: Decision
  if (categoria === 'faq' || RE_RECO.test(pregunta)) {
    const reply = await recomendar(pregunta, ctx.zona, lang)
    dec = { reply, confidence: 0.6, needs_human: false, categoria: 'recomendacion', sentimiento: 'neutro', motivo: '', fuente: 'web' }
  } else {
    dec = await decidir(ctx, pregunta, categoria)
  }

  if (dec.needs_human && !ctx.guia && dec.categoria !== 'recomendacion') {
    await registrarGap(ctx.propertyId, pregunta)
  }

  // 3) ¿Auto-envío (Fase 2) o propuesta por Telegram (Fase 1 / sensible)?
  const puedeAuto = !dec.needs_human && !!dec.reply && await autoPermitido(dec.categoria, dec.confidence)
  if (puedeAuto) {
    const ok = await enviarAlHuesped(ctx.reservationId, dec.reply)
    await logMensaje({ bookingId, propertyId: ctx.propertyId, categoria: dec.categoria, pregunta, respuesta: dec.reply, fuente: dec.fuente, confidence: dec.confidence, sentimiento: dec.sentimiento, needs_human: false, auto_sent: ok, edited: false })
    return { accion: ok ? 'auto_enviado' : 'fallo_envio' }
  }

  await proponerPorTelegram(ctx, pregunta, dec)
  await logMensaje({ bookingId, propertyId: ctx.propertyId, categoria: dec.categoria, pregunta, respuesta: dec.reply, fuente: dec.fuente, confidence: dec.confidence, sentimiento: dec.sentimiento, needs_human: dec.needs_human, auto_sent: false, edited: false })
  return { accion: 'propuesto_telegram' }
}
