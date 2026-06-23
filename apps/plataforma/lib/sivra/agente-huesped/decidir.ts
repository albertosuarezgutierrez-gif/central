// lib/sivra/agente-huesped/decidir.ts — motor de decisión IA con grounding.
import { aiComplete } from '@central/core-ai'
import type { Contexto } from './contexto'
import { contieneDatoInventado } from './guardrail'
import { esSensible } from './sensibilidad'

export type Decision = {
  reply: string
  confidence: number
  needs_human: boolean
  categoria: string
  sentimiento: 'positivo' | 'neutro' | 'negativo'
  motivo: string
  fuente: 'ia' | 'web' | 'regla'
}

const LANG_NAME: Record<string, string> = { es: 'español', en: 'English', fr: 'français', de: 'Deutsch', it: 'italiano' }

export async function decidir(ctx: Contexto, pregunta: string, categoria: string): Promise<Decision> {
  const fuentes = [ctx.ficha || '', ctx.guia || '', ctx.historial.map(h => h.text).join(' ')].join('\n')
  const aprend = ctx.aprendizajes.map(a => `P: ${a.pregunta_norm}\nR: ${a.respuesta_final}`).join('\n\n')

  const horario = (ctx.horaCheckIn || ctx.horaCheckOut)
    ? `\nHORARIO OFICIAL (dato exacto de la reserva — úsalo SIEMPRE para preguntas de hora de entrada/salida, NO seas vago): entrada a partir de las ${ctx.horaCheckIn || '—'}, salida (check-out) hasta las ${ctx.horaCheckOut || '—'}.`
    : ''

  const system = `Eres el asistente de atención al huésped de ${ctx.property} (alquiler turístico en ${ctx.zona}).
Huésped: ${ctx.guestName} · llegada ${ctx.checkIn} · salida ${ctx.checkOut} · canal ${ctx.portal}.${horario}
Responde SIEMPRE en ${LANG_NAME[ctx.lang] || 'English'}, cálido y breve (3-4 frases), usando el nombre del huésped.

INFORMACIÓN DISPONIBLE (única fuente de verdad; NO inventes nada que no esté aquí):
${ctx.ficha || '(sin ficha)'}
${ctx.guia ? `\nGUÍA DEL HUÉSPED:\n${ctx.guia}` : ''}

${aprend ? `EJEMPLOS DE RESPUESTAS APROBADAS POR EL ANFITRIÓN (imítalos en tono y criterio):\n${aprend}` : ''}

UPSELL: si el huésped pide early check-in o late check-out y no podemos darlo gratis, ofrece amablemente la opción como servicio de pago (sin importe concreto; di que se gestiona por la app de Smoobu del huésped). Nunca presiones.

Devuelve SOLO un JSON:
{"reply": "...", "confidence": 0.0-1.0, "needs_human": true|false, "sentimiento": "positivo|neutro|negativo", "motivo": "por qué escalas o no"}
- needs_human=true si: el huésped se queja/enfada, pide dinero/cambios/cancelación/emergencia, o la INFORMACIÓN no cubre la pregunta.
- confidence alto solo si la respuesta sale claramente de la INFORMACIÓN disponible.`

  let raw = ''
  try {
    raw = (await aiComplete([{ role: 'user', content: pregunta }], { system, maxTokens: 500 })) || ''
  } catch (e: any) {
    console.error('[decidir] aiComplete error:', e?.message)
    return { reply: '', confidence: 0, needs_human: true, categoria, sentimiento: 'neutro', motivo: 'IA no disponible', fuente: 'ia' }
  }

  // Intenta extraer el JSON; si el modelo NO devolvió JSON, usa su texto como borrador (a revisar).
  let parsed: any = null
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse((m ? m[0] : raw).replace(/```json|```/g, '').trim())
  } catch { parsed = null }

  if (!parsed || typeof parsed.reply !== 'string' || !parsed.reply.trim()) {
    const replyPlano = raw.replace(/```json|```/g, '').trim()
    const sent: Decision['sentimiento'] = /no funciona|aver[ií]a|roto|sucio|fatal|p[eé]simo|terrible|enfad|queja|inacept/i.test(pregunta) ? 'negativo' : 'neutro'
    return {
      reply: replyPlano,
      confidence: replyPlano ? 0.3 : 0,
      needs_human: true,
      categoria,
      sentimiento: sent,
      motivo: replyPlano ? 'IA sin JSON — revisa el borrador' : 'IA sin respuesta',
      fuente: 'ia',
    }
  }

  const sentimiento: Decision['sentimiento'] = ['positivo', 'neutro', 'negativo'].includes(parsed.sentimiento) ? parsed.sentimiento : 'neutro'
  let needs_human = !!parsed.needs_human || esSensible(pregunta) || sentimiento === 'negativo'
  let motivo = parsed.motivo || ''

  // Guardrail anti-invención: si la respuesta usa datos que no están en fuentes → escala.
  if (parsed.reply && contieneDatoInventado(parsed.reply, fuentes)) {
    needs_human = true
    motivo = 'guardrail: dato no presente en las fuentes'
  }

  return {
    reply: parsed.reply || '',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    needs_human, categoria, sentimiento, motivo, fuente: 'ia',
  }
}
