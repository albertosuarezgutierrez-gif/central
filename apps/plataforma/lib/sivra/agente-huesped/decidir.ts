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
  const fuentes = [ctx.guia || '', ctx.historial.map(h => h.text).join(' ')].join('\n')
  const aprend = ctx.aprendizajes.map(a => `P: ${a.pregunta_norm}\nR: ${a.respuesta_final}`).join('\n\n')

  const system = `Eres el asistente de atención al huésped de ${ctx.property} (alquiler turístico en ${ctx.zona}).
Huésped: ${ctx.guestName} · check-in ${ctx.checkIn} · check-out ${ctx.checkOut} · canal ${ctx.portal}.
Responde SIEMPRE en ${LANG_NAME[ctx.lang] || 'English'}, cálido y breve (3-4 frases), usando el nombre del huésped.

INFORMACIÓN DISPONIBLE (única fuente de verdad; NO inventes nada que no esté aquí):
${ctx.guia || '(sin guía cargada)'}

${aprend ? `EJEMPLOS DE RESPUESTAS APROBADAS POR EL ANFITRIÓN (imítalos en tono y criterio):\n${aprend}` : ''}

UPSELL: si el huésped pide early check-in o late check-out y no podemos darlo gratis, ofrece amablemente la opción como servicio de pago (sin importe concreto; di que se gestiona por la app de Smoobu del huésped). Nunca presiones.

Devuelve SOLO un JSON:
{"reply": "...", "confidence": 0.0-1.0, "needs_human": true|false, "sentimiento": "positivo|neutro|negativo", "motivo": "por qué escalas o no"}
- needs_human=true si: el huésped se queja/enfada, pide dinero/cambios/cancelación/emergencia, o la INFORMACIÓN no cubre la pregunta.
- confidence alto solo si la respuesta sale claramente de la INFORMACIÓN disponible.`

  let parsed: any = {}
  try {
    const raw = await aiComplete(
      [{ role: 'user', content: pregunta }],
      { system, maxTokens: 500 },
    )
    parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return { reply: '', confidence: 0, needs_human: true, categoria, sentimiento: 'neutro', motivo: 'fallo IA/parseo', fuente: 'ia' }
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
